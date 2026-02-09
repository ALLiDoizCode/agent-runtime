/**
 * Fulfillment Computation
 *
 * Implements simplified SHA256(data) fulfillment model.
 * The fulfillment is computed as SHA256 of the raw packet data,
 * removing the need for shared secrets or session state.
 *
 * Fulfillment model:
 *   fulfillment = SHA256(data)
 *   condition   = SHA256(fulfillment) = SHA256(SHA256(data))
 */

import * as crypto from 'crypto';

/**
 * Compute the fulfillment from raw packet data.
 *
 * fulfillment = SHA256(data)
 *
 * The corresponding condition is SHA256(fulfillment) = SHA256(SHA256(data)),
 * which is what the outbound sender computes via computeConditionFromData.
 *
 * @param data - Raw packet data bytes
 * @returns 32-byte SHA-256 hash (fulfillment preimage)
 */
export function computeFulfillmentFromData(data: Buffer): Buffer {
  return crypto.createHash('sha256').update(data).digest();
}

/**
 * Generate a random payment ID.
 *
 * Creates a URL-safe base64 string for use as payment identifier.
 *
 * @param length - Number of random bytes (default: 16)
 * @returns URL-safe base64 string
 */
export function generatePaymentId(length: number = 16): string {
  return crypto.randomBytes(length).toString('base64url');
}
