/**
 * Public Testnet Configuration
 *
 * Defines URLs and configuration for public testnets (Aptos Testnet, XRP Testnet, Base Sepolia).
 * Used when NETWORK_MODE=testnet to bypass local Docker blockchain containers.
 *
 * @see docs/prd/epic-28-aptos-integration.md
 */

export type NetworkMode = 'testnet' | 'local';

/**
 * Public testnet URL constants
 */
export const TESTNET_URLS = {
  aptos: {
    nodeUrl: 'https://fullnode.testnet.aptoslabs.com/v1',
    faucetUrl: 'https://faucet.testnet.aptoslabs.com',
  },
  xrp: {
    wssUrl: 'wss://s.altnet.rippletest.net:51233',
    rpcUrl: 'https://s.altnet.rippletest.net:51234',
    faucetUrl: 'https://faucet.altnet.rippletest.net',
  },
  evm: {
    rpcUrl: 'https://sepolia.base.org',
    chainId: 84532,
  },
};

/**
 * Local Docker container URL defaults
 */
export const LOCAL_URLS = {
  aptos: {
    nodeUrl: 'http://aptos-local:8080',
    faucetUrl: 'http://aptos-local:8081',
  },
  xrp: {
    wssUrl: 'ws://rippled:6006',
    rpcUrl: 'http://rippled:5005',
  },
  evm: {
    rpcUrl: 'http://anvil:8545',
    chainId: 31337,
  },
};

/**
 * Timeout configuration for different network modes
 * Testnets have higher latency and may require longer wait times
 */
export const TIMEOUTS = {
  local: {
    faucetWait: 5000,
    transactionWait: 10000,
    healthCheck: 30000,
    httpRequest: 10000,
  },
  testnet: {
    faucetWait: 30000, // Public faucets can be slow
    transactionWait: 60000, // Testnet confirmation times
    healthCheck: 60000,
    httpRequest: 30000,
  },
};

/**
 * Chain URL configuration for a given network mode
 */
export interface ChainUrls {
  aptosNodeUrl: string;
  aptosFaucetUrl: string;
  xrpWssUrl: string;
  xrpRpcUrl: string;
  xrpFaucetUrl: string | null; // null for local (uses genesis funding)
  evmRpcUrl: string;
  evmChainId: number;
}

/**
 * Resolve chain URLs based on network mode
 *
 * Priority:
 * 1. Explicit environment variables (e.g., APTOS_NODE_URL)
 * 2. Testnet/local defaults based on NETWORK_MODE
 *
 * @param networkMode - 'testnet' or 'local'
 * @param isDocker - Whether running inside Docker container
 * @returns Resolved chain URLs
 */
export function getChainUrls(networkMode: NetworkMode, isDocker: boolean): ChainUrls {
  if (networkMode === 'testnet') {
    return {
      aptosNodeUrl: process.env.APTOS_TESTNET_NODE_URL || TESTNET_URLS.aptos.nodeUrl,
      aptosFaucetUrl: process.env.APTOS_TESTNET_FAUCET_URL || TESTNET_URLS.aptos.faucetUrl,
      xrpWssUrl: process.env.XRP_TESTNET_WSS_URL || TESTNET_URLS.xrp.wssUrl,
      xrpRpcUrl: process.env.XRP_TESTNET_RPC_URL || TESTNET_URLS.xrp.rpcUrl,
      xrpFaucetUrl: process.env.XRP_TESTNET_FAUCET_URL || TESTNET_URLS.xrp.faucetUrl,
      evmRpcUrl: process.env.BASE_SEPOLIA_RPC_URL || TESTNET_URLS.evm.rpcUrl,
      evmChainId: TESTNET_URLS.evm.chainId,
    };
  }

  // Local mode - adjust URLs based on Docker/host context
  const localAptos = isDocker
    ? LOCAL_URLS.aptos
    : { nodeUrl: 'http://localhost:8080', faucetUrl: 'http://localhost:8081' };
  const localXrp = isDocker
    ? LOCAL_URLS.xrp
    : { wssUrl: 'ws://localhost:6006', rpcUrl: 'http://localhost:5005' };
  const localEvm = isDocker ? LOCAL_URLS.evm : { rpcUrl: 'http://localhost:8545', chainId: 31337 };

  return {
    aptosNodeUrl: process.env.APTOS_NODE_URL || localAptos.nodeUrl,
    aptosFaucetUrl: process.env.APTOS_FAUCET_URL || localAptos.faucetUrl,
    xrpWssUrl: process.env.XRPL_WSS_URL || localXrp.wssUrl,
    xrpRpcUrl: process.env.XRPL_RPC_URL || localXrp.rpcUrl,
    xrpFaucetUrl: null, // Local rippled uses genesis account funding
    evmRpcUrl: process.env.ANVIL_RPC_URL || localEvm.rpcUrl,
    evmChainId: localEvm.chainId,
  };
}

/**
 * Timeout configuration type
 */
export type TimeoutConfig = typeof TIMEOUTS.local;

/**
 * Get timeout values based on network mode
 */
export function getTimeouts(networkMode: NetworkMode): TimeoutConfig {
  return TIMEOUTS[networkMode];
}

/**
 * Parse NETWORK_MODE environment variable
 * @returns 'testnet' or 'local' (default: 'local' for backward compatibility)
 */
export function parseNetworkMode(): NetworkMode {
  const mode = process.env.NETWORK_MODE?.toLowerCase();
  if (mode === 'testnet') {
    return 'testnet';
  }
  return 'local';
}
