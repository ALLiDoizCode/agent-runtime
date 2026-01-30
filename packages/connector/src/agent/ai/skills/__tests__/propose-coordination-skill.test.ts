/**
 * Tests for propose_coordination skill
 */

import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { createProposeCoordinationSkill } from '../propose-coordination-skill';
import type { SkillExecuteContext } from '../../skill-registry';
import type { AgentEventDatabase } from '../../../event-database';
import type { Logger } from 'pino';
import { PacketType, type ILPPreparePacket } from '@m2m/shared';

describe('propose_coordination skill', () => {
  let coordinatorPrivateKeyHex: string;
  let coordinatorPubkey: string;
  let participant1Pubkey: string;
  let participant2Pubkey: string;
  let participant3Pubkey: string;
  let mockLogger: Logger;
  let mockDatabase: AgentEventDatabase;
  let mockPacket: ILPPreparePacket;

  beforeEach(() => {
    // Generate test keys
    const coordinatorKey = generateSecretKey();
    coordinatorPrivateKeyHex = bytesToHex(coordinatorKey);
    coordinatorPubkey = getPublicKey(coordinatorKey);

    participant1Pubkey = getPublicKey(generateSecretKey());
    participant2Pubkey = getPublicKey(generateSecretKey());
    participant3Pubkey = getPublicKey(generateSecretKey());

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      fatal: jest.fn(),
      trace: jest.fn(),
      child: jest.fn(() => mockLogger),
    } as unknown as Logger;

    // Create mock database
    mockDatabase = {} as AgentEventDatabase;

    // Create mock ILP packet
    mockPacket = {
      type: PacketType.PREPARE,
      destination: 'g.test',
      amount: 100n,
      data: Buffer.alloc(0),
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date(),
    };
  });

  /**
   * Helper function to create a test SkillExecuteContext.
   */
  const createTestContext = (): SkillExecuteContext => ({
    event: {
      id: '0'.repeat(64),
      pubkey: coordinatorPubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: 'test',
      sig: '0'.repeat(128),
    },
    packet: mockPacket,
    amount: 100n,
    source: 'test-source',
    agentPubkey: coordinatorPubkey,
    database: mockDatabase,
  });

  describe('skill registration (AC: 1)', () => {
    it('should have name "propose_coordination"', () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      expect(skill.name).toBe('propose_coordination');
    });

    it('should have eventKinds [5910]', () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      expect(skill.eventKinds).toEqual([5910]);
    });

    it('should have comprehensive description', () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      expect(skill.description).toBeDefined();
      expect(skill.description.length).toBeGreaterThan(100);
      expect(skill.description).toContain('consensus');
      expect(skill.description).toContain('majority');
      expect(skill.description).toContain('threshold');
    });

    it('should have defined parameters schema', () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      expect(skill.parameters).toBeDefined();
    });
  });

  describe('successful consensus proposal creation (AC: 2, 4, 5)', () => {
    it('should create consensus proposal with 2 participants', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const params = {
        type: 'consensus' as const,
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test consensus proposal',
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.responseEvent).toBeDefined();
      expect(result.responseEvent!.kind).toBe(5910);

      // Verify type tag
      const typeTag = result.responseEvent!.tags.find((t) => t[0] === 'type');
      expect(typeTag).toBeDefined();
      expect(typeTag![1]).toBe('consensus');

      // Verify p tags for participants
      const pTags = result.responseEvent!.tags.filter((t) => t[0] === 'p');
      expect(pTags).toHaveLength(2);
      expect(pTags.map((t) => t[1])).toContain(participant1Pubkey);
      expect(pTags.map((t) => t[1])).toContain(participant2Pubkey);

      // Verify description in content
      expect(result.responseEvent!.content).toBe('Test consensus proposal');
    });

    it('should create majority proposal with 3 participants', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const params = {
        type: 'majority' as const,
        participants: [participant1Pubkey, participant2Pubkey, participant3Pubkey],
        description: 'Test majority proposal',
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.responseEvent).toBeDefined();

      // Verify type tag
      const typeTag = result.responseEvent!.tags.find((t) => t[0] === 'type');
      expect(typeTag![1]).toBe('majority');

      // Verify all participants
      const pTags = result.responseEvent!.tags.filter((t) => t[0] === 'p');
      expect(pTags).toHaveLength(3);
    });
  });

  describe('successful threshold proposal creation (AC: 2, 4, 5)', () => {
    it('should create threshold proposal with threshold=2', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const params = {
        type: 'threshold' as const,
        participants: [participant1Pubkey, participant2Pubkey, participant3Pubkey],
        threshold: 2,
        description: 'Test threshold proposal',
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.responseEvent).toBeDefined();

      // Verify threshold tag
      const thresholdTag = result.responseEvent!.tags.find((t) => t[0] === 'threshold');
      expect(thresholdTag).toBeDefined();
      expect(thresholdTag![1]).toBe('2');
    });
  });

  describe('expiration configuration (AC: 6)', () => {
    it('should set expires tag with custom expiresIn=7200', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const beforeTimestamp = Math.floor(Date.now() / 1000);
      const params = {
        type: 'consensus' as const,
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test proposal with custom expiration',
        expiresIn: 7200,
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(true);

      // Extract expires tag
      const expiresTag = result.responseEvent!.tags.find((t) => t[0] === 'expires');
      expect(expiresTag).toBeDefined();

      const expiresTimestamp = parseInt(expiresTag![1] ?? '0', 10);
      const expectedExpires = beforeTimestamp + 7200;

      // Allow 5 second tolerance for test execution time
      expect(expiresTimestamp).toBeGreaterThanOrEqual(expectedExpires - 5);
      expect(expiresTimestamp).toBeLessThanOrEqual(expectedExpires + 5);
    });

    it('should default to expiresIn=3600 when not provided', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const beforeTimestamp = Math.floor(Date.now() / 1000);
      const params = {
        type: 'consensus' as const,
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test proposal with default expiration',
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(true);

      // Extract expires tag
      const expiresTag = result.responseEvent!.tags.find((t) => t[0] === 'expires');
      expect(expiresTag).toBeDefined();

      const expiresTimestamp = parseInt(expiresTag![1] ?? '0', 10);
      const expectedExpires = beforeTimestamp + 3600;

      // Allow 5 second tolerance for test execution time
      expect(expiresTimestamp).toBeGreaterThanOrEqual(expectedExpires - 5);
      expect(expiresTimestamp).toBeLessThanOrEqual(expectedExpires + 5);
    });
  });

  describe('proposal with action (AC: 2, 4)', () => {
    it('should include action tag when action provided', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const params = {
        type: 'consensus' as const,
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test proposal with action',
        action: {
          kind: 1,
          data: '{"message":"test"}',
        },
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(true);

      // Verify action tag
      const actionTag = result.responseEvent!.tags.find((t) => t[0] === 'action');
      expect(actionTag).toBeDefined();
      expect(actionTag![1]).toBe('1');
      expect(actionTag![2]).toBe('{"message":"test"}');
    });

    it('should omit action tag when action not provided', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const params = {
        type: 'consensus' as const,
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test proposal without action',
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(true);

      // Verify no action tag
      const actionTag = result.responseEvent!.tags.find((t) => t[0] === 'action');
      expect(actionTag).toBeUndefined();
    });
  });

  describe('parameter validation (AC: 8)', () => {
    it('should reject type=threshold without threshold parameter', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const params = {
        type: 'threshold' as const,
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test proposal',
        // Missing threshold parameter
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('F99');
      expect(result.error!.message).toContain('threshold');
    });

    it('should reject single participant (< 2)', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const params = {
        type: 'consensus' as const,
        participants: [participant1Pubkey],
        description: 'Test proposal',
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('F99');
    });

    it('should reject empty participants array', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const params = {
        type: 'consensus' as const,
        participants: [],
        description: 'Test proposal',
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('F99');
    });

    it('should reject description > 500 characters', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const params = {
        type: 'consensus' as const,
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'x'.repeat(501), // Exceed max length
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('F99');
    });
  });

  describe('logger integration', () => {
    it('should log successful proposal creation with structured data', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const params = {
        type: 'consensus' as const,
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test proposal',
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(true);

      // Verify logger.info was called
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: expect.any(String),
          participants: 2,
          type: 'consensus',
          expiresAt: expect.any(String),
          hasAction: false,
        }),
        expect.stringContaining('Coordination proposal created')
      );
    });

    it('should log proposal creation with action flag', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const params = {
        type: 'consensus' as const,
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test proposal with action',
        action: { kind: 1, data: '{"test":true}' },
      };

      await skill.execute(params, context);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          hasAction: true,
        }),
        expect.any(String)
      );
    });

    it('should log error on invalid parameters', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      // Pass invalid params (single participant) to trigger validation error
      const params = {
        type: 'consensus' as const,
        participants: [participant1Pubkey], // Only 1 participant, needs 2
        description: 'Test proposal',
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.anything(),
          params: expect.any(Object),
        }),
        expect.stringContaining('Invalid skill parameters')
      );
    });
  });

  describe('proposal ID extraction', () => {
    it('should extract proposal ID from event d tag', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const params = {
        type: 'consensus' as const,
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test proposal',
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(true);

      // Extract d tag from event
      const dTag = result.responseEvent!.tags.find((t) => t[0] === 'd');
      expect(dTag).toBeDefined();
      expect(dTag![1]).toHaveLength(32);
      expect(/^[0-9a-f]{32}$/.test(dTag![1] ?? '')).toBe(true);

      // Verify logger was called with this proposal ID
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: dTag![1],
        }),
        expect.any(String)
      );
    });
  });

  describe('responseEvent format', () => {
    it('should return signed NostrEvent with valid signature', async () => {
      const skill = createProposeCoordinationSkill(coordinatorPrivateKeyHex, mockLogger);
      const context = createTestContext();

      const params = {
        type: 'consensus' as const,
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test proposal',
      };

      const result = await skill.execute(params, context);

      expect(result.success).toBe(true);
      expect(result.responseEvent).toBeDefined();

      const event = result.responseEvent!;
      expect(event.id).toBeDefined();
      expect(event.pubkey).toBe(coordinatorPubkey);
      expect(event.sig).toBeDefined();
      expect(event.sig.length).toBe(128);
    });
  });
});
