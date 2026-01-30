/**
 * DVM Payment Validation Integration Tests
 *
 * Tests payment amount validation via ILP.
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
  type MultiAgentTestEnv,
} from './helpers/dvm-test-utils';
import { createKind5000QueryEvent } from './fixtures/dvm-events';

describe('DVM Integration - Payment Validation', () => {
  let testEnv: MultiAgentTestEnv;

  beforeAll(async () => {
    testEnv = await startTestAgents(2);
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('should validate payment amount via EventHandler._validatePayment', async () => {
    const service = testEnv.agents[1]!;

    const requestEvent = createKind5000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
      tags: [
        ['i', 'test', 'text'],
        ['bid', '1000'],
      ],
    });

    // Test with exact payment
    const exactPacket = createDVMPreparePacket(
      requestEvent,
      1000n,
      testEnv.capabilities[1]!.ilpAddress
    );
    const exactResponse = await service.processIncomingPacket(exactPacket, 'test-source');
    expect(isFulfill(exactResponse)).toBe(true);

    // Test with overpayment (should succeed)
    const overPacket = createDVMPreparePacket(
      requestEvent,
      2000n,
      testEnv.capabilities[1]!.ilpAddress
    );
    const overResponse = await service.processIncomingPacket(overPacket, 'test-source');
    expect(isFulfill(overResponse)).toBe(true);
  });

  it('should reject insufficient payment', async () => {
    const service = testEnv.agents[1]!;

    const requestEvent = createKind5000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
      tags: [
        ['i', 'test', 'text'],
        ['bid', '1000'],
      ],
    });

    const underPacket = createDVMPreparePacket(
      requestEvent,
      100n,
      testEnv.capabilities[1]!.ilpAddress
    );

    const response = await service.processIncomingPacket(underPacket, 'test-source');
    expect(isReject(response)).toBe(true);

    if (isReject(response)) {
      expect(response.code).toBe('F03');
    }
  });

  it('should reject zero payment', async () => {
    const service = testEnv.agents[1]!;

    const requestEvent = createKind5000QueryEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
    });

    const zeroPacket = createDVMPreparePacket(
      requestEvent,
      0n,
      testEnv.capabilities[1]!.ilpAddress
    );

    const response = await service.processIncomingPacket(zeroPacket, 'test-source');
    expect(isReject(response)).toBe(true);
  });
});
