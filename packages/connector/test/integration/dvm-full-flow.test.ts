/**
 * DVM Full Flow Integration Tests
 *
 * Tests complete DVM flow: Kind 5000 request → Kind 7000 status → Kind 6000 result
 * Verifies payment validation and ILP integration.
 */

// Mock the ESM-only @toon-format/toon package
jest.mock('@toon-format/toon', () => ({
  encode: (input: unknown) => JSON.stringify(input),
  decode: (input: string) => JSON.parse(input),
}));

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  startTestAgents,
  createDVMPreparePacket,
  isFulfill,
  isReject,
  toonCodec,
  waitForEventWithTag,
  type MultiAgentTestEnv,
} from './helpers/dvm-test-utils';
import { createKind5000QueryEvent } from './fixtures/dvm-events';

describe('DVM Integration - Full Flow', () => {
  let testEnv: MultiAgentTestEnv;

  beforeAll(async () => {
    // Start 2 agents for testing (requester and service provider)
    testEnv = await startTestAgents(2);
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('should complete full DVM flow (Kind 5000 → 7000 → 6000)', async () => {
    const service = testEnv.agents[1]!;

    // Create Kind 5000 DVM request
    const requestEvent = createKind5000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
      tags: [
        ['i', 'test query', 'text'],
        ['output', 'application/json'],
        ['param', 'filter', 'kind=1'],
        ['bid', '1000'],
      ],
    });

    // Create ILP PREPARE packet with sufficient payment
    const preparePacket = createDVMPreparePacket(
      requestEvent,
      1000n,
      testEnv.capabilities[1]!.ilpAddress
    );

    // Send request via ILP
    const response = await service.processIncomingPacket(preparePacket, 'test-source');

    // Verify response is FULFILL (not REJECT)
    expect(isFulfill(response)).toBe(true);

    if (isFulfill(response)) {
      // Decode the result event from FULFILL data
      const resultEvent = toonCodec.decode(response.data);

      // Verify Kind 6000 result received
      expect(resultEvent.kind).toBe(6000);
      expect(resultEvent.tags.find((t) => t[0] === 'e')?.[1]).toBe(requestEvent.id);
      expect(resultEvent.tags.find((t) => t[0] === 'p')?.[1]).toBe(requestEvent.pubkey);
      expect(resultEvent.tags.find((t) => t[0] === 'status')?.[1]).toBe('success');
      expect(resultEvent.tags.find((t) => t[0] === 'amount')).toBeDefined();

      // Verify result content is valid JSON array
      const resultData = JSON.parse(resultEvent.content);
      expect(Array.isArray(resultData)).toBe(true);
    }

    // Verify Kind 7000 status was emitted (check event database)
    const statusEvent = await waitForEventWithTag(
      service,
      7000,
      'e',
      requestEvent.id,
      5000 // 5 second timeout
    );

    expect(statusEvent).toBeDefined();
    expect(statusEvent.tags.find((t) => t[0] === 'status')?.[1]).toBe('processing');
  }, 10000);

  it('should reject requests with insufficient payment', async () => {
    const service = testEnv.agents[1]!;

    // Create Kind 5000 request with bid of 1000
    const requestEvent = createKind5000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
      tags: [
        ['i', 'test query', 'text'],
        ['bid', '1000'], // Bid says 1000
      ],
    });

    // Create ILP PREPARE packet with insufficient payment (only 10)
    const preparePacket = createDVMPreparePacket(
      requestEvent,
      10n, // Too low
      testEnv.capabilities[1]!.ilpAddress
    );

    // Send request via ILP
    const response = await service.processIncomingPacket(preparePacket, 'test-source');

    // Verify response is REJECT
    expect(isReject(response)).toBe(true);

    if (isReject(response)) {
      expect(response.code).toBe('F03');
      expect(response.message).toContain('Insufficient payment');
    }
  });

  it('should reject requests with zero payment', async () => {
    const service = testEnv.agents[1]!;

    // Create Kind 5000 request
    const requestEvent = createKind5000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
    });

    // Create ILP PREPARE packet with zero payment
    const preparePacket = createDVMPreparePacket(
      requestEvent,
      0n, // Zero payment
      testEnv.capabilities[1]!.ilpAddress
    );

    // Send request via ILP
    const response = await service.processIncomingPacket(preparePacket, 'test-source');

    // Verify response is REJECT
    expect(isReject(response)).toBe(true);

    if (isReject(response)) {
      expect(response.code).toBe('F03');
    }
  });

  it('should emit Kind 7000 status during processing', async () => {
    const service = testEnv.agents[1]!;

    // Create Kind 5000 request
    const requestEvent = createKind5000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
      tags: [
        ['i', 'long running query', 'text'],
        ['bid', '2000'],
      ],
    });

    // Create ILP PREPARE packet
    const preparePacket = createDVMPreparePacket(
      requestEvent,
      2000n,
      testEnv.capabilities[1]!.ilpAddress
    );

    // Send request (don't await yet, we want to check status during processing)
    const responsePromise = service.processIncomingPacket(preparePacket, 'test-source');

    // Wait for Kind 7000 status event
    const statusEvent = await waitForEventWithTag(service, 7000, 'e', requestEvent.id, 5000);

    expect(statusEvent).toBeDefined();
    expect(statusEvent.kind).toBe(7000);
    expect(statusEvent.tags.find((t) => t[0] === 'e')?.[1]).toBe(requestEvent.id);
    expect(statusEvent.tags.find((t) => t[0] === 'p')?.[1]).toBe(requestEvent.pubkey);

    const statusValue = statusEvent.tags.find((t) => t[0] === 'status')?.[1];
    expect(['payment-required', 'processing', 'success']).toContain(statusValue);

    // Now await the response
    const response = await responsePromise;
    expect(isFulfill(response)).toBe(true);
  }, 10000);

  it('should validate all required tags in Kind 6000 result', async () => {
    const service = testEnv.agents[1]!;

    // Create Kind 5000 request
    const requestEvent = createKind5000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
      tags: [
        ['i', 'validate tags', 'text'],
        ['bid', '1500'],
      ],
    });

    // Create ILP PREPARE packet
    const preparePacket = createDVMPreparePacket(
      requestEvent,
      1500n,
      testEnv.capabilities[1]!.ilpAddress
    );

    // Send request
    const response = await service.processIncomingPacket(preparePacket, 'test-source');

    expect(isFulfill(response)).toBe(true);

    if (isFulfill(response)) {
      const resultEvent = toonCodec.decode(response.data);

      // Verify all required tags are present
      const tags = resultEvent.tags;

      // Check 'e' tag (references request event)
      const eTag = tags.find((t) => t[0] === 'e');
      expect(eTag).toBeDefined();
      expect(eTag?.[1]).toBe(requestEvent.id);

      // Check 'p' tag (requester pubkey)
      const pTag = tags.find((t) => t[0] === 'p');
      expect(pTag).toBeDefined();
      expect(pTag?.[1]).toBe(requestEvent.pubkey);

      // Check 'request' tag (original request serialization)
      const requestTag = tags.find((t) => t[0] === 'request');
      expect(requestTag).toBeDefined();
      if (requestTag) {
        const requestData = JSON.parse(requestTag[1]!);
        expect(requestData.kind).toBe(5000);
        expect(requestData.id).toBe(requestEvent.id);
      }

      // Check 'amount' tag (payment received)
      const amountTag = tags.find((t) => t[0] === 'amount');
      expect(amountTag).toBeDefined();
      expect(Number(amountTag?.[1])).toBeGreaterThan(0);

      // Check 'status' tag
      const statusTag = tags.find((t) => t[0] === 'status');
      expect(statusTag).toBeDefined();
      expect(['success', 'error', 'partial']).toContain(statusTag?.[1]);
    }
  });

  it('should handle concurrent DVM requests', async () => {
    const service = testEnv.agents[1]!;

    // Create multiple Kind 5000 requests
    const requests = [
      createKind5000QueryEvent({
        pubkey: testEnv.capabilities[0]!.pubkey,
        tags: [
          ['i', 'query 1', 'text'],
          ['bid', '1000'],
        ],
      }),
      createKind5000QueryEvent({
        pubkey: testEnv.capabilities[0]!.pubkey,
        tags: [
          ['i', 'query 2', 'text'],
          ['bid', '1000'],
        ],
      }),
      createKind5000QueryEvent({
        pubkey: testEnv.capabilities[0]!.pubkey,
        tags: [
          ['i', 'query 3', 'text'],
          ['bid', '1000'],
        ],
      }),
    ];

    // Send all requests concurrently
    const responsePromises = requests.map((request) => {
      const packet = createDVMPreparePacket(request, 1000n, testEnv.capabilities[1]!.ilpAddress);
      return service.processIncomingPacket(packet, 'test-source');
    });

    // Wait for all responses
    const responses = await Promise.all(responsePromises);

    // Verify all succeeded
    responses.forEach((response, index) => {
      expect(isFulfill(response)).toBe(true);

      if (isFulfill(response)) {
        const resultEvent = toonCodec.decode(response.data);
        expect(resultEvent.kind).toBe(6000);
        expect(resultEvent.tags.find((t) => t[0] === 'e')?.[1]).toBe(requests[index]!.id);
      }
    });
  }, 15000);
});
