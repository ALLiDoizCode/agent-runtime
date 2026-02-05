/**
 * Aptos Environment Variable Validator
 *
 * Validates Aptos-related environment variables for connector startup.
 * The SDK factory `createAptosChannelSDKFromEnv()` reads env vars directly,
 * but this validator runs first to provide helpful warnings when
 * APTOS_ENABLED=true but required variables are missing.
 *
 * Story 28.5: Production Connector Aptos Settlement
 *
 * @packageDocumentation
 */

import type { Logger } from 'pino';

/**
 * Result of Aptos environment validation
 */
export interface AptosEnvValidation {
  /**
   * Whether APTOS_ENABLED=true is set
   */
  enabled: boolean;

  /**
   * Whether all required environment variables are present
   * Only relevant when enabled=true
   */
  valid: boolean;

  /**
   * List of missing required environment variables
   * Only populated when enabled=true and valid=false
   */
  missing?: string[];
}

/**
 * Required environment variables when APTOS_ENABLED=true
 *
 * These are read by `createAptosChannelSDKFromEnv()` in aptos-channel-sdk.ts
 */
const REQUIRED_APTOS_ENV_VARS = [
  'APTOS_NODE_URL',
  'APTOS_PRIVATE_KEY',
  'APTOS_ACCOUNT_ADDRESS',
  'APTOS_CLAIM_PRIVATE_KEY',
  'APTOS_MODULE_ADDRESS',
];

/**
 * Validate Aptos environment variables
 *
 * Checks whether Aptos is enabled and if all required environment
 * variables are present. Logs a warning if APTOS_ENABLED=true but
 * some required variables are missing.
 *
 * This validation runs before SDK initialization to provide helpful
 * error messages. The connector will continue without Aptos if
 * validation fails (graceful degradation).
 *
 * @param logger - Pino logger instance
 * @returns Validation result with enabled, valid, and missing fields
 *
 * @example
 * ```typescript
 * const validation = validateAptosEnvironment(logger);
 * if (validation.enabled && validation.valid) {
 *   const sdk = createAptosChannelSDKFromEnv(logger);
 *   sdk.startAutoRefresh();
 * }
 * ```
 */
export function validateAptosEnvironment(logger: Logger): AptosEnvValidation {
  const enabled = process.env.APTOS_ENABLED === 'true';

  // If Aptos is not enabled, validation passes (nothing to check)
  if (!enabled) {
    return { enabled: false, valid: true };
  }

  // Check for missing required environment variables
  const missing = REQUIRED_APTOS_ENV_VARS.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    logger.warn(
      { missing, event: 'aptos_env_validation_failed' },
      'APTOS_ENABLED=true but required environment variables are missing. ' +
        'Connector will continue without Aptos settlement support.'
    );
    return { enabled: true, valid: false, missing };
  }

  logger.info({ event: 'aptos_env_validation_passed' }, 'Aptos environment validation passed');
  return { enabled: true, valid: true };
}
