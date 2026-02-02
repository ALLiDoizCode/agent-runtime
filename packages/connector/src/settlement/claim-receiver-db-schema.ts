/**
 * Database Schema for Claim Receiver
 *
 * Defines the schema for storing received payment channel claims.
 * Used by ClaimReceiver to persist claims for verification tracking
 * and future redemption.
 *
 * @module claim-receiver-db-schema
 */

import type { Database } from 'better-sqlite3';

/**
 * SQL schema for received_claims table
 *
 * Stores all received payment channel claims with verification status
 * and redemption tracking.
 */
export const RECEIVED_CLAIMS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS received_claims (
    message_id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    blockchain TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    claim_data TEXT NOT NULL,
    verified BOOLEAN NOT NULL,
    received_at INTEGER NOT NULL,
    redeemed_at INTEGER,
    redemption_tx_hash TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_received_claims_peer ON received_claims(peer_id);
  CREATE INDEX IF NOT EXISTS idx_received_claims_blockchain_channel ON received_claims(blockchain, channel_id);
  CREATE INDEX IF NOT EXISTS idx_received_claims_redeemed ON received_claims(redeemed_at) WHERE redeemed_at IS NOT NULL;
`;

/**
 * Initialize received_claims table schema
 *
 * @param db - SQLite database instance
 */
export function initializeClaimReceiverSchema(db: Database): void {
  db.exec(RECEIVED_CLAIMS_SCHEMA);
}
