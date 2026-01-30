import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { ThresholdConsensus } from './threshold-consensus';
import { ProposalCreator } from './proposal';
import { VoteCreator } from './vote';
import { Vote, UnsupportedCoordinationTypeError, CoordinationType } from './types';

describe('ThresholdConsensus', () => {
  let consensus: ThresholdConsensus;
  let proposalCreator: ProposalCreator;
  let coordinatorPrivateKeyHex: string;
  let voter1PrivateKeyHex: string;
  let voter2PrivateKeyHex: string;
  let voter3PrivateKeyHex: string;
  let voter1Pubkey: string;
  let voter2Pubkey: string;
  let voter3Pubkey: string;

  beforeEach(() => {
    consensus = new ThresholdConsensus();

    // Generate coordinator key
    const coordinatorPrivateKey = generateSecretKey();
    coordinatorPrivateKeyHex = bytesToHex(coordinatorPrivateKey);
    proposalCreator = new ProposalCreator(coordinatorPrivateKeyHex);

    // Generate voter keys
    const voter1PrivateKey = generateSecretKey();
    voter1PrivateKeyHex = bytesToHex(voter1PrivateKey);
    voter1Pubkey = getPublicKey(voter1PrivateKey);

    const voter2PrivateKey = generateSecretKey();
    voter2PrivateKeyHex = bytesToHex(voter2PrivateKey);
    voter2Pubkey = getPublicKey(voter2PrivateKey);

    const voter3PrivateKey = generateSecretKey();
    voter3PrivateKeyHex = bytesToHex(voter3PrivateKey);
    voter3Pubkey = getPublicKey(voter3PrivateKey);
  });

  describe('Consensus Type', () => {
    it('should approve when all participants approve', () => {
      // Arrange: Create proposal with 2 participants
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voter1Pubkey, voter2Pubkey],
        expiresIn: 3600,
        description: 'Test consensus',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // Create votes from both participants (approve)
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'approve' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const votes = new Map<string, Vote>([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
      ]);

      // Act: Evaluate consensus
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be approved
      expect(outcome).toBe('approved');
    });

    it('should reject when one participant rejects', () => {
      // Arrange: Create proposal with 2 participants
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voter1Pubkey, voter2Pubkey],
        expiresIn: 3600,
        description: 'Test consensus',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // One approve, one reject
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'reject' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const votes = new Map<string, Vote>([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
      ]);

      // Act: Evaluate consensus
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be rejected
      expect(outcome).toBe('rejected');
    });

    it('should return pending when not all voted and not expired', () => {
      // Arrange: Create proposal with 2 participants
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voter1Pubkey, voter2Pubkey],
        expiresIn: 3600,
        description: 'Test consensus',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // Only one vote
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map<string, Vote>([[voter1Pubkey, vote1]]);

      // Act: Evaluate consensus
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be pending
      expect(outcome).toBe('pending');
    });

    it('should return inconclusive when expired without full consensus', () => {
      // Arrange: Create proposal and manually expire it
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voter1Pubkey, voter2Pubkey],
        expiresIn: 3600,
        description: 'Test consensus',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);
      // Manually set expires to past timestamp
      proposal.expires = Math.floor(Date.now() / 1000) - 1;

      // Only one vote
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map<string, Vote>([[voter1Pubkey, vote1]]);

      // Act: Evaluate consensus
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be inconclusive
      expect(outcome).toBe('inconclusive');
    });

    it('should return inconclusive when all voted but some abstained', () => {
      // Arrange: Create proposal with 2 participants
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voter1Pubkey, voter2Pubkey],
        expiresIn: 3600,
        description: 'Test consensus',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // One approve, one abstain
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'abstain' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const votes = new Map<string, Vote>([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
      ]);

      // Act: Evaluate consensus
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be inconclusive
      expect(outcome).toBe('inconclusive');
    });
  });

  describe('Majority Type', () => {
    it('should approve when >50% approve (2 of 3)', () => {
      // Arrange: Create proposal with 3 participants
      const proposalEvent = proposalCreator.create({
        type: 'majority',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        expiresIn: 3600,
        description: 'Test majority',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // 2 approve, 1 reject
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'approve' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const voteCreator3 = new VoteCreator(voter3PrivateKeyHex);
      const vote3Event = voteCreator3.create({ proposal, vote: 'reject' });
      const vote3 = voteCreator3.toVote(vote3Event);

      const votes = new Map<string, Vote>([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
        [voter3Pubkey, vote3],
      ]);

      // Act: Evaluate majority
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be approved
      expect(outcome).toBe('approved');
    });

    it('should reject when >50% reject', () => {
      // Arrange: Create proposal with 3 participants
      const proposalEvent = proposalCreator.create({
        type: 'majority',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        expiresIn: 3600,
        description: 'Test majority',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // 1 approve, 2 reject
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'reject' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const voteCreator3 = new VoteCreator(voter3PrivateKeyHex);
      const vote3Event = voteCreator3.create({ proposal, vote: 'reject' });
      const vote3 = voteCreator3.toVote(vote3Event);

      const votes = new Map<string, Vote>([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
        [voter3Pubkey, vote3],
      ]);

      // Act: Evaluate majority
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be rejected
      expect(outcome).toBe('rejected');
    });

    it('should return inconclusive when all voted but no majority reached', () => {
      // Arrange: Create proposal with 3 participants
      const proposalEvent = proposalCreator.create({
        type: 'majority',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        expiresIn: 3600,
        description: 'Test majority',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // 1 approve, 1 reject, 1 abstain
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'reject' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const voteCreator3 = new VoteCreator(voter3PrivateKeyHex);
      const vote3Event = voteCreator3.create({ proposal, vote: 'abstain' });
      const vote3 = voteCreator3.toVote(vote3Event);

      const votes = new Map<string, Vote>([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
        [voter3Pubkey, vote3],
      ]);

      // Act: Evaluate majority
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be inconclusive
      expect(outcome).toBe('inconclusive');
    });

    it('should return pending when not all voted and not expired', () => {
      // Arrange: Create proposal with 3 participants
      const proposalEvent = proposalCreator.create({
        type: 'majority',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        expiresIn: 3600,
        description: 'Test majority',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // Only one vote
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map<string, Vote>([[voter1Pubkey, vote1]]);

      // Act: Evaluate majority
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be pending
      expect(outcome).toBe('pending');
    });

    it('should return inconclusive when expired without majority', () => {
      // Arrange: Create proposal and manually expire it
      const proposalEvent = proposalCreator.create({
        type: 'majority',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        expiresIn: 3600,
        description: 'Test majority',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);
      // Manually set expires to past timestamp
      proposal.expires = Math.floor(Date.now() / 1000) - 1;

      // Only one vote
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map<string, Vote>([[voter1Pubkey, vote1]]);

      // Act: Evaluate majority
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be inconclusive
      expect(outcome).toBe('inconclusive');
    });
  });

  describe('Threshold Type', () => {
    it('should approve when threshold reached', () => {
      // Arrange: Create proposal with custom threshold (2 of 3)
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 2,
        expiresIn: 3600,
        description: 'Test threshold',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // 2 approve
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'approve' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const votes = new Map<string, Vote>([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
      ]);

      // Act: Evaluate threshold
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be approved
      expect(outcome).toBe('approved');
    });

    it('should reject when impossible to reach threshold', () => {
      // Arrange: Create proposal with threshold 3 of 3
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 3,
        expiresIn: 3600,
        description: 'Test threshold',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // 1 approve, 2 reject (can't reach 3)
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'reject' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const votes = new Map<string, Vote>([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
      ]);

      // Act: Evaluate threshold
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be rejected (1 approve + 1 remaining < 3)
      expect(outcome).toBe('rejected');
    });

    it('should return pending when threshold possible but not reached', () => {
      // Arrange: Create proposal with threshold 2 of 3
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 2,
        expiresIn: 3600,
        description: 'Test threshold',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // 1 approve (can still reach 2)
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map<string, Vote>([[voter1Pubkey, vote1]]);

      // Act: Evaluate threshold
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be pending (1 approve + 2 remaining >= 2)
      expect(outcome).toBe('pending');
    });

    it('should use custom threshold value when specified', () => {
      // Arrange: Create proposal with custom threshold 1 of 3
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 1,
        expiresIn: 3600,
        description: 'Test threshold',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // 1 approve (reaches threshold)
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map<string, Vote>([[voter1Pubkey, vote1]]);

      // Act: Evaluate threshold
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be approved with threshold 1
      expect(outcome).toBe('approved');
    });

    it('should default to majority threshold when threshold not specified', () => {
      // Arrange: Create proposal without threshold (should default to majority = 2)
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        expiresIn: 3600,
        description: 'Test threshold',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // 2 approve (reaches default majority)
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'approve' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const votes = new Map<string, Vote>([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
      ]);

      // Act: Evaluate threshold
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be approved with default threshold
      expect(outcome).toBe('approved');
    });
  });

  describe('Quorum Requirements', () => {
    it('should evaluate normally when quorum met', () => {
      // Arrange: Create proposal with quorum 2
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        quorum: 2,
        expiresIn: 3600,
        description: 'Test quorum',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // 3 votes (quorum met) - all approve
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'approve' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const voteCreator3 = new VoteCreator(voter3PrivateKeyHex);
      const vote3Event = voteCreator3.create({ proposal, vote: 'approve' });
      const vote3 = voteCreator3.toVote(vote3Event);

      const votes = new Map<string, Vote>([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
        [voter3Pubkey, vote3],
      ]);

      // Act: Evaluate with quorum
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be approved (quorum met, consensus reached)
      expect(outcome).toBe('approved');
    });

    it('should return pending when quorum not met and not expired', () => {
      // Arrange: Create proposal with quorum 2
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        quorum: 2,
        expiresIn: 3600,
        description: 'Test quorum',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // Only 1 vote (quorum not met)
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map<string, Vote>([[voter1Pubkey, vote1]]);

      // Act: Evaluate with quorum
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be pending (quorum not met)
      expect(outcome).toBe('pending');
    });

    it('should return inconclusive when quorum not met and expired', () => {
      // Arrange: Create proposal and manually expire it
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        quorum: 2,
        expiresIn: 3600,
        description: 'Test quorum',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);
      // Manually set expires to past timestamp
      proposal.expires = Math.floor(Date.now() / 1000) - 1;

      // Only 1 vote (quorum not met)
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map<string, Vote>([[voter1Pubkey, vote1]]);

      // Act: Evaluate with quorum
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be inconclusive (quorum failed)
      expect(outcome).toBe('inconclusive');
    });

    it('should evaluate normally when no quorum requirement', () => {
      // Arrange: Create proposal without quorum
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voter1Pubkey, voter2Pubkey],
        expiresIn: 3600,
        description: 'Test no quorum',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // All votes approve
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'approve' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const votes = new Map<string, Vote>([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
      ]);

      // Act: Evaluate without quorum
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be approved (no quorum check)
      expect(outcome).toBe('approved');
    });
  });

  describe('Edge Cases', () => {
    it('should return pending for empty votes map', () => {
      // Arrange: Create proposal
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voter1Pubkey, voter2Pubkey],
        expiresIn: 3600,
        description: 'Test empty votes',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      const votes = new Map<string, Vote>();

      // Act: Evaluate with no votes
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be pending
      expect(outcome).toBe('pending');
    });

    it('should return inconclusive for expired proposal with no votes', () => {
      // Arrange: Create proposal and manually expire it
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voter1Pubkey, voter2Pubkey],
        expiresIn: 3600,
        description: 'Test expired no votes',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);
      // Manually set expires to past timestamp
      proposal.expires = Math.floor(Date.now() / 1000) - 1;

      const votes = new Map<string, Vote>();

      // Act: Evaluate expired with no votes
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be inconclusive
      expect(outcome).toBe('inconclusive');
    });

    it('should return inconclusive for expired proposal with split votes', () => {
      // Arrange: Create proposal and manually expire it
      const proposalEvent = proposalCreator.create({
        type: 'majority',
        participants: [voter1Pubkey, voter2Pubkey],
        expiresIn: 3600,
        description: 'Test expired split votes',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);
      // Manually set expires to past timestamp
      proposal.expires = Math.floor(Date.now() / 1000) - 1;

      // 1 approve, 1 reject (no majority)
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'reject' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const votes = new Map<string, Vote>([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
      ]);

      // Act: Evaluate expired split votes
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be inconclusive
      expect(outcome).toBe('inconclusive');
    });

    it('should handle all participants abstaining (consensus)', () => {
      // Arrange: Create proposal
      const proposalEvent = proposalCreator.create({
        type: 'consensus',
        participants: [voter1Pubkey, voter2Pubkey],
        expiresIn: 3600,
        description: 'Test all abstain',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // All abstain
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'abstain' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'abstain' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const votes = new Map<string, Vote>([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
      ]);

      // Act: Evaluate all abstain
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be inconclusive (all voted but not all approved)
      expect(outcome).toBe('inconclusive');
    });

    it('should handle all participants abstaining (majority)', () => {
      // Arrange: Create proposal
      const proposalEvent = proposalCreator.create({
        type: 'majority',
        participants: [voter1Pubkey, voter2Pubkey],
        expiresIn: 3600,
        description: 'Test all abstain majority',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // All abstain
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'abstain' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'abstain' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const votes = new Map<string, Vote>([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
      ]);

      // Act: Evaluate all abstain
      const outcome = consensus.evaluate(proposal, votes);

      // Assert: Should be inconclusive (all voted but no majority)
      expect(outcome).toBe('inconclusive');
    });
  });

  describe('Unsupported Coordination Types', () => {
    it('should throw UnsupportedCoordinationTypeError for ranked type', () => {
      // Arrange: Create proposal with ranked type
      const proposalEvent = proposalCreator.create({
        type: 'ranked' as CoordinationType,
        participants: [voter1Pubkey, voter2Pubkey],
        expiresIn: 3600,
        description: 'Test ranked',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      const votes = new Map<string, Vote>();

      // Act & Assert: Should throw error
      expect(() => consensus.evaluate(proposal, votes)).toThrow(UnsupportedCoordinationTypeError);
      expect(() => consensus.evaluate(proposal, votes)).toThrow(
        'Unsupported coordination type: ranked'
      );
    });

    it('should throw UnsupportedCoordinationTypeError for allocation type', () => {
      // Arrange: Create proposal with allocation type
      const proposalEvent = proposalCreator.create({
        type: 'allocation' as CoordinationType,
        participants: [voter1Pubkey, voter2Pubkey],
        expiresIn: 3600,
        description: 'Test allocation',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      const votes = new Map<string, Vote>();

      // Act & Assert: Should throw error
      expect(() => consensus.evaluate(proposal, votes)).toThrow(UnsupportedCoordinationTypeError);
      expect(() => consensus.evaluate(proposal, votes)).toThrow(
        'Unsupported coordination type: allocation'
      );
    });
  });
});
