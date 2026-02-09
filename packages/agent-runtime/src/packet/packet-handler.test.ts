/**
 * Packet Handler Tests
 *
 * Tests for the simplified PacketHandler with SHA256(data) fulfillment.
 */

import { PacketHandler, PacketHandlerConfig } from './packet-handler';
import { BusinessClient } from '../business/business-client';
import { computeFulfillmentFromData } from '../stream/fulfillment';
import { computeConditionFromData } from '../http/ilp-send-handler';
import { LocalDeliveryRequest, PaymentResponse } from '../types';
import * as crypto from 'crypto';
import pino from 'pino';

// Create a silent logger for tests
const logger = pino({ level: 'silent' });

function createMockBusinessClient(): jest.Mocked<BusinessClient> {
  return {
    handlePayment: jest.fn(),
    mapRejectCode: jest.fn().mockReturnValue('F99'),
    healthCheck: jest.fn(),
  } as unknown as jest.Mocked<BusinessClient>;
}

function createValidRequest(overrides?: Partial<LocalDeliveryRequest>): LocalDeliveryRequest {
  const data = Buffer.from('test packet data');
  return {
    destination: 'g.connector.agent.payment123',
    amount: '1000',
    executionCondition: crypto
      .createHash('sha256')
      .update(crypto.createHash('sha256').update(data).digest())
      .digest()
      .toString('base64'),
    expiresAt: new Date(Date.now() + 30000).toISOString(),
    data: data.toString('base64'),
    sourcePeer: 'peer-alice',
    ...overrides,
  };
}

describe('PacketHandler', () => {
  let handler: PacketHandler;
  let mockBusinessClient: jest.Mocked<BusinessClient>;
  const config: PacketHandlerConfig = { baseAddress: 'g.connector.agent' };

  beforeEach(() => {
    mockBusinessClient = createMockBusinessClient();
    handler = new PacketHandler(config, mockBusinessClient, logger);
  });

  describe('constructor', () => {
    it('should take (config, businessClient, logger) — no SessionManager', () => {
      const h = new PacketHandler(config, mockBusinessClient, logger);
      expect(h.baseAddress).toBe('g.connector.agent');
    });
  });

  describe('handlePacket', () => {
    it('should fulfill with SHA256(data) when BLS accepts', async () => {
      const request = createValidRequest();
      const blsResponse: PaymentResponse = { accept: true, data: 'response-data' };
      mockBusinessClient.handlePayment.mockResolvedValue(blsResponse);

      const result = await handler.handlePacket(request);

      expect(result.fulfill).toBeDefined();
      expect(result.reject).toBeUndefined();

      // Verify fulfillment is base64-encoded SHA256 of decoded data
      const rawData = Buffer.from(request.data, 'base64');
      const expectedFulfillment = computeFulfillmentFromData(rawData);
      expect(result.fulfill!.fulfillment).toBe(expectedFulfillment.toString('base64'));
    });

    it('should include BLS data in FULFILL response', async () => {
      const request = createValidRequest();
      const blsResponse: PaymentResponse = { accept: true, data: 'bls-fulfill-data' };
      mockBusinessClient.handlePayment.mockResolvedValue(blsResponse);

      const result = await handler.handlePacket(request);

      expect(result.fulfill!.data).toBe('bls-fulfill-data');
    });

    it('should reject with mapped ILP error code when BLS rejects', async () => {
      const request = createValidRequest();
      const blsResponse: PaymentResponse = {
        accept: false,
        rejectReason: { code: 'insufficient_funds', message: 'Not enough balance' },
      };
      mockBusinessClient.handlePayment.mockResolvedValue(blsResponse);
      mockBusinessClient.mapRejectCode.mockReturnValue('F04');

      const result = await handler.handlePacket(request);

      expect(result.reject).toBeDefined();
      expect(result.fulfill).toBeUndefined();
      expect(result.reject!.code).toBe('F04');
      expect(result.reject!.message).toBe('Not enough balance');
      expect(mockBusinessClient.mapRejectCode).toHaveBeenCalledWith('insufficient_funds');
    });

    it('should include BLS data in REJECT response (AC: 5)', async () => {
      const request = createValidRequest();
      const blsResponse: PaymentResponse = {
        accept: false,
        data: 'rejection-details',
        rejectReason: { code: 'policy', message: 'Rejected by policy' },
      };
      mockBusinessClient.handlePayment.mockResolvedValue(blsResponse);
      mockBusinessClient.mapRejectCode.mockReturnValue('F99');

      const result = await handler.handlePacket(request);

      expect(result.reject).toBeDefined();
      expect(result.reject!.data).toBe('rejection-details');
    });

    it('should reject R00 for expired packet without calling BLS', async () => {
      const request = createValidRequest({
        expiresAt: new Date(Date.now() - 10000).toISOString(),
      });

      const result = await handler.handlePacket(request);

      expect(result.reject).toBeDefined();
      expect(result.reject!.code).toBe('R00');
      expect(result.reject!.message).toBe('Payment has expired');
      expect(mockBusinessClient.handlePayment).not.toHaveBeenCalled();
    });

    it('should handle empty string data — computes SHA256 of empty buffer, passes undefined to BLS', async () => {
      const request = createValidRequest({ data: '' });
      const blsResponse: PaymentResponse = { accept: true };
      mockBusinessClient.handlePayment.mockResolvedValue(blsResponse);

      const result = await handler.handlePacket(request);

      expect(result.fulfill).toBeDefined();

      // Verify BLS received undefined for data (empty string coerced)
      const calls = mockBusinessClient.handlePayment.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const paymentRequest = calls[0]![0];
      expect(paymentRequest.data).toBeUndefined();

      // Fulfillment is SHA256 of empty buffer (base64 decode of '' is empty buffer)
      const expectedFulfillment = computeFulfillmentFromData(Buffer.from('', 'base64'));
      expect(result.fulfill!.fulfillment).toBe(expectedFulfillment.toString('base64'));
    });

    it('should accept any destination starting with config.baseAddress (AC: 2)', async () => {
      const blsResponse: PaymentResponse = { accept: true };
      mockBusinessClient.handlePayment.mockResolvedValue(blsResponse);

      // Test with various destinations under base address
      const destinations = [
        'g.connector.agent.payment1',
        'g.connector.agent.sub.path',
        'g.connector.agent',
      ];

      for (const destination of destinations) {
        const request = createValidRequest({ destination });
        const result = await handler.handlePacket(request);
        expect(result.fulfill).toBeDefined();
      }
    });

    it('should cross-verify fulfillment matches outbound condition', async () => {
      const rawData = Buffer.from('cross-verification data');
      const request = createValidRequest({
        data: rawData.toString('base64'),
      });
      const blsResponse: PaymentResponse = { accept: true };
      mockBusinessClient.handlePayment.mockResolvedValue(blsResponse);

      const result = await handler.handlePacket(request);

      // The outbound sender computes condition = SHA256(SHA256(data))
      const { condition } = computeConditionFromData(rawData);

      // The inbound handler computes fulfillment = SHA256(data)
      // Verify: SHA256(fulfillment) == condition
      const fulfillmentBuf = Buffer.from(result.fulfill!.fulfillment, 'base64');
      const conditionFromFulfillment = crypto.createHash('sha256').update(fulfillmentBuf).digest();

      expect(conditionFromFulfillment.equals(condition)).toBe(true);
    });

    it('should use F99 when BLS rejects without rejectReason', async () => {
      const request = createValidRequest();
      const blsResponse: PaymentResponse = { accept: false };
      mockBusinessClient.handlePayment.mockResolvedValue(blsResponse);

      const result = await handler.handlePacket(request);

      expect(result.reject).toBeDefined();
      expect(result.reject!.code).toBe('F99');
      expect(result.reject!.message).toBe('Payment rejected');
    });

    it('should return T00 when BLS call throws an error', async () => {
      const request = createValidRequest();
      mockBusinessClient.handlePayment.mockRejectedValue(new Error('BLS unavailable'));

      const result = await handler.handlePacket(request);

      expect(result.reject).toBeDefined();
      expect(result.reject!.code).toBe('T00');
      expect(result.reject!.message).toBe('Internal error processing payment');
    });
  });
});
