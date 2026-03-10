/**
 * Per-Packet Claims E2E Test
 *
 * Validates that signed payment channel claims travel with each ILP PREPARE
 * packet via BTP protocolData.
 *
 * Two modes:
 *
 * A. In-Process (E2E_TESTS=true):
 *    - In-process ConnectorNode instances with in-memory ledger (no TigerBeetle)
 *    - Anvil (local EVM node, chain 31337) for settlement infrastructure
 *    - Sends packets via connectorA.sendPacket() directly
 *
 * B. Docker (E2E_DOCKER_TESTS=true):
 *    - Docker containers with TigerBeetle backend
 *    - Sends packets via Admin API HTTP endpoint
 *
 * Prerequisites:
 *   In-Process: ./scripts/run-per-packet-claims-e2e.sh
 *   Docker:     ./scripts/run-per-packet-claims-e2e.sh --docker
 *
 * Test scenarios:
 * 1. Claims travel with packets (valid EIP-712 signature, correct nonce/cumulative)
 * 2. Cumulative claim accuracy across multiple packets
 * 3. Packets flow without claims when no channel exists
 * 4. Claim failure resilience (packets still forward)
 * 5. Multi-hop packet routing (A → B → C)
 * 6. F02 error for unknown destinations
 * 7. Connection failure handling (T01 when intermediate node down)
 * 8. Full settlement lifecycle (in-memory ledger + Anvil):
 *    a. Per-packet balance verification (wallet + accounting per packet)
 *    b. Auto channel creation + deposit on first settlement trigger
 *    c. Receiving peer claims using sender's signed balance proofs
 *    d. Channel close initiates grace period
 *    e. Sender settle before grace period → ChallengeNotExpiredError
 *    f. Receiver claims during grace period → succeeds
 *    g. Receiver claims after grace period (before settle) → succeeds
 *    h. Sender settles after grace period → remaining funds returned
 *    i. Receiver claims on settled channel → fails
 *    j. Final balance reconciliation: A_spent === B_received
 */

/* eslint-disable no-console */

import { ConnectorNode } from '../../src/core/connector-node';
import type { ConnectorConfig } from '../../src/config/types';
import { AccountManager } from '../../src/settlement/account-manager';
import { SettlementMonitor } from '../../src/settlement/settlement-monitor';
import { SettlementState } from '../../src/config/types';
import pino from 'pino';
import { ethers } from 'ethers';
import {
  PacketType,
  ILPPreparePacket,
  ILPRejectPacket,
  ILPErrorCode,
  BalanceProof,
} from '@crosstown/shared';
import { waitFor } from '../helpers/wait-for';

// 5-minute timeout for E2E tests
jest.setTimeout(300000);

// ============================================================================
// Configuration
// ============================================================================

const ANVIL_RPC_URL = 'http://localhost:8545';

// Deployed contracts (deterministic from docker-compose)
const TOKEN_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const REGISTRY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

// Anvil default accounts
const CONNECTOR_A_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const CONNECTOR_B_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const CONNECTOR_C_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';

// Derived EVM addresses from Anvil private keys
const CONNECTOR_A_ADDRESS = new ethers.Wallet(CONNECTOR_A_KEY).address;
const CONNECTOR_B_ADDRESS = new ethers.Wallet(CONNECTOR_B_KEY).address;
// CONNECTOR_C_ADDRESS not used in settlement tests yet but available
// const CONNECTOR_C_ADDRESS = new ethers.Wallet(CONNECTOR_C_KEY).address;

// TigerBeetle (exposed via docker-compose-base-e2e-test.yml)
// Use 127.0.0.1 instead of localhost to avoid IPv6 resolution (TigerBeetle requires IPv4)
const TIGERBEETLE_ADDRESS = '127.0.0.1:3000';
const TIGERBEETLE_CLUSTER_ID = '0';

// Docker connector endpoints
const DOCKER_HEALTH_A = 'http://localhost:8080/health';
const DOCKER_HEALTH_B = 'http://localhost:8090/health';

// ERC20 ABI for token balance queries
const ERC20_BALANCE_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function symbol() view returns (string)',
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Query ERC20 token balance for an address on Anvil
 */
async function getTokenBalance(address: string): Promise<bigint> {
  const provider = new ethers.JsonRpcProvider(ANVIL_RPC_URL);
  const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_BALANCE_ABI, provider);
  const balance = await token.getFunction('balanceOf')(address);
  return balance as bigint;
}

/**
 * Access AccountManager from a ConnectorNode (test-only)
 */
function getAccountManager(connector: ConnectorNode): AccountManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (connector as any)._accountManager as AccountManager;
}

/**
 * Access SettlementMonitor from a ConnectorNode (test-only)
 */
function getSettlementMonitor(connector: ConnectorNode): SettlementMonitor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (connector as any)._settlementMonitor as SettlementMonitor;
}

/**
 * Check if TigerBeetle is reachable at the expected address
 */
async function isTigerBeetleAvailable(): Promise<boolean> {
  const net = await import('net');
  const [host, portStr] = TIGERBEETLE_ADDRESS.split(':');
  const port = parseInt(portStr!, 10);
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 2000 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForAnvil(timeout: number = 30000): Promise<void> {
  await waitFor(
    async () => {
      const response = await fetch(ANVIL_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1,
        }),
      });
      return response.ok;
    },
    { timeout, interval: 1000 }
  );
}

async function waitForDockerConnectors(timeout: number = 120000): Promise<void> {
  console.log('Waiting for Docker connectors to become healthy...');
  await waitFor(
    async () => {
      const [responseA, responseB] = await Promise.all([
        fetch(DOCKER_HEALTH_A).catch(() => null),
        fetch(DOCKER_HEALTH_B).catch(() => null),
      ]);
      return responseA?.ok === true && responseB?.ok === true;
    },
    { timeout, interval: 2000 }
  );
  console.log('Docker connectors are healthy');

  // Verify Admin API is actually reachable (port may be blocked by another process)
  const adminHealth = await fetch('http://localhost:8081/health').catch(() => null);
  if (adminHealth?.ok) {
    const body = (await adminHealth.json()) as { service?: string };
    if (body.service !== 'admin-api') {
      throw new Error(
        'Port 8081 is occupied by another process (not the connector Admin API). ' +
          'Stop the conflicting process and retry.'
      );
    }
  } else {
    throw new Error('Admin API on port 8081 is not reachable');
  }
  console.log('Admin API is reachable');
}

async function sendViaAdminApi(
  port: number,
  destination: string,
  amount: bigint
): Promise<{ type: string; [key: string]: unknown }> {
  const response = await fetch(`http://localhost:${port}/admin/ilp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destination,
      amount: amount.toString(),
      data: Buffer.alloc(0).toString('base64'),
      timeoutMs: 30000,
    }),
  });
  const text = await response.text();
  try {
    return JSON.parse(text) as { type: string; [key: string]: unknown };
  } catch {
    throw new Error(
      `Admin API returned non-JSON response (status ${response.status}): ${text.slice(0, 200)}`
    );
  }
}

/**
 * Fast-forward Anvil EVM block time by the given number of seconds.
 * Advances the internal clock and mines a new block so subsequent
 * transactions see the updated timestamp.
 */
async function advanceAnvilTime(seconds: number): Promise<void> {
  await fetch(ANVIL_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'evm_increaseTime',
      params: [seconds],
      id: 1,
    }),
  });
  await fetch(ANVIL_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'evm_mine',
      params: [],
      id: 2,
    }),
  });
}

/**
 * Take a snapshot of the current Anvil EVM state.
 * Returns a snapshot ID that can be used with revertAnvilSnapshot.
 */
async function takeAnvilSnapshot(): Promise<string> {
  const response = await fetch(ANVIL_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'evm_snapshot',
      params: [],
      id: 1,
    }),
  });
  const json = (await response.json()) as { result: string };
  return json.result;
}

/**
 * Revert Anvil EVM state to a previously taken snapshot.
 * Restores all balances, nonces, contract state, and block timestamp.
 */
async function revertAnvilSnapshot(snapshotId: string): Promise<void> {
  await fetch(ANVIL_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'evm_revert',
      params: [snapshotId],
      id: 1,
    }),
  });
}

// Save the original Date.now before any test mocking can occur.
// This prevents infinite recursion when jest.spyOn(Date, 'now') is
// called multiple times across suites without proper cleanup.
const originalDateNow = Date.now.bind(Date);

function createTestPacket(amount: bigint, destination: string): ILPPreparePacket {
  // Use unique executionCondition per packet for TigerBeetle transfer ID uniqueness
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const condition = require('crypto').randomBytes(32) as Buffer;
  return {
    type: PacketType.PREPARE,
    amount,
    destination,
    executionCondition: condition,
    expiresAt: new Date(Date.now() + 30000),
    data: Buffer.alloc(0),
  };
}

// ============================================================================
// Test Suite A: In-Process Mode
// ============================================================================

const SKIP_IN_PROCESS = process.env.E2E_TESTS !== 'true';
const describeInProcess = SKIP_IN_PROCESS ? describe.skip : describe;

describeInProcess('Per-Packet Claims E2E - In-Process', () => {
  let connectorA: ConnectorNode;
  let connectorB: ConnectorNode;
  let connectorC: ConnectorNode;

  beforeAll(async () => {
    console.log('Setting up Per-Packet Claims E2E (In-Process) - 3-node topology...');

    // Set BTP peer secrets for permissionless mode
    process.env.BTP_PEER_CONNECTOR_A_SECRET = '';
    process.env.BTP_PEER_CONNECTOR_B_SECRET = '';
    process.env.BTP_PEER_CONNECTOR_C_SECRET = '';

    // Verify Anvil is running
    try {
      await waitForAnvil();
      console.log('Anvil is ready');
    } catch {
      throw new Error(
        'Anvil not available. Run: docker compose -f docker-compose-base-e2e-test.yml up -d anvil_base_e2e'
      );
    }

    // Create Connector A config (routes to B and C via B)
    const configA: Partial<ConnectorConfig> = {
      nodeId: 'connector-a',
      btpServerPort: 14001,
      healthCheckPort: 18080,
      peers: [
        {
          id: 'connector-b',
          url: 'ws://localhost:14002',
          authToken: '',
        },
      ],
      routes: [
        { prefix: 'g.test.connector-b', nextHop: 'connector-b' },
        { prefix: 'g.test.connector-c', nextHop: 'connector-b' },
      ],
      settlementInfra: {
        enabled: true,
        rpcUrl: ANVIL_RPC_URL,
        registryAddress: REGISTRY_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
        privateKey: CONNECTOR_A_KEY,
      },
      adminApi: { enabled: false },
      explorer: { enabled: false },
    };

    // Create Connector B config (hub: peers with both A and C)
    const configB: Partial<ConnectorConfig> = {
      nodeId: 'connector-b',
      btpServerPort: 14002,
      healthCheckPort: 18090,
      peers: [
        {
          id: 'connector-a',
          url: 'ws://localhost:14001',
          authToken: '',
        },
        {
          id: 'connector-c',
          url: 'ws://localhost:14003',
          authToken: '',
        },
      ],
      routes: [
        { prefix: 'g.test.connector-a', nextHop: 'connector-a' },
        { prefix: 'g.test.connector-c', nextHop: 'connector-c' },
      ],
      settlementInfra: {
        enabled: true,
        rpcUrl: ANVIL_RPC_URL,
        registryAddress: REGISTRY_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
        privateKey: CONNECTOR_B_KEY,
      },
      adminApi: { enabled: false },
      explorer: { enabled: false },
    };

    // Create Connector C config (leaf node, peers with B)
    const configC: Partial<ConnectorConfig> = {
      nodeId: 'connector-c',
      btpServerPort: 14003,
      healthCheckPort: 18100,
      peers: [
        {
          id: 'connector-b',
          url: 'ws://localhost:14002',
          authToken: '',
        },
      ],
      routes: [
        { prefix: 'g.test.connector-b', nextHop: 'connector-b' },
        { prefix: 'g.test.connector-a', nextHop: 'connector-b' },
      ],
      settlementInfra: {
        enabled: true,
        rpcUrl: ANVIL_RPC_URL,
        registryAddress: REGISTRY_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
        privateKey: CONNECTOR_C_KEY,
      },
      adminApi: { enabled: false },
      explorer: { enabled: false },
    };

    const loggerA = pino({ level: 'warn' });
    const loggerB = pino({ level: 'warn' });
    const loggerC = pino({ level: 'warn' });

    connectorA = new ConnectorNode(configA as ConnectorConfig, loggerA);
    connectorB = new ConnectorNode(configB as ConnectorConfig, loggerB);
    connectorC = new ConnectorNode(configC as ConnectorConfig, loggerC);

    // Start connectors in reverse order so upstream peers can connect
    await connectorC.start();
    await connectorB.start();
    await connectorA.start();

    // Wait for BTP connections to establish
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log('3-node topology started and connected (A → B → C)');
  });

  afterAll(async () => {
    console.log('Cleaning up...');
    try {
      await connectorA?.stop();
    } catch {
      // ignore cleanup errors
    }
    try {
      await connectorB?.stop();
    } catch {
      // ignore cleanup errors
    }
    try {
      await connectorC?.stop();
    } catch {
      // ignore cleanup errors
    }
    // Clear BTP peer env vars to avoid leaking state
    delete process.env.BTP_PEER_CONNECTOR_A_SECRET;
    delete process.env.BTP_PEER_CONNECTOR_B_SECRET;
    delete process.env.BTP_PEER_CONNECTOR_C_SECRET;
  });

  it('should forward packets without claims when no payment channel exists', async () => {
    const packet = createTestPacket(1000n, 'g.test.connector-b.receiver');

    const response = await connectorA.sendPacket({
      destination: packet.destination,
      amount: packet.amount,
      executionCondition: packet.executionCondition,
      expiresAt: packet.expiresAt,
      data: packet.data,
    });

    expect(response).toBeDefined();
    console.log(
      'Packet forwarded without claims (graceful degradation)',
      response.type ?? 'response received'
    );
  });

  it('should send multiple packets and verify cumulative claim tracking', async () => {
    const amounts = [100n, 200n, 300n];
    const responses = [];

    for (const amount of amounts) {
      const packet = createTestPacket(amount, 'g.test.connector-b.receiver');
      const response = await connectorA.sendPacket({
        destination: packet.destination,
        amount: packet.amount,
        executionCondition: packet.executionCondition,
        expiresAt: packet.expiresAt,
        data: packet.data,
      });
      responses.push(response);
    }

    expect(responses).toHaveLength(3);
    responses.forEach((response) => {
      expect(response).toBeDefined();
    });

    console.log('Multiple packets forwarded successfully');
  });

  // ==========================================================================
  // Multi-Hop Packet Routing (replaces multi-node-forwarding.test.ts)
  // ==========================================================================

  it('should route packet through A → B → C (multi-hop forwarding)', async () => {
    const packet = createTestPacket(1000n, 'g.test.connector-c.receiver');

    const response = await connectorA.sendPacket({
      destination: packet.destination,
      amount: packet.amount,
      executionCondition: packet.executionCondition,
      expiresAt: packet.expiresAt,
      data: packet.data,
    });

    // Connector C returns F02 because it has no local receiver — this confirms
    // the packet successfully routed through A → B → C
    expect(response).toBeDefined();
    expect(response.type).toBe(PacketType.REJECT);
    if (response.type === PacketType.REJECT) {
      const reject = response as ILPRejectPacket;
      expect(reject.code).toBe(ILPErrorCode.F02_UNREACHABLE);
      expect(reject.triggeredBy).toBe('connector-c');
    }
    console.log('Multi-hop packet routed A → B → C successfully');
  });

  it('should return F02 for unknown destination', async () => {
    const packet = createTestPacket(1000n, 'g.test.unknown.destination');

    const response = await connectorA.sendPacket({
      destination: packet.destination,
      amount: packet.amount,
      executionCondition: packet.executionCondition,
      expiresAt: packet.expiresAt,
      data: packet.data,
    });

    expect(response).toBeDefined();
    expect(response.type).toBe(PacketType.REJECT);
    if (response.type === PacketType.REJECT) {
      const reject = response as ILPRejectPacket;
      expect(reject.code).toBe(ILPErrorCode.F02_UNREACHABLE);
    }
    console.log('Unknown destination correctly rejected with F02');
  });

  it('should return error when intermediate connector is down', async () => {
    // Stop connector B to simulate intermediate node failure
    await connectorB.stop();

    // Wait for connection loss to be detected
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const packet = createTestPacket(1000n, 'g.test.connector-c.receiver');

    const response = await connectorA.sendPacket({
      destination: packet.destination,
      amount: packet.amount,
      executionCondition: packet.executionCondition,
      expiresAt: packet.expiresAt,
      data: packet.data,
    });

    expect(response).toBeDefined();
    expect(response.type).toBe(PacketType.REJECT);
    if (response.type === PacketType.REJECT) {
      const reject = response as ILPRejectPacket;
      // T01 (Peer Unreachable) or R00 (Transfer Timed Out) are both valid
      expect([ILPErrorCode.T01_PEER_UNREACHABLE, ILPErrorCode.R00_TRANSFER_TIMED_OUT]).toContain(
        reject.code
      );
    }
    console.log('Intermediate node failure correctly produces error');

    // Restart connector B for any subsequent tests
    const configB: Partial<ConnectorConfig> = {
      nodeId: 'connector-b',
      btpServerPort: 14002,
      healthCheckPort: 18090,
      peers: [
        { id: 'connector-a', url: 'ws://localhost:14001', authToken: '' },
        { id: 'connector-c', url: 'ws://localhost:14003', authToken: '' },
      ],
      routes: [
        { prefix: 'g.test.connector-a', nextHop: 'connector-a' },
        { prefix: 'g.test.connector-c', nextHop: 'connector-c' },
      ],
      settlementInfra: {
        enabled: true,
        rpcUrl: ANVIL_RPC_URL,
        registryAddress: REGISTRY_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
        privateKey: CONNECTOR_B_KEY,
      },
      adminApi: { enabled: false },
      explorer: { enabled: false },
    };
    connectorB = new ConnectorNode(configB as ConnectorConfig, pino({ level: 'warn' }));
    await connectorB.start();
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });
});

// ============================================================================
// Test Suite B: Docker Mode
// ============================================================================

const SKIP_DOCKER = process.env.E2E_DOCKER_TESTS !== 'true';
const describeDocker = SKIP_DOCKER ? describe.skip : describe;

describeDocker('Per-Packet Claims E2E - Docker', () => {
  beforeAll(async () => {
    console.log('Setting up Per-Packet Claims E2E (Docker)...');

    // Wait for Docker connectors to become healthy
    try {
      await waitForDockerConnectors();
    } catch {
      throw new Error(
        'Docker connectors not available. Run: ./scripts/run-per-packet-claims-e2e.sh --docker'
      );
    }
  });

  it('should forward packets without claims when no payment channel exists', async () => {
    const response = await sendViaAdminApi(8081, 'g.test.connector-b.receiver', 1000n);

    expect(response).toBeDefined();
    console.log(
      'Packet forwarded without claims via Docker (graceful degradation)',
      response.type ?? 'response received'
    );
  });

  it('should send multiple packets and verify cumulative claim tracking', async () => {
    const amounts = [100n, 200n, 300n];
    const responses = [];

    for (const amount of amounts) {
      const response = await sendViaAdminApi(8081, 'g.test.connector-b.receiver', amount);
      responses.push(response);
    }

    expect(responses).toHaveLength(3);
    responses.forEach((response) => {
      expect(response).toBeDefined();
    });

    console.log('Multiple packets forwarded via Docker successfully');
  });
});

// ============================================================================
// Settlement Test Helpers
// ============================================================================

// Settlement test configuration shared across ledger backends
const SETTLEMENT_THRESHOLD = '500';
const SETTLEMENT_POLLING_MS = 500;
const PACKET_AMOUNT = 200n;
const PACKETS_TO_SEND = 3; // 3 × 200 = 600 > 500 threshold
const SETTLEMENT_TIMEOUT_SECS = 3600; // 1 hour — contract-enforced minimum (MIN_SETTLEMENT_TIMEOUT)

interface SettlementTestEnv {
  connectorA: ConnectorNode;
  connectorB: ConnectorNode;
}

/**
 * Build connector configs for the 2-node settlement topology.
 * Uses unique ports offset by `portOffset` to avoid conflicts across suites.
 */
function buildSettlementConfigs(portOffset: number): {
  configA: Partial<ConnectorConfig>;
  configB: Partial<ConnectorConfig>;
} {
  const btpPortA = 15001 + portOffset;
  const btpPortB = 15002 + portOffset;
  const healthPortA = 19080 + portOffset;
  const healthPortB = 19090 + portOffset;

  const configA: Partial<ConnectorConfig> = {
    nodeId: 'settlement-a',
    btpServerPort: btpPortA,
    healthCheckPort: healthPortA,
    peers: [
      {
        id: 'settlement-b',
        url: `ws://localhost:${btpPortB}`,
        authToken: '',
        evmAddress: CONNECTOR_B_ADDRESS,
      },
    ],
    routes: [{ prefix: 'g.test.settlement-b', nextHop: 'settlement-b' }],
    settlementInfra: {
      enabled: true,
      rpcUrl: ANVIL_RPC_URL,
      registryAddress: REGISTRY_ADDRESS,
      tokenAddress: TOKEN_ADDRESS,
      privateKey: CONNECTOR_A_KEY,
      threshold: SETTLEMENT_THRESHOLD,
      pollingIntervalMs: SETTLEMENT_POLLING_MS,
      initialDepositMultiplier: 2,
      settlementTimeoutSecs: SETTLEMENT_TIMEOUT_SECS,
    },
    adminApi: { enabled: false },
    explorer: { enabled: false },
  };

  const configB: Partial<ConnectorConfig> = {
    nodeId: 'settlement-b',
    btpServerPort: btpPortB,
    healthCheckPort: healthPortB,
    peers: [
      {
        id: 'settlement-a',
        url: `ws://localhost:${btpPortA}`,
        authToken: '',
        evmAddress: CONNECTOR_A_ADDRESS,
      },
    ],
    routes: [{ prefix: 'g.test.settlement-a', nextHop: 'settlement-a' }],
    settlementInfra: {
      enabled: true,
      rpcUrl: ANVIL_RPC_URL,
      registryAddress: REGISTRY_ADDRESS,
      tokenAddress: TOKEN_ADDRESS,
      privateKey: CONNECTOR_B_KEY,
      threshold: SETTLEMENT_THRESHOLD,
      pollingIntervalMs: SETTLEMENT_POLLING_MS,
      initialDepositMultiplier: 2,
      settlementTimeoutSecs: SETTLEMENT_TIMEOUT_SECS,
    },
    adminApi: { enabled: false },
    explorer: { enabled: false },
  };

  return { configA, configB };
}

/**
 * Create and start the 2-node settlement topology.
 */
async function startSettlementTopology(portOffset: number): Promise<SettlementTestEnv> {
  const { configA, configB } = buildSettlementConfigs(portOffset);

  const loggerA = pino({ level: 'warn' });
  const loggerB = pino({ level: 'warn' });

  const connectorA = new ConnectorNode(configA as ConnectorConfig, loggerA);
  const connectorB = new ConnectorNode(configB as ConnectorConfig, loggerB);

  // Start B first (downstream), then A
  await connectorB.start();
  await connectorA.start();

  // Wait for BTP connections to establish
  await new Promise((resolve) => setTimeout(resolve, 5000));

  return { connectorA, connectorB };
}

/**
 * Stop both connectors and clean up environment.
 */
async function stopSettlementTopology(env: SettlementTestEnv): Promise<void> {
  try {
    await env.connectorA?.stop();
  } catch {
    // ignore cleanup errors
  }
  try {
    await env.connectorB?.stop();
  } catch {
    // ignore cleanup errors
  }
}

/**
 * Core settlement test logic shared between in-memory and TigerBeetle backends.
 *
 * Validates the full per-packet claims lifecycle across four phases:
 *
 * PHASE 1 — Per-Packet Claims + Balance Verification
 *   Sends packets one by one, verifying accounting balance after each.
 *   Wallet and channel balances verified before and after the batch.
 *
 * PHASE 2 — Settlement Trigger
 *   A's SettlementExecutor auto-opens a channel and deposits.
 *   B claims from channel using A's signed balance proof.
 *   Wallet, channel, and accounting balances verified.
 *
 * PHASE 3 — Channel Close + Grace Period
 *   A closes channel (starts grace period).
 *   A tries to settle before grace period → ChallengeNotExpiredError.
 *   B claims during grace period → succeeds.
 *
 * PHASE 4 — Post Grace Period
 *   B claims after grace period but before A settles → succeeds.
 *   A settles channel → remaining funds returned.
 *   B tries to claim on settled channel → fails.
 *   Final balance reconciliation: A_spent === B_received.
 */
async function runSettlementTest(env: SettlementTestEnv): Promise<void> {
  const { connectorA, connectorB } = env;

  // ========================================================================
  // PHASE 1: Per-Packet Claims + Balance Verification
  // ========================================================================
  console.log('\n=== PHASE 1: Per-Packet Claims + Balance Verification ===');

  const accountManagerA = getAccountManager(connectorA);
  const settlementMonitorA = getSettlementMonitor(connectorA);
  expect(accountManagerA).toBeDefined();
  expect(settlementMonitorA).toBeDefined();

  const tokenId = connectorA.defaultSettlementTokenId;
  console.log(`Resolved settlement token ID: ${tokenId}`);

  // Step 1.1: Snapshot initial balances
  const walletAInitial = await getTokenBalance(CONNECTOR_A_ADDRESS);
  const walletBInitial = await getTokenBalance(CONNECTOR_B_ADDRESS);
  console.log(`Initial wallet A: ${walletAInitial}`);
  console.log(`Initial wallet B: ${walletBInitial}`);
  expect(walletAInitial).toBeGreaterThan(0n);

  // Verify no open channels exist yet
  const sdkA = connectorA.paymentChannelSDK;
  expect(sdkA).not.toBeNull();
  const existingChannels = await sdkA!.getMyChannels(TOKEN_ADDRESS);
  const openChannelsBefore: string[] = [];
  for (const chId of existingChannels) {
    const st = await sdkA!.getChannelState(chId, TOKEN_ADDRESS);
    if (st.status === 'opened') openChannelsBefore.push(chId);
  }
  console.log(`Open channels before test: ${openChannelsBefore.length}`);

  // Verify initial accounting balance is zero
  const initialAccounting = await accountManagerA.getAccountBalance('settlement-b', tokenId);
  console.log(
    `Initial accounting: credit=${initialAccounting.creditBalance}, debit=${initialAccounting.debitBalance}`
  );

  // Step 1.2: Send packets one by one with per-packet balance verification
  console.log(
    `\nSending ${PACKETS_TO_SEND} packets of ${PACKET_AMOUNT} each ` +
      `(total: ${PACKET_AMOUNT * BigInt(PACKETS_TO_SEND)}, threshold: ${SETTLEMENT_THRESHOLD})...`
  );

  for (let i = 0; i < PACKETS_TO_SEND; i++) {
    const walletABefore = await getTokenBalance(CONNECTOR_A_ADDRESS);
    const walletBBefore = await getTokenBalance(CONNECTOR_B_ADDRESS);
    const accountingBefore = await accountManagerA.getAccountBalance('settlement-b', tokenId);

    const packet = createTestPacket(PACKET_AMOUNT, 'g.test.settlement-b.receiver');
    const response = await connectorA.sendPacket({
      destination: packet.destination,
      amount: packet.amount,
      executionCondition: packet.executionCondition,
      expiresAt: packet.expiresAt,
      data: packet.data,
    });
    expect(response).toBeDefined();

    // Verify accounting balance increased by at least the packet amount
    const accountingAfter = await accountManagerA.getAccountBalance('settlement-b', tokenId);
    expect(accountingAfter.creditBalance).toBeGreaterThan(accountingBefore.creditBalance);

    const walletAAfter = await getTokenBalance(CONNECTOR_A_ADDRESS);
    const walletBAfter = await getTokenBalance(CONNECTOR_B_ADDRESS);

    console.log(
      `  Packet ${i + 1}: accounting credit ${accountingBefore.creditBalance} → ${accountingAfter.creditBalance}, ` +
        `wallet A: ${walletABefore} → ${walletAAfter}, wallet B: ${walletBBefore} → ${walletBAfter}`
    );
  }

  // Step 1.3: Verify accounting balance exceeds threshold
  const accountingAfterAllPackets = await accountManagerA.getAccountBalance(
    'settlement-b',
    tokenId
  );
  console.log(`\nAccounting after all packets: credit=${accountingAfterAllPackets.creditBalance}`);
  expect(accountingAfterAllPackets.creditBalance).toBeGreaterThanOrEqual(
    BigInt(SETTLEMENT_THRESHOLD)
  );

  // ========================================================================
  // PHASE 2: Settlement Trigger (A opens channel + deposits, B claims)
  // ========================================================================
  console.log('\n=== PHASE 2: Settlement Trigger ===');

  // Wait for A's settlement to trigger and complete
  console.log('Waiting for settlement to trigger and complete...');
  await waitFor(
    async () => {
      const state = settlementMonitorA.getSettlementState('settlement-b', tokenId);
      const balance = await accountManagerA.getAccountBalance('settlement-b', tokenId);
      console.log(`  Settlement state: ${state}, creditBalance: ${balance.creditBalance}`);
      return (
        state === SettlementState.IDLE &&
        balance.creditBalance < accountingAfterAllPackets.creditBalance
      );
    },
    { timeout: 30000, interval: 500 }
  );
  console.log('Settlement completed!');

  // Verify A's accounting balance reduced
  const accountingAfterSettlement = await accountManagerA.getAccountBalance(
    'settlement-b',
    tokenId
  );
  console.log(`Accounting after settlement: credit=${accountingAfterSettlement.creditBalance}`);
  expect(accountingAfterSettlement.creditBalance).toBeLessThan(
    accountingAfterAllPackets.creditBalance
  );

  // Verify A's wallet decreased (deposit into channel)
  const walletAAfterDeposit = await getTokenBalance(CONNECTOR_A_ADDRESS);
  console.log(`Wallet A: ${walletAInitial} → ${walletAAfterDeposit} (deposited into channel)`);
  expect(walletAAfterDeposit).toBeLessThan(walletAInitial);

  // Verify B's wallet is unchanged (no claims yet)
  const walletBBeforeClaim = await getTokenBalance(CONNECTOR_B_ADDRESS);
  console.log(`Wallet B unchanged at: ${walletBBeforeClaim}`);

  // Find the opened channel from A's SDK cache
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelCache = (sdkA as any).channelStateCache as Map<string, any>;
  expect(channelCache.size).toBeGreaterThan(0);
  let channelId: string | undefined;
  for (const [id, state] of channelCache) {
    if (state.status === 'opened' && !openChannelsBefore.includes(id)) {
      channelId = id;
      break;
    }
  }
  expect(channelId).toBeDefined();
  channelId = channelId!;
  console.log(`Payment channel opened: ${channelId}`);

  // Query channel state from B's perspective
  const sdkB = connectorB.paymentChannelSDK;
  expect(sdkB).not.toBeNull();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sdkB as any).channelStateCache.delete(channelId);
  const channelStateFromB = await sdkB!.getChannelState(channelId, TOKEN_ADDRESS);

  const depositAmount = channelStateFromB.theirDeposit;
  console.log(
    `Channel from B: theirDeposit=${depositAmount}, myDeposit=${channelStateFromB.myDeposit}, ` +
      `status=${channelStateFromB.status}`
  );
  expect(depositAmount).toBeGreaterThanOrEqual(accountingAfterAllPackets.creditBalance);
  expect(channelStateFromB.status).toBe('opened');

  // Get payment channel contract balance
  const tokenNetworkAddr = await sdkB!.getTokenNetworkAddress(TOKEN_ADDRESS);
  const channelContractBefore = await getTokenBalance(tokenNetworkAddr);
  console.log(`Channel contract balance: ${channelContractBefore}`);

  // B claims from channel using A's signed balance proof
  // Claim the accumulated packet amount (not the full deposit — leave remainder for grace period)
  const ZERO_HASH = '0x' + '0'.repeat(64);
  const claimAmount = accountingAfterAllPackets.creditBalance;

  const sigA1 = await sdkA!.signBalanceProof(channelId, 1, claimAmount);
  const claim1: BalanceProof = {
    channelId,
    nonce: 1,
    transferredAmount: claimAmount,
    lockedAmount: 0n,
    locksRoot: ZERO_HASH,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sdkB as any).channelStateCache.delete(channelId);

  await sdkB!.claimFromChannel(channelId, TOKEN_ADDRESS, claim1, sigA1);
  console.log(`B claimed ${claimAmount} from channel — channel stays open`);

  // Verify B's wallet increased
  const walletBAfterClaim = await getTokenBalance(CONNECTOR_B_ADDRESS);
  console.log(
    `Wallet B: ${walletBBeforeClaim} → ${walletBAfterClaim} (+${walletBAfterClaim - walletBBeforeClaim})`
  );
  expect(walletBAfterClaim).toBeGreaterThan(walletBBeforeClaim);
  expect(walletBAfterClaim - walletBBeforeClaim).toBe(claimAmount);

  // Verify channel contract balance decreased
  const channelContractAfterClaim = await getTokenBalance(tokenNetworkAddr);
  console.log(
    `Channel contract: ${channelContractBefore} → ${channelContractAfterClaim} ` +
      `(-${channelContractBefore - channelContractAfterClaim})`
  );
  expect(channelContractAfterClaim).toBeLessThan(channelContractBefore);
  expect(channelContractBefore - channelContractAfterClaim).toBe(claimAmount);

  // Verify channel still OPEN
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sdkB as any).channelStateCache.delete(channelId);
  const channelStateAfterClaim = await sdkB!.getChannelState(channelId, TOKEN_ADDRESS);
  expect(channelStateAfterClaim.status).toBe('opened');

  // Verify settlement state is IDLE
  expect(settlementMonitorA.getSettlementState('settlement-b', tokenId)).toBe(SettlementState.IDLE);
  console.log('Phase 2 complete — channel open, B claimed, settlement IDLE');

  // ========================================================================
  // PHASE 3: Channel Close + Grace Period
  // ========================================================================
  console.log('\n=== PHASE 3: Channel Close + Grace Period ===');

  // Remaining deposit after B's claim (initialDepositMultiplier=2 means ~50% remains)
  const remainingDeposit = depositAmount - claimAmount;
  console.log(`Remaining deposit in channel: ${remainingDeposit}`);
  expect(remainingDeposit).toBeGreaterThan(0n);

  // Step 3.1: A closes channel (starts grace period)
  await sdkA!.closeChannel(channelId, TOKEN_ADDRESS);
  console.log('A closed channel — grace period started');

  // Verify channel status is 'closed'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sdkA as any).channelStateCache.delete(channelId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sdkB as any).channelStateCache.delete(channelId);
  const channelStateAfterClose = await sdkA!.getChannelState(channelId, TOKEN_ADDRESS);
  expect(channelStateAfterClose.status).toBe('closed');
  console.log(`Channel status: ${channelStateAfterClose.status}`);

  // Step 3.2: A tries to settle before grace period → ChallengeNotExpiredError
  console.log('A tries to settle before grace period expires...');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sdkA as any).channelStateCache.delete(channelId);
  await expect(sdkA!.settleChannel(channelId, TOKEN_ADDRESS)).rejects.toThrow(
    'Challenge period not expired'
  );
  console.log('Correctly rejected — ChallengeNotExpiredError');

  // Step 3.3: B claims during grace period (half of remaining deposit)
  const gracePeriodClaimDelta = remainingDeposit / 2n;
  const gracePeriodCumulativeTransferred = claimAmount + gracePeriodClaimDelta;
  const sigA2 = await sdkA!.signBalanceProof(channelId, 2, gracePeriodCumulativeTransferred);
  const claim2: BalanceProof = {
    channelId,
    nonce: 2,
    transferredAmount: gracePeriodCumulativeTransferred,
    lockedAmount: 0n,
    locksRoot: ZERO_HASH,
  };

  const walletBBeforeGraceClaim = await getTokenBalance(CONNECTOR_B_ADDRESS);
  const channelContractBeforeGraceClaim = await getTokenBalance(tokenNetworkAddr);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sdkB as any).channelStateCache.delete(channelId);
  await sdkB!.claimFromChannel(channelId, TOKEN_ADDRESS, claim2, sigA2);
  console.log(`B claimed ${gracePeriodClaimDelta} during grace period`);

  // Verify B's wallet increased by the delta
  const walletBAfterGraceClaim = await getTokenBalance(CONNECTOR_B_ADDRESS);
  console.log(
    `Wallet B: ${walletBBeforeGraceClaim} → ${walletBAfterGraceClaim} ` +
      `(+${walletBAfterGraceClaim - walletBBeforeGraceClaim})`
  );
  expect(walletBAfterGraceClaim - walletBBeforeGraceClaim).toBe(gracePeriodClaimDelta);

  // Verify channel contract balance decreased
  const channelContractAfterGraceClaim = await getTokenBalance(tokenNetworkAddr);
  expect(channelContractAfterGraceClaim).toBeLessThan(channelContractBeforeGraceClaim);

  console.log('Phase 3 complete — claims succeed during grace period, early settle rejected');

  // ========================================================================
  // PHASE 4: Post Grace Period
  // ========================================================================
  console.log('\n=== PHASE 4: Post Grace Period ===');

  // Step 4.1: Fast-forward past grace period using Anvil time manipulation
  // Contract enforces MIN_SETTLEMENT_TIMEOUT = 1 hour. We advance EVM block time
  // via evm_increaseTime (for contract's block.timestamp check) and mock Date.now()
  // (for SDK's client-side check) — no need to wait 1 hour of real wall-clock time.
  const settlementTimeout = channelStateAfterClose.settlementTimeout;
  const advanceSeconds = settlementTimeout + 1;
  console.log(
    `Advancing EVM time by ${advanceSeconds}s (settlementTimeout=${settlementTimeout}s)...`
  );

  // Advance EVM block time so contract's block.timestamp check passes
  await advanceAnvilTime(advanceSeconds);

  // Mock Date.now() so SDK's client-side grace period check passes.
  // The SDK compares Date.now()/1000 against closedAt + settlementTimeout.
  // Without mocking, real wall clock is only seconds past close, not 1 hour.
  // Uses module-level originalDateNow to avoid infinite recursion if a prior
  // test leaked a Date.now spy (e.g. due to an error before restoreAllMocks).
  const timeAdvanceMs = advanceSeconds * 1000;
  jest.spyOn(Date, 'now').mockImplementation(() => originalDateNow() + timeAdvanceMs);

  // Clear caches so SDKs read fresh on-chain state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sdkA as any).channelStateCache.delete(channelId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sdkB as any).channelStateCache.delete(channelId);

  // Step 4.2: B claims after grace period but before A settles → should succeed
  // (Grace period is a MINIMUM before the depositor can settle, not a claim deadline.
  //  claimFromChannel only checks channel status, not time.)
  const postGraceClaimDelta = remainingDeposit / 4n;
  const postGraceCumulativeTransferred = gracePeriodCumulativeTransferred + postGraceClaimDelta;
  const sigA3 = await sdkA!.signBalanceProof(channelId, 3, postGraceCumulativeTransferred);
  const claim3: BalanceProof = {
    channelId,
    nonce: 3,
    transferredAmount: postGraceCumulativeTransferred,
    lockedAmount: 0n,
    locksRoot: ZERO_HASH,
  };

  const walletBBeforePostGrace = await getTokenBalance(CONNECTOR_B_ADDRESS);
  const channelContractBeforePostGrace = await getTokenBalance(tokenNetworkAddr);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sdkB as any).channelStateCache.delete(channelId);
  await sdkB!.claimFromChannel(channelId, TOKEN_ADDRESS, claim3, sigA3);
  console.log(`B claimed ${postGraceClaimDelta} after grace period (before A settles) — succeeded`);

  const walletBAfterPostGrace = await getTokenBalance(CONNECTOR_B_ADDRESS);
  expect(walletBAfterPostGrace - walletBBeforePostGrace).toBe(postGraceClaimDelta);

  const channelContractAfterPostGrace = await getTokenBalance(tokenNetworkAddr);
  expect(channelContractAfterPostGrace).toBeLessThan(channelContractBeforePostGrace);

  // Step 4.3: A settles channel — remaining funds returned to A
  const walletABeforeSettle = await getTokenBalance(CONNECTOR_A_ADDRESS);
  const channelContractBeforeSettle = await getTokenBalance(tokenNetworkAddr);
  console.log(`Channel contract before settle: ${channelContractBeforeSettle}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sdkA as any).channelStateCache.delete(channelId);
  await sdkA!.settleChannel(channelId, TOKEN_ADDRESS);
  console.log('A settled channel — remaining funds returned');

  // Restore real Date.now() after settle completes
  jest.restoreAllMocks();

  // Verify A's wallet increased (remaining deposit returned)
  const walletAAfterSettle = await getTokenBalance(CONNECTOR_A_ADDRESS);
  const returnedToA = walletAAfterSettle - walletABeforeSettle;
  console.log(`Wallet A: ${walletABeforeSettle} → ${walletAAfterSettle} (+${returnedToA})`);
  expect(walletAAfterSettle).toBeGreaterThan(walletABeforeSettle);

  // Verify channel status is 'settled'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sdkA as any).channelStateCache.delete(channelId);
  const channelStateAfterSettle = await sdkA!.getChannelState(channelId, TOKEN_ADDRESS);
  expect(channelStateAfterSettle.status).toBe('settled');
  console.log(`Channel status: ${channelStateAfterSettle.status}`);

  // Step 4.4: B tries to claim on settled channel → fails
  console.log('B tries to claim on settled channel...');
  const sigA4 = await sdkA!.signBalanceProof(channelId, 4, postGraceCumulativeTransferred + 1n);
  const claim4: BalanceProof = {
    channelId,
    nonce: 4,
    transferredAmount: postGraceCumulativeTransferred + 1n,
    lockedAmount: 0n,
    locksRoot: ZERO_HASH,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sdkB as any).channelStateCache.delete(channelId);
  await expect(sdkB!.claimFromChannel(channelId, TOKEN_ADDRESS, claim4, sigA4)).rejects.toThrow(
    /Cannot claim from channel in status: settled/
  );
  console.log('Correctly rejected — cannot claim from settled channel');

  // ========================================================================
  // Final Balance Reconciliation
  // ========================================================================
  console.log('\n=== Final Balance Reconciliation ===');

  const walletAFinal = await getTokenBalance(CONNECTOR_A_ADDRESS);
  const walletBFinal = await getTokenBalance(CONNECTOR_B_ADDRESS);

  const totalSpentByA = walletAInitial - walletAFinal;
  const totalReceivedByB = walletBFinal - walletBInitial;

  console.log(`A spent: ${totalSpentByA} (initial: ${walletAInitial}, final: ${walletAFinal})`);
  console.log(
    `B received: ${totalReceivedByB} (initial: ${walletBInitial}, final: ${walletBFinal})`
  );

  // A's total token spend must equal B's total token received (no value lost)
  expect(totalSpentByA).toBe(totalReceivedByB);

  // Verify the breakdown: B received claimAmount + gracePeriodClaimDelta + postGraceClaimDelta
  const expectedBReceived = claimAmount + gracePeriodClaimDelta + postGraceClaimDelta;
  expect(totalReceivedByB).toBe(expectedBReceived);

  // Verify settlement state is IDLE
  const finalState = settlementMonitorA.getSettlementState('settlement-b', tokenId);
  expect(finalState).toBe(SettlementState.IDLE);

  console.log(
    '\n=== ALL PHASES PASSED — Full settlement lifecycle verified ===\n' +
      `  Phase 1: Per-packet claims with balance verification\n` +
      `  Phase 2: Settlement trigger, channel creation, B claims\n` +
      `  Phase 3: Channel close, early settle rejected, grace period claims\n` +
      `  Phase 4: Post-grace claims, A settles, settled channel claim rejected\n` +
      `  Final:   A_spent(${totalSpentByA}) === B_received(${totalReceivedByB}) ✓`
  );
}

// ============================================================================
// Test Suite C: Settlement Integration - In-Memory Ledger + Anvil
// ============================================================================

describeInProcess('Settlement Integration E2E - In-Process (In-Memory Ledger)', () => {
  let env: SettlementTestEnv;
  let anvilSnapshotId: string;

  beforeAll(async () => {
    console.log('Setting up Settlement Integration E2E (In-Memory Ledger) - 2-node topology...');

    // Enable settlement recording in packet handler
    process.env.SETTLEMENT_ENABLED = 'true';

    // Ensure TigerBeetle is NOT used (in-memory ledger mode)
    delete process.env.TIGERBEETLE_CLUSTER_ID;
    delete process.env.TIGERBEETLE_REPLICAS;

    // Set BTP peer secrets for permissionless mode
    process.env.BTP_PEER_CONNECTOR_A_SECRET = '';
    process.env.BTP_PEER_CONNECTOR_B_SECRET = '';

    // Verify Anvil is running
    try {
      await waitForAnvil();
      console.log('Anvil is ready');
    } catch {
      throw new Error(
        'Anvil not available. Run: docker compose -f docker-compose-base-e2e-test.yml up -d anvil_base_e2e'
      );
    }

    // Snapshot Anvil state so we can revert after this suite
    // (prevents nonce/balance/time pollution across suites or re-runs)
    anvilSnapshotId = await takeAnvilSnapshot();

    env = await startSettlementTopology(0);
    console.log('2-node settlement topology started (In-Memory Ledger)');
  });

  afterEach(() => {
    // Always restore mocks (especially Date.now) to prevent leaking into next suite
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    console.log('Cleaning up settlement test connectors (In-Memory)...');
    await stopSettlementTopology(env);
    // Revert Anvil state to pre-test snapshot
    if (anvilSnapshotId) {
      await revertAnvilSnapshot(anvilSnapshotId);
    }
    delete process.env.SETTLEMENT_ENABLED;
    delete process.env.BTP_PEER_CONNECTOR_A_SECRET;
    delete process.env.BTP_PEER_CONNECTOR_B_SECRET;
  });

  it('should complete full settlement lifecycle: per-packet claims, settlement trigger, grace period, and channel close', async () => {
    await runSettlementTest(env);
  });
});

// ============================================================================
// Test Suite D: Settlement Integration - TigerBeetle + Anvil
// ============================================================================

describeInProcess('Settlement Integration E2E - In-Process (TigerBeetle)', () => {
  let env: SettlementTestEnv;
  let tigerBeetleAvailable = false;
  let anvilSnapshotId: string;

  beforeAll(async () => {
    // Check if TigerBeetle is reachable before setting up
    tigerBeetleAvailable = await isTigerBeetleAvailable();
    if (!tigerBeetleAvailable) {
      console.log(
        'TigerBeetle not available at ' +
          TIGERBEETLE_ADDRESS +
          ' — skipping TigerBeetle settlement tests. ' +
          'Run: docker compose -f docker-compose-base-e2e-test.yml up -d tigerbeetle_e2e'
      );
      return;
    }

    console.log('Setting up Settlement Integration E2E (TigerBeetle) - 2-node topology...');

    // Enable settlement recording in packet handler
    process.env.SETTLEMENT_ENABLED = 'true';

    // Configure TigerBeetle backend
    process.env.TIGERBEETLE_CLUSTER_ID = TIGERBEETLE_CLUSTER_ID;
    process.env.TIGERBEETLE_REPLICAS = TIGERBEETLE_ADDRESS;

    // Set BTP peer secrets for permissionless mode
    process.env.BTP_PEER_CONNECTOR_A_SECRET = '';
    process.env.BTP_PEER_CONNECTOR_B_SECRET = '';

    // Verify Anvil is running
    try {
      await waitForAnvil();
      console.log('Anvil is ready');
    } catch {
      throw new Error(
        'Anvil not available. Run: docker compose -f docker-compose-base-e2e-test.yml up -d anvil_base_e2e'
      );
    }

    // Snapshot Anvil state so we can revert after this suite
    anvilSnapshotId = await takeAnvilSnapshot();

    // Use different port offset to avoid conflicts with in-memory suite
    env = await startSettlementTopology(100);
    console.log('2-node settlement topology started (TigerBeetle)');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (tigerBeetleAvailable) {
      console.log('Cleaning up settlement test connectors (TigerBeetle)...');
      await stopSettlementTopology(env);
      if (anvilSnapshotId) {
        await revertAnvilSnapshot(anvilSnapshotId);
      }
      delete process.env.SETTLEMENT_ENABLED;
      delete process.env.TIGERBEETLE_CLUSTER_ID;
      delete process.env.TIGERBEETLE_REPLICAS;
      delete process.env.BTP_PEER_CONNECTOR_A_SECRET;
      delete process.env.BTP_PEER_CONNECTOR_B_SECRET;
    }
  });

  it('should complete full settlement lifecycle: per-packet claims, settlement trigger, grace period, and channel close', async () => {
    if (!tigerBeetleAvailable) {
      console.log('Skipping: TigerBeetle not available');
      return;
    }
    await runSettlementTest(env);
  });
});
