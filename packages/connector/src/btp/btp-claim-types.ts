/**
 * BTP Payment Channel Claim Protocol Message Types
 *
 * This module defines the standardized message format for exchanging payment channel
 * claims over the Bilateral Transfer Protocol (BTP). Claims are sent via BTP's
 * protocolData field with protocol name "payment-channel-claim" and content type 1 (JSON).
 *
 * Supports three blockchain types:
 * - XRP Ledger (PayChan)
 * - EVM-compatible chains (Raiden-style payment channels)
 * - Aptos Move-based payment channels
 *
 * Reference: RFC-0023 (Bilateral Transfer Protocol), Epic 17 PRD
 *
 * @module btp-claim-types
 */

/**
 * Supported blockchain types for payment channel claims.
 */
export type BlockchainType = 'xrp' | 'evm' | 'aptos';

/**
 * Base claim message structure shared across all blockchain types.
 *
 * Common fields:
 * - `version`: Protocol version (currently '1.0')
 * - `blockchain`: Discriminator for blockchain-specific claim structure
 * - `messageId`: Unique identifier for idempotent message processing
 * - `timestamp`: ISO 8601 timestamp for message creation time
 * - `senderId`: Peer ID of the sender (for correlation with BTP connection)
 */
export interface BaseClaimMessage {
  version: '1.0';
  blockchain: BlockchainType;
  messageId: string;
  timestamp: string;
  senderId: string;
}

/**
 * XRP Ledger PayChan claim message.
 *
 * Fields:
 * - `channelId`: 64-character hex string identifying the payment channel
 * - `amount`: Cumulative amount in XRP drops (1 XRP = 1,000,000 drops), string for bigint precision
 * - `signature`: ed25519 signature (128 hex characters) proving authorization
 * - `publicKey`: ed25519 public key with ED prefix (66 hex characters total)
 *
 * Example:
 * ```typescript
 * const xrpClaim: XRPClaimMessage = {
 *   version: '1.0',
 *   blockchain: 'xrp',
 *   messageId: 'claim-001',
 *   timestamp: '2026-02-02T12:00:00.000Z',
 *   senderId: 'peer-alice',
 *   channelId: 'A1B2C3D4E5F6789012345678901234567890123456789012345678901234567890',
 *   amount: '1000000', // 1 XRP
 *   signature: '0123456789ABCDEF...', // 128 hex chars
 *   publicKey: 'ED0123456789ABCDEF...', // ED prefix + 64 hex chars
 * };
 * ```
 */
export interface XRPClaimMessage extends BaseClaimMessage {
  blockchain: 'xrp';
  channelId: string;
  amount: string;
  signature: string;
  publicKey: string;
}

/**
 * EVM-compatible blockchain claim message (Raiden-style balance proofs).
 *
 * Fields:
 * - `channelId`: bytes32 hex string (0x-prefixed) identifying the payment channel
 * - `nonce`: Monotonically increasing balance proof nonce (prevents replay attacks)
 * - `transferredAmount`: Cumulative transferred amount (bigint precision)
 * - `lockedAmount`: Locked amount for pending transfers (0 for simple transfers)
 * - `locksRoot`: Merkle root of locked transfers (32-byte hex, zeros if no locks)
 * - `signature`: EIP-712 typed signature (hex string)
 * - `signerAddress`: Ethereum address of the signer (0x-prefixed, 40 hex chars)
 *
 * Example:
 * ```typescript
 * const evmClaim: EVMClaimMessage = {
 *   version: '1.0',
 *   blockchain: 'evm',
 *   messageId: 'claim-002',
 *   timestamp: '2026-02-02T12:00:00.000Z',
 *   senderId: 'peer-bob',
 *   channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
 *   nonce: 5,
 *   transferredAmount: '1000000000000000000', // 1 ETH in wei
 *   lockedAmount: '0',
 *   locksRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
 *   signature: '0xabcdef...', // EIP-712 signature
 *   signerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
 * };
 * ```
 */
export interface EVMClaimMessage extends BaseClaimMessage {
  blockchain: 'evm';
  channelId: string;
  nonce: number;
  transferredAmount: string;
  lockedAmount: string;
  locksRoot: string;
  signature: string;
  signerAddress: string;
}

/**
 * Aptos Move-based payment channel claim message.
 *
 * Fields:
 * - `channelOwner`: Aptos account address (0x-prefixed hex string)
 * - `amount`: Cumulative amount in octas (1 APT = 100,000,000 octas), string for bigint precision
 * - `nonce`: Monotonically increasing balance proof nonce
 * - `signature`: ed25519 signature (hex string)
 * - `publicKey`: ed25519 public key (hex string, no prefix)
 *
 * Example:
 * ```typescript
 * const aptosClaim: AptosClaimMessage = {
 *   version: '1.0',
 *   blockchain: 'aptos',
 *   messageId: 'claim-003',
 *   timestamp: '2026-02-02T12:00:00.000Z',
 *   senderId: 'peer-carol',
 *   channelOwner: '0x1234567890abcdef',
 *   amount: '100000000', // 1 APT
 *   nonce: 10,
 *   signature: 'fedcba9876543210...', // ed25519 signature
 *   publicKey: '0123456789abcdef...', // ed25519 public key
 * };
 * ```
 */
export interface AptosClaimMessage extends BaseClaimMessage {
  blockchain: 'aptos';
  channelOwner: string;
  amount: string;
  nonce: number;
  signature: string;
  publicKey: string;
}

/**
 * Union type representing any valid BTP claim message.
 *
 * TypeScript will discriminate based on the `blockchain` field.
 */
export type BTPClaimMessage = XRPClaimMessage | EVMClaimMessage | AptosClaimMessage;

/**
 * BTP Claim Protocol Constants
 *
 * These constants define the BTP protocolData fields for claim messages:
 * - `NAME`: Protocol name used in BTPProtocolData.protocolName
 * - `CONTENT_TYPE`: Content type code (1 = application/json)
 * - `VERSION`: Current protocol version
 */
export const BTP_CLAIM_PROTOCOL = {
  NAME: 'payment-channel-claim',
  CONTENT_TYPE: 1,
  VERSION: '1.0',
} as const;

/**
 * Type guard to check if a claim message is an XRP claim.
 *
 * @param msg - Claim message to check
 * @returns True if the message is an XRP claim, with type narrowing
 *
 * @example
 * ```typescript
 * if (isXRPClaim(msg)) {
 *   console.log(`XRP Channel ID: ${msg.channelId}`);
 *   // TypeScript knows msg is XRPClaimMessage here
 * }
 * ```
 */
export function isXRPClaim(msg: BTPClaimMessage): msg is XRPClaimMessage {
  return msg.blockchain === 'xrp';
}

/**
 * Type guard to check if a claim message is an EVM claim.
 *
 * @param msg - Claim message to check
 * @returns True if the message is an EVM claim, with type narrowing
 *
 * @example
 * ```typescript
 * if (isEVMClaim(msg)) {
 *   console.log(`EVM Nonce: ${msg.nonce}`);
 *   // TypeScript knows msg is EVMClaimMessage here
 * }
 * ```
 */
export function isEVMClaim(msg: BTPClaimMessage): msg is EVMClaimMessage {
  return msg.blockchain === 'evm';
}

/**
 * Type guard to check if a claim message is an Aptos claim.
 *
 * @param msg - Claim message to check
 * @returns True if the message is an Aptos claim, with type narrowing
 *
 * @example
 * ```typescript
 * if (isAptosClaim(msg)) {
 *   console.log(`Aptos Channel Owner: ${msg.channelOwner}`);
 *   // TypeScript knows msg is AptosClaimMessage here
 * }
 * ```
 */
export function isAptosClaim(msg: BTPClaimMessage): msg is AptosClaimMessage {
  return msg.blockchain === 'aptos';
}

/**
 * Helper function to validate ISO 8601 timestamp format.
 *
 * @param timestamp - Timestamp string to validate
 * @returns True if the timestamp is valid ISO 8601
 */
function isValidISO8601(timestamp: string): boolean {
  try {
    const date = new Date(timestamp);
    return date.toISOString() === timestamp;
  } catch {
    return false;
  }
}

/**
 * Validates an XRP claim message, throwing errors for invalid fields.
 *
 * @param claim - Partial XRP claim message to validate
 * @throws Error if any required field is missing or invalid
 */
function validateXRPClaim(claim: Partial<XRPClaimMessage>): void {
  // Validate channelId: 64-character hex string
  if (!claim.channelId || !/^[0-9A-Fa-f]{64}$/.test(claim.channelId)) {
    throw new Error('Invalid XRP channelId: must be 64-character hex string');
  }

  // Validate amount: positive bigint (drops)
  if (!claim.amount) {
    throw new Error('Invalid XRP amount: must be positive drops');
  }
  try {
    const amountBigInt = BigInt(claim.amount);
    if (amountBigInt <= 0n) {
      throw new Error('Invalid XRP amount: must be positive drops');
    }
  } catch {
    throw new Error('Invalid XRP amount: must be positive drops');
  }

  // Validate signature: 128-character hex string
  if (!claim.signature || !/^[0-9A-Fa-f]{128}$/.test(claim.signature)) {
    throw new Error('Invalid XRP signature: must be 128-character hex string');
  }

  // Validate publicKey: ED prefix + 64 hex characters (66 total)
  if (!claim.publicKey || !/^ED[0-9A-Fa-f]{64}$/i.test(claim.publicKey)) {
    throw new Error('Invalid XRP publicKey: must be ED prefix + 64 hex characters');
  }
}

/**
 * Validates an EVM claim message, throwing errors for invalid fields.
 *
 * @param claim - Partial EVM claim message to validate
 * @throws Error if any required field is missing or invalid
 */
function validateEVMClaim(claim: Partial<EVMClaimMessage>): void {
  // Validate channelId: bytes32 hex string (0x-prefixed, 66 chars total)
  if (!claim.channelId || !/^0x[0-9A-Fa-f]{64}$/.test(claim.channelId)) {
    throw new Error('Invalid EVM channelId: must be bytes32 hex string');
  }

  // Validate nonce: non-negative number
  if (typeof claim.nonce !== 'number' || claim.nonce < 0 || !Number.isInteger(claim.nonce)) {
    throw new Error('Invalid EVM nonce: must be non-negative number');
  }

  // Validate transferredAmount: non-negative bigint
  if (!claim.transferredAmount) {
    throw new Error('Invalid EVM transferredAmount: must be non-negative');
  }
  try {
    const amount = BigInt(claim.transferredAmount);
    if (amount < 0n) {
      throw new Error('Invalid EVM transferredAmount: must be non-negative');
    }
  } catch {
    throw new Error('Invalid EVM transferredAmount: must be non-negative');
  }

  // Validate signature: 0x-prefixed hex string
  if (!claim.signature || !/^0x[0-9A-Fa-f]+$/.test(claim.signature)) {
    throw new Error('Invalid EVM signature: must be hex string');
  }

  // Validate signerAddress: Ethereum address (0x-prefixed, 40 hex chars)
  if (!claim.signerAddress || !/^0x[0-9A-Fa-f]{40}$/.test(claim.signerAddress)) {
    throw new Error('Invalid EVM signerAddress: must be Ethereum address');
  }
}

/**
 * Validates an Aptos claim message, throwing errors for invalid fields.
 *
 * @param claim - Partial Aptos claim message to validate
 * @throws Error if any required field is missing or invalid
 */
function validateAptosClaim(claim: Partial<AptosClaimMessage>): void {
  // Validate channelOwner: Aptos account address (0x-prefixed hex)
  if (!claim.channelOwner || !/^0x[0-9A-Fa-f]+$/.test(claim.channelOwner)) {
    throw new Error('Invalid Aptos channelOwner: must be Aptos address');
  }

  // Validate amount: positive bigint (octas)
  if (!claim.amount) {
    throw new Error('Invalid Aptos amount: must be positive octas');
  }
  try {
    const amountBigInt = BigInt(claim.amount);
    if (amountBigInt <= 0n) {
      throw new Error('Invalid Aptos amount: must be positive octas');
    }
  } catch {
    throw new Error('Invalid Aptos amount: must be positive octas');
  }

  // Validate nonce: non-negative number
  if (typeof claim.nonce !== 'number' || claim.nonce < 0 || !Number.isInteger(claim.nonce)) {
    throw new Error('Invalid Aptos nonce: must be non-negative number');
  }

  // Validate signature: hex string
  if (!claim.signature || !/^[0-9A-Fa-f]+$/.test(claim.signature)) {
    throw new Error('Invalid Aptos signature: must be hex string');
  }

  // Validate publicKey: hex string
  if (!claim.publicKey || !/^[0-9A-Fa-f]+$/.test(claim.publicKey)) {
    throw new Error('Invalid Aptos publicKey: must be hex string');
  }
}

/**
 * Validates a BTP claim message, asserting it conforms to the protocol.
 *
 * This function performs runtime validation of all required fields and
 * blockchain-specific constraints. It uses TypeScript's assertion signature
 * to narrow the type from `unknown` to `BTPClaimMessage`.
 *
 * @param msg - Unknown message to validate
 * @throws Error if validation fails (with descriptive error message)
 *
 * @example
 * ```typescript
 * const rawMessage = JSON.parse(btpProtocolData.data.toString());
 * validateClaimMessage(rawMessage); // throws if invalid
 * // TypeScript now knows rawMessage is BTPClaimMessage
 * if (isXRPClaim(rawMessage)) {
 *   processXRPClaim(rawMessage);
 * }
 * ```
 */
export function validateClaimMessage(msg: unknown): asserts msg is BTPClaimMessage {
  // Check msg is an object
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
    throw new Error('Claim message must be an object');
  }

  const claim = msg as Record<string, unknown>;

  // Validate version
  if (claim.version !== '1.0') {
    throw new Error(`Unsupported claim version: ${claim.version}`);
  }

  // Validate blockchain type
  if (claim.blockchain !== 'xrp' && claim.blockchain !== 'evm' && claim.blockchain !== 'aptos') {
    throw new Error(`Invalid blockchain type: ${claim.blockchain}`);
  }

  // Validate messageId
  if (typeof claim.messageId !== 'string' || claim.messageId.trim() === '') {
    throw new Error('Missing or invalid messageId');
  }

  // Validate timestamp (ISO 8601)
  if (typeof claim.timestamp !== 'string' || !isValidISO8601(claim.timestamp)) {
    throw new Error('Missing or invalid timestamp');
  }

  // Validate senderId
  if (typeof claim.senderId !== 'string' || claim.senderId.trim() === '') {
    throw new Error('Missing or invalid senderId');
  }

  // Dispatch to blockchain-specific validators
  if (claim.blockchain === 'xrp') {
    validateXRPClaim(claim as Partial<XRPClaimMessage>);
  } else if (claim.blockchain === 'evm') {
    validateEVMClaim(claim as Partial<EVMClaimMessage>);
  } else if (claim.blockchain === 'aptos') {
    validateAptosClaim(claim as Partial<AptosClaimMessage>);
  }
}
