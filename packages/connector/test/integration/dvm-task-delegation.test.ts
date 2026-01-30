/**
 * DVM Task Delegation Integration Tests
 *
 * Tests Kind 5900 task delegation between agents.
 * Verifies agent-to-agent collaboration and task result handling.
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
import { createKind5900DelegationEvent } from './fixtures/dvm-events';

describe('DVM Integration - Task Delegation', () => {
  let testEnv: MultiAgentTestEnv;

  beforeAll(async () => {
    // Start 3 agents: A (requester), B (translator), C (summarizer)
    testEnv = await startTestAgents(3);
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('should handle two-agent delegation (A delegates to B)', async () => {
    const agentB = testEnv.agents[1]!;

    // Create Kind 5900 delegation request from A
    const delegationRequest = createKind5900DelegationEvent(
      testEnv.capabilities[1]!.pubkey, // Prefer Agent B
      {
        pubkey: testEnv.capabilities[0]!.pubkey,
        tags: [
          ['i', 'translate to Spanish', 'text'],
          ['p', testEnv.capabilities[1]!.pubkey], // Preferred agent
          ['timeout', '30'],
          ['priority', 'normal'],
        ],
      }
    );

    // Send delegation request to Agent B
    const preparePacket = createDVMPreparePacket(
      delegationRequest,
      1000n,
      testEnv.capabilities[1]!.ilpAddress
    );

    const response = await agentB.processIncomingPacket(preparePacket, 'test-source');

    // Verify Kind 6900 result
    expect(isFulfill(response)).toBe(true);

    if (isFulfill(response)) {
      const resultEvent = toonCodec.decode(response.data);

      expect(resultEvent.kind).toBe(6900);
      expect(resultEvent.tags.find((t) => t[0] === 'e')?.[1]).toBe(delegationRequest.id);
      expect(resultEvent.tags.find((t) => t[0] === 'p')?.[1]).toBe(delegationRequest.pubkey);
      expect(resultEvent.tags.find((t) => t[0] === 'status')?.[1]).toBe('success');
      expect(resultEvent.tags.find((t) => t[0] === 'runtime')).toBeDefined();
      expect(resultEvent.content).toBe('Task completed successfully');
    }
  });

  it('should handle delegation with preferred agent (p tag)', async () => {
    const agentB = testEnv.agents[1]!;

    // Create delegation with preferred agent
    const delegationRequest = createKind5900DelegationEvent(testEnv.capabilities[1]!.pubkey, {
      pubkey: testEnv.capabilities[0]!.pubkey,
    });

    const preparePacket = createDVMPreparePacket(
      delegationRequest,
      1000n,
      testEnv.capabilities[1]!.ilpAddress
    );

    const response = await agentB.processIncomingPacket(preparePacket, 'test-source');

    expect(isFulfill(response)).toBe(true);

    if (isFulfill(response)) {
      const resultEvent = toonCodec.decode(response.data);
      expect(resultEvent.kind).toBe(6900);
      expect(resultEvent.tags.find((t) => t[0] === 'status')?.[1]).toBe('success');
    }
  });

  it('should handle delegation without preferred agent', async () => {
    const agentB = testEnv.agents[1]!;

    // Create delegation without preferred agent (requires discovery)
    const delegationRequest = createKind5900DelegationEvent(undefined, {
      pubkey: testEnv.capabilities[0]!.pubkey,
      tags: [
        ['i', 'generic task', 'text'],
        ['timeout', '30'],
        ['priority', 'normal'],
      ],
    });

    const preparePacket = createDVMPreparePacket(
      delegationRequest,
      1000n,
      testEnv.capabilities[1]!.ilpAddress
    );

    const response = await agentB.processIncomingPacket(preparePacket, 'test-source');

    // Should succeed (agent accepts any task in test mode)
    expect(isFulfill(response)).toBe(true);

    if (isFulfill(response)) {
      const resultEvent = toonCodec.decode(response.data);
      expect(resultEvent.kind).toBe(6900);
      expect(resultEvent.tags.find((t) => t[0] === 'status')?.[1]).toBe('success');
    }
  });

  it('should include runtime and status tags in result', async () => {
    const agentB = testEnv.agents[1]!;

    const delegationRequest = createKind5900DelegationEvent(testEnv.capabilities[1]!.pubkey, {
      pubkey: testEnv.capabilities[0]!.pubkey,
    });

    const preparePacket = createDVMPreparePacket(
      delegationRequest,
      1000n,
      testEnv.capabilities[1]!.ilpAddress
    );

    const response = await agentB.processIncomingPacket(preparePacket, 'test-source');

    expect(isFulfill(response)).toBe(true);

    if (isFulfill(response)) {
      const resultEvent = toonCodec.decode(response.data);

      // Verify required tags
      const runtimeTag = resultEvent.tags.find((t) => t[0] === 'runtime');
      const statusTag = resultEvent.tags.find((t) => t[0] === 'status');
      const amountTag = resultEvent.tags.find((t) => t[0] === 'amount');

      expect(runtimeTag).toBeDefined();
      expect(Number(runtimeTag?.[1])).toBeGreaterThan(0);

      expect(statusTag).toBeDefined();
      expect(['success', 'error', 'partial']).toContain(statusTag?.[1]);

      expect(amountTag).toBeDefined();
    }
  });
});
