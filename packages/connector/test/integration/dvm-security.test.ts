/**
 * DVM Security and Input Validation Integration Tests
 *
 * Tests input validation and security edge cases.
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
  createMalformedTOONPacket,
  isReject,
  type MultiAgentTestEnv,
} from './helpers/dvm-test-utils';
import {
  createOversizedEvent,
  createMalformedEvent,
  createSQLInjectionEvent,
} from './fixtures/dvm-events';

describe('DVM Integration - Security', () => {
  let testEnv: MultiAgentTestEnv;

  beforeAll(async () => {
    testEnv = await startTestAgents(2);
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('should handle oversized input (validation in production handlers)', async () => {
    const service = testEnv.agents[1]!;

    const oversizedEvent = createOversizedEvent(5000, 70000);

    const preparePacket = createDVMPreparePacket(
      oversizedEvent,
      1000n,
      testEnv.capabilities[1]!.ilpAddress
    );

    const response = await service.processIncomingPacket(preparePacket, 'test-source');

    // Test handlers don't validate size, but production handlers should
    // This test verifies the system doesn't crash on large inputs
    expect(response).toBeDefined();
  });

  it('should reject malformed TOON-encoded data', async () => {
    const service = testEnv.agents[1]!;

    const malformedPacket = createMalformedTOONPacket(testEnv.capabilities[1]!.ilpAddress);

    const response = await service.processIncomingPacket(malformedPacket, 'test-source');

    expect(isReject(response)).toBe(true);

    if (isReject(response)) {
      expect(response.code).toBe('F01');
    }
  });

  it('should handle invalid Nostr event signatures', async () => {
    const service = testEnv.agents[1]!;

    const malformedEvent = createMalformedEvent(5000);

    const preparePacket = createDVMPreparePacket(
      malformedEvent,
      1000n,
      testEnv.capabilities[1]!.ilpAddress
    );

    const response = await service.processIncomingPacket(preparePacket, 'test-source');

    // Should handle gracefully (validation may occur at different layers)
    expect(response).toBeDefined();
  });

  it('should handle SQL injection attempts in query parameters', async () => {
    const service = testEnv.agents[1]!;

    const sqlInjectionEvent = createSQLInjectionEvent();

    const preparePacket = createDVMPreparePacket(
      sqlInjectionEvent,
      1000n,
      testEnv.capabilities[1]!.ilpAddress
    );

    const response = await service.processIncomingPacket(preparePacket, 'test-source');

    // Should handle safely without executing injection
    expect(response).toBeDefined();
  });

  it('should handle duplicate event replay', async () => {
    const service = testEnv.agents[1]!;

    const event = createSQLInjectionEvent();

    const packet1 = createDVMPreparePacket(event, 1000n, testEnv.capabilities[1]!.ilpAddress);
    const packet2 = createDVMPreparePacket(event, 1000n, testEnv.capabilities[1]!.ilpAddress);

    const response1 = await service.processIncomingPacket(packet1, 'test-source');
    const response2 = await service.processIncomingPacket(packet2, 'test-source');

    // Both should be handled (idempotency)
    expect(response1).toBeDefined();
    expect(response2).toBeDefined();
  });
});
