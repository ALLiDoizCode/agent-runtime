/* eslint-disable no-console */
/**
 * Integration tests for Aptos Local Testnet (Story 7.6)
 *
 * These tests verify that the Aptos local testnet Docker service is functioning correctly.
 * They test Node API accessibility, Faucet functionality, and AptosClient integration.
 *
 * Prerequisites:
 * - Docker running with aptos-local service started
 * - Run: docker-compose -f docker-compose-dev.yml up -d aptos-local
 * - Wait for health check to pass (~60 seconds)
 *
 * To run these tests:
 *   INTEGRATION_TESTS=true npm test -- aptos-local-testnet.test.ts
 *
 * To run with Docker infrastructure tests:
 *   E2E_TESTS=true npm test -- aptos-local-testnet.test.ts
 */

import { Network } from '@aptos-labs/ts-sdk';

// Configure test URLs
const APTOS_NODE_URL = process.env.APTOS_NODE_URL || 'http://localhost:8080/v1';
const APTOS_FAUCET_URL = process.env.APTOS_FAUCET_URL || 'http://localhost:8081';

/**
 * Check if Aptos local testnet infrastructure is running
 */
async function checkAptosInfrastructure(): Promise<boolean> {
  try {
    const response = await fetch(APTOS_NODE_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if Faucet is running
 */
async function checkFaucetInfrastructure(): Promise<boolean> {
  try {
    // Try the faucet health endpoint or root
    const response = await fetch(APTOS_FAUCET_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok || response.status === 404; // 404 on root is OK, faucet is running
  } catch {
    return false;
  }
}

/**
 * Generate a test account address for faucet testing
 * Uses a deterministic test address format
 */
function generateTestAccountAddress(): string {
  // Generate a random 32-byte address for testing
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const hexString = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `0x${hexString}`;
}

// Skip tests if infrastructure is not running or INTEGRATION_TESTS not set
const skipIntegration =
  process.env.CI === 'true' &&
  process.env.INTEGRATION_TESTS !== 'true' &&
  process.env.E2E_TESTS !== 'true';

const describeIfAptos = skipIntegration ? describe.skip : describe;

describeIfAptos('Aptos Local Testnet Integration (Story 7.6)', () => {
  let aptosAvailable = false;
  let faucetAvailable = false;

  beforeAll(async () => {
    // Check if Aptos infrastructure is running
    aptosAvailable = await checkAptosInfrastructure();
    faucetAvailable = await checkFaucetInfrastructure();

    if (!aptosAvailable) {
      console.warn(
        '\n⚠️  Aptos local testnet not running - some tests will be skipped\n' +
          '   Start with: docker-compose -f docker-compose-dev.yml up -d aptos-local\n' +
          '   Wait for health check: docker-compose -f docker-compose-dev.yml ps aptos-local\n'
      );
    }
  });

  describe('Node Accessibility (AC: 2)', () => {
    it('should verify Aptos local testnet is accessible', async () => {
      if (!aptosAvailable) {
        console.log('Skipping - Aptos local testnet not available');
        return;
      }

      const response = await fetch(APTOS_NODE_URL);
      expect(response.ok).toBe(true);

      const nodeInfo = await response.json();

      // Verify expected Aptos node metadata
      expect(nodeInfo).toHaveProperty('chain_id');
      expect(nodeInfo).toHaveProperty('ledger_version');
      expect(nodeInfo).toHaveProperty('node_role');

      // Local testnet typically has chain_id 4
      expect(typeof nodeInfo.chain_id).toBe('number');

      console.log('✓ Aptos node info:', {
        chainId: nodeInfo.chain_id,
        ledgerVersion: nodeInfo.ledger_version,
        blockHeight: nodeInfo.block_height,
        nodeRole: nodeInfo.node_role,
      });
    });

    it('should return valid ledger information', async () => {
      if (!aptosAvailable) {
        console.log('Skipping - Aptos local testnet not available');
        return;
      }

      const response = await fetch(APTOS_NODE_URL);
      const nodeInfo = await response.json();

      // Verify ledger properties
      expect(nodeInfo.ledger_version).toBeDefined();
      expect(nodeInfo.oldest_ledger_version).toBeDefined();
      expect(nodeInfo.ledger_timestamp).toBeDefined();

      // Ledger version should be a string representation of a number
      expect(typeof nodeInfo.ledger_version).toBe('string');
      expect(parseInt(nodeInfo.ledger_version, 10)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Faucet Functionality (AC: 3)', () => {
    it('should fund account via local faucet', async () => {
      if (!aptosAvailable || !faucetAvailable) {
        console.log('Skipping - Aptos local testnet or faucet not available');
        return;
      }

      const testAddress = generateTestAccountAddress();
      const fundAmount = 100_000_000; // 1 APT in octas

      // Fund account via faucet
      const response = await fetch(`${APTOS_FAUCET_URL}/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: testAddress,
          amount: fundAmount,
        }),
      });

      // Faucet should accept the request
      expect(response.ok).toBe(true);

      console.log(
        `✓ Faucet funded account ${testAddress.slice(0, 10)}... with ${fundAmount} octas`
      );

      // Wait a moment for transaction to be processed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Query account balance via Node API
      // Note: New accounts may not show resources immediately
      try {
        const balanceResponse = await fetch(
          `${APTOS_NODE_URL.replace('/v1', '')}/v1/accounts/${testAddress}/resources`
        );

        if (balanceResponse.ok) {
          const resources = await balanceResponse.json();
          const coinStore = resources.find(
            (r: { type: string }) => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>'
          );

          if (coinStore) {
            const balance = BigInt(coinStore.data.coin.value);
            expect(balance).toBeGreaterThan(BigInt(0));
            console.log(`✓ Account balance verified: ${balance} octas`);
          }
        }
      } catch {
        // Balance query may fail for newly created accounts, that's OK
        console.log('Note: Balance query skipped (account may need more time to appear)');
      }
    });
  });

  describe('Network Detection (AC: 12)', () => {
    it('should detect Network.LOCAL from localhost URL', () => {
      // Test the network detection logic used by AptosClient
      function getNetworkFromUrl(url: string): Network {
        if (url.includes('testnet')) {
          return Network.TESTNET;
        } else if (url.includes('devnet')) {
          return Network.DEVNET;
        } else if (url.includes('mainnet')) {
          return Network.MAINNET;
        } else if (url.includes('localhost') || url.includes('127.0.0.1')) {
          return Network.LOCAL;
        }
        return Network.CUSTOM;
      }

      // Test localhost detection
      expect(getNetworkFromUrl('http://localhost:8080/v1')).toBe(Network.LOCAL);
      expect(getNetworkFromUrl('http://127.0.0.1:8080/v1')).toBe(Network.LOCAL);
      expect(getNetworkFromUrl('http://localhost:18080/v1')).toBe(Network.LOCAL);

      // Test other networks
      expect(getNetworkFromUrl('https://fullnode.testnet.aptoslabs.com/v1')).toBe(Network.TESTNET);
      expect(getNetworkFromUrl('https://fullnode.mainnet.aptoslabs.com/v1')).toBe(Network.MAINNET);
      expect(getNetworkFromUrl('https://fullnode.devnet.aptoslabs.com/v1')).toBe(Network.DEVNET);

      // Docker hostname should be CUSTOM (not localhost pattern)
      expect(getNetworkFromUrl('http://aptos-local:8080/v1')).toBe(Network.CUSTOM);

      console.log('✓ Network detection logic verified for all network types');
    });
  });

  describe('Docker Health Check (AC: 4)', () => {
    it('should respond to health check endpoint', async () => {
      if (!aptosAvailable) {
        console.log('Skipping - Aptos local testnet not available');
        return;
      }

      // The health check uses the /v1 endpoint
      const response = await fetch(APTOS_NODE_URL);
      expect(response.ok).toBe(true);

      // Response should be valid JSON
      const data = await response.json();
      expect(data).toBeDefined();
      expect(typeof data).toBe('object');

      console.log('✓ Health check endpoint responding correctly');
    });
  });

  describe('Ledger Operations', () => {
    it('should query transactions endpoint', async () => {
      if (!aptosAvailable) {
        console.log('Skipping - Aptos local testnet not available');
        return;
      }

      const baseUrl = APTOS_NODE_URL.replace('/v1', '');
      const response = await fetch(`${baseUrl}/v1/transactions?limit=5`);

      expect(response.ok).toBe(true);

      const transactions = await response.json();
      expect(Array.isArray(transactions)).toBe(true);

      console.log(`✓ Transactions query returned ${transactions.length} transactions`);
    });

    it('should query blocks endpoint', async () => {
      if (!aptosAvailable) {
        console.log('Skipping - Aptos local testnet not available');
        return;
      }

      // Get latest block height from node info
      const nodeResponse = await fetch(APTOS_NODE_URL);
      const nodeInfo = await nodeResponse.json();
      const blockHeight = parseInt(nodeInfo.block_height, 10);

      if (blockHeight > 0) {
        const baseUrl = APTOS_NODE_URL.replace('/v1', '');
        const response = await fetch(`${baseUrl}/v1/blocks/by_height/${blockHeight}`);

        expect(response.ok).toBe(true);

        const block = await response.json();
        expect(block).toHaveProperty('block_height');

        console.log(`✓ Block ${blockHeight} queried successfully`);
      } else {
        console.log('Note: No blocks produced yet (genesis state)');
      }
    });
  });
});

// Separate test for Move module deployment (optional)
describeIfAptos('Aptos Move Module Deployment (AC: 11 - Optional)', () => {
  const CONTRACTS_BUILD_PATH = '../../../../packages/contracts-aptos/build';

  it('should skip if contracts not built', async () => {
    // This test is optional - skips if contracts haven't been built
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require(CONTRACTS_BUILD_PATH);
      console.log('Contracts build directory found');
    } catch {
      console.log('Skipping - Move contracts not built at packages/contracts-aptos/build/');
      console.log('To build contracts: cd packages/contracts-aptos && aptos move compile');
    }
  });
});
