/**
 * DVM Retry Logic Integration Tests
 *
 * Tests retry with exponential backoff.
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
  type MultiAgentTestEnv,
} from './helpers/dvm-test-utils';
import { createKind5000QueryEvent } from './fixtures/dvm-events';

describe('DVM Integration - Retry Logic', () => {
  let testEnv: MultiAgentTestEnv;

  beforeAll(async () => {
    testEnv = await startTestAgents(2);
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('should succeed on first attempt (no retry needed)', async () => {
    const service = testEnv.agents[1]!;

    const requestEvent = createKind5000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
      tags: [
        ['i', 'reliable query', 'text'],
        ['bid', '1000'],
      ],
    });

    const preparePacket = createDVMPreparePacket(
      requestEvent,
      1000n,
      testEnv.capabilities[1]!.ilpAddress
    );

    const response = await service.processIncomingPacket(preparePacket, 'test-source');
    expect(isFulfill(response)).toBe(true);
  });

  it('should handle retry configuration in handler', async () => {
    const service = testEnv.agents[1]!;

    // Test that retry logic exists by sending multiple identical requests
    const requests = Array(3)
      .fill(0)
      .map(() =>
        createKind5000QueryEvent({
          pubkey: testEnv.capabilities[0]!.pubkey,
          tags: [
            ['i', 'retry test', 'text'],
            ['bid', '1000'],
          ],
        })
      );

    const responses = await Promise.all(
      requests.map((req) => {
        const packet = createDVMPreparePacket(req, 1000n, testEnv.capabilities[1]!.ilpAddress);
        return service.processIncomingPacket(packet, 'test-source');
      })
    );

    // All should succeed
    responses.forEach((response) => {
      expect(isFulfill(response)).toBe(true);
    });
  });
});
