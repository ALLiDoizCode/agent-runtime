import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { VoteParser } from './vote-parser';
import { VoteCreator } from './vote';
import { ProposalCreator } from './proposal';
import {
  InvalidVoteError,
  ProposalMismatchError,
  NotParticipantError,
  type Proposal,
  COORDINATION_VOTE_KIND,
} from './types';

describe('VoteParser', () => {
  let voteParser: VoteParser;
  let voteCreator: VoteCreator;
  let proposalCreator: ProposalCreator;
  let voterPrivateKeyHex: string;
  let voterPubkey: string;
  let coordinatorPrivateKeyHex: string;
  let coordinatorPubkey: string;
  let proposal: Proposal;

  beforeEach(() => {
    voteParser = new VoteParser();

    const voterPrivateKey = generateSecretKey();
    voterPrivateKeyHex = bytesToHex(voterPrivateKey);
    voterPubkey = getPublicKey(voterPrivateKey);

    const coordinatorPrivateKey = generateSecretKey();
    coordinatorPrivateKeyHex = bytesToHex(coordinatorPrivateKey);
    coordinatorPubkey = getPublicKey(coordinatorPrivateKey);

    voteCreator = new VoteCreator(voterPrivateKeyHex);
    proposalCreator = new ProposalCreator(coordinatorPrivateKeyHex, 'g.test.agent');

    // Create a default proposal for testing
    const proposalEvent = proposalCreator.create({
      type: 'majority',
      participants: [voterPubkey, coordinatorPubkey],
      expiresIn: 3600,
      description: 'Test proposal',
    });
    proposal = proposalCreator.toProposal(proposalEvent);
  });

  describe('Valid vote parsing', () => {
    it('should parse valid vote with all fields (vote, reason, rank)', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        reason: 'I agree with this proposal',
        rank: [1, 2, 3],
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert
      expect(vote.kind).toBe(COORDINATION_VOTE_KIND);
      expect(vote.proposalEventId).toBe(proposal.event.id);
      expect(vote.proposalId).toBe(proposal.id);
      expect(vote.vote).toBe('approve');
      expect(vote.voterPubkey).toBe(voterPubkey);
      expect(vote.reason).toBe('I agree with this proposal');
      expect(vote.rank).toEqual([1, 2, 3]);
      expect(vote.event).toEqual(voteEvent);
    });

    it('should parse valid vote with minimal fields (vote only)', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'reject',
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert
      expect(vote.kind).toBe(COORDINATION_VOTE_KIND);
      expect(vote.proposalEventId).toBe(proposal.event.id);
      expect(vote.proposalId).toBe(proposal.id);
      expect(vote.vote).toBe('reject');
      expect(vote.voterPubkey).toBe(voterPubkey);
      expect(vote.reason).toBeUndefined();
      expect(vote.rank).toBeUndefined();
      expect(vote.event).toEqual(voteEvent);
    });

    it('should parse vote with "approve" value', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert
      expect(vote.vote).toBe('approve');
    });

    it('should parse vote with "reject" value', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'reject',
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert
      expect(vote.vote).toBe('reject');
    });

    it('should parse vote with "abstain" value', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'abstain',
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert
      expect(vote.vote).toBe('abstain');
    });

    it('should parse reason when present', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        reason: 'This is a good idea',
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert
      expect(vote.reason).toBe('This is a good idea');
    });

    it('should parse rank array when present', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        rank: [3, 1, 2],
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert
      expect(vote.rank).toEqual([3, 1, 2]);
    });

    it('should handle empty reason string', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        reason: '',
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert
      expect(vote.reason).toBe('');
    });

    it('should handle empty rank array', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        rank: [],
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert: Empty rank array in VoteCreator results in undefined from parser
      expect(vote.rank).toBeUndefined();
    });
  });

  describe('Event kind validation', () => {
    it('should reject event with wrong kind', () => {
      // Arrange: Create event with wrong kind
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });
      const wrongKindEvent = { ...voteEvent, kind: 1 }; // Kind 1 instead of 6910

      // Act & Assert
      expect(() => voteParser.parse(wrongKindEvent, proposal)).toThrow(InvalidVoteError);
      expect(() => voteParser.parse(wrongKindEvent, proposal)).toThrow(
        'Invalid event kind: 1. Expected 6910'
      );
    });

    it('should accept event with correct kind (6910)', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      // Act & Assert
      expect(() => voteParser.parse(voteEvent, proposal)).not.toThrow();
    });
  });

  describe('Signature validation', () => {
    it('should reject vote with invalid signature', () => {
      // Arrange: Create vote and corrupt signature by creating a new object
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      // Create corrupted event without spreading (to avoid copying cached verification)
      const corruptedEvent = {
        id: voteEvent.id,
        pubkey: voteEvent.pubkey,
        created_at: voteEvent.created_at,
        kind: voteEvent.kind,
        tags: voteEvent.tags,
        content: voteEvent.content,
        sig: 'a'.repeat(128), // Invalid signature
      };

      // Act & Assert
      expect(() => voteParser.parse(corruptedEvent, proposal)).toThrow(InvalidVoteError);
      expect(() => voteParser.parse(corruptedEvent, proposal)).toThrow(
        /signature verification failed/i
      );
    });

    it('should accept vote with valid signature', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      // Act & Assert
      expect(() => voteParser.parse(voteEvent, proposal)).not.toThrow();
    });
  });

  describe('Participant validation', () => {
    it('should accept vote when voter is participant', () => {
      // Arrange: voterPubkey is already in proposal.participants
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      // Act & Assert
      expect(() => voteParser.parse(voteEvent, proposal)).not.toThrow();
    });

    it('should reject vote when voter is not participant', () => {
      // Arrange: Create a vote for the original proposal, then parse against a different proposal
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      // Create a different proposal without the voter as participant
      const otherParticipant = getPublicKey(generateSecretKey());
      const otherProposalEvent = proposalCreator.create({
        type: 'majority',
        participants: [otherParticipant], // Voter not in list
        expiresIn: 3600,
        description: 'Different proposal',
      });
      const proposalWithoutVoter = proposalCreator.toProposal(otherProposalEvent);

      // Manually update vote event's d tag to match the other proposal
      const voteEventForOtherProposal = {
        ...voteEvent,
        tags: voteEvent.tags.map((tag) => (tag[0] === 'd' ? ['d', proposalWithoutVoter.id] : tag)),
      };

      // Act & Assert
      expect(() => voteParser.parse(voteEventForOtherProposal, proposalWithoutVoter)).toThrow(
        NotParticipantError
      );
      expect(() => voteParser.parse(voteEventForOtherProposal, proposalWithoutVoter)).toThrow(
        `Pubkey ${voterPubkey} is not a participant in proposal ${proposalWithoutVoter.id}`
      );
    });
  });

  describe('Vote value validation', () => {
    it('should accept "approve" vote value', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert
      expect(vote.vote).toBe('approve');
    });

    it('should accept "reject" vote value', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'reject',
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert
      expect(vote.vote).toBe('reject');
    });

    it('should accept "abstain" vote value', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'abstain',
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert
      expect(vote.vote).toBe('abstain');
    });

    it('should reject invalid vote value and list valid options', () => {
      // Arrange: Create vote and manually corrupt the vote tag
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      // Corrupt the vote tag
      const corruptedEvent = {
        ...voteEvent,
        tags: voteEvent.tags.map(
          (tag) => (tag[0] === 'vote' ? ['vote', 'maybe'] : tag) // Invalid vote value
        ),
      };

      // Act & Assert
      expect(() => voteParser.parse(corruptedEvent, proposal)).toThrow(InvalidVoteError);
      expect(() => voteParser.parse(corruptedEvent, proposal)).toThrow(
        'Invalid vote value: "maybe". Must be one of: approve, reject, abstain'
      );
    });
  });

  describe('Proposal reference validation', () => {
    it('should reject vote without e tag', () => {
      // Arrange: Create vote and remove e tag
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      const eventWithoutETag = {
        ...voteEvent,
        tags: voteEvent.tags.filter((tag) => tag[0] !== 'e'),
      };

      // Act & Assert
      expect(() => voteParser.parse(eventWithoutETag, proposal)).toThrow(InvalidVoteError);
      expect(() => voteParser.parse(eventWithoutETag, proposal)).toThrow(
        'Vote event must include an e tag with "proposal" marker'
      );
    });

    it('should reject vote with e tag but no "proposal" marker', () => {
      // Arrange: Create vote and remove proposal marker from e tag
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      const eventWithoutMarker = {
        ...voteEvent,
        tags: voteEvent.tags.map((tag) =>
          tag[0] === 'e' ? (['e', tag[1], tag[2] ?? ''] as string[]) : tag
        ), // Remove marker
      };

      // Act & Assert
      expect(() => voteParser.parse(eventWithoutMarker, proposal)).toThrow(InvalidVoteError);
      expect(() => voteParser.parse(eventWithoutMarker, proposal)).toThrow(
        'Vote event must include an e tag with "proposal" marker'
      );
    });

    it('should accept vote with correct e tag and proposal marker', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      // Act & Assert
      expect(() => voteParser.parse(voteEvent, proposal)).not.toThrow();
    });

    it('should reject vote with wrong proposal ID in d tag', () => {
      // Arrange: Create vote with wrong proposal ID
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      const wrongProposalId = 'wrong-proposal-id';
      const eventWithWrongDTag = {
        ...voteEvent,
        tags: voteEvent.tags.map((tag) => (tag[0] === 'd' ? ['d', wrongProposalId] : tag)),
      };

      // Act & Assert
      expect(() => voteParser.parse(eventWithWrongDTag, proposal)).toThrow(ProposalMismatchError);
      expect(() => voteParser.parse(eventWithWrongDTag, proposal)).toThrow(
        `Vote d tag "${wrongProposalId}" does not match proposal ID "${proposal.id}"`
      );
    });
  });

  describe('Required tag validation', () => {
    it('should reject vote missing d tag', () => {
      // Arrange: Create vote and remove d tag
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      const eventWithoutDTag = {
        ...voteEvent,
        tags: voteEvent.tags.filter((tag) => tag[0] !== 'd'),
      };

      // Act & Assert
      expect(() => voteParser.parse(eventWithoutDTag, proposal)).toThrow(InvalidVoteError);
      expect(() => voteParser.parse(eventWithoutDTag, proposal)).toThrow(
        'Vote event missing required "d" tag'
      );
    });

    it('should reject vote missing vote tag', () => {
      // Arrange: Create vote and remove vote tag
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      const eventWithoutVoteTag = {
        ...voteEvent,
        tags: voteEvent.tags.filter((tag) => tag[0] !== 'vote'),
      };

      // Act & Assert
      expect(() => voteParser.parse(eventWithoutVoteTag, proposal)).toThrow(InvalidVoteError);
      expect(() => voteParser.parse(eventWithoutVoteTag, proposal)).toThrow(
        'Vote event missing required "vote" tag'
      );
    });
  });

  describe('Optional field parsing', () => {
    it('should return undefined for missing reason', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert
      expect(vote.reason).toBeUndefined();
    });

    it('should return undefined for missing rank', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert
      expect(vote.rank).toBeUndefined();
    });

    it('should parse rank array with valid numbers', () => {
      // Arrange
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
        rank: [1, 5, 10, 100],
      });

      // Act
      const vote = voteParser.parse(voteEvent, proposal);

      // Assert
      expect(vote.rank).toEqual([1, 5, 10, 100]);
    });

    it('should reject invalid rank values (non-numeric strings)', () => {
      // Arrange: Create vote and manually add invalid rank values
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      const eventWithInvalidRank = {
        ...voteEvent,
        tags: [...voteEvent.tags, ['rank', 'first', 'second', 'third']],
      };

      // Act & Assert
      expect(() => voteParser.parse(eventWithInvalidRank, proposal)).toThrow(InvalidVoteError);
      expect(() => voteParser.parse(eventWithInvalidRank, proposal)).toThrow(
        'Invalid rank value: "first". All rank values must be numbers'
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle multiple e tags and use the one with proposal marker', () => {
      // Arrange: Create vote with multiple e tags
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      const eventWithMultipleETags = {
        ...voteEvent,
        tags: [
          ['e', 'some-other-event-id', '', 'reply'], // Different marker
          ...voteEvent.tags,
        ],
      };

      // Act
      const vote = voteParser.parse(eventWithMultipleETags, proposal);

      // Assert
      expect(vote.proposalEventId).toBe(proposal.event.id);
    });

    it('should reject vote with multiple e tags with proposal marker', () => {
      // Arrange: Create vote with duplicate proposal e tags
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      const proposalETag = voteEvent.tags.find((tag) => tag[0] === 'e' && tag[3] === 'proposal');
      const eventWithDuplicateProposalETags = {
        ...voteEvent,
        tags: [...voteEvent.tags, proposalETag!],
      };

      // Act & Assert
      expect(() => voteParser.parse(eventWithDuplicateProposalETags, proposal)).toThrow(
        InvalidVoteError
      );
      expect(() => voteParser.parse(eventWithDuplicateProposalETags, proposal)).toThrow(
        'Vote event must have exactly one e tag with "proposal" marker'
      );
    });

    it('should reject malformed e tag (missing elements)', () => {
      // Arrange: Create vote with malformed e tag
      const voteEvent = voteCreator.create({
        proposal,
        vote: 'approve',
      });

      const eventWithMalformedETag = {
        ...voteEvent,
        tags: voteEvent.tags.map((tag) => (tag[0] === 'e' ? (['e', tag[1]] as string[]) : tag)), // Only 2 elements
      };

      // Act & Assert
      expect(() => voteParser.parse(eventWithMalformedETag, proposal)).toThrow(InvalidVoteError);
      expect(() => voteParser.parse(eventWithMalformedETag, proposal)).toThrow(
        'Vote event must include an e tag with "proposal" marker'
      );
    });
  });
});
