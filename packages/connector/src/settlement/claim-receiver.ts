/**
 * Claim Receiver Module
 *
 * Receives and verifies payment channel claims from peers via BTP protocol.
 * Implements verification for EVM blockchains with signature
 * validation and monotonicity checks.
 *
 * @module claim-receiver
 * @see RFC-0023 - Bilateral Transfer Protocol (BTP)
 * @see Epic 17 - BTP Off-Chain Claim Exchange Protocol
 */

import type { Database } from 'better-sqlite3';
import type { Logger } from 'pino';
import type { BTPServer } from '../btp/btp-server';
import type { BTPProtocolData, BTPMessage } from '../btp/btp-types';
import { isBTPData } from '../btp/btp-types';
import type { TelemetryEmitter } from '../telemetry/telemetry-emitter';
import type { PaymentChannelSDK } from './payment-channel-sdk';
import {
  type BTPClaimMessage,
  type EVMClaimMessage,
  type BlockchainType,
  isEVMClaim,
  validateClaimMessage,
} from '../btp/btp-claim-types';

/**
 * Result of claim verification process
 */
export interface ClaimVerificationResult {
  /** Whether the claim passed verification */
  valid: boolean;
  /** Unique message ID of the claim */
  messageId: string;
  /** Error message if verification failed */
  error?: string;
}

/**
 * ClaimReceiver - Receives and verifies payment channel claims from peers
 *
 * Responsibilities:
 * - Register BTP protocol data handler for "payment-channel-claim" protocol
 * - Parse and validate incoming claim messages
 * - Verify EVM payment channel claims with signature validation
 * - Enforce monotonicity checks (nonce/amount must increase)
 * - Persist verified claims to database for later redemption
 * - Emit telemetry events for claim reception and verification
 *
 * @example
 * ```typescript
 * const claimReceiver = new ClaimReceiver(
 *   db,
 *   evmChannelSDK,
 *   logger,
 *   telemetryEmitter,
 *   'node-alice'
 * );
 *
 * claimReceiver.registerWithBTPServer(btpServer);
 * ```
 */
export class ClaimReceiver {
  constructor(
    private readonly db: Database,
    private readonly evmChannelSDK: PaymentChannelSDK,
    private readonly logger: Logger,
    private readonly telemetryEmitter?: TelemetryEmitter,
    private readonly nodeId?: string
  ) {}

  /**
   * Register claim message handler with BTP server
   *
   * Sets up callback to receive BTP messages with protocol name "payment-channel-claim"
   * and routes them to handleClaimMessage for processing.
   *
   * @param btpServer - BTP server instance to register with
   */
  registerWithBTPServer(btpServer: BTPServer): void {
    // Register message callback with BTP server
    btpServer.onMessage(async (peerId: string, message: BTPMessage) => {
      // Only process data messages (not error messages)
      if (!isBTPData(message)) {
        return;
      }

      // TypeScript now knows message.data is BTPData, not BTPErrorData
      // Iterate through protocol data array
      for (const protocolData of message.data.protocolData) {
        // Filter for claim protocol
        if (protocolData.protocolName === 'payment-channel-claim') {
          await this.handleClaimMessage(peerId, protocolData);
        }
      }
    });

    this.logger.info('ClaimReceiver registered with BTP server');
  }

  /**
   * Handle incoming claim message from BTP peer
   *
   * @param peerId - Peer ID of sender
   * @param protocolData - BTP protocol data containing claim message
   * @private
   */
  private async handleClaimMessage(peerId: string, protocolData: BTPProtocolData): Promise<void> {
    const childLogger = this.logger.child({ peerId, protocol: 'claim-receiver' });

    try {
      // Parse JSON claim message
      const claimMessage = JSON.parse(protocolData.data.toString('utf8')) as BTPClaimMessage;

      // Validate claim message structure
      validateClaimMessage(claimMessage);

      const messageId = claimMessage.messageId;
      const blockchain = claimMessage.blockchain;
      const amount = this._getClaimAmount(claimMessage);

      childLogger.info({ messageId, blockchain, amount }, 'Received claim message');

      // Verify EVM claim
      if (!isEVMClaim(claimMessage)) {
        throw new Error(`Unsupported blockchain type: ${blockchain}. Only EVM is supported.`);
      }

      const verificationResult = await this.verifyEVMClaim(claimMessage, peerId);

      // Persist verified claim
      if (verificationResult.valid) {
        this._persistReceivedClaim(peerId, claimMessage, true);
        childLogger.info({ messageId }, 'Claim verified and stored');
      } else {
        this._persistReceivedClaim(peerId, claimMessage, false);
        childLogger.warn(
          { messageId, error: verificationResult.error },
          'Claim verification failed'
        );
      }

      // Emit telemetry
      this._emitClaimReceivedTelemetry(
        peerId,
        claimMessage,
        verificationResult.valid,
        verificationResult.error
      );
    } catch (error) {
      childLogger.error({ error }, 'Failed to parse claim message');

      // Emit failure telemetry
      try {
        if (this.telemetryEmitter) {
          this.telemetryEmitter.emit({
            type: 'CLAIM_RECEIVED',
            nodeId: this.nodeId ?? 'unknown',
            peerId,
            blockchain: 'unknown' as BlockchainType,
            messageId: 'unknown',
            channelId: 'unknown',
            amount: '0',
            verified: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          });
        }
      } catch (telemetryError) {
        childLogger.error({ error: telemetryError }, 'Failed to emit telemetry');
      }
    }
  }

  /**
   * Verify EVM claim signature and nonce monotonicity
   *
   * @param claim - EVM claim message
   * @param peerId - Peer ID of sender
   * @returns Verification result
   * @private
   */
  private async verifyEVMClaim(
    claim: EVMClaimMessage,
    peerId: string
  ): Promise<ClaimVerificationResult> {
    try {
      // Create balance proof object with bigint conversion
      const balanceProof = {
        channelId: claim.channelId,
        nonce: claim.nonce,
        transferredAmount: BigInt(claim.transferredAmount),
        lockedAmount: BigInt(claim.lockedAmount),
        locksRoot: claim.locksRoot,
      };

      // Verify EIP-712 signature
      const isValid = await this.evmChannelSDK.verifyBalanceProof(
        balanceProof,
        claim.signature,
        claim.signerAddress
      );

      if (!isValid) {
        return {
          valid: false,
          messageId: claim.messageId,
          error: 'Invalid EIP-712 signature',
        };
      }

      // Check nonce monotonicity - nonce must strictly increase
      const latestClaim = await this.getLatestVerifiedClaim(peerId, 'evm', claim.channelId);

      if (latestClaim && isEVMClaim(latestClaim)) {
        if (claim.nonce <= latestClaim.nonce) {
          return {
            valid: false,
            messageId: claim.messageId,
            error: 'Nonce not monotonically increasing',
          };
        }
      }

      return { valid: true, messageId: claim.messageId };
    } catch (error) {
      return {
        valid: false,
        messageId: claim.messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Persist received claim to database
   *
   * @param peerId - Peer ID of sender
   * @param claim - Claim message
   * @param verified - Whether claim passed verification
   * @private
   */
  private _persistReceivedClaim(peerId: string, claim: BTPClaimMessage, verified: boolean): void {
    try {
      // EVM claims use channelId
      const channelId = claim.channelId;

      // Insert into database
      const stmt = this.db.prepare(`
        INSERT INTO received_claims (
          message_id,
          peer_id,
          blockchain,
          channel_id,
          claim_data,
          verified,
          received_at,
          redeemed_at,
          redemption_tx_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        claim.messageId,
        peerId,
        claim.blockchain,
        channelId,
        JSON.stringify(claim),
        verified ? 1 : 0,
        Date.now(),
        null,
        null
      );
    } catch (error) {
      // Non-blocking: Log error but don't throw
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        this.logger.warn(
          { messageId: claim.messageId },
          'Duplicate claim message ignored (idempotency)'
        );
      } else {
        this.logger.error({ error }, 'Failed to persist claim to database');
      }
    }
  }

  /**
   * Emit telemetry event for claim reception
   *
   * @param peerId - Peer ID of sender
   * @param claim - Claim message
   * @param verified - Whether claim passed verification
   * @param error - Error message if verification failed
   * @private
   */
  private _emitClaimReceivedTelemetry(
    peerId: string,
    claim: BTPClaimMessage,
    verified: boolean,
    error?: string
  ): void {
    try {
      if (!this.telemetryEmitter) {
        return;
      }

      // EVM claims use channelId
      const channelId = claim.channelId;

      this.telemetryEmitter.emit({
        type: 'CLAIM_RECEIVED',
        nodeId: this.nodeId ?? 'unknown',
        peerId,
        blockchain: claim.blockchain,
        messageId: claim.messageId,
        channelId,
        amount: this._getClaimAmount(claim),
        verified,
        error,
        timestamp: new Date().toISOString(),
      });
    } catch (telemetryError) {
      // Non-blocking: Log error but don't throw
      this.logger.error({ error: telemetryError }, 'Failed to emit claim received telemetry');
    }
  }

  /**
   * Get amount from claim message (EVM uses transferredAmount field)
   *
   * @param claim - Claim message
   * @returns Amount as string
   * @private
   */
  private _getClaimAmount(claim: BTPClaimMessage): string {
    return claim.transferredAmount;
  }

  /**
   * Get latest verified claim for a specific peer and channel
   *
   * Used for monotonicity checks and future redemption.
   *
   * @param peerId - Peer ID
   * @param blockchain - Blockchain type
   * @param channelId - Channel or owner identifier
   * @returns Latest verified claim or null if none found
   */
  async getLatestVerifiedClaim(
    peerId: string,
    blockchain: BlockchainType,
    channelId: string
  ): Promise<BTPClaimMessage | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT claim_data
        FROM received_claims
        WHERE peer_id = ?
          AND blockchain = ?
          AND channel_id = ?
          AND verified = 1
          AND redeemed_at IS NULL
        ORDER BY received_at DESC
        LIMIT 1
      `);

      const row = stmt.get(peerId, blockchain, channelId) as { claim_data: string } | undefined;

      if (!row) {
        return null;
      }

      return JSON.parse(row.claim_data) as BTPClaimMessage;
    } catch (error) {
      this.logger.error({ error }, 'Failed to query latest verified claim');
      return null;
    }
  }
}
