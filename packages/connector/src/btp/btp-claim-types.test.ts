/**
 * Unit tests for BTP Claim Message Protocol
 *
 * Tests cover EVM claim message validation, type guards, edge cases, and JSON serialization.
 * Epic 30 Story 30.4: Removed XRP/Aptos tests (EVM-only settlement).
 *
 * @module btp-claim-types.test
 */

import {
  BTPClaimMessage,
  EVMClaimMessage,
  validateClaimMessage,
  isEVMClaim,
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
    expect(() => validateClaimMessage(invalidMessage)).toThrow('Invalid version');
  });

  it('should reject unsupported version', () => {
    // Arrange
    const invalidMessage = {
      version: '2.0',
      blockchain: 'evm',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
      nonce: 1,
      transferredAmount: '1000000000000000000',
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890',
      signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      "Invalid version (expected '1.0', got '2.0')"
    );
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
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Unsupported blockchain type: bitcoin'
    );
  });

  it('should reject missing messageId', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'evm',
      timestamp: '2026-02-02T12:00:00.000Z',
      senderId: 'peer-alice',
      channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
      nonce: 1,
      transferredAmount: '1000000000000000000',
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890',
      signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Missing or invalid messageId (expected non-empty string)'
    );
  });

  it('should reject invalid timestamp format', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'evm',
      messageId: 'claim-001',
      timestamp: '2026-02-02 12:00:00', // Not ISO 8601
      senderId: 'peer-alice',
      channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
      nonce: 1,
      transferredAmount: '1000000000000000000',
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890',
      signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Invalid timestamp format (expected ISO 8601 with Z timezone)'
    );
  });

  it('should reject missing timestamp', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'evm',
      messageId: 'claim-001',
      senderId: 'peer-alice',
      channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
      nonce: 1,
      transferredAmount: '1000000000000000000',
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890',
      signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Missing or invalid timestamp (expected ISO 8601 string)'
    );
  });

  it('should reject missing senderId', () => {
    // Arrange
    const invalidMessage = {
      version: '1.0',
      blockchain: 'evm',
      messageId: 'claim-001',
      timestamp: '2026-02-02T12:00:00.000Z',
      channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
      nonce: 1,
      transferredAmount: '1000000000000000000',
      lockedAmount: '0',
      locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0xabcdef1234567890',
      signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    };

    // Act & Assert
    expect(() => validateClaimMessage(invalidMessage)).toThrow(
      'Missing or invalid senderId (expected non-empty string)'
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
      'Invalid channelId format (expected 0x-prefixed 64-char hex)'
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
      'Invalid channelId format (expected 0x-prefixed 64-char hex)'
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
      'Missing or invalid nonce (expected non-negative number)'
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
      'Invalid transferredAmount (expected non-negative integer string)'
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
      'Missing or invalid transferredAmount (expected non-empty string)'
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
      'Invalid signerAddress format (expected 0x-prefixed 40-char hex)'
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
      'Invalid signerAddress format (expected 0x-prefixed 40-char hex)'
    );
  });
});

describe('Type Guards', () => {
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

  describe('isEVMClaim', () => {
    it('should return true for EVM claim', () => {
      expect(isEVMClaim(evmClaim)).toBe(true);
    });

    it('should narrow type to EVMClaimMessage', () => {
      const claim: BTPClaimMessage = evmClaim;
      if (isEVMClaim(claim)) {
        // TypeScript should recognize claim.nonce exists
        expect(claim.nonce).toBeDefined();
        expect(claim.channelId).toBeDefined();
        expect(claim.transferredAmount).toBeDefined();
        expect(claim.signerAddress).toBeDefined();
      }
    });
  });
});

describe('JSON Serialization Round-Trip', () => {
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
});
