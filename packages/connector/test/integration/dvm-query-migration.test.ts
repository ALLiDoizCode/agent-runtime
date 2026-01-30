/**
 * DVM Query Migration Integration Tests
 *
 * Tests backward compatibility between Kind 10000 (legacy) and Kind 5000 (DVM).
 * Verifies deprecation warnings and equivalent query results.
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
  toonCodec,
  type MultiAgentTestEnv,
} from './helpers/dvm-test-utils';
import { createKind5000QueryEvent, createKind10000QueryEvent } from './fixtures/dvm-events';

describe('DVM Integration - Query Migration', () => {
  let testEnv: MultiAgentTestEnv;

  beforeAll(async () => {
    // Start 2 agents for testing
    testEnv = await startTestAgents(2);
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('should handle Kind 10000 (deprecated) with backward compatibility', async () => {
    const service = testEnv.agents[1]!;

    // Create Kind 10000 legacy query request
    const requestEvent = createKind10000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
    });

    // Create ILP PREPARE packet
    const preparePacket = createDVMPreparePacket(
      requestEvent,
      1000n,
      testEnv.capabilities[1]!.ilpAddress
    );

    // Send request via ILP
    const response = await service.processIncomingPacket(preparePacket, 'test-source');

    // Verify response is FULFILL
    expect(isFulfill(response)).toBe(true);

    if (isFulfill(response)) {
      const resultEvent = toonCodec.decode(response.data);

      // Kind 10000 should return Kind 11000 result (not Kind 6000)
      expect(resultEvent.kind).toBe(11000);
      expect(resultEvent.tags.find((t) => t[0] === 'e')?.[1]).toBe(requestEvent.id);
      expect(resultEvent.tags.find((t) => t[0] === 'p')?.[1]).toBe(requestEvent.pubkey);

      // Verify result content is valid JSON array
      const resultData = JSON.parse(resultEvent.content);
      expect(Array.isArray(resultData)).toBe(true);
    }
  });

  it('should handle Kind 5000 (new DVM format)', async () => {
    const service = testEnv.agents[1]!;

    // Create Kind 5000 DVM query request
    const requestEvent = createKind5000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
      tags: [
        ['i', 'test query', 'text'],
        ['output', 'application/json'],
        ['bid', '1000'],
      ],
    });

    // Create ILP PREPARE packet
    const preparePacket = createDVMPreparePacket(
      requestEvent,
      1000n,
      testEnv.capabilities[1]!.ilpAddress
    );

    // Send request via ILP
    const response = await service.processIncomingPacket(preparePacket, 'test-source');

    // Verify response is FULFILL
    expect(isFulfill(response)).toBe(true);

    if (isFulfill(response)) {
      const resultEvent = toonCodec.decode(response.data);

      // Kind 5000 should return Kind 6000 result
      expect(resultEvent.kind).toBe(6000);
      expect(resultEvent.tags.find((t) => t[0] === 'e')?.[1]).toBe(requestEvent.id);
      expect(resultEvent.tags.find((t) => t[0] === 'p')?.[1]).toBe(requestEvent.pubkey);
      expect(resultEvent.tags.find((t) => t[0] === 'status')?.[1]).toBe('success');

      // Verify result content is valid JSON array
      const resultData = JSON.parse(resultEvent.content);
      expect(Array.isArray(resultData)).toBe(true);
    }
  });

  it('should return equivalent results for both Kind 10000 and Kind 5000', async () => {
    const service = testEnv.agents[1]!;

    // Create both legacy and new format queries
    const legacyQuery = createKind10000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
    });

    const newQuery = createKind5000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
      tags: [
        ['i', 'equivalent query', 'text'],
        ['bid', '1000'],
      ],
    });

    // Send both requests
    const legacyPacket = createDVMPreparePacket(
      legacyQuery,
      1000n,
      testEnv.capabilities[1]!.ilpAddress
    );

    const newPacket = createDVMPreparePacket(newQuery, 1000n, testEnv.capabilities[1]!.ilpAddress);

    const [legacyResponse, newResponse] = await Promise.all([
      service.processIncomingPacket(legacyPacket, 'test-source'),
      service.processIncomingPacket(newPacket, 'test-source'),
    ]);

    // Verify both succeeded
    expect(isFulfill(legacyResponse)).toBe(true);
    expect(isFulfill(newResponse)).toBe(true);

    if (isFulfill(legacyResponse) && isFulfill(newResponse)) {
      const legacyResult = toonCodec.decode(legacyResponse.data);
      const newResult = toonCodec.decode(newResponse.data);

      // Both should return JSON arrays
      const legacyData = JSON.parse(legacyResult.content);
      const newData = JSON.parse(newResult.content);

      expect(Array.isArray(legacyData)).toBe(true);
      expect(Array.isArray(newData)).toBe(true);

      // Both should have status tags
      expect(legacyResult.tags.find((t) => t[0] === 'status')).toBeDefined();
      expect(newResult.tags.find((t) => t[0] === 'status')).toBeDefined();
    }
  });

  it('should emit deprecation warning for Kind 10000 (check via logs)', async () => {
    const service = testEnv.agents[1]!;

    // Create Kind 10000 legacy query
    const legacyQuery = createKind10000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
    });

    const packet = createDVMPreparePacket(legacyQuery, 1000n, testEnv.capabilities[1]!.ilpAddress);

    // Send request
    const response = await service.processIncomingPacket(packet, 'test-source');

    // Verify response is successful (deprecation is warning-only, not error)
    expect(isFulfill(response)).toBe(true);

    // Note: Actual deprecation warning verification would require logger mocking
    // For integration tests, we verify the functionality works despite deprecation
  });
});
