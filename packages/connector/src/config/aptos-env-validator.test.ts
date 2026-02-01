/**
 * Unit Tests for Aptos Environment Validator
 *
 * Tests the validateAptosEnvironment function that checks for required
 * environment variables when APTOS_ENABLED=true.
 *
 * Story 28.5: Production Connector Aptos Settlement
 *
 * @packageDocumentation
 */

import { validateAptosEnvironment, AptosEnvValidation } from './aptos-env-validator';
import type { Logger } from 'pino';

describe('validateAptosEnvironment', () => {
  // Mock logger
  const mockLogger: Logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  } as unknown as Logger;

  // Store original env vars
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env vars before each test
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore original env vars
    process.env = originalEnv;
  });

  describe('when APTOS_ENABLED is not set', () => {
    it('should return enabled=false and valid=true', () => {
      delete process.env.APTOS_ENABLED;

      const result = validateAptosEnvironment(mockLogger);

      expect(result).toEqual<AptosEnvValidation>({
        enabled: false,
        valid: true,
      });
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('when APTOS_ENABLED=false', () => {
    it('should return enabled=false and valid=true', () => {
      process.env.APTOS_ENABLED = 'false';

      const result = validateAptosEnvironment(mockLogger);

      expect(result).toEqual<AptosEnvValidation>({
        enabled: false,
        valid: true,
      });
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('when APTOS_ENABLED=true with all required vars', () => {
    it('should return enabled=true and valid=true', () => {
      process.env.APTOS_ENABLED = 'true';
      process.env.APTOS_NODE_URL = 'https://fullnode.testnet.aptoslabs.com/v1';
      process.env.APTOS_PRIVATE_KEY = '0xabcd1234';
      process.env.APTOS_ACCOUNT_ADDRESS = '0x1234567890abcdef';
      process.env.APTOS_CLAIM_PRIVATE_KEY = '0xefgh5678';
      process.env.APTOS_MODULE_ADDRESS = '0xmodule123';

      const result = validateAptosEnvironment(mockLogger);

      expect(result).toEqual<AptosEnvValidation>({
        enabled: true,
        valid: true,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        { event: 'aptos_env_validation_passed' },
        expect.any(String)
      );
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('when APTOS_ENABLED=true but missing required vars', () => {
    it('should return enabled=true, valid=false, and list missing vars', () => {
      process.env.APTOS_ENABLED = 'true';
      // Only set some of the required vars
      process.env.APTOS_NODE_URL = 'https://fullnode.testnet.aptoslabs.com/v1';
      process.env.APTOS_ACCOUNT_ADDRESS = '0x1234567890abcdef';
      // Missing: APTOS_PRIVATE_KEY, APTOS_CLAIM_PRIVATE_KEY, APTOS_MODULE_ADDRESS

      const result = validateAptosEnvironment(mockLogger);

      expect(result.enabled).toBe(true);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('APTOS_PRIVATE_KEY');
      expect(result.missing).toContain('APTOS_CLAIM_PRIVATE_KEY');
      expect(result.missing).toContain('APTOS_MODULE_ADDRESS');
      expect(result.missing).not.toContain('APTOS_NODE_URL');
      expect(result.missing).not.toContain('APTOS_ACCOUNT_ADDRESS');
    });

    it('should log a warning with missing variable names', () => {
      process.env.APTOS_ENABLED = 'true';
      process.env.APTOS_NODE_URL = 'https://fullnode.testnet.aptoslabs.com/v1';
      // Missing all other required vars

      validateAptosEnvironment(mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          missing: expect.arrayContaining([
            'APTOS_PRIVATE_KEY',
            'APTOS_ACCOUNT_ADDRESS',
            'APTOS_CLAIM_PRIVATE_KEY',
            'APTOS_MODULE_ADDRESS',
          ]),
          event: 'aptos_env_validation_failed',
        }),
        expect.any(String)
      );
    });
  });

  describe('when APTOS_ENABLED=true but all vars missing', () => {
    it('should list all 5 required vars as missing', () => {
      process.env.APTOS_ENABLED = 'true';
      // Delete all possible Aptos vars
      delete process.env.APTOS_NODE_URL;
      delete process.env.APTOS_PRIVATE_KEY;
      delete process.env.APTOS_ACCOUNT_ADDRESS;
      delete process.env.APTOS_CLAIM_PRIVATE_KEY;
      delete process.env.APTOS_MODULE_ADDRESS;

      const result = validateAptosEnvironment(mockLogger);

      expect(result.enabled).toBe(true);
      expect(result.valid).toBe(false);
      expect(result.missing).toHaveLength(5);
      expect(result.missing).toEqual(
        expect.arrayContaining([
          'APTOS_NODE_URL',
          'APTOS_PRIVATE_KEY',
          'APTOS_ACCOUNT_ADDRESS',
          'APTOS_CLAIM_PRIVATE_KEY',
          'APTOS_MODULE_ADDRESS',
        ])
      );
    });
  });
});
