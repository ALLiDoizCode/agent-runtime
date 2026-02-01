/**
 * Standalone Agent Server
 *
 * HTTP/WebSocket server that wraps AgentNode for Docker deployments.
 * Provides:
 * - BTP WebSocket endpoint for ILP communication
 * - HTTP API for configuration and management
 * - Health check endpoint
 *
 * Environment Variables:
 *   AGENT_HTTP_PORT - HTTP API port (default: 8080)
 *   AGENT_BTP_PORT - BTP WebSocket port (default: 3000)
 *   AGENT_PUBKEY - Nostr public key (required or auto-generated)
 *   AGENT_PRIVKEY - Nostr private key (required or auto-generated)
 *   AGENT_ID - Unique agent identifier (default: "agent-0")
 *   AGENT_DATABASE_PATH - Database path (default: ":memory:")
 *   LOG_LEVEL - Log level (default: "info")
 */

import * as http from 'http';
import * as crypto from 'crypto';
import * as path from 'path';
import { getPublicKey } from 'nostr-tools';
import { WebSocketServer, WebSocket } from 'ws';
import pino, { Logger } from 'pino';
import { ethers } from 'ethers';
import {
  Client as XrplClient,
  Wallet as XrplWallet,
  signPaymentChannelClaim,
  dropsToXrp,
} from 'xrpl';
import { AgentNode, AgentNodeConfig } from './agent-node';
import { getDomainSeparator, getBalanceProofTypes } from '../settlement/eip712-helper';
import { AptosChannelSDK, IAptosChannelSDK } from '../settlement/aptos-channel-sdk';
import { IAptosClient, AptosClient, AptosClientConfig } from '../settlement/aptos-client';
import { AptosClaimSigner } from '../settlement/aptos-claim-signer';
import { Ed25519PrivateKey, Account } from '@aptos-labs/ts-sdk';
import { ToonCodec, NostrEvent } from './toon-codec';
import { PacketType, ILPPreparePacket, ILPFulfillPacket, ILPRejectPacket } from '@m2m/shared';
import { EventStore } from '../explorer/event-store';
import { TelemetryEmitter } from '../telemetry/telemetry-emitter';
import { ExplorerServer } from '../explorer/explorer-server';

// ============================================
// Types
// ============================================

interface AgentServerConfig {
  httpPort: number;
  btpPort: number;
  explorerPort: number;
  agentId: string;
  nostrPubkey: string;
  nostrPrivkey: string;
  databasePath: string;
  explorerDbPath: string;
  ilpAddress: string;
  // EVM Payment Channel Configuration
  evmPrivkey: string;
  evmAddress: string;
  anvilRpcUrl: string | null;
  tokenNetworkAddress: string | null;
  agentTokenAddress: string | null;
  // XRP Payment Channel Configuration
  xrpEnabled: boolean;
  xrpWssUrl: string | null;
  xrpNetwork: string;
  xrpAccountSecret: string | null;
  xrpAccountAddress: string | null;
  // Aptos Payment Channel Configuration
  aptosEnabled: boolean;
  aptosNodeUrl: string | null;
  aptosPrivateKey: string | null;
  aptosModuleAddress: string | null;
  aptosAccountAddress: string | null;
  aptosCoinType: string | null; // Coin type for payment channels (default: AptosCoin)
  // Settlement Threshold Configuration
  settlementThreshold: bigint | null; // Auto-settle when owed balance exceeds this (in base units)
}

// EVM Payment channel state tracking
interface PaymentChannel {
  channelId: string;
  peerAddress: string;
  deposit: bigint;
  status: 'opened' | 'closed' | 'settled';
  nonce: number;
  transferredAmount: bigint;
}

// XRP Payment channel state tracking
interface XRPPaymentChannel {
  channelId: string;
  destination: string;
  amount: string; // XRP drops
  balance: string; // XRP drops claimed
  status: 'open' | 'closing' | 'closed';
  settleDelay: number;
  publicKey: string;
}

// Aptos Payment channel state tracking
interface AptosPaymentChannel {
  channelOwner: string; // Channel identifier (owner address)
  destination: string; // Destination Aptos address
  destinationPubkey: string; // ed25519 public key for claim verification
  deposited: string; // Octas deposited (string for bigint serialization)
  claimed: string; // Octas claimed (string for bigint serialization)
  status: 'open' | 'closing' | 'closed';
  settleDelay: number; // Settlement delay in seconds
  nonce: number; // Highest nonce of submitted claims
}

interface PeerConnection {
  peerId: string;
  ilpAddress: string;
  btpUrl: string;
  evmAddress?: string; // For EVM payment channel lookup
  xrpAddress?: string; // For XRP payment channel lookup
  aptosAddress?: string; // For Aptos payment channel lookup
  ws?: WebSocket;
}

interface SendEventRequest {
  targetPeerId: string;
  kind: number;
  content: string;
  tags?: string[][];
}

interface AddFollowRequest {
  pubkey: string;
  evmAddress?: string;
  xrpAddress?: string;
  aptosAddress?: string;
  ilpAddress: string;
  petname?: string;
  btpUrl?: string;
}

// ============================================
// Agent Server Class
// ============================================

export class AgentServer {
  private readonly config: AgentServerConfig;
  private readonly logger: Logger;
  private readonly agentNode: AgentNode;
  private readonly toonCodec: ToonCodec;
  private readonly eventStore: EventStore;
  private readonly telemetryEmitter: TelemetryEmitter;
  private readonly explorerServer: ExplorerServer;
  private httpServer: http.Server | null = null;
  private btpServer: WebSocketServer | null = null;
  private peers: Map<string, PeerConnection> = new Map();
  private eventsSent = 0;
  private eventsReceived = 0;
  private isShutdown = false;
  // Track pending packets for response correlation
  private pendingPackets: Map<
    string,
    { peerId: string; destination: string; amount: string; timestamp: number; packetId: string }
  > = new Map();
  // EVM Payment Channel state
  private evmProvider: ethers.JsonRpcProvider | null = null;
  private evmWallet: ethers.Wallet | null = null;
  private paymentChannels: Map<string, PaymentChannel> = new Map(); // channelId -> PaymentChannel
  private tokenNetworkContract: ethers.Contract | null = null;
  private agentTokenContract: ethers.Contract | null = null;
  // XRP Payment Channel state
  private xrplClient: XrplClient | null = null;
  private xrplWallet: XrplWallet | null = null;
  private xrpChannels: Map<string, XRPPaymentChannel> = new Map(); // channelId -> XRPPaymentChannel
  // Aptos Payment Channel state
  private aptosClient: IAptosClient | null = null;
  private aptosChannelSDK: IAptosChannelSDK | null = null;
  private aptosChannels: Map<string, AptosPaymentChannel> = new Map(); // channelOwner -> AptosPaymentChannel

  constructor(config: Partial<AgentServerConfig> = {}) {
    // Generate keypair if not provided
    let privkey = config.nostrPrivkey;
    let pubkey = config.nostrPubkey;

    if (!privkey) {
      const seed = config.agentId || `agent-${Date.now()}`;
      privkey = crypto.createHash('sha256').update(seed).digest('hex');
    }

    if (!pubkey) {
      pubkey = getPublicKey(Buffer.from(privkey, 'hex'));
    }

    const agentId = config.agentId || `agent-${pubkey.slice(0, 8)}`;

    // Generate EVM private key from agent ID (deterministic for testing)
    const evmPrivkey =
      config.evmPrivkey || crypto.createHash('sha256').update(`evm-${agentId}`).digest('hex');
    const evmWallet = new ethers.Wallet(evmPrivkey);
    const evmAddress = evmWallet.address;

    this.config = {
      httpPort: config.httpPort || parseInt(process.env.AGENT_HTTP_PORT || '8080', 10),
      btpPort: config.btpPort || parseInt(process.env.AGENT_BTP_PORT || '3000', 10),
      explorerPort: config.explorerPort || parseInt(process.env.AGENT_EXPLORER_PORT || '9000', 10),
      agentId,
      nostrPubkey: pubkey,
      nostrPrivkey: privkey,
      databasePath: config.databasePath || process.env.AGENT_DATABASE_PATH || ':memory:',
      explorerDbPath: config.explorerDbPath || process.env.AGENT_EXPLORER_DB_PATH || ':memory:',
      ilpAddress: config.ilpAddress || `g.agent.${agentId}`,
      // EVM configuration
      evmPrivkey,
      evmAddress,
      anvilRpcUrl: config.anvilRpcUrl || process.env.ANVIL_RPC_URL || null,
      tokenNetworkAddress: config.tokenNetworkAddress || process.env.TOKEN_NETWORK_ADDRESS || null,
      agentTokenAddress: config.agentTokenAddress || process.env.AGENT_TOKEN_ADDRESS || null,
      // XRP configuration
      xrpEnabled: config.xrpEnabled ?? process.env.XRP_ENABLED === 'true',
      xrpWssUrl: config.xrpWssUrl || process.env.XRPL_WSS_URL || null,
      xrpNetwork: config.xrpNetwork || process.env.XRPL_NETWORK || 'standalone',
      xrpAccountSecret: config.xrpAccountSecret || process.env.XRPL_ACCOUNT_SECRET || null,
      xrpAccountAddress: config.xrpAccountAddress || process.env.XRPL_ACCOUNT_ADDRESS || null,
      // Aptos configuration
      aptosEnabled: config.aptosEnabled ?? process.env.APTOS_ENABLED === 'true',
      aptosNodeUrl: config.aptosNodeUrl || process.env.APTOS_NODE_URL || null,
      aptosPrivateKey: config.aptosPrivateKey || process.env.APTOS_PRIVATE_KEY || null,
      aptosModuleAddress: config.aptosModuleAddress || process.env.APTOS_MODULE_ADDRESS || null,
      aptosAccountAddress: config.aptosAccountAddress || null,
      aptosCoinType: config.aptosCoinType || process.env.APTOS_COIN_TYPE || null,
      // Settlement threshold configuration
      settlementThreshold:
        config.settlementThreshold ??
        (process.env.SETTLEMENT_THRESHOLD ? BigInt(process.env.SETTLEMENT_THRESHOLD) : null),
    };

    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      name: this.config.agentId,
    });

    // Create EventStore for Explorer persistence
    this.eventStore = new EventStore({ path: this.config.explorerDbPath }, this.logger);

    // Create TelemetryEmitter (no dashboard URL needed, just for local event emission)
    this.telemetryEmitter = new TelemetryEmitter(
      '', // No dashboard URL - we're using local explorer only
      this.config.agentId,
      this.logger,
      this.eventStore
    );

    // Create ExplorerServer
    this.explorerServer = new ExplorerServer(
      {
        port: this.config.explorerPort,
        nodeId: this.config.agentId,
        staticPath: path.resolve(__dirname, '../../dist/explorer-ui'),
        balancesFetcher: () => this.getBalances(),
        peersFetcher: () => this.getPeers(),
        routesFetcher: () => this.getRoutes(),
      },
      this.eventStore,
      this.telemetryEmitter,
      this.logger
    );

    // Create AgentNode
    const nodeConfig: AgentNodeConfig = {
      agentPubkey: this.config.nostrPubkey,
      agentPrivkey: this.config.nostrPrivkey,
      databasePath: this.config.databasePath,
      pricing: {
        noteStorage: 100n,
        followUpdate: 50n,
        deletion: 10n,
        queryBase: 200n,
      },
      enableBuiltInHandlers: true,
    };

    this.agentNode = new AgentNode(nodeConfig, this.logger);
    this.toonCodec = new ToonCodec();
  }

  // ============================================
  // Server Lifecycle
  // ============================================

  async start(): Promise<void> {
    this.logger.info({ config: this.config }, 'Starting agent server');

    // Initialize EventStore
    await this.eventStore.initialize();

    // Initialize AgentNode
    await this.agentNode.initialize();

    // Initialize EVM provider and contracts if configured
    await this.initializeEVM();

    // Initialize XRP client if configured
    await this.initializeXRP();

    // Initialize Aptos client if configured
    await this.initializeAptos();

    // Start HTTP server
    await this.startHttpServer();

    // Start BTP WebSocket server
    await this.startBtpServer();

    // Start Explorer server
    await this.explorerServer.start();

    this.logger.info(
      {
        httpPort: this.config.httpPort,
        btpPort: this.config.btpPort,
        explorerPort: this.config.explorerPort,
        agentId: this.config.agentId,
        ilpAddress: this.config.ilpAddress,
        pubkey: this.config.nostrPubkey,
        evmAddress: this.config.evmAddress,
        settlementThreshold: this.config.settlementThreshold?.toString() || 'disabled',
      },
      'Agent server started'
    );
  }

  private async initializeEVM(): Promise<void> {
    if (!this.config.anvilRpcUrl) {
      this.logger.debug('No ANVIL_RPC_URL configured, skipping EVM initialization');
      return;
    }

    try {
      this.evmProvider = new ethers.JsonRpcProvider(this.config.anvilRpcUrl);
      // Use fast polling for local chains (Anvil mines instantly)
      this.evmProvider.pollingInterval = 500;
      this.evmWallet = new ethers.Wallet(this.config.evmPrivkey, this.evmProvider);

      // Initialize TokenNetwork contract if address provided
      if (this.config.tokenNetworkAddress) {
        const TOKEN_NETWORK_ABI = [
          'function openChannel(address participant2, uint256 settlementTimeout) external returns (bytes32)',
          'function setTotalDeposit(bytes32 channelId, address participant, uint256 totalDeposit) external',
          'function channels(bytes32) external view returns (uint256 settlementTimeout, uint8 state, uint256 closedAt, uint256 openedAt, address participant1, address participant2)',
          'function participants(bytes32, address) external view returns (uint256 deposit, uint256 withdrawnAmount, bool isCloser, uint256 nonce, uint256 transferredAmount)',
          'function cooperativeSettle(bytes32 channelId, tuple(bytes32 channelId, uint256 nonce, uint256 transferredAmount, uint256 lockedAmount, bytes32 locksRoot) proof1, bytes signature1, tuple(bytes32 channelId, uint256 nonce, uint256 transferredAmount, uint256 lockedAmount, bytes32 locksRoot) proof2, bytes signature2) external',
          'event ChannelOpened(bytes32 indexed channelId, address indexed participant1, address indexed participant2, uint256 settlementTimeout)',
        ];
        this.tokenNetworkContract = new ethers.Contract(
          this.config.tokenNetworkAddress,
          TOKEN_NETWORK_ABI,
          this.evmWallet
        );
      }

      // Initialize AGENT token contract if address provided
      if (this.config.agentTokenAddress) {
        const ERC20_ABI = [
          'function balanceOf(address) view returns (uint256)',
          'function transfer(address to, uint256 value) returns (bool)',
          'function approve(address spender, uint256 value) returns (bool)',
        ];
        this.agentTokenContract = new ethers.Contract(
          this.config.agentTokenAddress,
          ERC20_ABI,
          this.evmWallet
        );
      }

      this.logger.info(
        {
          evmAddress: this.config.evmAddress,
          tokenNetworkAddress: this.config.tokenNetworkAddress,
          agentTokenAddress: this.config.agentTokenAddress,
        },
        'EVM initialized'
      );
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize EVM');
    }
  }

  private async initializeXRP(): Promise<void> {
    if (!this.config.xrpEnabled || !this.config.xrpWssUrl) {
      this.logger.debug('XRP not enabled or no WSS URL configured, skipping XRP initialization');
      return;
    }

    // Only initialize if we have account credentials
    if (!this.config.xrpAccountSecret) {
      this.logger.debug('No XRP account secret configured, XRP will be configured at runtime');
      return;
    }

    try {
      this.xrplClient = new XrplClient(this.config.xrpWssUrl, {
        timeout: 10000,
      });

      // Initialize wallet from secret
      this.xrplWallet = XrplWallet.fromSeed(this.config.xrpAccountSecret);

      // Validate address matches derived wallet if provided
      if (
        this.config.xrpAccountAddress &&
        this.xrplWallet.address !== this.config.xrpAccountAddress
      ) {
        throw new Error(
          `XRP account address mismatch: expected ${this.config.xrpAccountAddress}, got ${this.xrplWallet.address}`
        );
      }

      this.config.xrpAccountAddress = this.xrplWallet.address;

      // Connect to rippled
      await this.xrplClient.connect();

      this.logger.info(
        {
          xrpAddress: this.config.xrpAccountAddress,
          xrpNetwork: this.config.xrpNetwork,
        },
        'XRP initialized'
      );
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize XRP');
      // Don't throw - XRP is optional and can be configured at runtime
    }
  }

  private async initializeAptos(): Promise<void> {
    if (!this.config.aptosEnabled || !this.config.aptosNodeUrl) {
      this.logger.debug(
        'Aptos not enabled or no node URL configured, skipping Aptos initialization'
      );
      return;
    }

    if (!this.config.aptosPrivateKey || !this.config.aptosModuleAddress) {
      this.logger.debug(
        'No Aptos private key or module address configured, Aptos will be configured at runtime'
      );
      return;
    }

    try {
      // Derive account address from private key (AptosClient constructor validates this)
      const privateKey = new Ed25519PrivateKey(this.config.aptosPrivateKey);
      const account = Account.fromPrivateKey({ privateKey });
      const derivedAddress = account.accountAddress.toString();

      // Create Aptos client config from this.config values (not process.env)
      const aptosClientConfig: AptosClientConfig = {
        nodeUrl: this.config.aptosNodeUrl,
        privateKey: this.config.aptosPrivateKey,
        accountAddress: derivedAddress,
      };

      // Create Aptos client directly with config values
      const aptosClient = new AptosClient(aptosClientConfig, this.logger);

      // Create claim signer with the same private key
      const claimSigner = new AptosClaimSigner(
        { privateKey: this.config.aptosPrivateKey },
        this.logger
      );

      // Store client reference for balance queries
      this.aptosClient = aptosClient;

      // Connect to validate account exists and check balance
      try {
        await aptosClient.connect();
      } catch (error) {
        this.logger.warn(
          { err: error, address: derivedAddress },
          'Aptos account validation failed (account may not exist yet)'
        );
      }

      // Create AptosChannelSDK with optional coin type
      this.aptosChannelSDK = new AptosChannelSDK(
        aptosClient,
        claimSigner,
        {
          moduleAddress: this.config.aptosModuleAddress,
          coinType: this.config.aptosCoinType || undefined, // Uses AptosCoin if not specified
        },
        this.logger
      );

      // Update config with derived account address
      this.config.aptosAccountAddress = aptosClient.getAddress();

      // Log balance for debugging
      try {
        const balance = await aptosClient.getBalance(derivedAddress);
        this.logger.info(
          {
            aptosAddress: this.config.aptosAccountAddress,
            aptosModuleAddress: this.config.aptosModuleAddress,
            balanceOctas: balance.toString(),
            balanceAPT: (Number(balance) / 100_000_000).toFixed(4),
          },
          'Aptos initialized'
        );
      } catch (balanceError) {
        this.logger.info(
          {
            aptosAddress: this.config.aptosAccountAddress,
            aptosModuleAddress: this.config.aptosModuleAddress,
          },
          'Aptos initialized (balance check failed)'
        );
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize Aptos');
      // Don't throw - Aptos is optional and can be configured at runtime
    }
  }

  async shutdown(): Promise<void> {
    if (this.isShutdown) return;
    this.isShutdown = true;

    this.logger.info('Shutting down agent server...');

    // Close peer connections
    for (const peer of this.peers.values()) {
      if (peer.ws) {
        peer.ws.close();
      }
    }

    // Close BTP server
    if (this.btpServer) {
      this.btpServer.close();
    }

    // Close HTTP server
    if (this.httpServer) {
      this.httpServer.close();
    }

    // Stop Explorer server
    await this.explorerServer.stop();

    // Close EventStore
    await this.eventStore.close();

    // Disconnect TelemetryEmitter
    await this.telemetryEmitter.disconnect();

    // Disconnect XRP client
    if (this.xrplClient?.isConnected()) {
      await this.xrplClient.disconnect();
    }

    // Cleanup Aptos resources
    this.aptosChannels.clear();
    this.aptosChannelSDK = null;
    if (this.aptosClient?.isConnected()) {
      await this.aptosClient.disconnect();
    }
    this.aptosClient = null;

    // Shutdown AgentNode
    await this.agentNode.shutdown();

    this.logger.info('Agent server shutdown complete');
  }

  // ============================================
  // HTTP Server
  // ============================================

  private startHttpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      this.httpServer.on('error', reject);
      this.httpServer.listen(this.config.httpPort, () => {
        resolve();
      });
    });
  }

  private async handleHttpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost:${this.config.httpPort}`);

    res.setHeader('Content-Type', 'application/json');

    try {
      // Health check
      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            status: 'ok',
            initialized: this.agentNode.isInitialized,
            agentId: this.config.agentId,
            pubkey: this.config.nostrPubkey,
          })
        );
        return;
      }

      // Status endpoint
      if (req.method === 'GET' && url.pathname === '/status') {
        const events = await this.agentNode.database.queryEvents({ kinds: [1] });
        res.writeHead(200);
        res.end(
          JSON.stringify({
            agentId: this.config.agentId,
            ilpAddress: this.config.ilpAddress,
            pubkey: this.config.nostrPubkey,
            evmAddress: this.config.evmAddress,
            xrpAddress: this.config.xrpAccountAddress,
            xrpEnabled: this.config.xrpEnabled,
            aptosAddress: this.config.aptosAccountAddress,
            aptosEnabled: this.config.aptosEnabled,
            initialized: this.agentNode.isInitialized,
            followCount: this.agentNode.followGraphRouter.getFollowCount(),
            peerCount: this.peers.size,
            storedEventCount: events.length,
            eventsSent: this.eventsSent,
            eventsReceived: this.eventsReceived,
            channelCount: this.paymentChannels.size,
            xrpChannelCount: this.xrpChannels.size,
            aptosChannelCount: this.aptosChannels.size,
            ai: this.agentNode.aiDispatcher
              ? {
                  enabled: this.agentNode.aiDispatcher.isEnabled,
                  budget: this.agentNode.aiDispatcher.getBudgetStatus(),
                }
              : { enabled: false },
          })
        );
        return;
      }

      // Balances endpoint - returns EVM token + ETH + XRP + Aptos balances
      if (req.method === 'GET' && url.pathname === '/balances') {
        const balances = await this.getBalances();
        res.writeHead(200);
        res.end(JSON.stringify(balances));
        return;
      }

      // Add follow
      if (req.method === 'POST' && url.pathname === '/follows') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as AddFollowRequest;

        this.agentNode.followGraphRouter.addFollow({
          pubkey: data.pubkey,
          ilpAddress: data.ilpAddress,
          petname: data.petname,
        });

        // Store peer connection info if BTP URL provided
        if (data.btpUrl) {
          this.peers.set(data.petname || data.pubkey, {
            peerId: data.petname || data.pubkey,
            ilpAddress: data.ilpAddress,
            btpUrl: data.btpUrl,
            evmAddress: data.evmAddress,
            xrpAddress: data.xrpAddress,
            aptosAddress: data.aptosAddress,
          });
        }

        res.writeHead(200);
        res.end(
          JSON.stringify({
            success: true,
            followCount: this.agentNode.followGraphRouter.getFollowCount(),
          })
        );
        return;
      }

      // List follows
      if (req.method === 'GET' && url.pathname === '/follows') {
        const follows = this.agentNode.followGraphRouter.getAllFollows();
        res.writeHead(200);
        res.end(JSON.stringify({ follows }));
        return;
      }

      // Send event to a specific peer
      if (req.method === 'POST' && url.pathname === '/send-event') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as SendEventRequest;
        const result = await this.sendEventToPeer(data);
        res.writeHead(result.success ? 200 : 400);
        res.end(JSON.stringify(result));
        return;
      }

      // Send events to all follows
      if (req.method === 'POST' && url.pathname === '/broadcast') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as Omit<SendEventRequest, 'targetPeerId'>;
        const result = await this.broadcastToFollows(data);
        res.writeHead(200);
        res.end(JSON.stringify(result));
        return;
      }

      // Query stored events
      if (req.method === 'GET' && url.pathname === '/events') {
        const kinds = url.searchParams.get('kinds')?.split(',').map(Number) || [1];
        const limit = parseInt(url.searchParams.get('limit') || '100', 10);
        const events = await this.agentNode.database.queryEvents({ kinds, limit });
        res.writeHead(200);
        res.end(JSON.stringify({ events }));
        return;
      }

      // Connect to peer (establish BTP connection)
      if (req.method === 'POST' && url.pathname === '/connect') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as { peerId: string; btpUrl: string };
        await this.connectToPeer(data.peerId, data.btpUrl);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // Get payment channels
      if (req.method === 'GET' && url.pathname === '/channels') {
        const channels = Array.from(this.paymentChannels.values()).map((ch) => ({
          channelId: ch.channelId,
          peerAddress: ch.peerAddress,
          deposit: ch.deposit.toString(),
          status: ch.status,
          nonce: ch.nonce,
          transferredAmount: ch.transferredAmount.toString(),
        }));
        res.writeHead(200);
        res.end(JSON.stringify({ channels }));
        return;
      }

      // Open payment channel
      if (req.method === 'POST' && url.pathname === '/channels/open') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as { peerEvmAddress: string; depositAmount: string };
        const result = await this.openPaymentChannel(
          data.peerEvmAddress,
          BigInt(data.depositAmount)
        );
        res.writeHead(200);
        res.end(JSON.stringify(result));
        return;
      }

      // Configure EVM contracts (called by test runner)
      if (req.method === 'POST' && url.pathname === '/configure-evm') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as {
          anvilRpcUrl: string;
          tokenNetworkAddress: string;
          agentTokenAddress: string;
        };

        // Update config
        this.config.anvilRpcUrl = data.anvilRpcUrl;
        this.config.tokenNetworkAddress = data.tokenNetworkAddress;
        this.config.agentTokenAddress = data.agentTokenAddress;

        // Re-initialize EVM
        await this.initializeEVM();

        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // Configure XRP (called by test runner)
      if (req.method === 'POST' && url.pathname === '/configure-xrp') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as {
          xrpWssUrl: string;
          xrpAccountSecret: string;
          xrpNetwork?: string;
        };

        // Update config
        this.config.xrpEnabled = true;
        this.config.xrpWssUrl = data.xrpWssUrl;
        this.config.xrpAccountSecret = data.xrpAccountSecret;
        if (data.xrpNetwork) {
          this.config.xrpNetwork = data.xrpNetwork;
        }

        // Re-initialize XRP
        await this.initializeXRP();

        res.writeHead(200);
        res.end(
          JSON.stringify({
            success: true,
            xrpAddress: this.config.xrpAccountAddress,
          })
        );
        return;
      }

      // Configure Aptos (called by test runner)
      if (req.method === 'POST' && url.pathname === '/configure-aptos') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as {
          aptosNodeUrl: string;
          aptosPrivateKey: string;
          aptosModuleAddress: string;
          aptosCoinType?: string; // Optional coin type for channels (default: AptosCoin)
        };

        // Update config
        this.config.aptosEnabled = true;
        this.config.aptosNodeUrl = data.aptosNodeUrl;
        this.config.aptosPrivateKey = data.aptosPrivateKey;
        this.config.aptosModuleAddress = data.aptosModuleAddress;
        if (data.aptosCoinType) {
          this.config.aptosCoinType = data.aptosCoinType;
        }

        // Re-initialize Aptos with error handling
        try {
          await this.initializeAptos();

          // Check if initialization actually succeeded
          if (!this.aptosClient || !this.aptosChannelSDK) {
            res.writeHead(500);
            res.end(
              JSON.stringify({
                success: false,
                error: 'Aptos initialization failed - client or SDK not created',
              })
            );
            return;
          }

          res.writeHead(200);
          res.end(
            JSON.stringify({
              success: true,
              aptosAddress: this.config.aptosAccountAddress,
            })
          );
        } catch (error) {
          this.logger.error({ err: error }, 'Failed to configure Aptos');
          res.writeHead(500);
          res.end(
            JSON.stringify({
              success: false,
              error: (error as Error).message,
            })
          );
        }
        return;
      }

      // Configure settlement threshold (event-driven - checked on each balance update)
      if (req.method === 'POST' && url.pathname === '/configure-settlement') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as {
          threshold: string | null; // Base units (octas, drops, wei) or null to disable
        };

        const threshold = data.threshold ? BigInt(data.threshold) : null;
        this.setSettlementThreshold(threshold);

        res.writeHead(200);
        res.end(
          JSON.stringify({
            success: true,
            threshold: threshold?.toString() || null,
          })
        );
        return;
      }

      // Get settlement status
      if (req.method === 'GET' && url.pathname === '/settlement-status') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            threshold: this.config.settlementThreshold?.toString() || null,
            enabled: this.config.settlementThreshold !== null, // Event-driven, enabled if threshold is set
          })
        );
        return;
      }

      // Get Aptos payment channels
      if (req.method === 'GET' && url.pathname === '/aptos-channels') {
        const channels = Array.from(this.aptosChannels.values()).map((ch) => ({
          channelOwner: ch.channelOwner,
          destination: ch.destination,
          deposited: ch.deposited,
          claimed: ch.claimed,
          status: ch.status,
          settleDelay: ch.settleDelay,
          nonce: ch.nonce,
        }));
        res.writeHead(200);
        res.end(JSON.stringify({ channels }));
        return;
      }

      // Open Aptos payment channel
      if (req.method === 'POST' && url.pathname === '/aptos-channels/open') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as {
          destination: string;
          destinationPubkey: string;
          amount: string;
          settleDelay?: number;
          coinType?: string; // Optional: coin type for channel (default: AptosCoin)
        };
        const result = await this.openAptosPaymentChannel(
          data.destination,
          data.destinationPubkey,
          data.amount,
          data.settleDelay || 86400 // Default 24 hours
          // Note: coinType is configured at SDK initialization, not per-channel
        );
        res.writeHead(result.success ? 200 : 400);
        res.end(JSON.stringify(result));
        return;
      }

      // Get Aptos channel by ID
      if (
        req.method === 'GET' &&
        url.pathname.startsWith('/aptos-channels/') &&
        !url.pathname.includes('/claim') &&
        !url.pathname.includes('/close')
      ) {
        const channelOwner = url.pathname.split('/aptos-channels/')[1];

        if (!channelOwner) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Channel owner address required' }));
          return;
        }

        if (!this.aptosChannelSDK) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Aptos not initialized' }));
          return;
        }

        // Check local cache first
        let channel = this.aptosChannels.get(channelOwner);

        // If not in cache, try to fetch from chain
        if (!channel) {
          const state = await this.aptosChannelSDK.getChannelState(channelOwner);
          if (state) {
            channel = {
              channelOwner: state.channelOwner,
              destination: state.destination,
              destinationPubkey: state.destinationPubkey,
              deposited: state.deposited.toString(),
              claimed: state.claimed.toString(),
              status: state.status,
              settleDelay: state.settleDelay,
              nonce: state.nonce,
            };
            this.aptosChannels.set(channelOwner, channel);
          }
        }

        if (!channel) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Channel not found' }));
          return;
        }

        res.writeHead(200);
        res.end(JSON.stringify({ channel }));
        return;
      }

      // Aptos channel claim
      if (req.method === 'POST' && url.pathname === '/aptos-channels/claim') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as {
          channelOwner: string;
          amount: string;
          nonce: number;
          signature: string;
        };
        const result = await this.claimAptosChannel(data);
        res.writeHead(result.success ? 200 : 400);
        res.end(JSON.stringify(result));
        return;
      }

      // Aptos channel close
      if (req.method === 'POST' && url.pathname === '/aptos-channels/close') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as { channelOwner: string };
        const result = await this.closeAptosChannel(data.channelOwner);
        res.writeHead(result.success ? 200 : 400);
        res.end(JSON.stringify(result));
        return;
      }

      // Get XRP payment channels
      if (req.method === 'GET' && url.pathname === '/xrp-channels') {
        const channels = Array.from(this.xrpChannels.values()).map((ch) => ({
          channelId: ch.channelId,
          destination: ch.destination,
          amount: ch.amount,
          balance: ch.balance,
          status: ch.status,
          settleDelay: ch.settleDelay,
        }));
        res.writeHead(200);
        res.end(JSON.stringify({ channels }));
        return;
      }

      // Open XRP payment channel
      if (req.method === 'POST' && url.pathname === '/xrp-channels/open') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as {
          destination: string;
          amount: string;
          settleDelay?: number;
        };
        const result = await this.openXRPPaymentChannel(
          data.destination,
          data.amount,
          data.settleDelay || 3600
        );
        res.writeHead(result.success ? 200 : 400);
        res.end(JSON.stringify(result));
        return;
      }

      // Sign EVM balance proof
      if (req.method === 'POST' && url.pathname === '/channels/sign-proof') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as {
          channelId: string;
          nonce: number;
          transferredAmount: string;
        };
        const result = await this.signBalanceProof(
          data.channelId,
          data.nonce,
          data.transferredAmount
        );
        res.writeHead(result.signature ? 200 : 400);
        res.end(JSON.stringify(result));
        return;
      }

      // EVM cooperative settle
      if (req.method === 'POST' && url.pathname === '/channels/cooperative-settle') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as {
          channelId: string;
          proof1: {
            channelId: string;
            nonce: number;
            transferredAmount: string;
            lockedAmount: number;
            locksRoot: string;
          };
          sig1: string;
          proof2: {
            channelId: string;
            nonce: number;
            transferredAmount: string;
            lockedAmount: number;
            locksRoot: string;
          };
          sig2: string;
        };
        const result = await this.cooperativeSettle(data);
        res.writeHead(result.success ? 200 : 400);
        res.end(JSON.stringify(result));
        return;
      }

      // XRP payment channel claim
      if (req.method === 'POST' && url.pathname === '/xrp-channels/claim') {
        const body = await this.readRequestBody(req);
        const data = JSON.parse(body) as { channelId: string };
        const result = await this.claimXRPChannel(data.channelId);
        res.writeHead(result.success ? 200 : 400);
        res.end(JSON.stringify(result));
        return;
      }

      // Not found
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      this.logger.error({ err: error }, 'HTTP request error');
      res.writeHead(500);
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
  }

  private readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  // ============================================
  // BTP WebSocket Server
  // ============================================

  private startBtpServer(): Promise<void> {
    return new Promise((resolve) => {
      this.btpServer = new WebSocketServer({ port: this.config.btpPort });

      this.btpServer.on('connection', (ws, req) => {
        const peerId = req.url?.slice(1) || `peer-${Date.now()}`;
        this.logger.info({ peerId }, 'BTP connection established');

        ws.on('message', async (data) => {
          await this.handleBtpMessage(ws, peerId, data as Buffer);
        });

        ws.on('close', () => {
          this.logger.info({ peerId }, 'BTP connection closed');
        });

        ws.on('error', (err) => {
          this.logger.error({ peerId, err }, 'BTP connection error');
        });
      });

      this.btpServer.on('listening', () => {
        resolve();
      });
    });
  }

  private async handleBtpMessage(ws: WebSocket, peerId: string, data: Buffer): Promise<void> {
    try {
      // Parse BTP packet (simplified - just the ILP data)
      // In real implementation, this would be proper BTP framing
      const packet = this.parseBtpPacket(data);

      if (packet.type === PacketType.PREPARE) {
        const response = await this.agentNode.processIncomingPacket(packet, peerId);

        // Decode the Nostr event from the packet data
        let decodedEvent: NostrEvent | undefined;
        try {
          decodedEvent = this.toonCodec.decode(packet.data);
        } catch (decodeError) {
          this.logger.debug(
            { peerId, err: decodeError },
            'Could not decode Nostr event from packet'
          );
        }

        if (response.type === PacketType.FULFILL) {
          this.eventsReceived++;

          // Emit FULFILL telemetry event
          // Get peer's ILP address for display
          const peerConnection = this.peers.get(peerId);
          const peerIlpAddress = peerConnection?.ilpAddress || `g.agent.${peerId}`;
          // Use Nostr event ID as packet ID for correlation (unique per packet)
          const fulfillPacketId =
            decodedEvent?.id ||
            `${peerId}-${packet.executionCondition.toString('hex').slice(0, 16)}`;
          this.telemetryEmitter.emit({
            type: 'AGENT_CHANNEL_PAYMENT_SENT',
            timestamp: Date.now(),
            nodeId: this.config.agentId,
            agentId: this.config.agentId,
            packetType: 'fulfill',
            packetId: fulfillPacketId,
            from: this.config.ilpAddress,
            to: peerIlpAddress,
            peerId: peerId,
            channelId: `${this.config.agentId}-${peerId}`,
            amount: packet.amount.toString(),
            destination: packet.destination,
            executionCondition: packet.executionCondition.toString('hex'),
            expiresAt: packet.expiresAt.toISOString(),
            fulfillment: response.fulfillment.toString('hex'),
            event: decodedEvent
              ? {
                  id: decodedEvent.id,
                  pubkey: decodedEvent.pubkey,
                  kind: decodedEvent.kind,
                  content: decodedEvent.content,
                  created_at: decodedEvent.created_at,
                  tags: decodedEvent.tags,
                  sig: decodedEvent.sig,
                }
              : undefined,
          });
        } else if (response.type === PacketType.REJECT) {
          // Emit REJECT telemetry event
          const rejectResponse = response as ILPRejectPacket;
          const rejectPeerConnection = this.peers.get(peerId);
          const rejectPeerIlpAddress = rejectPeerConnection?.ilpAddress || `g.agent.${peerId}`;
          // Use Nostr event ID as packet ID for correlation (unique per packet)
          const rejectPacketId =
            decodedEvent?.id ||
            `${peerId}-${packet.executionCondition.toString('hex').slice(0, 16)}`;
          this.telemetryEmitter.emit({
            type: 'AGENT_CHANNEL_PAYMENT_SENT',
            timestamp: Date.now(),
            nodeId: this.config.agentId,
            agentId: this.config.agentId,
            packetType: 'reject',
            packetId: rejectPacketId,
            from: this.config.ilpAddress,
            to: rejectPeerIlpAddress,
            peerId: peerId,
            channelId: `${this.config.agentId}-${peerId}`,
            amount: packet.amount.toString(),
            destination: packet.destination,
            executionCondition: packet.executionCondition.toString('hex'),
            expiresAt: packet.expiresAt.toISOString(),
            errorCode: rejectResponse.code,
            errorMessage: rejectResponse.message,
            event: decodedEvent
              ? {
                  id: decodedEvent.id,
                  pubkey: decodedEvent.pubkey,
                  kind: decodedEvent.kind,
                  content: decodedEvent.content,
                  created_at: decodedEvent.created_at,
                  tags: decodedEvent.tags,
                  sig: decodedEvent.sig,
                }
              : undefined,
          });
        }

        // Send response - cast to union type for serialization
        const responseData = this.serializeBtpResponse(
          response as ILPFulfillPacket | ILPRejectPacket
        );
        ws.send(responseData);
      }
    } catch (error) {
      this.logger.error({ peerId, err: error }, 'BTP message handling error');
    }
  }

  // ============================================
  // Peer Communication
  // ============================================

  private async connectToPeer(peerId: string, btpUrl: string): Promise<void> {
    const existingPeer = this.peers.get(peerId);
    if (existingPeer?.ws?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${btpUrl}/${this.config.agentId}`);

      ws.on('open', () => {
        this.logger.info({ peerId, btpUrl }, 'Connected to peer');

        const peer = this.peers.get(peerId);
        if (peer) {
          peer.ws = ws;
        } else {
          this.peers.set(peerId, { peerId, ilpAddress: '', btpUrl, ws });
        }

        resolve();
      });

      ws.on('message', (data) => {
        this.handlePeerResponse(peerId, data as Buffer);
      });

      ws.on('error', (err) => {
        this.logger.error({ peerId, err }, 'Peer connection error');
        reject(err);
      });

      ws.on('close', () => {
        this.logger.info({ peerId }, 'Peer connection closed');
        const peer = this.peers.get(peerId);
        if (peer) {
          peer.ws = undefined;
        }
      });
    });
  }

  private handlePeerResponse(peerId: string, data: Buffer): void {
    try {
      const response = this.parseBtpResponse(data);
      this.logger.debug({ peerId, responseType: response.type }, 'Received peer response');

      // Get pending packet info for correlation
      const pendingPacket = this.pendingPackets.get(peerId);
      if (pendingPacket) {
        this.pendingPackets.delete(peerId);

        // Emit response received telemetry
        const packetType = response.type === PacketType.FULFILL ? 'fulfill' : 'reject';
        const responsePeerConnection = this.peers.get(peerId);
        const responsePeerIlpAddress = responsePeerConnection?.ilpAddress || `g.agent.${peerId}`;
        this.telemetryEmitter.emit({
          type: 'AGENT_CHANNEL_PAYMENT_SENT',
          timestamp: Date.now(),
          nodeId: this.config.agentId,
          agentId: this.config.agentId,
          packetType: packetType as 'prepare' | 'fulfill' | 'reject',
          packetId: pendingPacket.packetId, // Correlate with PREPARE
          from: responsePeerIlpAddress, // Response comes FROM the peer
          to: this.config.ilpAddress, // Response goes TO us
          peerId: peerId,
          channelId: `${peerId}-${this.config.agentId}`,
          amount: pendingPacket.amount,
          destination: pendingPacket.destination,
        });
      }
    } catch (error) {
      this.logger.error({ peerId, err: error }, 'Failed to parse peer response');
    }
  }

  private async sendEventToPeer(
    request: SendEventRequest
  ): Promise<{ success: boolean; error?: string }> {
    const peer = this.peers.get(request.targetPeerId);
    if (!peer) {
      return { success: false, error: `Peer ${request.targetPeerId} not found` };
    }

    // Connect if not connected
    if (!peer.ws || peer.ws.readyState !== WebSocket.OPEN) {
      try {
        await this.connectToPeer(peer.peerId, peer.btpUrl);
      } catch (error) {
        return { success: false, error: `Failed to connect to peer: ${(error as Error).message}` };
      }
    }

    // Create Nostr event
    const event = this.createNostrEvent(request.kind, request.content, request.tags);

    // Define packet amount (in token units for EVM, drops for XRP)
    const packetAmount = 100n;

    // Create ILP Prepare packet
    const packet: ILPPreparePacket = {
      type: PacketType.PREPARE,
      amount: packetAmount,
      destination: peer.ilpAddress,
      executionCondition: AgentNode.AGENT_CONDITION,
      expiresAt: new Date(Date.now() + 30000),
      data: this.toonCodec.encode(event),
    };

    // Find payment channel for this peer and update balance
    const channelInfo = this.updateChannelBalanceForPeer(peer, packetAmount);

    // Send via BTP
    try {
      const btpData = this.serializeBtpPacket(packet);
      peer.ws!.send(btpData);
      this.eventsSent++;

      // Use Nostr event ID as packet ID for correlation (same ID used by receiver)
      const packetId = event.id;

      // Track pending packet for response correlation
      this.pendingPackets.set(request.targetPeerId, {
        peerId: request.targetPeerId,
        destination: packet.destination,
        amount: packet.amount.toString(),
        timestamp: Date.now(),
        packetId,
      });

      // Emit PREPARE telemetry event with channel info
      const preparePeerConnection = this.peers.get(request.targetPeerId);
      const preparePeerIlpAddress =
        preparePeerConnection?.ilpAddress || `g.agent.${request.targetPeerId}`;
      this.telemetryEmitter.emit({
        type: 'AGENT_CHANNEL_PAYMENT_SENT',
        timestamp: Date.now(),
        nodeId: this.config.agentId,
        agentId: this.config.agentId,
        packetType: 'prepare',
        packetId,
        from: this.config.ilpAddress,
        to: preparePeerIlpAddress,
        peerId: request.targetPeerId,
        channelId: channelInfo.channelId || `${this.config.agentId}-${request.targetPeerId}`,
        amount: packet.amount.toString(),
        destination: packet.destination,
        executionCondition: packet.executionCondition.toString('hex'),
        expiresAt: packet.expiresAt.toISOString(),
        // Extended fields for channel tracking
        channelType: channelInfo.channelType,
        channelBalance: channelInfo.balance,
        channelDeposit: channelInfo.deposit,
        event: {
          id: event.id,
          pubkey: event.pubkey,
          kind: event.kind,
          content: event.content,
          created_at: event.created_at,
          tags: event.tags,
          sig: event.sig,
        },
      } as Parameters<typeof this.telemetryEmitter.emit>[0]);

      // Emit balance update telemetry if channel found
      if (channelInfo.channelId) {
        this.telemetryEmitter.emit({
          type: 'AGENT_CHANNEL_BALANCE_UPDATE',
          timestamp: Date.now(),
          nodeId: this.config.agentId,
          agentId: this.config.agentId,
          channelId: channelInfo.channelId,
          channelType: channelInfo.channelType,
          peerId: request.targetPeerId,
          previousBalance: channelInfo.previousBalance,
          newBalance: channelInfo.balance,
          amount: packetAmount.toString(),
          direction: 'outgoing',
          deposit: channelInfo.deposit,
        } as unknown as Parameters<typeof this.telemetryEmitter.emit>[0]);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Find and update the payment channel balance for a peer
   * Prefers EVM channels, falls back to XRP channels, then Aptos channels
   */
  private updateChannelBalanceForPeer(
    peer: { evmAddress?: string; xrpAddress?: string; aptosAddress?: string },
    amount: bigint
  ): {
    channelId: string | null;
    channelType: 'evm' | 'xrp' | 'aptos' | 'none';
    balance: string;
    previousBalance: string;
    deposit: string;
  } {
    // Try EVM channel first
    if (peer.evmAddress) {
      for (const [channelId, channel] of this.paymentChannels) {
        if (channel.peerAddress === peer.evmAddress && channel.status === 'opened') {
          const previousBalance = channel.transferredAmount.toString();
          channel.transferredAmount += amount;
          channel.nonce++;

          // Check settlement threshold
          this.checkChannelSettlementThreshold(
            'evm',
            channelId,
            channel.peerAddress,
            channel.transferredAmount,
            channel.deposit
          );

          return {
            channelId,
            channelType: 'evm',
            balance: channel.transferredAmount.toString(),
            previousBalance,
            deposit: channel.deposit.toString(),
          };
        }
      }
    }

    // Try XRP channel
    if (peer.xrpAddress) {
      for (const [channelId, channel] of this.xrpChannels) {
        if (channel.destination === peer.xrpAddress && channel.status === 'open') {
          const previousBalance = channel.balance;
          const newBalance = (BigInt(channel.balance) + amount).toString();
          channel.balance = newBalance;

          // Check settlement threshold
          this.checkChannelSettlementThreshold(
            'xrp',
            channelId,
            channel.destination,
            BigInt(newBalance),
            BigInt(channel.amount)
          );

          return {
            channelId,
            channelType: 'xrp',
            balance: newBalance,
            previousBalance,
            deposit: channel.amount,
          };
        }
      }
    }

    // Try Aptos channel
    if (peer.aptosAddress) {
      for (const [channelOwner, channel] of this.aptosChannels) {
        if (channel.destination === peer.aptosAddress && channel.status === 'open') {
          const previousClaimed = channel.claimed;
          const newClaimed = (BigInt(channel.claimed) + amount).toString();
          channel.claimed = newClaimed;
          channel.nonce++;

          // Check settlement threshold
          this.checkChannelSettlementThreshold(
            'aptos',
            channelOwner,
            channel.destination,
            BigInt(newClaimed),
            BigInt(channel.deposited)
          );

          return {
            channelId: channelOwner,
            channelType: 'aptos',
            balance: newClaimed,
            previousBalance: previousClaimed,
            deposit: channel.deposited,
          };
        }
      }
    }

    return {
      channelId: null,
      channelType: 'none',
      balance: '0',
      previousBalance: '0',
      deposit: '0',
    };
  }

  /**
   * Check if channel balance exceeds settlement threshold and trigger settlement
   */
  private checkChannelSettlementThreshold(
    chain: 'evm' | 'xrp' | 'aptos',
    channelId: string,
    peerId: string,
    currentBalance: bigint,
    _deposit: bigint
  ): void {
    if (!this.config.settlementThreshold) return;

    const threshold = this.config.settlementThreshold;

    if (currentBalance >= threshold) {
      const exceedsBy = currentBalance - threshold;

      this.logger.info(
        {
          chain,
          channelId,
          peerId,
          currentBalance: currentBalance.toString(),
          threshold: threshold.toString(),
          exceedsBy: exceedsBy.toString(),
        },
        'Settlement threshold exceeded - triggering settlement'
      );

      this.telemetryEmitter.emit({
        type: 'SETTLEMENT_TRIGGERED',
        nodeId: this.config.agentId,
        peerId,
        tokenId: chain,
        currentBalance: currentBalance.toString(),
        threshold: threshold.toString(),
        exceedsBy: exceedsBy.toString(),
        triggerReason: 'THRESHOLD_EXCEEDED',
        timestamp: new Date().toISOString(),
      });

      // Trigger actual settlement asynchronously
      this.performSettlement(chain, channelId, peerId, currentBalance).catch((err) => {
        this.logger.error({ err, chain, channelId, peerId }, 'Settlement failed');
      });
    }
  }

  /**
   * Perform on-chain settlement for a payment channel
   * Note: This requires signed balance proofs from the counterparty.
   * Currently, balance proofs are not exchanged via BTP, so settlement
   * may require manual intervention or cooperative signing.
   */
  private async performSettlement(
    chain: 'evm' | 'xrp' | 'aptos',
    channelId: string,
    peerId: string,
    amount: bigint
  ): Promise<void> {
    this.logger.info(
      { chain, channelId, peerId, amount: amount.toString() },
      'Attempting settlement'
    );

    try {
      switch (chain) {
        case 'evm': {
          // EVM requires cooperative settlement with both parties' signatures
          // or unilateral close with dispute period
          const channel = this.paymentChannels.get(channelId);
          if (!channel) {
            this.logger.warn({ channelId }, 'EVM channel not found for settlement');
            return;
          }
          // TODO: Implement EVM cooperative settlement
          // This requires exchanging balance proofs with the peer
          this.logger.info(
            { channelId, balance: amount.toString() },
            'EVM settlement requires cooperative signing - balance proof exchange not yet implemented in BTP'
          );
          break;
        }

        case 'xrp': {
          // XRP PayChan can be claimed with a signed claim from the channel owner
          const xrpChannel = this.xrpChannels.get(channelId);
          if (!xrpChannel) {
            this.logger.warn({ channelId }, 'XRP channel not found for settlement');
            return;
          }
          // TODO: Implement XRP payment channel claim
          // This requires the channel owner's signature for the claim amount
          this.logger.info(
            { channelId, balance: xrpChannel.balance },
            'XRP settlement requires owner signature - balance proof exchange not yet implemented in BTP'
          );
          break;
        }

        case 'aptos': {
          // Aptos channel claim requires a signature from the channel owner
          const aptosChannel = this.aptosChannels.get(channelId);
          if (!aptosChannel) {
            this.logger.warn({ channelId }, 'Aptos channel not found for settlement');
            return;
          }
          // TODO: Implement Aptos claim submission
          // This requires the channel owner's signature for the claim
          this.logger.info(
            { channelOwner: channelId, claimed: aptosChannel.claimed },
            'Aptos settlement requires owner signature - balance proof exchange not yet implemented in BTP'
          );
          break;
        }
      }

      this.telemetryEmitter.emit({
        type: 'SETTLEMENT_TRIGGERED',
        nodeId: this.config.agentId,
        peerId,
        tokenId: chain,
        currentBalance: amount.toString(),
        threshold: this.config.settlementThreshold?.toString() || '0',
        exceedsBy: '0',
        triggerReason: 'SETTLEMENT_ATTEMPTED',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        { err: error, chain, channelId, peerId },
        'Error during settlement attempt'
      );
      throw error;
    }
  }

  private async broadcastToFollows(
    data: Omit<SendEventRequest, 'targetPeerId'>
  ): Promise<{ sent: number; failed: number; errors: string[] }> {
    const follows = this.agentNode.followGraphRouter.getAllFollows();
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const follow of follows) {
      const peer = Array.from(this.peers.values()).find((p) => p.ilpAddress === follow.ilpAddress);
      if (!peer) {
        failed++;
        errors.push(`No peer connection for ${follow.petname || follow.pubkey}`);
        continue;
      }

      const result = await this.sendEventToPeer({
        targetPeerId: peer.peerId,
        kind: data.kind,
        content: data.content,
        tags: data.tags,
      });

      if (result.success) {
        sent++;
      } else {
        failed++;
        errors.push(`${peer.peerId}: ${result.error}`);
      }
    }

    return { sent, failed, errors };
  }

  // ============================================
  // BTP Packet Serialization (Simplified)
  // ============================================

  private parseBtpPacket(data: Buffer): ILPPreparePacket {
    // Simplified BTP parsing - just JSON for now
    // Real implementation would use proper BTP binary framing
    const json = JSON.parse(data.toString());
    return {
      type: PacketType.PREPARE,
      amount: BigInt(json.amount || 0),
      destination: json.destination || '',
      executionCondition: Buffer.from(json.executionCondition || '', 'base64'),
      expiresAt: new Date(json.expiresAt || Date.now() + 30000),
      data: Buffer.from(json.data || '', 'base64'),
    };
  }

  private serializeBtpPacket(packet: ILPPreparePacket): Buffer {
    const json = {
      type: 'PREPARE',
      amount: packet.amount.toString(),
      destination: packet.destination,
      executionCondition: packet.executionCondition.toString('base64'),
      expiresAt: packet.expiresAt.toISOString(),
      data: packet.data.toString('base64'),
    };
    return Buffer.from(JSON.stringify(json));
  }

  private parseBtpResponse(data: Buffer): { type: PacketType } {
    const json = JSON.parse(data.toString());
    return { type: json.type === 'FULFILL' ? PacketType.FULFILL : PacketType.REJECT };
  }

  private serializeBtpResponse(response: ILPFulfillPacket | ILPRejectPacket): Buffer {
    const typeStr = response.type === PacketType.FULFILL ? 'FULFILL' : 'REJECT';
    const json: Record<string, unknown> = {
      type: typeStr,
    };

    if (response.type === PacketType.FULFILL && response.fulfillment) {
      json.fulfillment = response.fulfillment.toString('base64');
      if (response.data) {
        json.data = response.data.toString('base64');
      }
    } else if (response.type === PacketType.REJECT) {
      json.code = response.code;
      json.message = response.message;
      if (response.data) {
        json.data = response.data.toString('base64');
      }
    }

    return Buffer.from(JSON.stringify(json));
  }

  // ============================================
  // Nostr Event Creation
  // ============================================

  private createNostrEvent(kind: number, content: string, tags?: string[][]): NostrEvent {
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      id: crypto.randomBytes(32).toString('hex'),
      pubkey: this.config.nostrPubkey,
      created_at: timestamp,
      kind,
      tags: tags || [],
      content,
      sig: crypto.randomBytes(64).toString('hex'),
    };
  }

  // ============================================
  // Payment Channels
  // ============================================

  private async openPaymentChannel(
    peerEvmAddress: string,
    depositAmount: bigint
  ): Promise<{ success: boolean; channelId?: string; error?: string }> {
    if (
      !this.evmProvider ||
      !this.evmWallet ||
      !this.tokenNetworkContract ||
      !this.agentTokenContract
    ) {
      return { success: false, error: 'EVM not initialized' };
    }

    try {
      // Get fresh nonce from provider to avoid stale nonce issues
      let nonce = await this.evmProvider.getTransactionCount(this.evmWallet.address);

      // Approve tokens for TokenNetwork
      const tokenNetworkAddress = await this.tokenNetworkContract.getAddress();
      const approveFn = this.agentTokenContract.getFunction('approve');
      const approveTx = await approveFn(tokenNetworkAddress, depositAmount, { nonce });
      await approveTx.wait();
      nonce++;

      this.logger.info(
        { peerEvmAddress, depositAmount: depositAmount.toString() },
        'Opening payment channel'
      );

      // Open channel with 1 hour settlement timeout
      const settlementTimeout = 3600;
      const openChannelFn = this.tokenNetworkContract.getFunction('openChannel');
      const openTx = await openChannelFn(peerEvmAddress, settlementTimeout, { nonce });
      const receipt = await openTx.wait();
      nonce++;

      // Parse ChannelOpened event to get channel ID
      const event = receipt.logs.find((log: ethers.Log) => {
        try {
          const parsed = this.tokenNetworkContract!.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsed?.name === 'ChannelOpened';
        } catch {
          return false;
        }
      });

      if (!event) {
        return { success: false, error: 'ChannelOpened event not found' };
      }

      const parsed = this.tokenNetworkContract.interface.parseLog({
        topics: event.topics as string[],
        data: event.data,
      });
      const channelId = parsed?.args[0] as string;

      // Deposit to channel
      const myAddress = await this.evmWallet.getAddress();
      const setDepositFn = this.tokenNetworkContract.getFunction('setTotalDeposit');
      const depositTx = await setDepositFn(channelId, myAddress, depositAmount, { nonce });
      await depositTx.wait();

      // Track channel
      this.paymentChannels.set(channelId, {
        channelId,
        peerAddress: peerEvmAddress,
        deposit: depositAmount,
        status: 'opened',
        nonce: 0,
        transferredAmount: 0n,
      });

      this.logger.info({ channelId, peerEvmAddress }, 'Payment channel opened');

      // Emit telemetry for payment channel opened
      this.telemetryEmitter.emit({
        type: 'AGENT_CHANNEL_OPENED',
        timestamp: Date.now(),
        nodeId: this.config.agentId,
        agentId: this.config.agentId,
        channelId,
        chain: 'evm',
        peerId: peerEvmAddress,
        amount: depositAmount.toString(),
      });

      return { success: true, channelId };
    } catch (error) {
      this.logger.error({ err: error, peerEvmAddress }, 'Failed to open payment channel');
      return { success: false, error: (error as Error).message };
    }
  }

  // ============================================
  // XRP Payment Channels
  // ============================================

  private async openXRPPaymentChannel(
    destination: string,
    amount: string,
    settleDelay: number
  ): Promise<{ success: boolean; channelId?: string; error?: string }> {
    if (!this.xrplClient || !this.xrplWallet) {
      return { success: false, error: 'XRP not initialized' };
    }

    if (!this.xrplClient.isConnected()) {
      try {
        await this.xrplClient.connect();
      } catch (error) {
        return {
          success: false,
          error: `Failed to connect to XRP ledger: ${(error as Error).message}`,
        };
      }
    }

    try {
      this.logger.info(
        {
          destination,
          amount,
          settleDelay,
          account: this.xrplWallet.address,
          network: this.config.xrpNetwork,
        },
        'Opening XRP payment channel'
      );

      // Get the public key from the wallet for the channel
      const publicKey = this.xrplWallet.publicKey;

      // In standalone mode, advance ledger first to ensure account state is current
      if (this.config.xrpNetwork === 'standalone') {
        try {
          await this.xrplClient.request({ command: 'ledger_accept' } as never);
        } catch {
          // Ignore - may not be needed
        }
      }

      // Construct PaymentChannelCreate transaction
      const tx = {
        TransactionType: 'PaymentChannelCreate' as const,
        Account: this.xrplWallet.address,
        Destination: destination,
        Amount: amount,
        SettleDelay: settleDelay,
        PublicKey: publicKey,
      };

      // Autofill and sign transaction
      const prepared = await this.xrplClient.autofill(tx);
      const signed = this.xrplWallet.sign(prepared);

      let result;
      if (this.config.xrpNetwork === 'standalone') {
        // In standalone mode, submit and manually advance the ledger
        const submitResult = await this.xrplClient.submit(signed.tx_blob);
        if (submitResult.result.engine_result !== 'tesSUCCESS') {
          return { success: false, error: `Submit failed: ${submitResult.result.engine_result}` };
        }
        // Advance the ledger to validate the transaction
        await this.xrplClient.request({ command: 'ledger_accept' } as never);
        // Fetch the transaction to get meta
        const txResponse = await this.xrplClient.request({
          command: 'tx',
          transaction: submitResult.result.tx_json?.hash || signed.hash,
        } as never);
        result = txResponse;
      } else {
        // Normal mode - submit and wait for validation
        result = await this.xrplClient.submitAndWait(signed.tx_blob);
      }

      // The channel ID is derived from the transaction
      // For PaymentChannelCreate, the channel ID is in the meta.AffectedNodes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resultObj = result as any;

      // Handle different response formats from xrpl.js
      // - submitAndWait returns { result: { meta: ... } }
      // - tx command returns { result: { meta: ... } }
      const txResult = resultObj.result || resultObj;
      const meta = txResult.meta as {
        AffectedNodes?: Array<{
          CreatedNode?: {
            LedgerEntryType: string;
            LedgerIndex: string;
          };
        }>;
        TransactionResult?: string;
      };

      // Check if transaction was successful
      if (meta?.TransactionResult && meta.TransactionResult !== 'tesSUCCESS') {
        return { success: false, error: `Transaction failed: ${meta.TransactionResult}` };
      }

      let channelId: string | undefined;
      if (meta?.AffectedNodes) {
        for (const node of meta.AffectedNodes) {
          if (node.CreatedNode?.LedgerEntryType === 'PayChannel') {
            channelId = node.CreatedNode.LedgerIndex;
            break;
          }
        }
      }

      if (!channelId) {
        // Log the result for debugging
        this.logger.warn(
          {
            hasResult: !!txResult,
            hasMeta: !!meta,
            affectedNodesCount: meta?.AffectedNodes?.length || 0,
            transactionResult: meta?.TransactionResult,
          },
          'Channel ID not found in transaction result'
        );
        return { success: false, error: 'Channel ID not found in transaction result' };
      }

      // Track channel
      this.xrpChannels.set(channelId, {
        channelId,
        destination,
        amount,
        balance: '0',
        status: 'open',
        settleDelay,
        publicKey,
      });

      this.logger.info({ channelId, destination }, 'XRP payment channel opened');

      // Emit telemetry for XRP channel opened
      this.telemetryEmitter.emit({
        type: 'AGENT_CHANNEL_OPENED',
        timestamp: Date.now(),
        nodeId: this.config.agentId,
        agentId: this.config.agentId,
        channelId,
        chain: 'xrp',
        peerId: destination,
        amount,
      });

      return { success: true, channelId };
    } catch (error) {
      this.logger.error({ err: error, destination }, 'Failed to open XRP payment channel');
      return { success: false, error: (error as Error).message };
    }
  }

  // ============================================
  // Aptos Payment Channels
  // ============================================

  private async openAptosPaymentChannel(
    destination: string,
    destinationPubkey: string,
    amount: string,
    settleDelay: number
    // Note: coinType is configured at SDK initialization via configure-aptos endpoint
  ): Promise<{ success: boolean; channelOwner?: string; error?: string }> {
    if (!this.aptosChannelSDK) {
      return { success: false, error: 'Aptos not initialized' };
    }

    try {
      this.logger.info(
        {
          destination,
          amount,
          settleDelay,
        },
        'Opening Aptos payment channel'
      );

      // Open channel via SDK (uses coin type from SDK config)
      // Note: coinType is configured when SDK is initialized, not per-channel
      const channelOwner = await this.aptosChannelSDK.openChannel(
        destination,
        destinationPubkey,
        BigInt(amount),
        settleDelay
      );

      // Fetch channel state and track locally
      const channelState = await this.aptosChannelSDK.getChannelState(channelOwner);
      if (channelState) {
        this.aptosChannels.set(channelOwner, {
          channelOwner: channelState.channelOwner,
          destination: channelState.destination,
          destinationPubkey: channelState.destinationPubkey,
          deposited: channelState.deposited.toString(),
          claimed: channelState.claimed.toString(),
          status: channelState.status,
          settleDelay: channelState.settleDelay,
          nonce: channelState.nonce,
        });
      }

      this.logger.info({ channelOwner, destination }, 'Aptos payment channel opened');

      // Emit telemetry
      this.telemetryEmitter.emit({
        type: 'AGENT_CHANNEL_OPENED',
        timestamp: Date.now(),
        nodeId: this.config.agentId,
        agentId: this.config.agentId,
        channelId: channelOwner,
        chain: 'aptos',
        peerId: destination,
        amount,
      });

      return { success: true, channelOwner };
    } catch (error) {
      // Get more detailed error message including original error
      let errorMessage = (error as Error).message;
      if (error && typeof error === 'object' && 'originalError' in error) {
        const originalError = (error as { originalError: unknown }).originalError;
        if (originalError instanceof Error) {
          errorMessage = `${errorMessage}: ${originalError.message}`;
        }
      }
      this.logger.error(
        { err: error, destination, errorMessage },
        'Failed to open Aptos payment channel'
      );
      return { success: false, error: errorMessage };
    }
  }

  private async claimAptosChannel(claim: {
    channelOwner: string;
    amount: string;
    nonce: number;
    signature: string;
  }): Promise<{
    success: boolean;
    channelOwner: string;
    claimedAmount?: string;
    error?: string;
  }> {
    if (!this.aptosChannelSDK) {
      return { success: false, channelOwner: claim.channelOwner, error: 'Aptos not initialized' };
    }

    try {
      this.logger.info(
        {
          channelOwner: claim.channelOwner,
          amount: claim.amount,
          nonce: claim.nonce,
        },
        'Submitting Aptos channel claim'
      );

      // Fetch channel state to get destination public key for claim verification
      const channelState = this.aptosChannels.get(claim.channelOwner);
      if (!channelState) {
        return {
          success: false,
          channelOwner: claim.channelOwner,
          error: 'Channel not found in local state',
        };
      }

      // Submit claim to chain with public key from channel state
      await this.aptosChannelSDK.submitClaim({
        channelOwner: claim.channelOwner,
        amount: BigInt(claim.amount),
        nonce: claim.nonce,
        signature: claim.signature,
        publicKey: channelState.destinationPubkey,
        createdAt: Date.now(),
      });

      // Refresh channel state
      const state = await this.aptosChannelSDK.getChannelState(claim.channelOwner);
      if (state) {
        this.aptosChannels.set(claim.channelOwner, {
          channelOwner: state.channelOwner,
          destination: state.destination,
          destinationPubkey: state.destinationPubkey,
          deposited: state.deposited.toString(),
          claimed: state.claimed.toString(),
          status: state.status,
          settleDelay: state.settleDelay,
          nonce: state.nonce,
        });
      }

      this.logger.info(
        {
          channelOwner: claim.channelOwner,
          claimedAmount: claim.amount,
        },
        'Aptos channel claim submitted'
      );

      return {
        success: true,
        channelOwner: claim.channelOwner,
        claimedAmount: claim.amount,
      };
    } catch (error) {
      this.logger.error(
        { err: error, channelOwner: claim.channelOwner },
        'Aptos channel claim failed'
      );
      return { success: false, channelOwner: claim.channelOwner, error: (error as Error).message };
    }
  }

  private async closeAptosChannel(channelOwner: string): Promise<{
    success: boolean;
    channelOwner: string;
    error?: string;
  }> {
    if (!this.aptosChannelSDK) {
      return { success: false, channelOwner, error: 'Aptos not initialized' };
    }

    try {
      this.logger.info({ channelOwner }, 'Requesting Aptos channel close');

      // Request channel close (starts settle delay)
      await this.aptosChannelSDK.requestClose(channelOwner);

      // Update local state to 'closing'
      const channel = this.aptosChannels.get(channelOwner);
      if (channel) {
        channel.status = 'closing';
      }

      this.logger.info({ channelOwner }, 'Aptos channel close requested');

      return { success: true, channelOwner };
    } catch (error) {
      this.logger.error({ err: error, channelOwner }, 'Aptos channel close failed');
      return { success: false, channelOwner, error: (error as Error).message };
    }
  }

  // ============================================
  // EVM Settlement
  // ============================================

  private async signBalanceProof(
    channelId: string,
    nonce: number,
    transferredAmount: string
  ): Promise<{ signature?: string; signer?: string; error?: string }> {
    if (!this.evmWallet || !this.evmProvider || !this.config.tokenNetworkAddress) {
      return { error: 'EVM not initialized' };
    }

    try {
      const network = await this.evmProvider.getNetwork();
      const domain = getDomainSeparator(network.chainId, this.config.tokenNetworkAddress);
      const types = getBalanceProofTypes();
      const value = {
        channelId,
        nonce,
        transferredAmount,
        lockedAmount: 0,
        locksRoot: ethers.ZeroHash,
      };

      const signature = await this.evmWallet.signTypedData(domain, types, value);
      return { signature, signer: this.evmWallet.address };
    } catch (error) {
      this.logger.error({ err: error, channelId }, 'Failed to sign balance proof');
      return { error: (error as Error).message };
    }
  }

  private async cooperativeSettle(data: {
    channelId: string;
    proof1: {
      channelId: string;
      nonce: number;
      transferredAmount: string;
      lockedAmount: number;
      locksRoot: string;
    };
    sig1: string;
    proof2: {
      channelId: string;
      nonce: number;
      transferredAmount: string;
      lockedAmount: number;
      locksRoot: string;
    };
    sig2: string;
  }): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (!this.tokenNetworkContract || !this.evmWallet) {
      return { success: false, error: 'EVM not initialized' };
    }

    const proof1Tuple = [
      data.proof1.channelId,
      data.proof1.nonce,
      data.proof1.transferredAmount,
      data.proof1.lockedAmount,
      data.proof1.locksRoot,
    ];
    const proof2Tuple = [
      data.proof2.channelId,
      data.proof2.nonce,
      data.proof2.transferredAmount,
      data.proof2.lockedAmount,
      data.proof2.locksRoot,
    ];

    // Retry with escalating nonce on nonce collision (ethers v6 internal tracker can get out of sync)
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const nonce = await this.evmProvider!.getTransactionCount(this.evmWallet.address, 'latest');
        const adjustedNonce = nonce + attempt; // Escalate nonce on retry
        const settleFn = this.tokenNetworkContract.getFunction('cooperativeSettle');
        const tx = await settleFn(data.channelId, proof1Tuple, data.sig1, proof2Tuple, data.sig2, {
          nonce: adjustedNonce,
        });
        // Wait for 1 confirmation with a timeout
        const receipt = await Promise.race([
          tx.wait(1),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('tx.wait timeout')), 30000)
          ),
        ]);

        // Update local channel state
        const channel = this.paymentChannels.get(data.channelId);
        if (channel) {
          channel.status = 'settled';
        }

        this.logger.info(
          { channelId: data.channelId, txHash: receipt.hash },
          'Channel cooperatively settled'
        );
        return { success: true, txHash: receipt.hash };
      } catch (error) {
        const errMsg = (error as Error).message || '';
        if (errMsg.includes('nonce') && attempt < maxRetries - 1) {
          this.logger.warn(
            { channelId: data.channelId, attempt, nonce: attempt },
            'Nonce collision, retrying with incremented nonce'
          );
          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }
        this.logger.error({ err: error, channelId: data.channelId }, 'Cooperative settle failed');
        return { success: false, error: errMsg };
      }
    }
    return { success: false, error: 'Max retries exceeded' };
  }

  // ============================================
  // XRP Settlement
  // ============================================

  private async claimXRPChannel(channelId: string): Promise<{
    success: boolean;
    channelId: string;
    claimedAmount?: string;
    txHash?: string;
    error?: string;
  }> {
    if (!this.xrplClient || !this.xrplWallet) {
      return { success: false, channelId, error: 'XRP not initialized' };
    }

    const channel = this.xrpChannels.get(channelId);
    if (!channel) {
      return { success: false, channelId, error: 'Channel not found' };
    }

    if (!this.xrplClient.isConnected()) {
      try {
        await this.xrplClient.connect();
      } catch (error) {
        return {
          success: false,
          channelId,
          error: `Failed to connect to XRP ledger: ${(error as Error).message}`,
        };
      }
    }

    try {
      const balance = channel.balance;

      // Sign the payment channel claim (signPaymentChannelClaim expects XRP, not drops)
      const balanceInXRP = dropsToXrp(balance);
      const signature = signPaymentChannelClaim(
        channelId,
        balanceInXRP,
        this.xrplWallet.privateKey
      );

      // Submit PaymentChannelClaim transaction
      const tx = {
        TransactionType: 'PaymentChannelClaim' as const,
        Account: this.xrplWallet.address,
        Channel: channelId,
        Balance: balance,
        Amount: balance,
        Signature: signature.toUpperCase(),
        PublicKey: this.xrplWallet.publicKey,
      };

      const prepared = await this.xrplClient.autofill(tx);
      const signed = this.xrplWallet.sign(prepared);

      let txHash: string | undefined;
      if (this.config.xrpNetwork === 'standalone') {
        const submitResult = await this.xrplClient.submit(signed.tx_blob);
        if (submitResult.result.engine_result !== 'tesSUCCESS') {
          return {
            success: false,
            channelId,
            error: `Claim submit failed: ${submitResult.result.engine_result}`,
          };
        }
        await this.xrplClient.request({ command: 'ledger_accept' } as never);
        txHash = submitResult.result.tx_json?.hash || signed.hash;
      } else {
        const result = await this.xrplClient.submitAndWait(signed.tx_blob);
        txHash = result.result.hash;
      }

      this.logger.info({ channelId, claimedAmount: balance, txHash }, 'XRP channel claimed');

      return {
        success: true,
        channelId,
        claimedAmount: balance,
        txHash,
      };
    } catch (error) {
      this.logger.error({ err: error, channelId }, 'XRP channel claim failed');
      return { success: false, channelId, error: (error as Error).message };
    }
  }

  // ============================================
  // Balance Queries
  // ============================================

  private async getBalances(): Promise<{
    agentId: string;
    evmAddress: string;
    xrpAddress: string | null;
    aptosAddress: string | null;
    ethBalance: string | null;
    agentTokenBalance: string | null;
    xrpBalance: string | null;
    aptosBalance: string | null;
    evmChannels: Array<{
      channelId: string;
      peerAddress: string;
      deposit: string;
      transferredAmount: string;
      status: string;
    }>;
    xrpChannels: Array<{
      channelId: string;
      destination: string;
      amount: string;
      balance: string;
      status: string;
    }>;
    aptosChannels: Array<{
      channelOwner: string;
      destination: string;
      deposited: string;
      claimed: string;
      status: string;
    }>;
  }> {
    let ethBalance: string | null = null;
    let agentTokenBalance: string | null = null;
    let xrpBalance: string | null = null;
    let aptosBalance: string | null = null;

    // Query EVM balances
    if (this.evmProvider && this.evmWallet) {
      try {
        const rawEth = await this.evmProvider.getBalance(this.evmWallet.address);
        ethBalance = ethers.formatEther(rawEth);
      } catch {
        // ignore
      }

      if (this.agentTokenContract) {
        try {
          const balFn = this.agentTokenContract.getFunction('balanceOf');
          const rawToken = await balFn(this.evmWallet.address);
          agentTokenBalance = ethers.formatUnits(rawToken, 18);
        } catch {
          // ignore
        }
      }
    }

    // Query XRP balance
    if (this.xrplClient?.isConnected() && this.config.xrpAccountAddress) {
      try {
        const info = await this.xrplClient.request({
          command: 'account_info',
          account: this.config.xrpAccountAddress,
          ledger_index: 'validated',
        });
        const drops = info.result.account_data.Balance;
        xrpBalance = (Number(drops) / 1_000_000).toFixed(6);
      } catch {
        // ignore
      }
    }

    // Query Aptos balance
    if (this.aptosClient?.isConnected() && this.config.aptosAccountAddress) {
      try {
        // Query APT balance via Aptos client (returns bigint in octas)
        const balanceOctas = await this.aptosClient.getBalance(this.config.aptosAccountAddress);
        // Convert octas to APT (1 APT = 100,000,000 octas)
        aptosBalance = (Number(balanceOctas) / 100_000_000).toFixed(8);
      } catch {
        // ignore - balance query failed
      }
    }

    return {
      agentId: this.config.agentId,
      evmAddress: this.config.evmAddress,
      xrpAddress: this.config.xrpAccountAddress,
      aptosAddress: this.config.aptosAccountAddress,
      ethBalance,
      agentTokenBalance,
      xrpBalance,
      aptosBalance,
      evmChannels: Array.from(this.paymentChannels.values()).map((ch) => ({
        channelId: ch.channelId,
        peerAddress: ch.peerAddress,
        deposit: ethers.formatUnits(ch.deposit, 18),
        transferredAmount: ethers.formatUnits(ch.transferredAmount, 18),
        status: ch.status,
      })),
      xrpChannels: Array.from(this.xrpChannels.values()).map((ch) => ({
        channelId: ch.channelId,
        destination: ch.destination,
        amount: (Number(ch.amount) / 1_000_000).toFixed(6),
        balance: (Number(ch.balance) / 1_000_000).toFixed(6),
        status: ch.status,
      })),
      aptosChannels: Array.from(this.aptosChannels.values()).map((ch) => ({
        channelOwner: ch.channelOwner,
        destination: ch.destination,
        deposited: (Number(ch.deposited) / 100_000_000).toFixed(8), // Octas to APT
        claimed: (Number(ch.claimed) / 100_000_000).toFixed(8),
        status: ch.status,
      })),
    };
  }

  // ============================================
  // Peer & Routing Data for Explorer
  // ============================================

  private async getPeers(): Promise<
    Array<{
      peerId: string;
      ilpAddress: string;
      evmAddress?: string;
      xrpAddress?: string;
      btpUrl?: string;
      connected: boolean;
      petname?: string;
      pubkey?: string;
    }>
  > {
    const follows = this.agentNode.followGraphRouter.getAllFollows();
    return follows.map((follow) => {
      // Find matching peer connection by ILP address to get richer data
      const peerConn = Array.from(this.peers.values()).find(
        (p) => p.ilpAddress === follow.ilpAddress
      );
      const isConnected = peerConn?.ws?.readyState === WebSocket.OPEN;

      return {
        peerId: follow.petname || follow.pubkey.slice(0, 8),
        ilpAddress: follow.ilpAddress,
        evmAddress: peerConn?.evmAddress,
        xrpAddress: peerConn?.xrpAddress,
        btpUrl: peerConn?.btpUrl,
        connected: isConnected,
        petname: follow.petname,
        pubkey: follow.pubkey,
      };
    });
  }

  private async getRoutes(): Promise<
    Array<{ prefix: string; nextHop: string; priority?: number }>
  > {
    // Build routing table from follows — each follow's ILP address is a route prefix
    const follows = this.agentNode.followGraphRouter.getAllFollows();
    return follows.map((follow) => ({
      prefix: follow.ilpAddress,
      nextHop: follow.petname || follow.pubkey.slice(0, 8),
    }));
  }

  // ============================================
  // Accessors
  // ============================================

  get agentId(): string {
    return this.config.agentId;
  }

  get pubkey(): string {
    return this.config.nostrPubkey;
  }

  get ilpAddress(): string {
    return this.config.ilpAddress;
  }

  get node(): AgentNode {
    return this.agentNode;
  }

  // ============================================
  // Settlement Threshold Configuration
  // ============================================

  /**
   * Configure settlement threshold at runtime
   * Threshold is checked automatically when channel balances change (no polling)
   */
  public setSettlementThreshold(threshold: bigint | null): void {
    this.config.settlementThreshold = threshold;
    this.logger.info(
      { threshold: threshold?.toString() || 'disabled' },
      'Settlement threshold updated'
    );
  }
}

// ============================================
// Main Entry Point
// ============================================

async function main(): Promise<void> {
  const server = new AgentServer({
    agentId: process.env.AGENT_ID,
    httpPort: parseInt(process.env.AGENT_HTTP_PORT || '8080', 10),
    btpPort: parseInt(process.env.AGENT_BTP_PORT || '3000', 10),
    explorerPort: parseInt(process.env.AGENT_EXPLORER_PORT || '9000', 10),
    nostrPubkey: process.env.AGENT_PUBKEY,
    nostrPrivkey: process.env.AGENT_PRIVKEY,
    databasePath: process.env.AGENT_DATABASE_PATH || ':memory:',
    explorerDbPath: process.env.AGENT_EXPLORER_DB_PATH || ':memory:',
  });

  // Handle shutdown signals
  const shutdown = async (): Promise<void> => {
    await server.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await server.start();
}

// Run if executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to start agent server:', err);
    process.exit(1);
  });
}
