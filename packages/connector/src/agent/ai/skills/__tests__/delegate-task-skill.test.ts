/**
 * Tests for delegate_task skill
 */

import { createDelegateTaskSkill } from '../delegate-task-skill';
import type { SkillExecuteContext } from '../../skill-registry';
import type { SocialCapabilityDiscovery } from '../../../discovery/social-discovery';
import type { CapabilityWithDistance } from '../../../discovery/types';
import {
  PacketType,
  type ILPPreparePacket,
  type ILPFulfillPacket,
  type ILPRejectPacket,
} from '@m2m/shared';
import { ToonCodec } from '../../../toon-codec';
import type { AgentEventDatabase } from '../../../event-database';
import type { Logger } from 'pino';

// TODO: Enable once discovery module is implemented (Epic 18)
describe.skip('delegate_task skill', () => {
  const mockDatabase = {} as AgentEventDatabase;
  const mockPacket: ILPPreparePacket = {
    type: PacketType.PREPARE,
    destination: 'g.test',
    amount: 100n,
    data: Buffer.alloc(0),
    executionCondition: Buffer.alloc(32),
    expiresAt: new Date(),
  };

  const createMockCapability = (
    ilpAddress: string,
    pubkey: string,
    socialDistance: number = 1,
    pricingAmount: bigint = 1000n
  ): CapabilityWithDistance => ({
    pubkey,
    identifier: ilpAddress,
    supportedKinds: [5900],
    supportedNips: [],
    agentType: 'assistant',
    ilpAddress,
    pricing: new Map([[5900, { kind: 5900, amount: pricingAmount, currency: 'msat' }]]),
    metadata: { name: 'Test Agent' },
    createdAt: Date.now(),
    socialDistance,
  });

  const createMockContext = (
    discovery: Partial<SocialCapabilityDiscovery>,
    sendPacket?: (
      ilpAddress: string,
      packet: ILPPreparePacket
    ) => Promise<ILPFulfillPacket | ILPRejectPacket>
  ): SkillExecuteContext => ({
    event: {
      id: '0'.repeat(64),
      pubkey: 'agent-pubkey',
      created_at: 1234567890,
      kind: 1,
      tags: [],
      content: 'test',
      sig: '0'.repeat(128),
    },
    packet: mockPacket,
    amount: 100n,
    source: 'test-source',
    agentPubkey: 'agent-pubkey',
    database: mockDatabase,
    discovery: discovery as SocialCapabilityDiscovery,
    sendPacket: sendPacket || jest.fn(),
  });

  describe('capability discovery integration', () => {
    it('should discover capable agents via discoverForKind', async () => {
      const mockDiscovery = {
        discoverForKind: jest
          .fn()
          .mockResolvedValue([createMockCapability('g.agent.alice', 'alice-pubkey')]),
      };

      const mockSendPacket = jest.fn().mockResolvedValue({
        type: PacketType.FULFILL,
        fulfillment: Buffer.alloc(32),
        data: new ToonCodec().encode({
          id: '0'.repeat(64),
          pubkey: 'alice-pubkey',
          created_at: 1234567890,
          kind: 6900,
          tags: [],
          content: 'result',
          sig: '0'.repeat(128),
        }),
      });

      const skill = createDelegateTaskSkill();
      const context = createMockContext(mockDiscovery, mockSendPacket);

      await skill.execute(
        {
          taskDescription: 'test task',
          targetKind: 5900,
          timeout: 30,
        },
        context
      );

      expect(mockDiscovery.discoverForKind).toHaveBeenCalledWith(5900);
    });

    it('should throw NoCapableAgentError when no agents found', async () => {
      const mockDiscovery = {
        discoverForKind: jest.fn().mockResolvedValue([]),
      };

      const skill = createDelegateTaskSkill();
      const context = createMockContext(mockDiscovery);

      const result = await skill.execute(
        {
          taskDescription: 'test task',
          targetKind: 5900,
          timeout: 30,
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('No capable agents found');
    });

    it('should select first capable agent when no preference specified', async () => {
      const capabilities = [
        createMockCapability('g.agent.alice', 'alice-pubkey', 1),
        createMockCapability('g.agent.bob', 'bob-pubkey', 2),
      ];

      const mockDiscovery = {
        discoverForKind: jest.fn().mockResolvedValue(capabilities),
      };

      const mockSendPacket = jest.fn().mockResolvedValue({
        type: PacketType.FULFILL,
        fulfillment: Buffer.alloc(32),
        data: new ToonCodec().encode({
          id: '0'.repeat(64),
          pubkey: 'alice-pubkey',
          created_at: 1234567890,
          kind: 6900,
          tags: [],
          content: 'result',
          sig: '0'.repeat(128),
        }),
      });

      const skill = createDelegateTaskSkill();
      const context = createMockContext(mockDiscovery, mockSendPacket);

      await skill.execute(
        {
          taskDescription: 'test task',
          targetKind: 5900,
          timeout: 30,
        },
        context
      );

      // Should send to first agent (alice)
      expect(mockSendPacket).toHaveBeenCalled();
      const [ilpAddress] = mockSendPacket.mock.calls[0];
      expect(ilpAddress).toBe('g.agent.alice');
    });

    it('should select preferred agent when specified and available', async () => {
      const capabilities = [
        createMockCapability('g.agent.alice', 'alice-pubkey', 1),
        createMockCapability('g.agent.bob', 'bob-pubkey', 2),
      ];

      const mockDiscovery = {
        discoverForKind: jest.fn().mockResolvedValue(capabilities),
      };

      const mockSendPacket = jest.fn().mockResolvedValue({
        type: PacketType.FULFILL,
        fulfillment: Buffer.alloc(32),
        data: new ToonCodec().encode({
          id: '0'.repeat(64),
          pubkey: 'bob-pubkey',
          created_at: 1234567890,
          kind: 6900,
          tags: [],
          content: 'result',
          sig: '0'.repeat(128),
        }),
      });

      const skill = createDelegateTaskSkill();
      const context = createMockContext(mockDiscovery, mockSendPacket);

      await skill.execute(
        {
          taskDescription: 'test task',
          targetKind: 5900,
          timeout: 30,
          preferredAgent: 'g.agent.bob',
        },
        context
      );

      // Should send to preferred agent (bob)
      expect(mockSendPacket).toHaveBeenCalled();
      const [ilpAddress2] = mockSendPacket.mock.calls[0];
      expect(ilpAddress2).toBe('g.agent.bob');
    });

    it('should throw PreferredAgentNotFoundError when preferred agent not capable', async () => {
      const capabilities = [createMockCapability('g.agent.alice', 'alice-pubkey')];

      const mockDiscovery = {
        discoverForKind: jest.fn().mockResolvedValue(capabilities),
      };

      const skill = createDelegateTaskSkill();
      const context = createMockContext(mockDiscovery);

      const result = await skill.execute(
        {
          taskDescription: 'test task',
          targetKind: 5900,
          timeout: 30,
          preferredAgent: 'g.agent.bob',
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('not found or not capable');
    });
  });

  describe('Kind 5900 request creation and sending', () => {
    it('should create valid Kind 5900 event with proper tags', async () => {
      const mockDiscovery = {
        discoverForKind: jest
          .fn()
          .mockResolvedValue([createMockCapability('g.agent.alice', 'alice-pubkey')]),
      };

      const mockSendPacket = jest.fn().mockResolvedValue({
        type: PacketType.FULFILL,
        fulfillment: Buffer.alloc(32),
        data: new ToonCodec().encode({
          id: '0'.repeat(64),
          pubkey: 'alice-pubkey',
          created_at: 1234567890,
          kind: 6900,
          tags: [],
          content: 'result',
          sig: '0'.repeat(128),
        }),
      });

      const skill = createDelegateTaskSkill();
      const context = createMockContext(mockDiscovery, mockSendPacket);

      await skill.execute(
        {
          taskDescription: 'test task description',
          targetKind: 5900,
          timeout: 45,
        },
        context
      );

      // Verify ILP packet was created correctly
      expect(mockSendPacket).toHaveBeenCalled();
      const [, packet] = mockSendPacket.mock.calls[0];

      expect(packet.type).toBe(PacketType.PREPARE);
      expect(packet.destination).toBe('g.agent.alice');

      // Decode TOON data and verify Kind 5900 event structure
      const codec = new ToonCodec();
      const event = codec.decode(packet.data);

      expect(event.kind).toBe(5900);
      expect(event.content).toBe('test task description');
      expect(event.pubkey).toBe('agent-pubkey');

      // Verify tags
      const iTags = event.tags.filter((t) => t[0] === 'i');
      expect(iTags.length).toBeGreaterThan(0);
      expect(iTags[0]?.[1]).toBe('test task description');

      const timeoutTags = event.tags.filter((t) => t[0] === 'timeout');
      expect(timeoutTags[0]?.[1]).toBe('45');

      const pTags = event.tags.filter((t) => t[0] === 'p');
      expect(pTags[0]?.[1]).toBe('alice-pubkey');
    });

    it('should use pricing from capability for ILP packet amount', async () => {
      const mockDiscovery = {
        discoverForKind: jest
          .fn()
          .mockResolvedValue([createMockCapability('g.agent.alice', 'alice-pubkey', 1, 5000n)]),
      };

      const mockSendPacket = jest.fn().mockResolvedValue({
        type: PacketType.FULFILL,
        fulfillment: Buffer.alloc(32),
        data: Buffer.alloc(0),
      });

      const skill = createDelegateTaskSkill();
      const context = createMockContext(mockDiscovery, mockSendPacket);

      await skill.execute(
        {
          taskDescription: 'test task',
          targetKind: 5900,
          timeout: 30,
        },
        context
      );

      const [, packet2] = mockSendPacket.mock.calls[0];
      expect(packet2.amount).toBe(5000n);
    });

    it('should default to 0 payment when no pricing available', async () => {
      const capability = createMockCapability('g.agent.alice', 'alice-pubkey');
      capability.pricing = new Map(); // No pricing

      const mockDiscovery = {
        discoverForKind: jest.fn().mockResolvedValue([capability]),
      };

      const mockSendPacket = jest.fn().mockResolvedValue({
        type: PacketType.FULFILL,
        fulfillment: Buffer.alloc(32),
        data: Buffer.alloc(0),
      });

      const skill = createDelegateTaskSkill();
      const context = createMockContext(mockDiscovery, mockSendPacket);

      await skill.execute(
        {
          taskDescription: 'test task',
          targetKind: 5900,
          timeout: 30,
        },
        context
      );

      const [, packet3] = mockSendPacket.mock.calls[0];
      expect(packet3.amount).toBe(0n);
    });
  });

  describe('Kind 6900 result parsing', () => {
    it('should parse Kind 6900 result from ILP FULFILL', async () => {
      const resultEvent = {
        id: '0'.repeat(64),
        pubkey: 'alice-pubkey',
        created_at: 1234567890,
        kind: 6900,
        tags: [
          ['e', 'original-event-id'],
          ['status', 'success'],
          ['runtime', '1234'],
        ],
        content: JSON.stringify({ result: 'task completed' }),
        sig: '0'.repeat(128),
      };

      const mockDiscovery = {
        discoverForKind: jest
          .fn()
          .mockResolvedValue([createMockCapability('g.agent.alice', 'alice-pubkey')]),
      };

      const mockSendPacket = jest.fn().mockResolvedValue({
        type: PacketType.FULFILL,
        fulfillment: Buffer.alloc(32),
        data: new ToonCodec().encode(resultEvent),
      });

      const skill = createDelegateTaskSkill();
      const context = createMockContext(mockDiscovery, mockSendPacket);

      const result = await skill.execute(
        {
          taskDescription: 'test task',
          targetKind: 5900,
          timeout: 30,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.responseEvent).toBeDefined();
      expect(result.responseEvent?.kind).toBe(6900);
      expect(result.responseEvent?.content).toBe(JSON.stringify({ result: 'task completed' }));
    });

    it('should handle empty response data gracefully', async () => {
      const mockDiscovery = {
        discoverForKind: jest
          .fn()
          .mockResolvedValue([createMockCapability('g.agent.alice', 'alice-pubkey')]),
      };

      const mockSendPacket = jest.fn().mockResolvedValue({
        type: PacketType.FULFILL,
        fulfillment: Buffer.alloc(32),
        data: Buffer.alloc(0),
      });

      const skill = createDelegateTaskSkill();
      const context = createMockContext(mockDiscovery, mockSendPacket);

      const result = await skill.execute(
        {
          taskDescription: 'test task',
          targetKind: 5900,
          timeout: 30,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.responseEvent).toBeUndefined();
    });

    it('should fail when receiving ILP REJECT instead of FULFILL', async () => {
      const mockDiscovery = {
        discoverForKind: jest
          .fn()
          .mockResolvedValue([createMockCapability('g.agent.alice', 'alice-pubkey')]),
      };

      const mockSendPacket = jest.fn().mockResolvedValue({
        type: PacketType.REJECT,
        code: 'F99',
        triggeredBy: 'g.agent.alice',
        message: 'Task failed',
        data: Buffer.alloc(0),
      });

      const skill = createDelegateTaskSkill();
      const context = createMockContext(mockDiscovery, mockSendPacket);

      const result = await skill.execute(
        {
          taskDescription: 'test task',
          targetKind: 5900,
          timeout: 30,
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('F99');
    });
  });

  describe('timeout and retry logic', () => {
    it('should retry on network errors with exponential backoff', async () => {
      const mockDiscovery = {
        discoverForKind: jest
          .fn()
          .mockResolvedValue([createMockCapability('g.agent.alice', 'alice-pubkey')]),
      };

      let attemptCount = 0;
      const mockSendPacket = jest.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Network timeout');
        }
        return {
          type: PacketType.FULFILL,
          fulfillment: Buffer.alloc(32),
          data: Buffer.alloc(0),
        };
      });

      const skill = createDelegateTaskSkill();
      const context = createMockContext(mockDiscovery, mockSendPacket);

      const result = await skill.execute(
        {
          taskDescription: 'test task',
          targetKind: 5900,
          timeout: 30,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3); // Initial attempt + 2 retries
    });

    it('should fail after max retries exceeded', async () => {
      const mockDiscovery = {
        discoverForKind: jest
          .fn()
          .mockResolvedValue([createMockCapability('g.agent.alice', 'alice-pubkey')]),
      };

      const mockSendPacket = jest.fn().mockRejectedValue(new Error('Network timeout'));

      const skill = createDelegateTaskSkill();
      const context = createMockContext(mockDiscovery, mockSendPacket);

      const result = await skill.execute(
        {
          taskDescription: 'test task',
          targetKind: 5900,
          timeout: 5, // Short timeout to speed up test
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timed out');
      expect(mockSendPacket.mock.calls.length).toBeGreaterThan(1); // Should have retried
    });

    it('should not retry on non-retryable errors', async () => {
      const mockDiscovery = {
        discoverForKind: jest
          .fn()
          .mockResolvedValue([createMockCapability('g.agent.alice', 'alice-pubkey')]),
      };

      const mockSendPacket = jest.fn().mockRejectedValue(new Error('Invalid format'));

      const skill = createDelegateTaskSkill();
      const context = createMockContext(mockDiscovery, mockSendPacket);

      await expect(
        skill.execute(
          {
            taskDescription: 'test task',
            targetKind: 5900,
            timeout: 30,
          },
          context
        )
      ).rejects.toThrow('Invalid format');

      expect(mockSendPacket.mock.calls.length).toBe(1); // Should not retry
    });
  });

  describe('logging', () => {
    it('should log delegation decisions and outcomes', async () => {
      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      } as unknown as Logger;

      const mockDiscovery = {
        discoverForKind: jest
          .fn()
          .mockResolvedValue([createMockCapability('g.agent.alice', 'alice-pubkey')]),
      };

      const mockSendPacket = jest.fn().mockResolvedValue({
        type: PacketType.FULFILL,
        fulfillment: Buffer.alloc(32),
        data: Buffer.alloc(0),
      });

      const skill = createDelegateTaskSkill(mockLogger);
      const context = createMockContext(mockDiscovery, mockSendPacket);

      await skill.execute(
        {
          taskDescription: 'test task',
          targetKind: 5900,
          timeout: 30,
        },
        context
      );

      // Verify logging calls
      expect(mockLogger.info).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });
});
