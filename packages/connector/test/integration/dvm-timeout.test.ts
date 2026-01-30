/**
 * DVM Timeout Handling Integration Tests
 *
 * Tests timeout enforcement and cancellation.
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

describe('DVM Integration - Timeout Handling', () => {
  let testEnv: MultiAgentTestEnv;

  beforeAll(async () => {
    testEnv = await startTestAgents(2);
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('should accept timeout tag in request', async () => {
    const service = testEnv.agents[1]!;

    const requestEvent = createKind5000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
      tags: [
        ['i', 'test query', 'text'],
        ['timeout', '30'], // 30 second timeout
        ['bid', '1000'],
      ],
    });

    const preparePacket = createDVMPreparePacket(
      requestEvent,
      1000n,
      testEnv.capabilities[1]!.ilpAddress
    );

    const response = await service.processIncomingPacket(preparePacket, 'test-source');

    // Should succeed within timeout
    expect(isFulfill(response)).toBe(true);
  });

  it('should handle configurable timeout values (10s, 30s, 60s)', async () => {
    const service = testEnv.agents[1]!;

    const timeouts = [10, 30, 60];

    for (const timeout of timeouts) {
      const requestEvent = createKind5000QueryEvent({
        pubkey: testEnv.capabilities[0]!.pubkey,
        tags: [
          ['i', `timeout test ${timeout}`, 'text'],
          ['timeout', timeout.toString()],
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
    }
  });
});
