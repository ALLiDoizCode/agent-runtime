/**
 * Integration Tests for Tri-Chain Settlement (EVM + XRP + Aptos)
 *
 * Tests the UnifiedSettlementExecutor's ability to route settlements
 * across all three supported blockchains.
 *
 * Prerequisites:
 * - EVM: docker-compose-dev.yml with Anvil running
 * - XRP: docker-compose-dev.yml with rippled running
 * - Aptos: APTOS_NODE_URL and APTOS_PRIVATE_KEY environment variables set
 *
 * Story 27.5: Tri-Chain Settlement Integration (EVM + XRP + Aptos)
 *
 * @module test/integration/tri-chain-settlement.test
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { EventEmitter } from 'events';
import pino from 'pino';

// Check prerequisites before running tests
const PREREQUISITES = {
  APTOS_NODE_URL: process.env.APTOS_NODE_URL,
  APTOS_PRIVATE_KEY: process.env.APTOS_PRIVATE_KEY,
  APTOS_MODULE_ADDRESS: process.env.APTOS_MODULE_ADDRESS,
  APTOS_CLAIM_PRIVATE_KEY: process.env.APTOS_CLAIM_PRIVATE_KEY,
};

const aptosConfigured =
  PREREQUISITES.APTOS_NODE_URL &&
  PREREQUISITES.APTOS_PRIVATE_KEY &&
  PREREQUISITES.APTOS_MODULE_ADDRESS &&
  PREREQUISITES.APTOS_CLAIM_PRIVATE_KEY;

// Create silent logger for tests
const logger = pino({ level: 'silent' });

describe('Tri-Chain Settlement Integration', () => {
  beforeAll(() => {
    if (!aptosConfigured) {
      console.warn(
        '\n⚠️  Aptos environment not configured - some integration tests will be skipped\n' +
          '   Required environment variables:\n' +
          '   - APTOS_NODE_URL\n' +
          '   - APTOS_PRIVATE_KEY\n' +
          '   - APTOS_MODULE_ADDRESS\n' +
          '   - APTOS_CLAIM_PRIVATE_KEY\n'
      );
    }
  });

  describe('Settlement Routing (Mocked)', () => {
    // These tests use mocked SDKs to verify routing logic without real blockchain connections
    // For full integration tests with real blockchains, use the "Real Blockchain" describe block

    it('should route correctly based on token type with mock SDKs', async () => {
      // Import dynamically to avoid module resolution issues
      const { UnifiedSettlementExecutor } =
        await import('../../src/settlement/unified-settlement-executor');

      // Create mock SDKs
      const mockEvmSDK = {
        openChannel: jest.fn().mockResolvedValue('0xchannelid'),
      } as any;

      const mockXrpManager = {
        createChannel: jest.fn().mockResolvedValue('A'.repeat(64)),
      } as any;

      const mockXrpClaimSigner = {
        signClaim: jest.fn().mockResolvedValue('signature'),
        getPublicKey: jest.fn().mockReturnValue('ED' + '0'.repeat(64)),
      } as any;

      const mockAptosSDK = {
        openChannel: jest.fn().mockResolvedValue('0x' + '1'.repeat(64)),
        signClaim: jest.fn().mockReturnValue({
          channelOwner: '0x' + '1'.repeat(64),
          amount: BigInt('1000000000'),
          nonce: 1,
          signature: '0x' + 'a'.repeat(128),
          publicKey: '0x' + 'b'.repeat(64),
          createdAt: Date.now(),
        }),
        getMyChannels: jest.fn().mockReturnValue([]),
      } as any;

      const mockSettlementMonitor = new EventEmitter() as any;

      const mockAccountManager = {
        recordSettlement: jest.fn().mockResolvedValue(undefined),
      } as any;

      // Create tri-chain peer config
      const triChainPeer = {
        peerId: 'peer-trichain',
        address: 'g.trichain',
        settlementPreference: 'any' as const,
        settlementTokens: ['USDC', 'XRP', 'APT'],
        evmAddress: '0x' + '1'.repeat(40),
        xrpAddress: 'rN7n7otQDd6FczFgLdlqtyMVrn3HMfXEEW',
        aptosAddress: '0x' + '2'.repeat(64),
        aptosPubkey: '3'.repeat(64),
      };

      const config = {
        peers: new Map([['peer-trichain', triChainPeer]]) as any,
        defaultPreference: 'any' as const,
        enabled: true,
      };

      const executor = new UnifiedSettlementExecutor(
        config,
        mockEvmSDK,
        mockXrpManager,
        mockXrpClaimSigner,
        mockAptosSDK,
        mockSettlementMonitor,
        mockAccountManager,
        null,
        logger
      );

      executor.start();

      // Capture the handler
      const handler = mockSettlementMonitor.listeners('SETTLEMENT_REQUIRED')[0];

      // Test EVM routing (USDC)
      await handler({
        peerId: 'peer-trichain',
        balance: '1000000000',
        tokenId: '0xUSDCAddress',
        timestamp: Date.now(),
      });
      expect(mockEvmSDK.openChannel).toHaveBeenCalled();

      // Reset mocks
      jest.clearAllMocks();

      // Test XRP routing
      await handler({
        peerId: 'peer-trichain',
        balance: '2000000000',
        tokenId: 'XRP',
        timestamp: Date.now(),
      });
      expect(mockXrpManager.createChannel).toHaveBeenCalled();

      // Reset mocks
      jest.clearAllMocks();

      // Test Aptos routing
      await handler({
        peerId: 'peer-trichain',
        balance: '3000000000',
        tokenId: 'APT',
        timestamp: Date.now(),
      });
      expect(mockAptosSDK.openChannel).toHaveBeenCalled();

      executor.stop();
    });

    it('should handle peer with only EVM settlement', async () => {
      const { UnifiedSettlementExecutor } =
        await import('../../src/settlement/unified-settlement-executor');

      const mockEvmSDK = {
        openChannel: jest.fn().mockResolvedValue('0xchannelid'),
      } as any;

      const mockXrpManager = {} as any;
      const mockXrpClaimSigner = {} as any;
      const mockSettlementMonitor = new EventEmitter() as any;
      const mockAccountManager = {
        recordSettlement: jest.fn().mockResolvedValue(undefined),
      } as any;

      const config = {
        peers: new Map([
          [
            'peer-evm',
            {
              peerId: 'peer-evm',
              address: 'g.evm',
              settlementPreference: 'evm' as const,
              settlementTokens: ['USDC'],
              evmAddress: '0x' + '1'.repeat(40),
            },
          ],
        ]),
        defaultPreference: 'evm' as const,
        enabled: true,
      };

      const executor = new UnifiedSettlementExecutor(
        config,
        mockEvmSDK,
        mockXrpManager,
        mockXrpClaimSigner,
        null, // No Aptos SDK
        mockSettlementMonitor,
        mockAccountManager,
        null,
        logger
      );

      executor.start();

      const handler = mockSettlementMonitor.listeners('SETTLEMENT_REQUIRED')[0];

      await handler({
        peerId: 'peer-evm',
        balance: '1000000000',
        tokenId: '0xUSDCAddress',
        timestamp: Date.now(),
      });

      expect(mockEvmSDK.openChannel).toHaveBeenCalled();

      executor.stop();
    });

    it('should handle peer with only XRP settlement', async () => {
      const { UnifiedSettlementExecutor } =
        await import('../../src/settlement/unified-settlement-executor');

      const mockEvmSDK = {} as any;
      const mockXrpManager = {
        createChannel: jest.fn().mockResolvedValue('A'.repeat(64)),
      } as any;
      const mockXrpClaimSigner = {
        signClaim: jest.fn().mockResolvedValue('signature'),
        getPublicKey: jest.fn().mockReturnValue('ED' + '0'.repeat(64)),
      } as any;
      const mockSettlementMonitor = new EventEmitter() as any;
      const mockAccountManager = {
        recordSettlement: jest.fn().mockResolvedValue(undefined),
      } as any;

      const config = {
        peers: new Map([
          [
            'peer-xrp',
            {
              peerId: 'peer-xrp',
              address: 'g.xrp',
              settlementPreference: 'xrp' as const,
              settlementTokens: ['XRP'],
              xrpAddress: 'rN7n7otQDd6FczFgLdlqtyMVrn3HMfXEEW',
            },
          ],
        ]),
        defaultPreference: 'xrp' as const,
        enabled: true,
      };

      const executor = new UnifiedSettlementExecutor(
        config,
        mockEvmSDK,
        mockXrpManager,
        mockXrpClaimSigner,
        null, // No Aptos SDK
        mockSettlementMonitor,
        mockAccountManager,
        null,
        logger
      );

      executor.start();

      const handler = mockSettlementMonitor.listeners('SETTLEMENT_REQUIRED')[0];

      await handler({
        peerId: 'peer-xrp',
        balance: '1000000000',
        tokenId: 'XRP',
        timestamp: Date.now(),
      });

      expect(mockXrpManager.createChannel).toHaveBeenCalled();

      executor.stop();
    });

    it('should handle peer with only Aptos settlement', async () => {
      const { UnifiedSettlementExecutor } =
        await import('../../src/settlement/unified-settlement-executor');

      const mockEvmSDK = {} as any;
      const mockXrpManager = {} as any;
      const mockXrpClaimSigner = {} as any;
      const mockAptosSDK = {
        openChannel: jest.fn().mockResolvedValue('0x' + '1'.repeat(64)),
        signClaim: jest.fn().mockReturnValue({
          channelOwner: '0x' + '1'.repeat(64),
          amount: BigInt('1000000000'),
          nonce: 1,
          signature: '0x' + 'a'.repeat(128),
          publicKey: '0x' + 'b'.repeat(64),
          createdAt: Date.now(),
        }),
        getMyChannels: jest.fn().mockReturnValue([]),
      } as any;
      const mockSettlementMonitor = new EventEmitter() as any;
      const mockAccountManager = {
        recordSettlement: jest.fn().mockResolvedValue(undefined),
      } as any;

      const config = {
        peers: new Map([
          [
            'peer-aptos',
            {
              peerId: 'peer-aptos',
              address: 'g.aptos',
              settlementPreference: 'aptos' as const,
              settlementTokens: ['APT'],
              aptosAddress: '0x' + '2'.repeat(64),
              aptosPubkey: '3'.repeat(64),
            },
          ],
        ]),
        defaultPreference: 'aptos' as const,
        enabled: true,
      };

      const executor = new UnifiedSettlementExecutor(
        config,
        mockEvmSDK,
        mockXrpManager,
        mockXrpClaimSigner,
        mockAptosSDK,
        mockSettlementMonitor,
        mockAccountManager,
        null,
        logger
      );

      executor.start();

      const handler = mockSettlementMonitor.listeners('SETTLEMENT_REQUIRED')[0];

      await handler({
        peerId: 'peer-aptos',
        balance: '1000000000',
        tokenId: 'APT',
        timestamp: Date.now(),
      });

      expect(mockAptosSDK.openChannel).toHaveBeenCalled();
      expect(mockAptosSDK.signClaim).toHaveBeenCalled();

      executor.stop();
    });
  });

  describe('Real Blockchain Integration', () => {
    // These tests require actual blockchain connections
    // They are skipped if the required environment variables are not set

    it.skip('should settle EVM peer with USDC (requires Anvil)', async () => {
      // This test requires docker-compose-dev with Anvil running
      // Skip for now - would need full infrastructure setup
      expect(true).toBe(true);
    });

    it.skip('should settle XRP peer with XRP (requires rippled)', async () => {
      // This test requires docker-compose-dev with rippled running
      // Skip for now - would need full infrastructure setup
      expect(true).toBe(true);
    });

    it.skip('should settle Aptos peer with APT (requires Aptos testnet)', async () => {
      // This test requires Aptos testnet connection
      // Skip if not configured
      if (!aptosConfigured) {
        // eslint-disable-next-line no-console
        console.log('Skipping Aptos integration test - environment not configured');
        return;
      }

      // Would implement actual Aptos settlement here
      expect(true).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle incompatible token/preference combinations', async () => {
      const { UnifiedSettlementExecutor } =
        await import('../../src/settlement/unified-settlement-executor');

      const mockEvmSDK = {
        openChannel: jest.fn(),
      } as any;
      const mockXrpManager = {} as any;
      const mockXrpClaimSigner = {} as any;
      const mockSettlementMonitor = new EventEmitter() as any;
      const mockAccountManager = {} as any;

      const config = {
        peers: new Map([
          [
            'peer-evm-only',
            {
              peerId: 'peer-evm-only',
              address: 'g.evmonly',
              settlementPreference: 'evm' as const,
              settlementTokens: ['USDC'],
              evmAddress: '0x' + '1'.repeat(40),
            },
          ],
        ]),
        defaultPreference: 'evm' as const,
        enabled: true,
      };

      const executor = new UnifiedSettlementExecutor(
        config,
        mockEvmSDK,
        mockXrpManager,
        mockXrpClaimSigner,
        null,
        mockSettlementMonitor,
        mockAccountManager,
        null,
        logger
      );

      executor.start();

      const handler = mockSettlementMonitor.listeners('SETTLEMENT_REQUIRED')[0];

      // Try to settle XRP with EVM-only peer - should fail
      await expect(
        handler({
          peerId: 'peer-evm-only',
          balance: '1000000000',
          tokenId: 'XRP', // XRP token to EVM-only peer
          timestamp: Date.now(),
        })
      ).rejects.toThrow('No compatible settlement method');

      // Try to settle APT with EVM-only peer - should fail
      await expect(
        handler({
          peerId: 'peer-evm-only',
          balance: '1000000000',
          tokenId: 'APT', // APT token to EVM-only peer
          timestamp: Date.now(),
        })
      ).rejects.toThrow('No compatible settlement method');

      executor.stop();
    });
  });
});
