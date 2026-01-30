import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { VoteCreator } from './vote';
import { ProposalCreator } from './proposal';
import {
  COORDINATION_VOTE_KIND,
  TAG_D,
  TAG_E,
  TAG_VOTE,
  TAG_REASON,
  TAG_RANK,
  NotParticipantError,
  Proposal,
} from './types';

describe('VoteCreator', () => {
  let voteCreator: VoteCreator;
  let proposalCreator: ProposalCreator;
  let voterPrivateKeyHex: string;
  let voterPubkey: string;
  let coordinatorPrivateKeyHex: string;
  let coordinatorPubkey: string;

  beforeEach(() => {
    // Generate voter key
    const voterPrivateKey = generateSecretKey();
    voterPrivateKeyHex = bytesToHex(voterPrivateKey);
    voterPubkey = getPublicKey(voterPrivateKey);

    // Generate coordinator key
    const coordinatorPrivateKey = generateSecretKey();
    coordinatorPrivateKeyHex = bytesToHex(coordinatorPrivateKey);
    coordinatorPubkey = getPublicKey(coordinatorPrivateKey);

    // Create instances
    voteCreator = new VoteCreator(voterPrivateKeyHex);
    proposalCreator = new ProposalCreator(coordinatorPrivateKeyHex);
  });

  describe('constructor and pubkey getter', () => {
    it('should store voter public key correctly', () => {
      expect(voteCreator.pubkey).toBe(voterPubkey);
    });

    it('should accept hex private key', () => {
      const creator = new VoteCreator(voterPrivateKeyHex);
      expect(creator.pubkey).toBe(voterPubkey);
    });
  });

  describe('create() - valid vote creation', () => {
    let proposal: Proposal;

    beforeEach(() => {
      // Create proposal with voter as participant
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voterPubkey, coordinatorPubkey],
        expiresIn: 3600,
        description: 'Test proposal',
      });
      proposal = proposalCreator.toProposal(proposalEvent);
    });

    it('should create vote with all fields (approve, reason, rank)', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        reason: 'I agree with this proposal',
        rank: [1, 2, 3],
      });

      // Verify event structure
      expect(voteEvent.kind).toBe(COORDINATION_VOTE_KIND);
      expect(voteEvent.pubkey).toBe(voterPubkey);
      expect(voteEvent.content).toBe('I agree with this proposal');
      expect(voteEvent.id).toBeDefined();
      expect(voteEvent.sig).toBeDefined();

      // Verify e tag with proposal marker
      const eTags = voteEvent.tags.filter((t) => t[0] === TAG_E);
      expect(eTags).toHaveLength(1);
      expect(eTags[0]).toEqual([TAG_E, proposal.event.id, '', 'proposal']);

      // Verify d tag matches proposal
      const dTags = voteEvent.tags.filter((t) => t[0] === TAG_D);
      expect(dTags).toHaveLength(1);
      expect(dTags[0]![1]).toBe(proposal.id);

      // Verify vote tag
      const voteTags = voteEvent.tags.filter((t) => t[0] === TAG_VOTE);
      expect(voteTags).toHaveLength(1);
      expect(voteTags[0]![1]).toBe('approve');

      // Verify reason tag
      const reasonTags = voteEvent.tags.filter((t) => t[0] === TAG_REASON);
      expect(reasonTags).toHaveLength(1);
      expect(reasonTags[0]![1]).toBe('I agree with this proposal');

      // Verify rank tag
      const rankTags = voteEvent.tags.filter((t) => t[0] === TAG_RANK);
      expect(rankTags).toHaveLength(1);
      expect(rankTags[0]!.slice(1)).toEqual(['1', '2', '3']);
    });

    it('should create vote with minimal fields (abstain, no reason)', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'abstain',
      });

      // Verify event structure
      expect(voteEvent.kind).toBe(COORDINATION_VOTE_KIND);
      expect(voteEvent.pubkey).toBe(voterPubkey);
      expect(voteEvent.content).toBe(''); // Empty content when no reason

      // Verify required tags present
      const eTags = voteEvent.tags.filter((t) => t[0] === TAG_E);
      expect(eTags).toHaveLength(1);

      const dTags = voteEvent.tags.filter((t) => t[0] === TAG_D);
      expect(dTags).toHaveLength(1);

      const voteTags = voteEvent.tags.filter((t) => t[0] === TAG_VOTE);
      expect(voteTags).toHaveLength(1);
      expect(voteTags[0]![1]).toBe('abstain');

      // Verify optional tags omitted
      const reasonTags = voteEvent.tags.filter((t) => t[0] === TAG_REASON);
      expect(reasonTags).toHaveLength(0);

      const rankTags = voteEvent.tags.filter((t) => t[0] === TAG_RANK);
      expect(rankTags).toHaveLength(0);
    });

    it('should accept approve vote value', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      const voteTags = voteEvent.tags.filter((t) => t[0] === TAG_VOTE);
      expect(voteTags[0]![1]).toBe('approve');
    });

    it('should accept reject vote value', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'reject',
      });

      const voteTags = voteEvent.tags.filter((t) => t[0] === TAG_VOTE);
      expect(voteTags[0]![1]).toBe('reject');
    });

    it('should accept abstain vote value', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'abstain',
      });

      const voteTags = voteEvent.tags.filter((t) => t[0] === TAG_VOTE);
      expect(voteTags[0]![1]).toBe('abstain');
    });

    it('should include reason tag when reason provided', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        reason: 'Sounds good to me',
      });

      const reasonTags = voteEvent.tags.filter((t) => t[0] === TAG_REASON);
      expect(reasonTags).toHaveLength(1);
      expect(reasonTags[0]![1]).toBe('Sounds good to me');
      expect(voteEvent.content).toBe('Sounds good to me');
    });

    it('should include rank tag when rank array provided', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        rank: [1, 2, 3, 4, 5],
      });

      const rankTags = voteEvent.tags.filter((t) => t[0] === TAG_RANK);
      expect(rankTags).toHaveLength(1);
      expect(rankTags[0]!.slice(1)).toEqual(['1', '2', '3', '4', '5']);
    });

    it('should omit rank tag when rank array is empty', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        rank: [],
      });

      const rankTags = voteEvent.tags.filter((t) => t[0] === TAG_RANK);
      expect(rankTags).toHaveLength(0);
    });

    it('should create vote with empty reason string', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        reason: '',
      });

      const reasonTags = voteEvent.tags.filter((t) => t[0] === TAG_REASON);
      expect(reasonTags).toHaveLength(1);
      expect(reasonTags[0]![1]).toBe('');
      expect(voteEvent.content).toBe('');
    });

    it('should verify e tag has correct format with proposal marker', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      const eTags = voteEvent.tags.filter((t) => t[0] === TAG_E);
      expect(eTags).toHaveLength(1);
      expect(eTags[0]).toHaveLength(4); // ['e', eventId, '', 'proposal']
      expect(eTags[0]![0]).toBe(TAG_E);
      expect(eTags[0]![1]).toBe(proposal.event.id);
      expect(eTags[0]![2]).toBe(''); // Empty relay hint
      expect(eTags[0]![3]).toBe('proposal'); // Marker
    });

    it('should verify d tag matches proposal d tag', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      const dTags = voteEvent.tags.filter((t) => t[0] === TAG_D);
      expect(dTags).toHaveLength(1);
      expect(dTags[0]![1]).toBe(proposal.id);
    });
  });

  describe('create() - participant validation', () => {
    it('should accept vote when voter is participant', () => {
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voterPubkey],
        expiresIn: 3600,
        description: 'Test proposal',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      expect(voteEvent).toBeDefined();
      expect(voteEvent.pubkey).toBe(voterPubkey);
    });

    it('should throw NotParticipantError when voter not in participant list', () => {
      // Create proposal without voter as participant
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [coordinatorPubkey], // Only coordinator
        expiresIn: 3600,
        description: 'Test proposal',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      expect(() => {
        voteCreator.create({
          proposal,
          vote: 'approve',
        });
      }).toThrow(NotParticipantError);
    });

    it('should include voter pubkey and proposal ID in NotParticipantError message', () => {
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [coordinatorPubkey],
        expiresIn: 3600,
        description: 'Test proposal',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      expect(() => {
        voteCreator.create({
          proposal,
          vote: 'approve',
        });
      }).toThrow(new NotParticipantError(voterPubkey, proposal.id));
    });
  });

  describe('create() - invalid params validation', () => {
    let proposal: Proposal;

    beforeEach(() => {
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voterPubkey],
        expiresIn: 3600,
        description: 'Test proposal',
      });
      proposal = proposalCreator.toProposal(proposalEvent);
    });

    it('should throw error for invalid vote value', () => {
      expect(() => {
        voteCreator.create({
          proposal,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          vote: 'invalid' as any,
        });
      }).toThrow();
    });

    it('should enforce MAX_REASON_LENGTH (500 characters)', () => {
      const longReason = 'a'.repeat(501); // Exceeds 500 character limit

      expect(() => {
        voteCreator.create({
          proposal,
          vote: 'approve',
          reason: longReason,
        });
      }).toThrow(/Reason exceeds maximum length/);
    });

    it('should accept reason at MAX_REASON_LENGTH exactly', () => {
      const maxReason = 'a'.repeat(500); // Exactly 500 characters

      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        reason: maxReason,
      });

      expect(voteEvent).toBeDefined();
      expect(voteEvent.content).toBe(maxReason);
    });

    it('should enforce MAX_RANK_VALUES (100 values)', () => {
      const largeRank = Array.from({ length: 101 }, (_, i) => i); // 101 values

      expect(() => {
        voteCreator.create({
          proposal,
          vote: 'approve',
          rank: largeRank,
        });
      }).toThrow(/Rank array exceeds maximum length/);
    });

    it('should accept rank array at MAX_RANK_VALUES exactly', () => {
      const maxRank = Array.from({ length: 100 }, (_, i) => i); // Exactly 100 values

      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        rank: maxRank,
      });

      expect(voteEvent).toBeDefined();
      const rankTags = voteEvent.tags.filter((t) => t[0] === TAG_RANK);
      expect(rankTags[0]!.slice(1)).toHaveLength(100);
    });
  });

  describe('toVote() - event to Vote conversion', () => {
    let proposal: Proposal;

    beforeEach(() => {
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voterPubkey],
        expiresIn: 3600,
        description: 'Test proposal',
      });
      proposal = proposalCreator.toProposal(proposalEvent);
    });

    it('should convert vote event with all fields to Vote object', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        reason: 'I agree',
        rank: [1, 2, 3],
      });

      const vote = voteCreator.toVote(voteEvent);

      expect(vote.kind).toBe(COORDINATION_VOTE_KIND);
      expect(vote.proposalEventId).toBe(proposal.event.id);
      expect(vote.proposalId).toBe(proposal.id);
      expect(vote.vote).toBe('approve');
      expect(vote.reason).toBe('I agree');
      expect(vote.rank).toEqual([1, 2, 3]);
      expect(vote.voterPubkey).toBe(voterPubkey);
      expect(vote.event).toBe(voteEvent);
    });

    it('should convert vote event with minimal fields to Vote object', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'reject',
      });

      const vote = voteCreator.toVote(voteEvent);

      expect(vote.kind).toBe(COORDINATION_VOTE_KIND);
      expect(vote.proposalEventId).toBe(proposal.event.id);
      expect(vote.proposalId).toBe(proposal.id);
      expect(vote.vote).toBe('reject');
      expect(vote.reason).toBeUndefined();
      expect(vote.rank).toBeUndefined();
      expect(vote.voterPubkey).toBe(voterPubkey);
    });

    it('should handle empty rank array as undefined', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        rank: [],
      });

      const vote = voteCreator.toVote(voteEvent);

      expect(vote.rank).toBeUndefined();
    });

    it('should extract vote value correctly', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'abstain',
      });

      const vote = voteCreator.toVote(voteEvent);

      expect(vote.vote).toBe('abstain');
    });

    it('should extract reason when provided', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        reason: 'This is justified',
      });

      const vote = voteCreator.toVote(voteEvent);

      expect(vote.reason).toBe('This is justified');
    });

    it('should extract rank array when provided', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        rank: [5, 4, 3, 2, 1],
      });

      const vote = voteCreator.toVote(voteEvent);

      expect(vote.rank).toEqual([5, 4, 3, 2, 1]);
    });

    it('should extract proposal event ID from e tag', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      const vote = voteCreator.toVote(voteEvent);

      expect(vote.proposalEventId).toBe(proposal.event.id);
    });

    it('should extract proposal ID from d tag', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      const vote = voteCreator.toVote(voteEvent);

      expect(vote.proposalId).toBe(proposal.id);
    });
  });

  describe('edge cases', () => {
    let proposal: Proposal;

    beforeEach(() => {
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voterPubkey],
        expiresIn: 3600,
        description: 'Test proposal',
      });
      proposal = proposalCreator.toProposal(proposalEvent);
    });

    it('should handle reason with special characters', () => {
      const specialReason = 'Reason with "quotes" and \'apostrophes\' and newlines\n\nOK!';

      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        reason: specialReason,
      });

      expect(voteEvent.content).toBe(specialReason);

      const vote = voteCreator.toVote(voteEvent);
      expect(vote.reason).toBe(specialReason);
    });

    it('should handle rank with negative numbers', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        rank: [-1, 0, 1],
      });

      const vote = voteCreator.toVote(voteEvent);
      expect(vote.rank).toEqual([-1, 0, 1]);
    });

    it('should handle rank with large numbers', () => {
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        rank: [1000000, 2000000],
      });

      const vote = voteCreator.toVote(voteEvent);
      expect(vote.rank).toEqual([1000000, 2000000]);
    });

    it('should handle multiple participants in proposal', () => {
      // Create voter2
      const voter2PrivateKey = generateSecretKey();
      const voter2Pubkey = getPublicKey(voter2PrivateKey);

      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voterPubkey, voter2Pubkey, coordinatorPubkey],
        expiresIn: 3600,
        description: 'Test proposal',
      });
      const multiProposal = proposalCreator.toProposal(proposalEvent);

      const voteEvent = voteCreator.create({
        proposal: multiProposal,
        vote: 'approve',
      });

      expect(voteEvent.pubkey).toBe(voterPubkey);
      expect(voteEvent).toBeDefined();
    });
  });
});
