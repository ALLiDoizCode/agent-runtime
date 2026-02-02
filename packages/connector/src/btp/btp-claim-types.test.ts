/**
 * Unit tests for BTP Claim Message Protocol
 *
 * Tests cover:
 * - Message validation for all three blockchain types
 * - Type guards for runtime type narrowing
 * - Edge cases: invalid formats, missing fields, boundary values
 * - JSON serialization round-trip
 *
 * @module btp-claim-types.test
 */

import {
  BTPClaimMessage,
  XRPClaimMessage,
  EVMClaimMessage,
  AptosClaimMessage,
  validateClaimMessage,
  isXRPClaim,
  isEVMClaim,
  isAptosClaim,
  BTP_CLAIM_PROTOCOL,
} from './btp-claim-types';

describe('BTP_CLAIM_PROTOCOL constants', () => {
  it('should define correct protocol constants', () => {
    expect(BTP_CLAIM_PROTOCOL.NAME).toBe('payment-channel-claim');
    expect(BTP_CLAIM_PROTOCOL.CONTENT_TYPE).toBe(1);
    expect(BTP_CLAIM_PROTOCOL.VERSION).toBe('1.0');
  });
});

describe('validateClaimMessage - Valid Messages', () => {
  it('should accept valid XRP claim message', () => {
    // Arrange
    const validXRPClaim: XRPClaimMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-xrp-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: '1000000', // 1 XRP in drops
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(validXRPClaim)).not.toThrow();
  });

  it('should accept valid EVM claim message', () => {
    // Arrange
    const validEVMClaim: EVMClaimMessage = {
      version: '1.0',
      blockchain: 'evm',
      messageId: 'claim-evm-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-bob',
      channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
      nonce: 5,
      transferredAmount: '1000000000000000000', // 1 ETH in wei
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act & Assert
    expect(() => validateClaimMessage(validEVMClaim)).not.toThrow();
  });

  it('should accept valid Aptos claim message', () => {
    // Arrange
    const validAptosClaim: AptosClaimMessage = {
      version: '1.0',
      blockchain: 'aptos',
      messageId: 'claim-aptos-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-carol',
      channelOwner: '0x1234567890abcdef',
      amount: '100000000', // 1 APT in octas
      nonce: 10,
      signature: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      publicKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    };

    // Act & Assert
    expect(() => validateClaimMessage(validAptosClaim)).not.toThrow();
  });
});

describe('validateClaimMessage - Common Field Validation', () => {
  it('should reject non-object message', () => {
    // Arrange
    const invalidMessage = 'not an object';

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow('Claim message must be an object');
  });

  it('should reject null message', () => {
    // Arrange
    const invalidMessage = null;

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow('Claim message must be an object');
  });

  it('should reject array message', () => {
    // Arrange
    const invalidMessage = ['not', 'an', 'object'];

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow('Claim message must be an object');
  });

  it('should reject unsupported version', () => {
    // Arrange
    const invalidMessage = {
      version: '2.0',
      blockchain: 'xrp',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: '1000000',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow('Unsupported claim version: 2.0');
  });

  it('should reject invalid blockchain type', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'bitcoin',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow('Invalid blockchain type: bitcoin');
  });

  it('should reject missing messageId', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: '1000000',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow('Missing or invalid messageId');
  });

  it('should reject empty messageId', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: '   ',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: '1000000',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow('Missing or invalid messageId');
  });

  it('should reject invalid timestamp format', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-001',
      timestamp: '2026-02-02 12:00:00', // Not ISO 8601
      senderId: 'peer-alice',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: '1000000',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow('Missing or invalid timestamp');
  });

  it('should reject missing timestamp', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-001',
      senderId: 'peer-alice',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: '1000000',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow('Missing or invalid timestamp');
  });

  it('should reject missing senderId', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: '1000000',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow('Missing or invalid senderId');
  });

  it('should reject empty senderId', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: '   ',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: '1000000',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow('Missing or invalid senderId');
  });
});

describe('validateClaimMessage - XRP-Specific Validation', () => {
  it('should reject invalid XRP channelId format (too short)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: 'ABCD', // Too short
      amount: '1000000',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid XRP channelId: must be 64-character hex string'
    );
  });

  it('should reject invalid XRP channelId format (non-hex)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      amount: '1000000',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid XRP channelId: must be 64-character hex string'
    );
  });

  it('should reject zero XRP amount', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: '0',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid XRP amount: must be positive drops'
    );
  });

  it('should reject negative XRP amount', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: '-1000000',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid XRP amount: must be positive drops'
    );
  });

  it('should reject invalid XRP amount format (non-numeric)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: 'not-a-number',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid XRP amount: must be positive drops'
    );
  });

  it('should reject missing XRP amount', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid XRP amount: must be positive drops'
    );
  });

  it('should reject invalid XRP signature format', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: '1000000',
      signature: 'TOOSHORT',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid XRP signature: must be 128-character hex string'
    );
  });

  it('should reject invalid XRP publicKey format (missing ED prefix)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: '1000000',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid XRP publicKey: must be ED prefix + 64 hex characters'
    );
  });

  it('should reject invalid XRP publicKey format (wrong length)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: '1000000',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'EDSHORT',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid XRP publicKey: must be ED prefix + 64 hex characters'
    );
  });
});

describe('validateClaimMessage - EVM-Specific Validation', () => {
  it('should reject invalid EVM channelId format (missing 0x prefix)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'evm',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-bob',
      channelId: '1234567890123456789012345678901234567890123456789012345678901234',
      nonce: 5,
      transferredAmount: '1000000000000000000',
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890',
      signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid EVM channelId: must be bytes32 hex string'
    );
  });

  it('should reject invalid EVM channelId format (wrong length)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'evm',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-bob',
      channelId: '0x1234',
      nonce: 5,
      transferredAmount: '1000000000000000000',
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890',
      signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid EVM channelId: must be bytes32 hex string'
    );
  });

  it('should reject negative EVM nonce', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'evm',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-bob',
      channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
      nonce: -5,
      transferredAmount: '1000000000000000000',
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890',
      signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid EVM nonce: must be non-negative number'
    );
  });

  it('should reject non-integer EVM nonce', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'evm',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-bob',
      channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
      nonce: 5.5,
      transferredAmount: '1000000000000000000',
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890',
      signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid EVM nonce: must be non-negative number'
    );
  });

  it('should reject invalid EVM transferredAmount format (non-numeric)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'evm',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-bob',
      channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
      nonce: 5,
      transferredAmount: 'invalid-amount',
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890',
      signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid EVM transferredAmount: must be non-negative'
    );
  });

  it('should reject missing EVM transferredAmount', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'evm',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-bob',
      channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
      nonce: 5,
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890',
      signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid EVM transferredAmount: must be non-negative'
    );
  });

  it('should reject invalid EVM signature format (missing 0x prefix)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'evm',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-bob',
      channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
      nonce: 5,
      transferredAmount: '1000000000000000000',
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: 'abcdef1234567890',
      signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid EVM signature: must be hex string'
    );
  });

  it('should reject invalid EVM signerAddress format (missing 0x prefix)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'evm',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-bob',
      channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
      nonce: 5,
      transferredAmount: '1000000000000000000',
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890',
      signerAddress: '742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid EVM signerAddress: must be Ethereum address'
    );
  });

  it('should reject invalid EVM signerAddress format (wrong length)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'evm',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-bob',
      channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
      nonce: 5,
      transferredAmount: '1000000000000000000',
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890',
      signerAddress: '0x1234',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid EVM signerAddress: must be Ethereum address'
    );
  });
});

describe('validateClaimMessage - Aptos-Specific Validation', () => {
  it('should reject invalid Aptos channelOwner format (missing 0x prefix)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'aptos',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-carol',
      channelOwner: '1234567890abcdef',
      amount: '100000000',
      nonce: 10,
      signature: 'fedcba9876543210',
      publicKey: '0123456789abcdef',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid Aptos channelOwner: must be Aptos address'
    );
  });

  it('should reject zero Aptos amount', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'aptos',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-carol',
      channelOwner: '0x1234567890abcdef',
      amount: '0',
      nonce: 10,
      signature: 'fedcba9876543210',
      publicKey: '0123456789abcdef',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid Aptos amount: must be positive octas'
    );
  });

  it('should reject negative Aptos amount', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'aptos',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-carol',
      channelOwner: '0x1234567890abcdef',
      amount: '-100000000',
      nonce: 10,
      signature: 'fedcba9876543210',
      publicKey: '0123456789abcdef',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid Aptos amount: must be positive octas'
    );
  });

  it('should reject invalid Aptos amount format (non-numeric)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'aptos',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-carol',
      channelOwner: '0x1234567890abcdef',
      amount: 'not-a-number',
      nonce: 10,
      signature: 'fedcba9876543210',
      publicKey: '0123456789abcdef',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid Aptos amount: must be positive octas'
    );
  });

  it('should reject missing Aptos amount', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'aptos',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-carol',
      channelOwner: '0x1234567890abcdef',
      nonce: 10,
      signature: 'fedcba9876543210',
      publicKey: '0123456789abcdef',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid Aptos amount: must be positive octas'
    );
  });

  it('should reject negative Aptos nonce', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'aptos',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-carol',
      channelOwner: '0x1234567890abcdef',
      amount: '100000000',
      nonce: -10,
      signature: 'fedcba9876543210',
      publicKey: '0123456789abcdef',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid Aptos nonce: must be non-negative number'
    );
  });

  it('should reject non-integer Aptos nonce', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'aptos',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-carol',
      channelOwner: '0x1234567890abcdef',
      amount: '100000000',
      nonce: 10.5,
      signature: 'fedcba9876543210',
      publicKey: '0123456789abcdef',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid Aptos nonce: must be non-negative number'
    );
  });

  it('should reject invalid Aptos signature format (non-hex)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'aptos',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-carol',
      channelOwner: '0x1234567890abcdef',
      amount: '100000000',
      nonce: 10,
      signature: 'ZZZZZZZZ',
      publicKey: '0123456789abcdef',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid Aptos signature: must be hex string'
    );
  });

  it('should reject invalid Aptos publicKey format (non-hex)', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'aptos',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-carol',
      channelOwner: '0x1234567890abcdef',
      amount: '100000000',
      nonce: 10,
      signature: 'fedcba9876543210',
      publicKey: 'ZZZZZZZZ',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid Aptos publicKey: must be hex string'
    );
  });
});

describe('Type Guards', () => {
  const xrpClaim: XRPClaimMessage = {
    version: '1.0',
    blockchain: 'xrp',
    messageId: 'claim-xrp-001',
    timestamp: '2026-02-02T12:00:00.000Z',
    senderId: 'peer-alice',
    channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
    amount: '1000000',
    signature:
      '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
  };

  const evmClaim: EVMClaimMessage = {
    version: '1.0',
    blockchain: 'evm',
    messageId: 'claim-evm-001',
    timestamp: '2026-02-02T12:00:00.000Z',
    senderId: 'peer-bob',
    channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
    nonce: 5,
    transferredAmount: '1000000000000000000',
    lockedAmount: '0',
    locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
    signature: '0xabcdef1234567890',
    signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  };

  const aptosClaim: AptosClaimMessage = {
    version: '1.0',
    blockchain: 'aptos',
    messageId: 'claim-aptos-001',
    timestamp: '2026-02-02T12:00:00.000Z',
    senderId: 'peer-carol',
    channelOwner: '0x1234567890abcdef',
    amount: '100000000',
    nonce: 10,
    signature: 'fedcba9876543210',
    publicKey: '0123456789abcdef',
  };

  describe('isXRPClaim', () => {
    it('should return true for XRP claim', () => {
      expect(isXRPClaim(xrpClaim)).toBe(true);
    });

    it('should return false for EVM claim', () => {
      expect(isXRPClaim(evmClaim)).toBe(false);
    });

    it('should return false for Aptos claim', () => {
      expect(isXRPClaim(aptosClaim)).toBe(false);
    });

    it('should narrow type to XRPClaimMessage', () => {
      const claim: BTPClaimMessage = xrpClaim;
      if (isXRPClaim(claim)) {
        // TypeScript should recognize claim.channelId exists
        expect(claim.channelId).toBeDefined();
        // TypeScript should NOT recognize claim.nonce (EVM-specific)
        // @ts-expect-error - nonce should not exist on XRP claim
        expect(claim.nonce).toBeUndefined();
      }
    });
  });

  describe('isEVMClaim', () => {
    it('should return true for EVM claim', () => {
      expect(isEVMClaim(evmClaim)).toBe(true);
    });

    it('should return false for XRP claim', () => {
      expect(isEVMClaim(xrpClaim)).toBe(false);
    });

    it('should return false for Aptos claim', () => {
      expect(isEVMClaim(aptosClaim)).toBe(false);
    });

    it('should narrow type to EVMClaimMessage', () => {
      const claim: BTPClaimMessage = evmClaim;
      if (isEVMClaim(claim)) {
        // TypeScript should recognize claim.nonce exists
        expect(claim.nonce).toBeDefined();
        // TypeScript should NOT recognize claim.channelOwner (Aptos-specific)
        // @ts-expect-error - channelOwner should not exist on EVM claim
        expect(claim.channelOwner).toBeUndefined();
      }
    });
  });

  describe('isAptosClaim', () => {
    it('should return true for Aptos claim', () => {
      expect(isAptosClaim(aptosClaim)).toBe(true);
    });

    it('should return false for XRP claim', () => {
      expect(isAptosClaim(xrpClaim)).toBe(false);
    });

    it('should return false for EVM claim', () => {
      expect(isAptosClaim(evmClaim)).toBe(false);
    });

    it('should narrow type to AptosClaimMessage', () => {
      const claim: BTPClaimMessage = aptosClaim;
      if (isAptosClaim(claim)) {
        // TypeScript should recognize claim.channelOwner exists
        expect(claim.channelOwner).toBeDefined();
        // TypeScript should NOT recognize claim.channelId (XRP/EVM-specific)
        // @ts-expect-error - channelId should not exist on Aptos claim
        expect(claim.channelId).toBeUndefined();
      }
    });
  });
});

describe('JSON Serialization Round-Trip', () => {
  it('should serialize and deserialize XRP claim correctly', () => {
    // Arrange
    const originalClaim: XRPClaimMessage = {
      version: '1.0',
      blockchain: 'xrp',
      messageId: 'claim-xrp-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234ABCD',
      amount: '1000000',
      signature:
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      publicKey: 'ED0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
    };

    // Act
    const serialized = JSON.stringify(originalClaim);
    const deserialized = JSON.parse(serialized);
    validateClaimMessage(deserialized);

    // Assert
    expect(deserialized).toEqual(originalClaim);
    expect(isXRPClaim(deserialized)).toBe(true);
  });

  it('should serialize and deserialize EVM claim correctly', () => {
    // Arrange
    const originalClaim: EVMClaimMessage = {
      version: '1.0',
      blockchain: 'evm',
      messageId: 'claim-evm-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-bob',
      channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
      nonce: 5,
      transferredAmount: '1000000000000000000',
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890',
      signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act
    const serialized = JSON.stringify(originalClaim);
    const deserialized = JSON.parse(serialized);
    validateClaimMessage(deserialized);

    // Assert
    expect(deserialized).toEqual(originalClaim);
    expect(isEVMClaim(deserialized)).toBe(true);
  });

  it('should serialize and deserialize Aptos claim correctly', () => {
    // Arrange
    const originalClaim: AptosClaimMessage = {
      version: '1.0',
      blockchain: 'aptos',
      messageId: 'claim-aptos-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-carol',
      channelOwner: '0x1234567890abcdef',
      amount: '100000000',
      nonce: 10,
      signature: 'fedcba9876543210',
      publicKey: '0123456789abcdef',
    };

    // Act
    const serialized = JSON.stringify(originalClaim);
    const deserialized = JSON.parse(serialized);
    validateClaimMessage(deserialized);

    // Assert
    expect(deserialized).toEqual(originalClaim);
    expect(isAptosClaim(deserialized)).toBe(true);
  });
});
