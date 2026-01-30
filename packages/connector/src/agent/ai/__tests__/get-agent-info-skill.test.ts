/**
 * Tests for enhanced get_agent_info skill with CapabilityPublisher integration
 *
 * Validates that the skill correctly integrates capability advertisement data
 * and maintains backward compatibility when CapabilityPublisher is not available.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createGetAgentInfoSkill } from '../skills/get-agent-info-skill';
import type { FollowGraphRouter } from '../../follow-graph-router';
import type { SkillRegistry } from '../skill-registry';
import type { CapabilityPublisher } from '../../discovery/capability-publisher';
import type { AgentCapability, AgentType } from '../../discovery/types';
import type { SkillExecuteContext, PacketSender } from '../skill-registry';
import type { SocialCapabilityDiscovery } from '../../discovery/social-discovery';
import type { AgentEventDatabase } from '../../event-database';
import type { NostrEvent } from '../../toon-codec';
import type { ILPPreparePacket } from '@m2m/shared';
import type { Logger } from 'pino';

describe('get_agent_info skill (enhanced with CapabilityPublisher)', () => {
  let mockFollowGraphRouter: jest.Mocked<FollowGraphRouter>;
  let mockSkillRegistry: jest.Mocked<SkillRegistry>;
  let mockCapabilityPublisher: jest.Mocked<CapabilityPublisher>;
  let mockLogger: jest.Mocked<Logger>;
  let mockRegisteredKinds: jest.Mock<() => number[]>;
  let context: SkillExecuteContext;

  beforeEach(() => {
    // Mock FollowGraphRouter
    mockFollowGraphRouter = {
      getAllFollows: jest.fn(),
    } as unknown as jest.Mocked<FollowGraphRouter>;

    // Mock SkillRegistry
    mockSkillRegistry = {
      getSkillSummary: jest.fn(),
    } as unknown as jest.Mocked<SkillRegistry>;

    // Mock CapabilityPublisher
    mockCapabilityPublisher = {
      getLocal: jest.fn(),
    } as unknown as jest.Mocked<CapabilityPublisher>;

    // Mock Logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    // Mock registeredKinds function
    mockRegisteredKinds = jest.fn();

    // Default context (minimal required fields)
    // Note: logger is added at runtime by AI dispatcher, not part of SkillExecuteContext type
    context = {
      agentPubkey: '0'.repeat(64),
      database: {} as unknown as AgentEventDatabase,
      discovery: {} as unknown as SocialCapabilityDiscovery,
      sendPacket: jest.fn() as PacketSender,
      event: {} as NostrEvent,
      packet: {} as ILPPreparePacket,
      amount: 0n,
      source: 'test',
      logger: mockLogger, // Added at runtime
    } as SkillExecuteContext;
  });

  describe('with CapabilityPublisher available', () => {
    it('should include agentType, model, and capacity from CapabilityPublisher', async () => {
      const capability: AgentCapability = {
        pubkey: '0'.repeat(64),
        identifier: 'g.agent.test',
        supportedKinds: [1, 3, 5000],
        supportedNips: ['89', '90', 'xx1'],
        agentType: 'dvm' as AgentType,
        ilpAddress: 'g.agent.test',
        pricing: new Map(),
        capacity: {
          maxConcurrent: 10,
          queueDepth: 100,
        },
        model: 'anthropic:claude-haiku-4-5',
        metadata: {
          name: 'Test Agent',
        },
        createdAt: Math.floor(Date.now() / 1000),
      };

      mockCapabilityPublisher.getLocal.mockReturnValue(capability);
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);
      mockSkillRegistry.getSkillSummary.mockReturnValue([]);
      mockRegisteredKinds.mockReturnValue([1, 3]);

      const skill = createGetAgentInfoSkill(
        mockFollowGraphRouter,
        mockRegisteredKinds,
        mockSkillRegistry,
        mockCapabilityPublisher
      );

      const result = await skill.execute({ reason: 'test' }, context);

      expect(result.success).toBe(true);
      expect(result.responseEvent).toBeDefined();

      const info = JSON.parse(result.responseEvent!.content);
      expect(info.agentType).toBe('dvm');
      expect(info.model).toBe('anthropic:claude-haiku-4-5');
      expect(info.capacity).toEqual({
        maxConcurrent: 10,
        queueDepth: 100,
      });
    });

    it('should use supportedKinds from CapabilityPublisher when available', async () => {
      const capability: AgentCapability = {
        pubkey: '0'.repeat(64),
        identifier: 'g.agent.test',
        supportedKinds: [5000, 5100, 5200],
        supportedNips: ['89', '90'],
        agentType: 'dvm' as AgentType,
        ilpAddress: 'g.agent.test',
        pricing: new Map(),
        metadata: {
          name: 'Test Agent',
        },
        createdAt: Math.floor(Date.now() / 1000),
      };

      mockCapabilityPublisher.getLocal.mockReturnValue(capability);
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);
      mockSkillRegistry.getSkillSummary.mockReturnValue([]);
      mockRegisteredKinds.mockReturnValue([1, 3]); // Different from capability

      const skill = createGetAgentInfoSkill(
        mockFollowGraphRouter,
        mockRegisteredKinds,
        mockSkillRegistry,
        mockCapabilityPublisher
      );

      const result = await skill.execute({ reason: 'test' }, context);

      expect(result.success).toBe(true);
      const info = JSON.parse(result.responseEvent!.content);
      expect(info.supportedKinds).toEqual([5000, 5100, 5200]); // From capability, not registeredKinds
    });

    it('should include all existing response fields for backward compatibility', async () => {
      const capability: AgentCapability = {
        pubkey: '0'.repeat(64),
        identifier: 'g.agent.test',
        supportedKinds: [1],
        supportedNips: ['89'],
        agentType: 'assistant' as AgentType,
        ilpAddress: 'g.agent.test',
        pricing: new Map(),
        metadata: {
          name: 'Test Agent',
        },
        createdAt: Math.floor(Date.now() / 1000),
      };

      mockCapabilityPublisher.getLocal.mockReturnValue(capability);
      mockFollowGraphRouter.getAllFollows.mockReturnValue([
        {
          pubkey: '1'.repeat(64),
          ilpAddress: 'g.agent.peer',
          petname: 'peer1',
          relayHint: 'wss://relay.example.com',
          addedAt: Math.floor(Date.now() / 1000),
        },
      ]);
      mockSkillRegistry.getSkillSummary.mockReturnValue([
        {
          name: 'test_skill',
          description: 'Test skill',
          eventKinds: [1],
          pricing: { base: 100n, model: 'flat' as const },
        },
      ]);
      mockRegisteredKinds.mockReturnValue([1]);

      const skill = createGetAgentInfoSkill(
        mockFollowGraphRouter,
        mockRegisteredKinds,
        mockSkillRegistry,
        mockCapabilityPublisher
      );

      const result = await skill.execute({ reason: 'test' }, context);

      expect(result.success).toBe(true);
      const info = JSON.parse(result.responseEvent!.content);

      // Existing fields
      expect(info.agentPubkey).toBe(context.agentPubkey);
      expect(info.supportedKinds).toEqual([1]);
      expect(info.followCount).toBe(1);
      expect(info.peers).toHaveLength(1);
      expect(info.peers[0]).toEqual({
        pubkey: '1'.repeat(64),
        ilpAddress: 'g.agent.peer',
        petname: 'peer1',
      });
      expect(info.pricing).toBeDefined();
      expect(info.pricing['1']).toEqual({
        base: '100',
        model: 'flat',
      });
      expect(info.skills).toHaveLength(1);
      expect(info.skills[0]).toEqual({
        name: 'test_skill',
        description: 'Test skill',
        eventKinds: [1],
      });

      // New fields
      expect(info.agentType).toBe('assistant');
    });

    it('should not include agentType, model, capacity if CapabilityPublisher returns undefined', async () => {
      mockCapabilityPublisher.getLocal.mockReturnValue(undefined);
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);
      mockSkillRegistry.getSkillSummary.mockReturnValue([]);
      mockRegisteredKinds.mockReturnValue([1, 3]);

      const skill = createGetAgentInfoSkill(
        mockFollowGraphRouter,
        mockRegisteredKinds,
        mockSkillRegistry,
        mockCapabilityPublisher
      );

      const result = await skill.execute({ reason: 'test' }, context);

      expect(result.success).toBe(true);
      const info = JSON.parse(result.responseEvent!.content);

      expect(info.agentType).toBeUndefined();
      expect(info.model).toBeUndefined();
      expect(info.capacity).toBeUndefined();
      expect(info.supportedKinds).toEqual([1, 3]); // From registeredKinds
    });

    it('should log debug message when capability retrieved', async () => {
      const capability: AgentCapability = {
        pubkey: '0'.repeat(64),
        identifier: 'g.agent.test',
        supportedKinds: [1],
        supportedNips: ['89'],
        agentType: 'dvm' as AgentType,
        ilpAddress: 'g.agent.test',
        pricing: new Map(),
        metadata: {
          name: 'Test Agent',
        },
        createdAt: Math.floor(Date.now() / 1000),
      };

      mockCapabilityPublisher.getLocal.mockReturnValue(capability);
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);
      mockSkillRegistry.getSkillSummary.mockReturnValue([]);
      mockRegisteredKinds.mockReturnValue([1]);

      const skill = createGetAgentInfoSkill(
        mockFollowGraphRouter,
        mockRegisteredKinds,
        mockSkillRegistry,
        mockCapabilityPublisher
      );

      await skill.execute({ reason: 'test' }, context);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { capability },
        'Retrieved capability from CapabilityPublisher'
      );
    });

    it('should log debug message when capability not yet published', async () => {
      mockCapabilityPublisher.getLocal.mockReturnValue(undefined);
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);
      mockSkillRegistry.getSkillSummary.mockReturnValue([]);
      mockRegisteredKinds.mockReturnValue([1]);

      const skill = createGetAgentInfoSkill(
        mockFollowGraphRouter,
        mockRegisteredKinds,
        mockSkillRegistry,
        mockCapabilityPublisher
      );

      await skill.execute({ reason: 'test' }, context);

      expect(mockLogger.debug).toHaveBeenCalledWith('No capability published yet, using defaults');
    });
  });

  describe('backward compatibility without CapabilityPublisher', () => {
    it('should work correctly when CapabilityPublisher is not provided', async () => {
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);
      mockSkillRegistry.getSkillSummary.mockReturnValue([]);
      mockRegisteredKinds.mockReturnValue([1, 3, 5]);

      const skill = createGetAgentInfoSkill(
        mockFollowGraphRouter,
        mockRegisteredKinds,
        mockSkillRegistry
        // No capabilityPublisher parameter
      );

      const result = await skill.execute({ reason: 'test' }, context);

      expect(result.success).toBe(true);
      const info = JSON.parse(result.responseEvent!.content);

      expect(info.agentPubkey).toBe(context.agentPubkey);
      expect(info.supportedKinds).toEqual([1, 3, 5]); // From registeredKinds
      expect(info.agentType).toBeUndefined();
      expect(info.model).toBeUndefined();
      expect(info.capacity).toBeUndefined();
    });

    it('should include pricing from SkillRegistry when CapabilityPublisher not provided', async () => {
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);
      mockSkillRegistry.getSkillSummary.mockReturnValue([
        {
          name: 'skill1',
          description: 'Skill 1',
          eventKinds: [5000],
          pricing: { base: 100n, model: 'flat' as const },
        },
        {
          name: 'skill2',
          description: 'Skill 2',
          eventKinds: [5100],
          pricing: { base: 250n, model: 'per-token' as const, perUnit: 10n },
        },
      ]);
      mockRegisteredKinds.mockReturnValue([5000, 5100]);

      const skill = createGetAgentInfoSkill(
        mockFollowGraphRouter,
        mockRegisteredKinds,
        mockSkillRegistry
      );

      const result = await skill.execute({ reason: 'test' }, context);

      expect(result.success).toBe(true);
      const info = JSON.parse(result.responseEvent!.content);

      expect(info.pricing).toEqual({
        '5000': { base: '100', model: 'flat' },
        '5100': { base: '250', model: 'per-token', perUnit: '10' },
      });
    });
  });

  describe('error handling', () => {
    it('should handle CapabilityPublisher.getLocal() errors gracefully', async () => {
      mockCapabilityPublisher.getLocal.mockImplementation(() => {
        throw new Error('Database error');
      });
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);
      mockSkillRegistry.getSkillSummary.mockReturnValue([]);
      mockRegisteredKinds.mockReturnValue([1, 3]);

      const skill = createGetAgentInfoSkill(
        mockFollowGraphRouter,
        mockRegisteredKinds,
        mockSkillRegistry,
        mockCapabilityPublisher
      );

      const result = await skill.execute({ reason: 'test' }, context);

      expect(result.success).toBe(true);
      const info = JSON.parse(result.responseEvent!.content);

      // Should fall back to registeredKinds
      expect(info.supportedKinds).toEqual([1, 3]);
      expect(info.agentType).toBeUndefined();

      // Should log error
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to retrieve capability from publisher'
      );
    });
  });

  describe('pricing format', () => {
    it('should convert bigint pricing values to strings for JSON serialization', async () => {
      mockCapabilityPublisher.getLocal.mockReturnValue(undefined);
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);
      mockSkillRegistry.getSkillSummary.mockReturnValue([
        {
          name: 'expensive_skill',
          description: 'Expensive skill',
          eventKinds: [5000],
          pricing: { base: 9999999999999999n, model: 'flat' as const },
        },
      ]);
      mockRegisteredKinds.mockReturnValue([5000]);

      const skill = createGetAgentInfoSkill(
        mockFollowGraphRouter,
        mockRegisteredKinds,
        mockSkillRegistry,
        mockCapabilityPublisher
      );

      const result = await skill.execute({ reason: 'test' }, context);

      expect(result.success).toBe(true);
      const info = JSON.parse(result.responseEvent!.content);

      expect(info.pricing['5000'].base).toBe('9999999999999999');
      expect(typeof info.pricing['5000'].base).toBe('string');
    });

    it('should handle perUnit pricing correctly', async () => {
      mockCapabilityPublisher.getLocal.mockReturnValue(undefined);
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);
      mockSkillRegistry.getSkillSummary.mockReturnValue([
        {
          name: 'per_unit_skill',
          description: 'Per-unit skill',
          eventKinds: [5100],
          pricing: { base: 50n, model: 'per-token' as const, perUnit: 5n },
        },
      ]);
      mockRegisteredKinds.mockReturnValue([5100]);

      const skill = createGetAgentInfoSkill(
        mockFollowGraphRouter,
        mockRegisteredKinds,
        mockSkillRegistry,
        mockCapabilityPublisher
      );

      const result = await skill.execute({ reason: 'test' }, context);

      expect(result.success).toBe(true);
      const info = JSON.parse(result.responseEvent!.content);

      expect(info.pricing['5100']).toEqual({
        base: '50',
        model: 'per-token',
        perUnit: '5',
      });
    });
  });

  describe('Kind 10001 response event', () => {
    it('should return Kind 10001 response event', async () => {
      mockCapabilityPublisher.getLocal.mockReturnValue(undefined);
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);
      mockSkillRegistry.getSkillSummary.mockReturnValue([]);
      mockRegisteredKinds.mockReturnValue([1]);

      const skill = createGetAgentInfoSkill(
        mockFollowGraphRouter,
        mockRegisteredKinds,
        mockSkillRegistry,
        mockCapabilityPublisher
      );

      const result = await skill.execute({ reason: 'test' }, context);

      expect(result.success).toBe(true);
      expect(result.responseEvent).toBeDefined();
      expect(result.responseEvent!.kind).toBe(10001);
      expect(result.responseEvent!.pubkey).toBe(context.agentPubkey);
      expect(result.responseEvent!.tags).toEqual([]);
      expect(result.responseEvent!.content).toBeDefined();
      expect(() => JSON.parse(result.responseEvent!.content)).not.toThrow();
    });

    it('should return JSON-serializable response', async () => {
      const capability: AgentCapability = {
        pubkey: '0'.repeat(64),
        identifier: 'g.agent.test',
        supportedKinds: [1],
        supportedNips: ['89'],
        agentType: 'dvm' as AgentType,
        ilpAddress: 'g.agent.test',
        pricing: new Map(),
        capacity: {
          maxConcurrent: 5,
          queueDepth: 50,
        },
        model: 'anthropic:claude-sonnet-4-5',
        metadata: {
          name: 'Test Agent',
        },
        createdAt: Math.floor(Date.now() / 1000),
      };

      mockCapabilityPublisher.getLocal.mockReturnValue(capability);
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);
      mockSkillRegistry.getSkillSummary.mockReturnValue([]);
      mockRegisteredKinds.mockReturnValue([1]);

      const skill = createGetAgentInfoSkill(
        mockFollowGraphRouter,
        mockRegisteredKinds,
        mockSkillRegistry,
        mockCapabilityPublisher
      );

      const result = await skill.execute({ reason: 'test' }, context);

      expect(result.success).toBe(true);
      expect(() => JSON.parse(result.responseEvent!.content)).not.toThrow();

      const info = JSON.parse(result.responseEvent!.content);
      expect(JSON.stringify(info)).toBeDefined(); // Can be re-serialized
    });
  });
});
