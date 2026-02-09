/**
 * Fulfillment Computation Tests
 *
 * Tests for SHA256(data) fulfillment model and payment ID generation.
 */

import { computeFulfillmentFromData, generatePaymentId } from './fulfillment';
import { computeConditionFromData } from '../http/ilp-send-handler';
import * as crypto from 'crypto';

describe('Fulfillment', () => {
  describe('computeFulfillmentFromData', () => {
    it('should return a 32-byte Buffer', () => {
      const data = Buffer.from('test packet data');
      const fulfillment = computeFulfillmentFromData(data);

      expect(Buffer.isBuffer(fulfillment)).toBe(true);
      expect(fulfillment.length).toBe(32);
    });

    it('should be deterministic — same input produces same output', () => {
      const data = Buffer.from('deterministic test');
      const fulfillment1 = computeFulfillmentFromData(data);
      const fulfillment2 = computeFulfillmentFromData(data);

      expect(fulfillment1.equals(fulfillment2)).toBe(true);
    });

    it('should produce different outputs for different inputs', () => {
      const data1 = Buffer.from('packet 1');
      const data2 = Buffer.from('packet 2');

      const fulfillment1 = computeFulfillmentFromData(data1);
      const fulfillment2 = computeFulfillmentFromData(data2);

      expect(fulfillment1.equals(fulfillment2)).toBe(false);
    });

    it('should match manual SHA256 computation', () => {
      const data = Buffer.from('verify against manual hash');
      const fulfillment = computeFulfillmentFromData(data);

      const expected = crypto.createHash('sha256').update(data).digest();
      expect(fulfillment.equals(expected)).toBe(true);
    });

    it('should cross-verify with computeConditionFromData — SHA256(fulfillment) equals condition', () => {
      const data = Buffer.from('cross-verify test data');
      const fulfillment = computeFulfillmentFromData(data);

      // condition = SHA256(fulfillment) should match computeConditionFromData(data).condition
      const conditionFromFulfillment = crypto.createHash('sha256').update(fulfillment).digest();
      const { condition } = computeConditionFromData(data);

      expect(conditionFromFulfillment.equals(condition)).toBe(true);
    });

    it('should produce valid hash for empty buffer input', () => {
      const data = Buffer.alloc(0);
      const fulfillment = computeFulfillmentFromData(data);

      expect(Buffer.isBuffer(fulfillment)).toBe(true);
      expect(fulfillment.length).toBe(32);

      // SHA256 of empty input is a well-known hash
      const expected = crypto.createHash('sha256').update(Buffer.alloc(0)).digest();
      expect(fulfillment.equals(expected)).toBe(true);
    });
  });

  describe('generatePaymentId', () => {
    it('should generate URL-safe base64 string by default', () => {
      const paymentId = generatePaymentId();
      expect(typeof paymentId).toBe('string');
      expect(paymentId.length).toBeGreaterThan(0);
      // URL-safe base64 should not contain + or /
      expect(paymentId).not.toMatch(/[+/]/);
    });

    it('should respect custom length', () => {
      const paymentId8 = generatePaymentId(8);
      const paymentId32 = generatePaymentId(32);
      // base64url encoding: 4 chars per 3 bytes
      expect(paymentId8.length).toBeLessThan(paymentId32.length);
    });
  });
});
