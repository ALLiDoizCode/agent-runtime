import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { Logger } from 'pino';
import { WeightedVoting } from './weighted-voting';
import { ProposalCreator } from './proposal';
import { VoteCreator } from './vote';
import { Vote } from './types';

describe('WeightedVoting', () => {
  let weightedVoting: WeightedVoting;
  let proposalCreator: ProposalCreator;
  let mockLogger: {
    debug: jest.Mock;
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };
  let coordinatorPrivateKeyHex: string;
  let voter1PrivateKeyHex: string;
  let voter2PrivateKeyHex: string;
  let voter3PrivateKeyHex: string;
  let voter1Pubkey: string;
  let voter2Pubkey: string;
  let voter3Pubkey: string;
  let voter4Pubkey: string;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    weightedVoting = new WeightedVoting(mockLogger as unknown as Logger);

    // Generate coordinator key
    const coordinatorPrivateKey = generateSecretKey();
    coordinatorPrivateKeyHex = bytesToHex(coordinatorPrivateKey);
    proposalCreator = new ProposalCreator(coordinatorPrivateKeyHex, 'g.test.agent');

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

    const voter4PrivateKey = generateSecretKey();
    voter4Pubkey = getPublicKey(voter4PrivateKey);
  });

  describe('Weighted Voting with Equal Weights', () => {
    it('should behave same as unweighted when all weights are 1', () => {
      // Arrange: Create proposal with equal weights (all 1)
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 2, // 2 of 3
        expiresIn: 3600,
        description: 'Test equal weights',
        weights: {
          [voter1Pubkey]: 1,
          [voter2Pubkey]: 1,
          [voter3Pubkey]: 1,
        },
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // Create two approve votes
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

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      expect(result.outcome).toBe('approved'); // 2 weights >= 2 threshold (2/3 * 3 = 2)
      expect(result.weighted.approve).toBe(2);
      expect(result.weighted.reject).toBe(0);
      expect(result.weighted.abstain).toBe(0);
    });
  });

  describe('Weighted Voting with Different Weights', () => {
    it('should approve with higher weight participant voting approve', () => {
      // Arrange: Create proposal with different weights
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey],
        threshold: 1, // 1 of 2 (50%)
        expiresIn: 3600,
        description: 'Test weighted voting',
        weights: {
          [voter1Pubkey]: 10, // Higher weight
          [voter2Pubkey]: 1, // Lower weight
        },
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // Create vote from high-weight participant
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map([[voter1Pubkey, vote1]]);

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      // Total weight: 11, threshold: (1/2) * 11 = 5.5
      // Approve weight: 10 >= 5.5 → approved
      expect(result.outcome).toBe('approved');
      expect(result.weighted.approve).toBe(10);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          weightedTally: expect.objectContaining({ approve: 10 }),
          totalWeight: 11,
        }),
        expect.any(String)
      );
    });

    it('should reject with higher reject weight', () => {
      // Arrange: Create proposal where high weight voter rejects
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 2, // 2 of 3 (66.67%)
        expiresIn: 3600,
        description: 'Test weighted reject',
        weights: {
          [voter1Pubkey]: 10,
          [voter2Pubkey]: 1,
          [voter3Pubkey]: 1,
        },
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // High weight voter rejects
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'reject' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map([[voter1Pubkey, vote1]]);

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      // Total weight: 12, threshold: (2/3) * 12 = 8
      // Reject weight: 10 > 12 - 8 = 4 → approval impossible → rejected
      expect(result.outcome).toBe('rejected');
      expect(result.weighted.reject).toBe(10);
    });
  });

  describe('Weighted Threshold Calculation', () => {
    it('should calculate threshold as (threshold / participants) * totalWeight', () => {
      // Arrange: 2 of 4 participants, custom weights
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey, voter4Pubkey],
        threshold: 2, // 2 of 4 (50%)
        expiresIn: 3600,
        description: 'Test threshold calculation',
        weights: {
          [voter1Pubkey]: 25,
          [voter2Pubkey]: 25,
          [voter3Pubkey]: 25,
          [voter4Pubkey]: 25,
        },
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // Two voters approve (50% of weight)
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'approve' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const votes = new Map([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
      ]);

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      // Total weight: 100, threshold: (2/4) * 100 = 50
      // Approve weight: 50 >= 50 → approved
      expect(result.outcome).toBe('approved');
      expect(result.weighted.approve).toBe(50);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          threshold: 50,
          totalWeight: 100,
        }),
        expect.any(String)
      );
    });

    it('should use majority (totalWeight / 2 + 1) when threshold undefined', () => {
      // Arrange: No threshold defined
      const proposalEvent = proposalCreator.create({
        type: 'majority',
        participants: [voter1Pubkey, voter2Pubkey],
        expiresIn: 3600,
        description: 'Test majority threshold',
        weights: {
          [voter1Pubkey]: 50,
          [voter2Pubkey]: 50,
        },
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // One voter approves (50 weight)
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map([[voter1Pubkey, vote1]]);

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      // Total weight: 100, threshold: 100 / 2 + 1 = 51
      // Approve weight: 50 < 51 → pending (not approved yet)
      expect(result.outcome).toBe('pending');
    });
  });

  describe('Weighted Threshold Reached', () => {
    it('should approve when weighted threshold reached', () => {
      // Arrange
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 2, // 2 of 3 (66.67%)
        expiresIn: 3600,
        description: 'Test threshold reached',
        weights: {
          [voter1Pubkey]: 5,
          [voter2Pubkey]: 3,
          [voter3Pubkey]: 2,
        },
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // Voter1 and Voter2 approve (weight 5 + 3 = 8)
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'approve' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const votes = new Map([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
      ]);

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      // Total weight: 10, threshold: (2/3) * 10 = 6.67
      // Approve weight: 8 >= 6.67 → approved
      expect(result.outcome).toBe('approved');
      expect(result.weighted.approve).toBe(8);
    });

    it('should reject when approval impossible due to high reject weight', () => {
      // Arrange
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 2, // 2 of 3 (66.67%)
        expiresIn: 3600,
        description: 'Test approval impossible',
        weights: {
          [voter1Pubkey]: 6,
          [voter2Pubkey]: 2,
          [voter3Pubkey]: 2,
        },
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // Voter1 rejects (weight 6)
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'reject' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map([[voter1Pubkey, vote1]]);

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      // Total weight: 10, threshold: (2/3) * 10 = 6.67
      // Reject weight: 6 > 10 - 6.67 = 3.33 → approval impossible → rejected
      expect(result.outcome).toBe('rejected');
      expect(result.weighted.reject).toBe(6);
    });
  });

  describe('All Voted but No Threshold', () => {
    it('should return inconclusive when all voted but no threshold reached', () => {
      // Arrange
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 3, // 3 of 3 (100%) - requires all
        expiresIn: 3600,
        description: 'Test all voted no threshold',
        weights: {
          [voter1Pubkey]: 1,
          [voter2Pubkey]: 1,
          [voter3Pubkey]: 1,
        },
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // All vote but not all approve
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'approve' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const voteCreator3 = new VoteCreator(voter3PrivateKeyHex);
      const vote3Event = voteCreator3.create({ proposal, vote: 'abstain' });
      const vote3 = voteCreator3.toVote(vote3Event);

      const votes = new Map([
        [voter1Pubkey, vote1],
        [voter2Pubkey, vote2],
        [voter3Pubkey, vote3],
      ]);

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      // All voted but approve weight (2) < threshold (3)
      expect(result.outcome).toBe('inconclusive');
    });
  });

  describe('Missing Weights Default to 1', () => {
    it('should default to weight 1 when weights undefined', () => {
      // Arrange: No weights defined
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey],
        threshold: 1, // 1 of 2
        expiresIn: 3600,
        description: 'Test no weights',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // One voter approves
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map([[voter1Pubkey, vote1]]);

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      // Total weight: 2 (both default to 1), threshold: (1/2) * 2 = 1
      // Approve weight: 1 >= 1 → approved
      expect(result.outcome).toBe('approved');
      expect(result.weighted.approve).toBe(1);
    });

    it('should default to weight 1 for participant not in weights map', () => {
      // Arrange: Weights defined for some but not all participants
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 2, // 2 of 3
        expiresIn: 3600,
        description: 'Test partial weights',
        weights: {
          [voter1Pubkey]: 5,
          // voter2Pubkey missing - should default to 1
          [voter3Pubkey]: 4,
        },
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // Voter2 (missing weight) approves
      const voteCreator2 = new VoteCreator(voter2PrivateKeyHex);
      const vote2Event = voteCreator2.create({ proposal, vote: 'approve' });
      const vote2 = voteCreator2.toVote(vote2Event);

      const votes = new Map([[voter2Pubkey, vote2]]);

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      // Total weight: 5 + 1 + 4 = 10, threshold: (2/3) * 10 = 6.67
      // Approve weight: 1 < 6.67 → pending
      expect(result.outcome).toBe('pending');
      expect(result.weighted.approve).toBe(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          pubkey: voter2Pubkey,
        }),
        expect.stringContaining('missing from weight map')
      );
    });
  });

  describe('Empty Votes Map', () => {
    it('should return pending when no votes yet', () => {
      // Arrange
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey],
        threshold: 1,
        expiresIn: 3600,
        description: 'Test empty votes',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      const votes = new Map<string, Vote>();

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      expect(result.outcome).toBe('pending');
      expect(result.weighted.approve).toBe(0);
      expect(result.weighted.reject).toBe(0);
      expect(result.weighted.abstain).toBe(0);
    });
  });

  describe('Partial Votes (Not All Voted)', () => {
    it('should return pending when not all voted and not expired', () => {
      // Arrange
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 2,
        expiresIn: 3600,
        description: 'Test partial votes',
        weights: {
          [voter1Pubkey]: 1,
          [voter2Pubkey]: 1,
          [voter3Pubkey]: 1,
        },
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      // Only one voter votes
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map([[voter1Pubkey, vote1]]);

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      expect(result.outcome).toBe('pending');
    });
  });

  describe('Expired Proposal', () => {
    it('should return inconclusive when expired without threshold', () => {
      // Arrange: Create expired proposal
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey],
        threshold: 2, // Requires both
        expiresIn: 3600,
        description: 'Test expired',
      });
      const proposal = proposalCreator.toProposal(proposalEvent);
      // Manually expire the proposal
      proposal.expires = Math.floor(Date.now() / 1000) - 1;

      // Only one vote
      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map([[voter1Pubkey, vote1]]);

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      expect(result.outcome).toBe('inconclusive');
    });
  });

  describe('Logger Verification', () => {
    it('should log weighted tally with correct structure', () => {
      // Arrange
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey],
        threshold: 1,
        expiresIn: 3600,
        description: 'Test logging',
        weights: {
          [voter1Pubkey]: 3,
          [voter2Pubkey]: 2,
        },
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map([[voter1Pubkey, vote1]]);

      // Act
      weightedVoting.evaluate(proposal, votes);

      // Assert
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: proposal.id,
          weightedTally: {
            approve: 3,
            reject: 0,
            abstain: 0,
          },
          totalWeight: 5,
          threshold: 2.5, // (1/2) * 5
        }),
        'Weighted voting evaluation'
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: proposal.id,
          outcome: 'approved',
        }),
        'Weighted voting evaluation completed'
      );
    });
  });

  describe('Zero or Negative Weights', () => {
    it('should warn and default to 1 for zero weight', () => {
      // Arrange
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey],
        threshold: 1,
        expiresIn: 3600,
        description: 'Test zero weight',
        weights: {
          [voter1Pubkey]: 0, // Zero weight
          [voter2Pubkey]: 1,
        },
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map([[voter1Pubkey, vote1]]);

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          pubkey: voter1Pubkey,
          weight: 0,
        }),
        expect.stringContaining('zero or negative weight')
      );
      // Weight should default to 1
      expect(result.weighted.approve).toBe(1);
    });

    it('should warn and default to 1 for negative weight', () => {
      // Arrange
      const proposalEvent = proposalCreator.create({
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey],
        threshold: 1,
        expiresIn: 3600,
        description: 'Test negative weight',
        weights: {
          [voter1Pubkey]: -5, // Negative weight
          [voter2Pubkey]: 1,
        },
      });
      const proposal = proposalCreator.toProposal(proposalEvent);

      const voteCreator1 = new VoteCreator(voter1PrivateKeyHex);
      const vote1Event = voteCreator1.create({ proposal, vote: 'approve' });
      const vote1 = voteCreator1.toVote(vote1Event);

      const votes = new Map([[voter1Pubkey, vote1]]);

      // Act
      const result = weightedVoting.evaluate(proposal, votes);

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          pubkey: voter1Pubkey,
          weight: -5,
        }),
        expect.stringContaining('zero or negative weight')
      );
      // Weight should default to 1
      expect(result.weighted.approve).toBe(1);
    });
  });
});
