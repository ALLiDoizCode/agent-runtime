import {
  CoordinationType,
  VoteValue,
  CoordinationOutcome,
  COORDINATION_PROPOSAL_KIND,
  COORDINATION_VOTE_KIND,
  COORDINATION_RESULT_KIND,
  CoordinationTypeSchema,
  VoteValueSchema,
  CoordinationOutcomeSchema,
  ProposalActionSchema,
  CreateProposalParamsSchema,
  VoteSchema,
  CoordinationResultSchema,
  TAG_D,
  TAG_TYPE,
  TAG_P,
  TAG_THRESHOLD,
  TAG_QUORUM,
  TAG_EXPIRES,
  TAG_ACTION,
  TAG_WEIGHT,
  TAG_E,
  TAG_VOTE,
  TAG_REASON,
  TAG_RANK,
  TAG_OUTCOME,
  TAG_VOTES,
  TAG_PARTICIPANTS,
  TAG_STAKE,
} from './types';

describe('Coordination Types', () => {
  describe('CoordinationType', () => {
    it('should have all coordination type values', () => {
      const validTypes: CoordinationType[] = [
        'consensus',
        'majority',
        'threshold',
        'ranked',
        'allocation',
      ];
      expect(validTypes).toHaveLength(5);
    });

    it('should validate coordination types with Zod schema', () => {
      expect(CoordinationTypeSchema.parse('consensus')).toBe('consensus');
      expect(CoordinationTypeSchema.parse('majority')).toBe('majority');
      expect(CoordinationTypeSchema.parse('threshold')).toBe('threshold');
      expect(CoordinationTypeSchema.parse('ranked')).toBe('ranked');
      expect(CoordinationTypeSchema.parse('allocation')).toBe('allocation');
    });

    it('should reject invalid coordination type', () => {
      expect(() => CoordinationTypeSchema.parse('invalid')).toThrow();
      expect(() => CoordinationTypeSchema.parse('')).toThrow();
      expect(() => CoordinationTypeSchema.parse(123)).toThrow();
    });
  });

  describe('VoteValue', () => {
    it('should have all vote value types', () => {
      const validVotes: VoteValue[] = ['approve', 'reject', 'abstain'];
      expect(validVotes).toHaveLength(3);
    });

    it('should validate vote values with Zod schema', () => {
      expect(VoteValueSchema.parse('approve')).toBe('approve');
      expect(VoteValueSchema.parse('reject')).toBe('reject');
      expect(VoteValueSchema.parse('abstain')).toBe('abstain');
    });

    it('should reject invalid vote value', () => {
      expect(() => VoteValueSchema.parse('yes')).toThrow();
      expect(() => VoteValueSchema.parse('no')).toThrow();
      expect(() => VoteValueSchema.parse('')).toThrow();
    });
  });

  describe('CoordinationOutcome', () => {
    it('should have all outcome types', () => {
      const validOutcomes: CoordinationOutcome[] = [
        'approved',
        'rejected',
        'expired',
        'inconclusive',
      ];
      expect(validOutcomes).toHaveLength(4);
    });

    it('should validate outcomes with Zod schema', () => {
      expect(CoordinationOutcomeSchema.parse('approved')).toBe('approved');
      expect(CoordinationOutcomeSchema.parse('rejected')).toBe('rejected');
      expect(CoordinationOutcomeSchema.parse('expired')).toBe('expired');
      expect(CoordinationOutcomeSchema.parse('inconclusive')).toBe('inconclusive');
    });

    it('should reject invalid outcome', () => {
      expect(() => CoordinationOutcomeSchema.parse('passed')).toThrow();
      expect(() => CoordinationOutcomeSchema.parse('failed')).toThrow();
    });
  });

  describe('Event Kind Constants', () => {
    it('should have correct proposal kind', () => {
      expect(COORDINATION_PROPOSAL_KIND).toBe(5910);
    });

    it('should have correct vote kind', () => {
      expect(COORDINATION_VOTE_KIND).toBe(6910);
    });

    it('should have correct result kind', () => {
      expect(COORDINATION_RESULT_KIND).toBe(7910);
    });
  });

  describe('Tag Name Constants', () => {
    it('should have correct tag names', () => {
      expect(TAG_D).toBe('d');
      expect(TAG_TYPE).toBe('type');
      expect(TAG_P).toBe('p');
      expect(TAG_THRESHOLD).toBe('threshold');
      expect(TAG_QUORUM).toBe('quorum');
      expect(TAG_EXPIRES).toBe('expires');
      expect(TAG_ACTION).toBe('action');
      expect(TAG_WEIGHT).toBe('weight');
      expect(TAG_E).toBe('e');
      expect(TAG_VOTE).toBe('vote');
      expect(TAG_REASON).toBe('reason');
      expect(TAG_RANK).toBe('rank');
      expect(TAG_OUTCOME).toBe('outcome');
      expect(TAG_VOTES).toBe('votes');
      expect(TAG_PARTICIPANTS).toBe('participants');
    });
  });

  describe('ProposalActionSchema', () => {
    it('should validate valid proposal action', () => {
      const action = {
        kind: 1,
        data: '{"message":"test"}',
      };
      expect(ProposalActionSchema.parse(action)).toEqual(action);
    });

    it('should reject invalid action without kind', () => {
      expect(() => ProposalActionSchema.parse({ data: 'test' })).toThrow();
    });

    it('should reject invalid action without data', () => {
      expect(() => ProposalActionSchema.parse({ kind: 1 })).toThrow();
    });
  });

  describe('CreateProposalParamsSchema', () => {
    it('should validate minimal proposal params', () => {
      const params = {
        type: 'majority',
        participants: ['pubkey1', 'pubkey2'],
        expiresIn: 3600,
        description: 'Test proposal',
      };
      const result = CreateProposalParamsSchema.parse(params);
      expect(result.type).toBe('majority');
      expect(result.participants).toHaveLength(2);
      expect(result.expiresIn).toBe(3600);
      expect(result.description).toBe('Test proposal');
    });

    it('should validate full proposal params', () => {
      const params = {
        type: 'threshold',
        participants: ['pubkey1', 'pubkey2', 'pubkey3'],
        threshold: 2,
        quorum: 2,
        expiresIn: 7200,
        action: { kind: 1, data: '{}' },
        weights: { pubkey1: 2, pubkey2: 1, pubkey3: 1 },
        description: 'Full proposal',
      };
      const result = CreateProposalParamsSchema.parse(params);
      expect(result.threshold).toBe(2);
      expect(result.quorum).toBe(2);
      expect(result.action).toBeDefined();
      expect(result.weights).toBeDefined();
    });

    it('should reject missing required fields', () => {
      expect(() =>
        CreateProposalParamsSchema.parse({
          type: 'majority',
          participants: ['pubkey1'],
          // missing expiresIn and description
        })
      ).toThrow();
    });

    it('should reject empty participants array', () => {
      expect(() =>
        CreateProposalParamsSchema.parse({
          type: 'majority',
          participants: [],
          expiresIn: 3600,
          description: 'Test',
        })
      ).toThrow();
    });

    it('should reject negative expiresIn', () => {
      expect(() =>
        CreateProposalParamsSchema.parse({
          type: 'majority',
          participants: ['pubkey1'],
          expiresIn: -100,
          description: 'Test',
        })
      ).toThrow();
    });
  });

  describe('VoteSchema', () => {
    it('should validate valid vote', () => {
      const vote = {
        kind: 6910,
        proposalEventId: 'event123',
        proposalId: 'proposal456',
        vote: 'approve',
        voterPubkey: 'pubkey789',
        event: {
          id: 'vote-event-id',
          pubkey: 'pubkey789',
          created_at: 1234567890,
          kind: 6910,
          tags: [],
          content: '',
          sig: 'signature',
        },
      };
      const result = VoteSchema.parse(vote);
      expect(result.vote).toBe('approve');
      expect(result.kind).toBe(6910);
    });

    it('should validate vote with optional fields', () => {
      const vote = {
        kind: 6910,
        proposalEventId: 'event123',
        proposalId: 'proposal456',
        vote: 'reject',
        reason: 'I disagree with the proposal',
        rank: [1, 2, 3],
        voterPubkey: 'pubkey789',
        event: {
          id: 'vote-event-id',
          pubkey: 'pubkey789',
          created_at: 1234567890,
          kind: 6910,
          tags: [],
          content: '',
          sig: 'signature',
        },
      };
      const result = VoteSchema.parse(vote);
      expect(result.reason).toBe('I disagree with the proposal');
      expect(result.rank).toEqual([1, 2, 3]);
    });

    it('should reject invalid vote value', () => {
      expect(() =>
        VoteSchema.parse({
          kind: 6910,
          proposalEventId: 'event123',
          proposalId: 'proposal456',
          vote: 'maybe',
          voterPubkey: 'pubkey789',
          event: {
            id: 'id',
            pubkey: 'pubkey',
            created_at: 123,
            kind: 6910,
            tags: [],
            content: '',
            sig: 'sig',
          },
        })
      ).toThrow();
    });
  });

  describe('CoordinationResultSchema', () => {
    it('should validate valid result', () => {
      const result = {
        kind: 7910,
        proposalEventId: 'proposal-event-123',
        proposalId: 'proposal-123',
        outcome: 'approved',
        votes: {
          approve: 3,
          reject: 1,
          abstain: 0,
        },
        participants: {
          voted: 4,
          total: 5,
        },
        voteEventIds: ['vote1', 'vote2', 'vote3', 'vote4'],
        content: 'Proposal approved with 3/4 votes',
        event: {
          id: 'result-event-id',
          pubkey: 'coordinator-pubkey',
          created_at: 1234567890,
          kind: 7910,
          tags: [],
          content: '',
          sig: 'signature',
        },
      };
      const parsed = CoordinationResultSchema.parse(result);
      expect(parsed.outcome).toBe('approved');
      expect(parsed.votes.approve).toBe(3);
      expect(parsed.participants.voted).toBe(4);
    });

    it('should reject missing votes field', () => {
      expect(() =>
        CoordinationResultSchema.parse({
          kind: 7910,
          proposalEventId: 'event123',
          proposalId: 'proposal123',
          outcome: 'approved',
          // missing votes
          participants: { voted: 4, total: 5 },
          voteEventIds: [],
          content: 'test',
          event: {
            id: 'id',
            pubkey: 'pubkey',
            created_at: 123,
            kind: 7910,
            tags: [],
            content: '',
            sig: 'sig',
          },
        })
      ).toThrow();
    });

    it('should reject invalid outcome', () => {
      expect(() =>
        CoordinationResultSchema.parse({
          kind: 7910,
          proposalEventId: 'event123',
          proposalId: 'proposal123',
          outcome: 'passed', // invalid
          votes: { approve: 3, reject: 0, abstain: 0 },
          participants: { voted: 3, total: 3 },
          voteEventIds: [],
          content: 'test',
          event: {
            id: 'id',
            pubkey: 'pubkey',
            created_at: 123,
            kind: 7910,
            tags: [],
            content: '',
            sig: 'sig',
          },
        })
      ).toThrow();
    });
  });

  describe('TAG_STAKE', () => {
    it('should have correct stake tag constant', () => {
      expect(TAG_STAKE).toBe('stake');
    });
  });

  describe('CreateProposalParamsSchema with stakeRequired', () => {
    it('should validate proposal with stakeRequired', () => {
      const params = {
        type: 'consensus',
        participants: ['pubkey1', 'pubkey2'],
        expiresIn: 3600,
        description: 'Test with stake',
        stakeRequired: 1000n,
      };
      const result = CreateProposalParamsSchema.parse(params);
      expect(result.stakeRequired).toBe(1000n);
    });

    it('should validate proposal without stakeRequired', () => {
      const params = {
        type: 'consensus',
        participants: ['pubkey1', 'pubkey2'],
        expiresIn: 3600,
        description: 'Test without stake',
      };
      const result = CreateProposalParamsSchema.parse(params);
      expect(result.stakeRequired).toBeUndefined();
    });

    it('should reject zero stake', () => {
      expect(() =>
        CreateProposalParamsSchema.parse({
          type: 'consensus',
          participants: ['pubkey1'],
          expiresIn: 3600,
          description: 'Test',
          stakeRequired: 0n,
        })
      ).toThrow();
    });

    it('should reject negative stake', () => {
      expect(() =>
        CreateProposalParamsSchema.parse({
          type: 'consensus',
          participants: ['pubkey1'],
          expiresIn: 3600,
          description: 'Test',
          stakeRequired: -100n,
        })
      ).toThrow();
    });

    it('should handle very large stake amounts', () => {
      const largeAmount = BigInt('999999999999999999'); // ~999 quadrillion
      const params = {
        type: 'consensus',
        participants: ['pubkey1', 'pubkey2'],
        expiresIn: 3600,
        description: 'Test with large stake',
        stakeRequired: largeAmount,
      };
      const result = CreateProposalParamsSchema.parse(params);
      expect(result.stakeRequired).toBe(largeAmount);
    });

    it('should handle MAX_SAFE_INTEGER equivalent for bigint', () => {
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER); // 2^53 - 1
      const params = {
        type: 'consensus',
        participants: ['pubkey1', 'pubkey2'],
        expiresIn: 3600,
        description: 'Test with max safe integer',
        stakeRequired: maxSafe,
      };
      const result = CreateProposalParamsSchema.parse(params);
      expect(result.stakeRequired).toBe(maxSafe);
    });

    it('should handle stake amount larger than MAX_SAFE_INTEGER', () => {
      const beyondSafe = BigInt(Number.MAX_SAFE_INTEGER) + 1000n;
      const params = {
        type: 'consensus',
        participants: ['pubkey1', 'pubkey2'],
        expiresIn: 3600,
        description: 'Test beyond max safe integer',
        stakeRequired: beyondSafe,
      };
      const result = CreateProposalParamsSchema.parse(params);
      expect(result.stakeRequired).toBe(beyondSafe);
    });
  });
});
