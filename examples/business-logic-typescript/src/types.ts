/**
 * Type definitions for ILP Agent Runtime Business Logic API
 *
 * These types define the contract between your business logic
 * and the Agent Runtime.
 */

/**
 * Payment request from Agent Runtime.
 * Received when an ILP payment packet arrives.
 */
export interface PaymentRequest {
  /** Unique payment identifier */
  paymentId: string;
  /** Full ILP destination address */
  destination: string;
  /** Amount in smallest unit (e.g., satoshis, drops) */
  amount: string;
  /** ISO 8601 expiration timestamp */
  expiresAt: string;
  /** Base64-encoded application data (optional) */
  data?: string;
  /** Metadata (optional) */
  metadata?: Record<string, string>;
}

/**
 * Payment response to Agent Runtime.
 * Determines whether the payment is fulfilled or rejected.
 */
export interface PaymentResponse {
  /** Whether to accept (fulfill) the payment */
  accept: boolean;
  /** Base64-encoded response data (optional, included in fulfill packet) */
  data?: string;
  /** Rejection reason (required if accept is false) */
  rejectReason?: {
    /**
     * Error code. Common codes:
     * - 'insufficient_funds' → ILP T04
     * - 'expired' → ILP R00
     * - 'invalid_request' → ILP F00
     * - 'invalid_amount' → ILP F03
     * - 'unexpected_payment' → ILP F06
     * - 'application_error' → ILP F99
     * - 'internal_error' → ILP T00
     */
    code: string;
    /** Human-readable error message */
    message: string;
  };
}
