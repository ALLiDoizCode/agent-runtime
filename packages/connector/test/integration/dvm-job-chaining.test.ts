/**
 * DVM Job Chaining Integration Tests
 *
 * Tests 2-hop job chains with dependency resolution.
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
import {
  createKind5100TranslationEvent,
  createKind5200SummarizationEvent,
} from './fixtures/dvm-events';

describe('DVM Integration - Job Chaining', () => {
  let testEnv: MultiAgentTestEnv;

  beforeAll(async () => {
    testEnv = await startTestAgents(3);
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('should handle 2-hop chain: translate → summarize', async () => {
    const translator = testEnv.agents[1]!;
    const summarizer = testEnv.agents[2]!;

    // Step 1: Translation job (Kind 5100)
    const translationRequest = createKind5100TranslationEvent({
      pubkey: testEnv.capabilities[0]!.pubkey,
    });

    const translatePacket = createDVMPreparePacket(
      translationRequest,
      500n,
      testEnv.capabilities[1]!.ilpAddress
    );

    const translateResponse = await translator.processIncomingPacket(
      translatePacket,
      'test-source'
    );

    expect(isFulfill(translateResponse)).toBe(true);

    if (isFulfill(translateResponse)) {
      const translateResult = toonCodec.decode(translateResponse.data);

      // Step 2: Summarization job with dependency (Kind 5200)
      const summarizeRequest = createKind5200SummarizationEvent(translateResult.id, {
        pubkey: testEnv.capabilities[0]!.pubkey,
      });

      const summarizePacket = createDVMPreparePacket(
        summarizeRequest,
        800n,
        testEnv.capabilities[2]!.ilpAddress
      );

      const summarizeResponse = await summarizer.processIncomingPacket(
        summarizePacket,
        'test-source'
      );

      expect(isFulfill(summarizeResponse)).toBe(true);

      if (isFulfill(summarizeResponse)) {
        const summarizeResult = toonCodec.decode(summarizeResponse.data);
        expect(summarizeResult.kind).toBe(6200);
        expect(summarizeResult.tags.find((t) => t[0] === 'status')?.[1]).toBe('success');
      }
    }
  });

  it('should verify dependency via e tag with dependency marker', async () => {
    const dependencyEventId = 'abc123';
    const summarizeRequest = createKind5200SummarizationEvent(dependencyEventId, {
      pubkey: testEnv.capabilities[0]!.pubkey,
    });

    // Verify dependency tag exists
    const depTag = summarizeRequest.tags.find((t) => t[0] === 'e' && t[3] === 'dependency');
    expect(depTag).toBeDefined();
    expect(depTag?.[1]).toBe(dependencyEventId);
  });
});
