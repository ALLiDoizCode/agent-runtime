/**
 * Unit tests for ClaimReceiver
 *
 * Tests claim reception, validation, EVM signature verification,
 * monotonicity checks, and database persistence.
 *
 * Epic 30 Story 30.4: Removed XRP/Aptos claim handling tests (EVM-only settlement).
 */

import { ClaimReceiver } from './claim-receiver';
import type { Database, Statement } from 'better-sqlite3';
import type { Logger } from 'pino';
import type { BTPServer } from '../btp/btp-server';
import type { BTPProtocolData, BTPMessage, BTPData } from '../btp/btp-types';
import type { TelemetryEmitter } from '../telemetry/telemetry-emitter';
import type { PaymentChannelSDK } from './payment-channel-sdk';
import type { EVMClaimMessage } from '../btp/btp-claim-types';

describe('ClaimReceiver', () => {
  let claimReceiver: ClaimReceiver;
  let mockDb: jest.Mocked<Database>;
  let mockLogger: jest.Mocked<Logger>;
  let mockTelemetryEmitter: jest.Mocked<TelemetryEmitter>;
  let mockBTPServer: jest.Mocked<BTPServer>;
  let mockPaymentChannelSDK: jest.Mocked<PaymentChannelSDK>;
  let mockStatement: jest.Mocked<Statement>;
  let btpMessageHandler: ((peerId: string, message: BTPMessage) => void) | null;

  beforeEach(() => {
    jest.clearAllMocks();
    btpMessageHandler = null;

    // Mock Database
    mockStatement = {
      run: jest.fn(),
      get: jest.fn(),
    } as unknown as jest.Mocked<Statement>;

    mockDb = {
      prepare: jest.fn().mockReturnValue(mockStatement),
      exec: jest.fn(),
    } as unknown as jest.Mocked<Database>;

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<Logger>;

    // Mock TelemetryEmitter
    mockTelemetryEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<TelemetryEmitter>;

    // Mock BTPServer
    mockBTPServer = {
      onMessage: jest.fn((handler) => {
        btpMessageHandler = handler;
      }),
    } as unknown as jest.Mocked<BTPServer>;

    // Mock PaymentChannelSDK
    mockPaymentChannelSDK = {
      verifyBalanceProof: jest.fn(),
    } as unknown as jest.Mocked<PaymentChannelSDK>;

    // Create ClaimReceiver instance (EVM-only)
    claimReceiver = new ClaimReceiver(
      mockDb,
      mockPaymentChannelSDK,
      mockLogger,
      mockTelemetryEmitter,
      'test-node'
    );
  });

  describe('registerWithBTPServer', () => {
    it('should register message handler with BTP server', () => {
      claimReceiver.registerWithBTPServer(mockBTPServer);

      expect(mockBTPServer.onMessage).toHaveBeenCalledTimes(1);
      expect(mockBTPServer.onMessage).toHaveBeenCalledWith(expect.any(Function));
      expect(mockLogger.info).toHaveBeenCalledWith('ClaimReceiver registered with BTP server');
    });
  });

  // XRP claim handling removed in Epic 30 Story 30.4 - EVM-only settlement

  describe('handleClaimMessage - EVM Claims', () => {
    let validEVMClaim: EVMClaimMessage;
    let protocolData: BTPProtocolData;
    let btpMessage: BTPMessage;

    beforeEach(() => {
      validEVMClaim = {
        version: '1.0',
        blockchain: 'evm',
        messageId: 'evm-0xabc123-5-1706889600000',
        timestamp: '2026-02-02T12:00:00.000Z',
        senderId: 'peer-bob',
        channelId: '0x' + 'a'.repeat(64),
        nonce: 5,
        transferredAmount: '1000000000000000000',
        lockedAmount: '0',
        locksRoot: '0x' + '0'.repeat(64),
        signature: '0x' + 'b'.repeat(130),
        signerAddress: '0x' + 'c'.repeat(40),
      };

      protocolData = {
        protocolName: 'payment-channel-claim',
        contentType: 1,
        data: Buffer.from(JSON.stringify(validEVMClaim), 'utf8'),
      };

      btpMessage = {
        type: 6,
        requestId: 1,
        data: {
          protocolData: [protocolData],
          transfer: {
            amount: '0',
            expiresAt: new Date(Date.now() + 30000).toISOString(),
          },
        } as BTPData,
      };
    });

    it('should verify valid EVM claim and store with verified=true', async () => {
      mockPaymentChannelSDK.verifyBalanceProof.mockResolvedValue(true);
      mockStatement.get.mockReturnValue(undefined); // No previous claim

      claimReceiver.registerWithBTPServer(mockBTPServer);
      await btpMessageHandler!('peer-bob', btpMessage);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify balance proof verification
      expect(mockPaymentChannelSDK.verifyBalanceProof).toHaveBeenCalledWith(
        {
          channelId: validEVMClaim.channelId,
          nonce: validEVMClaim.nonce,
          transferredAmount: BigInt(validEVMClaim.transferredAmount),
          lockedAmount: BigInt(validEVMClaim.lockedAmount),
          locksRoot: validEVMClaim.locksRoot,
        },
        validEVMClaim.signature,
        validEVMClaim.signerAddress
      );

      // Verify database insert with verified=true
      expect(mockStatement.run).toHaveBeenCalledWith(
        validEVMClaim.messageId,
        'peer-bob',
        'evm',
        validEVMClaim.channelId,
        JSON.stringify(validEVMClaim),
        1, // verified=true
        expect.any(Number),
        null,
        null
      );

      // Verify telemetry emission
      expect(mockTelemetryEmitter.emit).toHaveBeenCalledWith({
        type: 'CLAIM_RECEIVED',
        nodeId: 'test-node',
        peerId: 'peer-bob',
        blockchain: 'evm',
        messageId: validEVMClaim.messageId,
        channelId: validEVMClaim.channelId,
        amount: validEVMClaim.transferredAmount,
        verified: true,
        timestamp: expect.any(String),
      });
    });

    it('should reject EVM claim with invalid EIP-712 signature', async () => {
      mockPaymentChannelSDK.verifyBalanceProof.mockResolvedValue(false);

      claimReceiver.registerWithBTPServer(mockBTPServer);
      await btpMessageHandler!('peer-bob', btpMessage);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify database insert with verified=false
      expect(mockStatement.run).toHaveBeenCalledWith(
        validEVMClaim.messageId,
        'peer-bob',
        'evm',
        validEVMClaim.channelId,
        JSON.stringify(validEVMClaim),
        0, // verified=false
        expect.any(Number),
        null,
        null
      );

      // Verify telemetry emission with error
      expect(mockTelemetryEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          verified: false,
          error: 'Invalid EIP-712 signature',
        })
      );
    });

    it('should reject EVM claim with non-increasing nonce (monotonicity check)', async () => {
      mockPaymentChannelSDK.verifyBalanceProof.mockResolvedValue(true);

      // Mock previous claim with same nonce
      const previousClaim: EVMClaimMessage = {
        ...validEVMClaim,
        nonce: 5, // Same nonce
      };

      mockStatement.get.mockReturnValue({
        claim_data: JSON.stringify(previousClaim),
      });

      claimReceiver.registerWithBTPServer(mockBTPServer);
      await btpMessageHandler!('peer-bob', btpMessage);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify database insert with verified=false
      expect(mockStatement.run).toHaveBeenCalledWith(
        validEVMClaim.messageId,
        'peer-bob',
        'evm',
        validEVMClaim.channelId,
        JSON.stringify(validEVMClaim),
        0, // verified=false
        expect.any(Number),
        null,
        null
      );

      // Verify telemetry emission with monotonicity error
      expect(mockTelemetryEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          verified: false,
          error: 'Nonce not monotonically increasing',
        })
      );
    });
  });

  // Aptos claim handling removed in Epic 30 Story 30.4 - EVM-only settlement

  describe('Error Handling', () => {
    it('should handle invalid JSON parsing gracefully', async () => {
      const protocolData: BTPProtocolData = {
        protocolName: 'payment-channel-claim',
        contentType: 1,
        data: Buffer.from('invalid json', 'utf8'),
      };

      const btpMessage: BTPMessage = {
        type: 6,
        requestId: 1,
        data: {
          protocolData: [protocolData],
          transfer: {
            amount: '0',
            expiresAt: new Date(Date.now() + 30000).toISOString(),
          },
        } as BTPData,
      };

      claimReceiver.registerWithBTPServer(mockBTPServer);
      await btpMessageHandler!('peer-bob', btpMessage);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify error logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Failed to parse claim message'
      );

      // Verify telemetry emitted with error
      expect(mockTelemetryEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CLAIM_RECEIVED',
          verified: false,
          error: expect.any(String),
        })
      );

      // Verify no database insert
      expect(mockStatement.run).not.toHaveBeenCalled();
    });

    it('should handle database persistence failure gracefully', async () => {
      const validEVMClaim: EVMClaimMessage = {
        version: '1.0',
        blockchain: 'evm',
        messageId: 'evm-test-123',
        timestamp: '2026-02-02T12:00:00.000Z',
        senderId: 'peer-bob',
        channelId: '0x' + 'a'.repeat(64),
        nonce: 1,
        transferredAmount: '1000000',
        lockedAmount: '0',
        locksRoot: '0x' + '0'.repeat(64),
        signature: '0x' + 'b'.repeat(130),
        signerAddress: '0x' + 'c'.repeat(40),
      };

      const protocolData: BTPProtocolData = {
        protocolName: 'payment-channel-claim',
        contentType: 1,
        data: Buffer.from(JSON.stringify(validEVMClaim), 'utf8'),
      };

      const btpMessage: BTPMessage = {
        type: 6,
        requestId: 1,
        data: {
          protocolData: [protocolData],
          transfer: {
            amount: '0',
            expiresAt: new Date(Date.now() + 30000).toISOString(),
          },
        } as BTPData,
      };

      mockPaymentChannelSDK.verifyBalanceProof.mockResolvedValue(true);
      mockStatement.get.mockReturnValue(undefined);
      mockStatement.run.mockImplementation(() => {
        throw new Error('Database error');
      });

      claimReceiver.registerWithBTPServer(mockBTPServer);
      await btpMessageHandler!('peer-bob', btpMessage);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify error logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Failed to persist claim to database'
      );

      // Verify telemetry still emitted (non-blocking)
      expect(mockTelemetryEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CLAIM_RECEIVED',
          verified: true,
        })
      );
    });

    it('should handle telemetry emission failure gracefully', async () => {
      const validEVMClaim: EVMClaimMessage = {
        version: '1.0',
        blockchain: 'evm',
        messageId: 'evm-test-123',
        timestamp: '2026-02-02T12:00:00.000Z',
        senderId: 'peer-bob',
        channelId: '0x' + 'a'.repeat(64),
        nonce: 1,
        transferredAmount: '1000000',
        lockedAmount: '0',
        locksRoot: '0x' + '0'.repeat(64),
        signature: '0x' + 'b'.repeat(130),
        signerAddress: '0x' + 'c'.repeat(40),
      };

      const protocolData: BTPProtocolData = {
        protocolName: 'payment-channel-claim',
        contentType: 1,
        data: Buffer.from(JSON.stringify(validEVMClaim), 'utf8'),
      };

      const btpMessage: BTPMessage = {
        type: 6,
        requestId: 1,
        data: {
          protocolData: [protocolData],
          transfer: {
            amount: '0',
            expiresAt: new Date(Date.now() + 30000).toISOString(),
          },
        } as BTPData,
      };

      mockPaymentChannelSDK.verifyBalanceProof.mockResolvedValue(true);
      mockStatement.get.mockReturnValue(undefined);
      mockTelemetryEmitter.emit.mockImplementation(() => {
        throw new Error('Telemetry error');
      });

      claimReceiver.registerWithBTPServer(mockBTPServer);
      await btpMessageHandler!('peer-bob', btpMessage);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify telemetry error logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Failed to emit claim received telemetry'
      );

      // Verify database insert still succeeded (non-blocking)
      expect(mockStatement.run).toHaveBeenCalled();
    });

    it('should handle duplicate message IDs gracefully (idempotency)', async () => {
      const validEVMClaim: EVMClaimMessage = {
        version: '1.0',
        blockchain: 'evm',
        messageId: 'evm-test-123',
        timestamp: '2026-02-02T12:00:00.000Z',
        senderId: 'peer-bob',
        channelId: '0x' + 'a'.repeat(64),
        nonce: 1,
        transferredAmount: '1000000',
        lockedAmount: '0',
        locksRoot: '0x' + '0'.repeat(64),
        signature: '0x' + 'b'.repeat(130),
        signerAddress: '0x' + 'c'.repeat(40),
      };

      const protocolData: BTPProtocolData = {
        protocolName: 'payment-channel-claim',
        contentType: 1,
        data: Buffer.from(JSON.stringify(validEVMClaim), 'utf8'),
      };

      const btpMessage: BTPMessage = {
        type: 6,
        requestId: 1,
        data: {
          protocolData: [protocolData],
          transfer: {
            amount: '0',
            expiresAt: new Date(Date.now() + 30000).toISOString(),
          },
        } as BTPData,
      };

      mockPaymentChannelSDK.verifyBalanceProof.mockResolvedValue(true);
      mockStatement.get.mockReturnValue(undefined);
      mockStatement.run.mockImplementation(() => {
        const error = new Error('UNIQUE constraint failed: received_claims.message_id');
        throw error;
      });

      claimReceiver.registerWithBTPServer(mockBTPServer);
      await btpMessageHandler!('peer-bob', btpMessage);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify warning logged for duplicate
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { messageId: validEVMClaim.messageId },
        'Duplicate claim message ignored (idempotency)'
      );
    });
  });

  describe('getLatestVerifiedClaim', () => {
    it('should return latest verified claim for peer and channel', async () => {
      const storedClaim: EVMClaimMessage = {
        version: '1.0',
        blockchain: 'evm',
        messageId: 'evm-test-123',
        timestamp: '2026-02-02T12:00:00.000Z',
        senderId: 'peer-bob',
        channelId: '0x' + 'a'.repeat(64),
        nonce: 1,
        transferredAmount: '1000000',
        lockedAmount: '0',
        locksRoot: '0x' + '0'.repeat(64),
        signature: '0x' + 'b'.repeat(130),
        signerAddress: '0x' + 'c'.repeat(40),
      };

      mockStatement.get.mockReturnValue({
        claim_data: JSON.stringify(storedClaim),
      });

      const result = await claimReceiver.getLatestVerifiedClaim(
        'peer-bob',
        'evm',
        '0x' + 'a'.repeat(64)
      );

      expect(result).toEqual(storedClaim);
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT claim_data'));
      expect(mockStatement.get).toHaveBeenCalledWith('peer-bob', 'evm', '0x' + 'a'.repeat(64));
    });

    it('should return null if no verified claim found', async () => {
      mockStatement.get.mockReturnValue(undefined);

      const result = await claimReceiver.getLatestVerifiedClaim(
        'peer-bob',
        'evm',
        '0x' + 'a'.repeat(64)
      );

      expect(result).toBeNull();
    });

    it('should return null and log error on database failure', async () => {
      mockStatement.get.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await claimReceiver.getLatestVerifiedClaim(
        'peer-bob',
        'evm',
        '0x' + 'a'.repeat(64)
      );

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Failed to query latest verified claim'
      );
    });
  });
});
