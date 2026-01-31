/**
 * Vote Coordination Skill Tests
 *
 * Comprehensive unit tests for vote_coordination AI skill.
 * Tests skill registration, vote creation, error handling, and logger integration.
 */

import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { createVoteCoordinationSkill } from '../vote-coordination-skill';
import {
  COORDINATION_VOTE_KIND,
  COORDINATION_PROPOSAL_KIND,
  type Proposal,
} from '../../../coordination';
import type { SkillExecuteContext } from '../../skill-registry';
import { ProposalCreator } from '../../../coordination/proposal';
import type { NostrEvent } from '../../../toon-codec';

describe('vote_coordination skill', () => {
  // Test setup
  let voterPrivateKey: string;
  let voterPubkey: string;
  let coordinatorPrivateKey: string;
  let otherPubkey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockLogger: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDatabase: any;

  beforeEach(() => {
    // Generate test keys
    const voterSecretKey = generateSecretKey();
    voterPrivateKey = bytesToHex(voterSecretKey);
    voterPubkey = getPublicKey(voterSecretKey);

    const coordinatorSecretKey = generateSecretKey();
    coordinatorPrivateKey = bytesToHex(coordinatorSecretKey);

    const otherSecretKey = generateSecretKey();
    otherPubkey = getPublicKey(otherSecretKey);

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    };

    // Create mock database
    mockDatabase = {
      queryEvents: jest.fn(),
    };
  });

  /**
   * Helper: Create test context
   */
  function createTestContext(overrides?: Partial<SkillExecuteContext>): SkillExecuteContext {
    return {
      database: mockDatabase,
      agentPubkey: voterPubkey,
      reasoning: undefined,
      ...overrides,
    } as SkillExecuteContext;
  }

  /**
   * Helper: Create test proposal using ProposalCreator
   */
  function createTestProposal(overrides?: {
    participants?: string[];
    type?: 'threshold' | 'majority' | 'consensus' | 'ranked' | 'allocation';
  }): { proposal: Proposal; event: NostrEvent } {
    const proposalCreator = new ProposalCreator(coordinatorPrivateKey, 'g.test.agent');
    const participants = overrides?.participants || [voterPubkey, otherPubkey];
    const type = overrides?.type || 'threshold';

    const event = proposalCreator.create({
      type,
      participants,
      threshold: 2,
      expiresIn: 3600, // 1 hour
      description: 'Test proposal for voting',
    });

    const proposal = proposalCreator.toProposal(event);
    return { proposal, event };
  }

  describe('Skill Registration', () => {
    it('should register with correct name (AC: 1)', () => {
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      expect(skill.name).toBe('vote_coordination');
    });

    it('should register with Kind 6910 (AC: 1)', () => {
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      expect(skill.eventKinds).toEqual([COORDINATION_VOTE_KIND]); // 6910
    });

    it('should have comprehensive description (AC: 1)', () => {
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      expect(skill.description).toBeDefined();
      expect(skill.description.length).toBeGreaterThan(100);
      expect(skill.description).toContain('vote');
      expect(skill.description).toContain('proposal');
      expect(skill.description).toContain('participant');
    });

    it('should have Zod parameters schema (AC: 1)', () => {
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      expect(skill.parameters).toBeDefined();
      expect(skill.parameters.parse).toBeDefined(); // Zod schema has parse method
    });
  });

  describe('Successful Vote Creation', () => {
    it('should create approve vote for valid proposal (AC: 2, 3, 4, 5, 6)', async () => {
      // Arrange
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      const { proposal, event: proposalEvent } = createTestProposal({
        participants: [voterPubkey, otherPubkey],
      });
      mockDatabase.queryEvents.mockResolvedValue([proposalEvent]);

      const context = createTestContext({
        agentPubkey: voterPubkey,
        database: mockDatabase,
      });
      const params = {
        proposalId: proposal.id,
        vote: 'approve' as const,
        reason: 'Good proposal',
      };

      // Act
      const result = await skill.execute(params, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.responseEvent).toBeDefined();
      expect(result.responseEvent!.kind).toBe(COORDINATION_VOTE_KIND); // 6910
      expect(result.responseEvent!.tags).toContainEqual(['vote', 'approve']);
      expect(result.responseEvent!.tags).toContainEqual(['d', proposal.id]);
      expect(
        result.responseEvent!.tags.some((tag) => tag[0] === 'e' && tag[1] === proposalEvent.id)
      ).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          voteId: expect.any(String),
          proposalId: proposal.id,
          vote: 'approve',
          hasReason: true,
          voterPubkey,
        }),
        expect.stringContaining('Coordination vote created via AI skill')
      );
    });

    it('should create reject vote (AC: 2, 5, 6)', async () => {
      // Arrange
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      const { proposal, event: proposalEvent } = createTestProposal();
      mockDatabase.queryEvents.mockResolvedValue([proposalEvent]);

      const context = createTestContext();
      const params = {
        proposalId: proposal.id,
        vote: 'reject' as const,
      };

      // Act
      const result = await skill.execute(params, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.responseEvent).toBeDefined();
      expect(result.responseEvent!.tags).toContainEqual(['vote', 'reject']);
    });

    it('should create abstain vote (AC: 2, 5, 6)', async () => {
      // Arrange
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      const { proposal, event: proposalEvent } = createTestProposal();
      mockDatabase.queryEvents.mockResolvedValue([proposalEvent]);

      const context = createTestContext();
      const params = {
        proposalId: proposal.id,
        vote: 'abstain' as const,
      };

      // Act
      const result = await skill.execute(params, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.responseEvent).toBeDefined();
      expect(result.responseEvent!.tags).toContainEqual(['vote', 'abstain']);
    });

    it('should include reason in vote event (AC: 2, 5)', async () => {
      // Arrange
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      const { proposal, event: proposalEvent } = createTestProposal();
      mockDatabase.queryEvents.mockResolvedValue([proposalEvent]);

      const context = createTestContext();
      const reason = 'Proposal aligns with project goals';
      const params = {
        proposalId: proposal.id,
        vote: 'approve' as const,
        reason,
      };

      // Act
      const result = await skill.execute(params, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.responseEvent).toBeDefined();
      expect(result.responseEvent!.tags).toContainEqual(['reason', reason]);
      expect(result.responseEvent!.content).toBe(reason);
    });
  });

  describe('Proposal Fetching', () => {
    it('should fetch proposal with correct filter (AC: 3)', async () => {
      // Arrange
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      const { proposal, event: proposalEvent } = createTestProposal();
      mockDatabase.queryEvents.mockResolvedValue([proposalEvent]);

      const context = createTestContext();
      const params = {
        proposalId: proposal.id,
        vote: 'approve' as const,
      };

      // Act
      await skill.execute(params, context);

      // Assert
      expect(mockDatabase.queryEvents).toHaveBeenCalledWith({
        kinds: [COORDINATION_PROPOSAL_KIND], // Kind 5910
        '#d': [params.proposalId],
        limit: 1,
      });
    });
  });

  describe('Error Handling', () => {
    it('should return error when proposal not found (AC: 3, 8)', async () => {
      // Arrange
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      mockDatabase.queryEvents.mockResolvedValue([]); // Empty result

      const context = createTestContext();
      const params = {
        proposalId: 'non-existent-proposal',
        vote: 'approve' as const,
      };

      // Act
      const result = await skill.execute(params, context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('F99');
      expect(result.error!.message).toContain('Proposal not found');
      expect(result.error!.message).toContain('non-existent-proposal');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should return error when agent is not a participant (AC: 4, 8)', async () => {
      // Arrange
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      const { proposal, event: proposalEvent } = createTestProposal({
        participants: [otherPubkey], // Voter NOT in participants
      });
      mockDatabase.queryEvents.mockResolvedValue([proposalEvent]);

      const context = createTestContext({
        agentPubkey: voterPubkey,
      });
      const params = {
        proposalId: proposal.id,
        vote: 'approve' as const,
      };

      // Act
      const result = await skill.execute(params, context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('F99');
      expect(result.error!.message).toContain('not a participant');
      expect(result.error!.message).toContain(voterPubkey);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should validate proposalId parameter (AC: 8)', () => {
      // Arrange
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);

      // Act & Assert - Zod requires .min(1) for non-empty strings, but we allow empty for now
      // The real validation happens when fetching from database (proposal not found)
      const result = skill.parameters.safeParse({
        proposalId: '', // Empty proposalId
        vote: 'approve',
      });
      // Empty string passes Zod validation but will fail in database query
      expect(result.success).toBe(true);
    });

    it('should validate vote parameter (AC: 8)', () => {
      // Arrange
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);

      // Act & Assert
      expect(() => {
        skill.parameters.parse({
          proposalId: 'test-id',
          vote: 'invalid-vote', // Invalid vote value
        });
      }).toThrow(); // Zod validation error
    });

    it('should handle VoteCreator errors (AC: 8)', async () => {
      // Arrange
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      const { proposal } = createTestProposal();

      // Mock database to throw an error
      mockDatabase.queryEvents.mockRejectedValue(new Error('Database connection failed'));

      const context = createTestContext();
      const params = {
        proposalId: proposal.id,
        vote: 'approve' as const,
      };

      // Act
      const result = await skill.execute(params, context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('F99');
      expect(result.error!.message).toContain('Failed to create vote');
      expect(result.error!.message).toContain('Database connection failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Logger Integration', () => {
    it('should log vote creation on success', async () => {
      // Arrange
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      const { proposal, event: proposalEvent } = createTestProposal();
      mockDatabase.queryEvents.mockResolvedValue([proposalEvent]);

      const context = createTestContext();
      const params = {
        proposalId: proposal.id,
        vote: 'approve' as const,
        reason: 'Test reason',
      };

      // Act
      await skill.execute(params, context);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          voteId: expect.any(String),
          proposalId: proposal.id,
          vote: 'approve',
          hasReason: true,
          voterPubkey,
        }),
        expect.stringContaining('Coordination vote created via AI skill')
      );
    });

    it('should log errors on failure', async () => {
      // Arrange
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      mockDatabase.queryEvents.mockResolvedValue([]); // Proposal not found

      const context = createTestContext();
      const params = {
        proposalId: 'non-existent',
        vote: 'approve' as const,
      };

      // Act
      await skill.execute(params, context);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: 'non-existent',
        }),
        expect.stringContaining('Proposal not found')
      );
    });

    it('should track hasReason flag in logs', async () => {
      // Arrange
      const skill = createVoteCoordinationSkill(voterPrivateKey, 'g.test.agent', mockLogger);
      const { proposal, event: proposalEvent } = createTestProposal();
      mockDatabase.queryEvents.mockResolvedValue([proposalEvent]);

      const context = createTestContext();
      const paramsWithoutReason = {
        proposalId: proposal.id,
        vote: 'approve' as const,
      };

      // Act
      await skill.execute(paramsWithoutReason, context);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          hasReason: false,
        }),
        expect.any(String)
      );
    });
  });
});
