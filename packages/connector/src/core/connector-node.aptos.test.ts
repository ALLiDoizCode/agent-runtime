/**
 * Unit Tests for ConnectorNode Aptos Initialization
 *
 * Tests the Aptos Channel SDK lifecycle management in ConnectorNode.
 * Verifies SDK initialization on startup and cleanup on shutdown.
 *
 * Story 28.5: Production Connector Aptos Settlement
 *
 * @packageDocumentation
 */

import { ConnectorNode } from './connector-node';
import type { Logger } from 'pino';
import * as aptosEnvValidator from '../config/aptos-env-validator';
import * as aptosChannelSdk from '../settlement/aptos-channel-sdk';

// Mock all dependencies
jest.mock('../config/config-loader', () => ({
  ConfigLoader: {
    loadConfig: jest.fn().mockReturnValue({
      nodeId: 'test-node',
      btpServerPort: 9000,
      healthCheckPort: 8080,
      peers: [],
      routes: [],
    }),
  },
  ConfigurationError: class ConfigurationError extends Error {},
}));

jest.mock('../routing/routing-table', () => ({
  RoutingTable: jest.fn().mockImplementation(() => ({
    getAllRoutes: jest.fn().mockReturnValue([]),
    lookup: jest.fn(),
  })),
}));

jest.mock('../btp/btp-client-manager', () => ({
  BTPClientManager: jest.fn().mockImplementation(() => ({
    getPeerIds: jest.fn().mockReturnValue([]),
    getPeerStatus: jest.fn().mockReturnValue(new Map()),
    setPacketHandler: jest.fn(),
  })),
}));

jest.mock('../btp/btp-server', () => ({
  BTPServer: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('./packet-handler', () => ({
  PacketHandler: jest.fn().mockImplementation(() => ({
    setBTPServer: jest.fn(),
  })),
}));

jest.mock('../http/health-server', () => ({
  HealthServer: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../telemetry/telemetry-emitter', () => ({
  TelemetryEmitter: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    onEvent: jest.fn(),
    emitNodeStatus: jest.fn(),
  })),
}));

jest.mock('../config/aptos-env-validator');
jest.mock('../settlement/aptos-channel-sdk');

describe('ConnectorNode Aptos Integration', () => {
  // Mock logger
  const mockLogger: Logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  } as unknown as Logger;

  // Mock SDK instance
  const mockAptosSDK = {
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
    openChannel: jest.fn(),
    signClaim: jest.fn(),
    getMyChannels: jest.fn().mockReturnValue([]),
  };

  // Store original env vars
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();

    // Default: Aptos not enabled
    (aptosEnvValidator.validateAptosEnvironment as jest.Mock).mockReturnValue({
      enabled: false,
      valid: true,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('when APTOS_ENABLED=false (default)', () => {
    it('should not create SDK', async () => {
      (aptosEnvValidator.validateAptosEnvironment as jest.Mock).mockReturnValue({
        enabled: false,
        valid: true,
      });

      const connector = new ConnectorNode('./config.yaml', mockLogger);
      await connector.start();

      expect(aptosChannelSdk.createAptosChannelSDKFromEnv).not.toHaveBeenCalled();
      expect(connector.getAptosChannelSDK()).toBeNull();

      await connector.stop();
    });
  });

  describe('when APTOS_ENABLED=true with all required vars', () => {
    it('should create SDK and start auto-refresh', async () => {
      (aptosEnvValidator.validateAptosEnvironment as jest.Mock).mockReturnValue({
        enabled: true,
        valid: true,
      });
      (aptosChannelSdk.createAptosChannelSDKFromEnv as jest.Mock).mockReturnValue(mockAptosSDK);

      const connector = new ConnectorNode('./config.yaml', mockLogger);
      await connector.start();

      expect(aptosChannelSdk.createAptosChannelSDKFromEnv).toHaveBeenCalledWith(
        expect.objectContaining({ info: expect.any(Function) })
      );
      expect(mockAptosSDK.startAutoRefresh).toHaveBeenCalled();
      expect(connector.getAptosChannelSDK()).toBe(mockAptosSDK);

      await connector.stop();
    });

    it('should log SDK initialization', async () => {
      (aptosEnvValidator.validateAptosEnvironment as jest.Mock).mockReturnValue({
        enabled: true,
        valid: true,
      });
      (aptosChannelSdk.createAptosChannelSDKFromEnv as jest.Mock).mockReturnValue(mockAptosSDK);

      const connector = new ConnectorNode('./config.yaml', mockLogger);
      await connector.start();

      expect(mockLogger.info).toHaveBeenCalledWith(
        { event: 'aptos_sdk_initialized' },
        expect.stringContaining('AptosChannelSDK initialized')
      );

      await connector.stop();
    });
  });

  describe('when APTOS_ENABLED=true but missing required vars', () => {
    it('should not create SDK and log warning', async () => {
      (aptosEnvValidator.validateAptosEnvironment as jest.Mock).mockReturnValue({
        enabled: true,
        valid: false,
        missing: ['APTOS_PRIVATE_KEY', 'APTOS_MODULE_ADDRESS'],
      });

      const connector = new ConnectorNode('./config.yaml', mockLogger);
      await connector.start();

      expect(aptosChannelSdk.createAptosChannelSDKFromEnv).not.toHaveBeenCalled();
      expect(connector.getAptosChannelSDK()).toBeNull();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'aptos_disabled_missing_env',
          missing: ['APTOS_PRIVATE_KEY', 'APTOS_MODULE_ADDRESS'],
        }),
        expect.any(String)
      );

      await connector.stop();
    });
  });

  describe('when SDK initialization fails', () => {
    it('should log error and continue without Aptos', async () => {
      (aptosEnvValidator.validateAptosEnvironment as jest.Mock).mockReturnValue({
        enabled: true,
        valid: true,
      });
      (aptosChannelSdk.createAptosChannelSDKFromEnv as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to connect to Aptos node');
      });

      const connector = new ConnectorNode('./config.yaml', mockLogger);
      // Should not throw
      await connector.start();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'aptos_sdk_init_failed',
          error: 'Failed to connect to Aptos node',
        }),
        expect.any(String)
      );
      expect(connector.getAptosChannelSDK()).toBeNull();

      await connector.stop();
    });
  });

  describe('stop() calls stopAutoRefresh()', () => {
    it('should stop auto-refresh when connector stops', async () => {
      (aptosEnvValidator.validateAptosEnvironment as jest.Mock).mockReturnValue({
        enabled: true,
        valid: true,
      });
      (aptosChannelSdk.createAptosChannelSDKFromEnv as jest.Mock).mockReturnValue(mockAptosSDK);

      const connector = new ConnectorNode('./config.yaml', mockLogger);
      await connector.start();

      expect(mockAptosSDK.stopAutoRefresh).not.toHaveBeenCalled();

      await connector.stop();

      expect(mockAptosSDK.stopAutoRefresh).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        { event: 'aptos_sdk_stopped' },
        expect.stringContaining('stopped')
      );
    });

    it('should not throw if SDK was not initialized', async () => {
      (aptosEnvValidator.validateAptosEnvironment as jest.Mock).mockReturnValue({
        enabled: false,
        valid: true,
      });

      const connector = new ConnectorNode('./config.yaml', mockLogger);
      await connector.start();
      // Should not throw even though SDK is null
      await expect(connector.stop()).resolves.not.toThrow();
    });
  });

  describe('feature flag APTOS_SETTLEMENT_ENABLED', () => {
    it('SettlementDisabledError is exported from unified-settlement-executor', async () => {
      // Verify the error class is exported for testing
      const { SettlementDisabledError } = await import('../settlement/unified-settlement-executor');
      expect(SettlementDisabledError).toBeDefined();

      const error = new SettlementDisabledError('Test message');
      expect(error.name).toBe('SettlementDisabledError');
      expect(error.message).toBe('Test message');
    });
  });
});
