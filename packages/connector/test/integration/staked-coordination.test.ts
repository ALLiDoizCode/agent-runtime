/**
 * Integration tests for staked coordination flow
 *
 * Tests the full coordination workflow with stake requirements:
 * - Create staked proposal via ProposalCreator
 * - Parse proposal with ProposalParser
 * - Aggregate results with EscrowCoordinator integration
 */

import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import pino from 'pino';
import {
  ProposalCreator,
  ProposalParser,
  ResultAggregator,
  EscrowCoordinator,
  VoteCreator,
  CreateProposalParams,
  CreateVoteParams,
  Vote,
  TAG_STAKE,
} from '../../src/agent/coordination';

// Test logger (silent for tests)
const testLogger = pino({ level: 'silent' });

// Generate test keypairs
const coordinatorSecretKey = generateSecretKey();
const coordinatorPrivateKeyHex = bytesToHex(coordinatorSecretKey);

const participant1SecretKey = generateSecretKey();
const participant1PrivateKeyHex = bytesToHex(participant1SecretKey);
const participant1Pubkey = getPublicKey(participant1SecretKey);

const participant2SecretKey = generateSecretKey();
const participant2PrivateKeyHex = bytesToHex(participant2SecretKey);
const participant2Pubkey = getPublicKey(participant2SecretKey);

const participant3SecretKey = generateSecretKey();
const participant3Pubkey = getPublicKey(participant3SecretKey);

// Test ILP address
const testIlpAddress = 'g.coordinator.agent';

describe('Staked Coordination Integration', () => {
  let proposalCreator: ProposalCreator;
  let proposalParser: ProposalParser;
  let escrowCoordinator: EscrowCoordinator;
  let resultAggregator: ResultAggregator;

  beforeEach(() => {
    // Initialize components
    proposalCreator = new ProposalCreator(coordinatorPrivateKeyHex, testIlpAddress);
    proposalParser = new ProposalParser();
    escrowCoordinator = new EscrowCoordinator({
      ilpAddress: testIlpAddress,
      logger: testLogger,
    });
    resultAggregator = new ResultAggregator(
      coordinatorPrivateKeyHex,
      testLogger,
      escrowCoordinator
    );
  });

  describe('Staked Proposal Creation and Parsing', () => {
    it('should create proposal with stake tag when stakeRequired is defined', () => {
      // Arrange
      const params: CreateProposalParams = {
        type: 'consensus',
        participants: [participant1Pubkey, participant2Pubkey, participant3Pubkey],
        description: 'Test staked proposal',
        expiresIn: 3600,
        stakeRequired: 1000n,
      };

      // Act
      const proposalEvent = proposalCreator.create(params);

      // Assert
      const stakeTag = proposalEvent.tags.find((t) => t[0] === TAG_STAKE);
      expect(stakeTag).toBeDefined();
      expect(stakeTag?.[1]).toBe('1000');
    });

    it('should include escrow address in proposal content when stakeRequired is defined', () => {
      // Arrange
      const params: CreateProposalParams = {
        type: 'majority',
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test staked proposal',
        expiresIn: 3600,
        stakeRequired: 500n,
      };

      // Act
      const proposalEvent = proposalCreator.create(params);

      // Assert
      expect(proposalEvent.content).toContain('Escrow Address:');
      expect(proposalEvent.content).toContain('.escrow.');
    });

    it('should parse stakeRequired from proposal event', () => {
      // Arrange
      const params: CreateProposalParams = {
        type: 'threshold',
        participants: [participant1Pubkey, participant2Pubkey, participant3Pubkey],
        threshold: 2,
        description: 'Test staked proposal',
        expiresIn: 3600,
        stakeRequired: 2000n,
      };
      const proposalEvent = proposalCreator.create(params);

      // Act
      const proposal = proposalParser.parse(proposalEvent);

      // Assert
      expect(proposal.stakeRequired).toBe(2000n);
    });

    it('should extract escrow address from proposal content', () => {
      // Arrange
      const params: CreateProposalParams = {
        type: 'consensus',
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test staked proposal',
        expiresIn: 3600,
        stakeRequired: 1500n,
      };
      const proposalEvent = proposalCreator.create(params);

      // Act
      const proposal = proposalParser.parse(proposalEvent);

      // Assert
      expect(proposal.escrowAddress).toBeDefined();
      expect(proposal.escrowAddress).toMatch(/^g\.coordinator\.agent\.escrow\./);
    });

    it('should initialize empty stakes Map for staked proposals', () => {
      // Arrange
      const params: CreateProposalParams = {
        type: 'consensus',
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test staked proposal',
        expiresIn: 3600,
        stakeRequired: 1000n,
      };
      const proposalEvent = proposalCreator.create(params);

      // Act
      const proposal = proposalParser.parse(proposalEvent);

      // Assert
      expect(proposal.stakes).toBeInstanceOf(Map);
      expect(proposal.stakes?.size).toBe(0);
    });

    it('should not set stake fields for non-staked proposals', () => {
      // Arrange
      const params: CreateProposalParams = {
        type: 'consensus',
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test non-staked proposal',
        expiresIn: 3600,
        // stakeRequired intentionally omitted
      };
      const proposalEvent = proposalCreator.create(params);

      // Act
      const proposal = proposalParser.parse(proposalEvent);

      // Assert
      expect(proposal.stakeRequired).toBeUndefined();
      expect(proposal.escrowAddress).toBeUndefined();
      expect(proposal.stakes).toBeUndefined();
    });
  });

  describe('Escrow Resolution with Approved Outcome', () => {
    it('should trigger escrow release when proposal is approved', async () => {
      // Arrange
      const params: CreateProposalParams = {
        type: 'consensus',
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test staked proposal',
        expiresIn: 3600,
        stakeRequired: 1000n,
      };
      const proposalEvent = proposalCreator.create(params);
      const proposal = proposalParser.parse(proposalEvent);

      // Add stakes to proposal (simulating participants staking)
      proposal.stakes?.set(participant1Pubkey, 1000n);
      proposal.stakes?.set(participant2Pubkey, 1000n);

      // Create votes (all approve)
      const vote1Creator = new VoteCreator(participant1PrivateKeyHex);
      const vote2Creator = new VoteCreator(participant2PrivateKeyHex);

      const voteParams1: CreateVoteParams = {
        proposal,
        vote: 'approve',
      };
      const voteParams2: CreateVoteParams = {
        proposal,
        vote: 'approve',
      };

      const vote1Event = vote1Creator.create(voteParams1);
      const vote2Event = vote2Creator.create(voteParams2);

      const votes = new Map<string, Vote>([
        [participant1Pubkey, vote1Creator.toVote(vote1Event)],
        [participant2Pubkey, vote2Creator.toVote(vote2Event)],
      ]);

      // Mock logger to capture logs
      const logSpy = jest.spyOn(testLogger, 'info');

      // Act
      const result = await resultAggregator.createResultWithAction(proposal, votes, 'approved');

      // Assert
      expect(result.outcome).toBe('approved');
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: proposal.id,
          outcome: 'approved',
        }),
        expect.stringContaining('Triggering escrow resolution')
      );
      expect(proposal.stakes?.size).toBe(0); // Stakes cleared after resolution
    });
  });

  describe('Escrow Resolution with Rejected Outcome', () => {
    it('should trigger escrow refund when proposal is rejected', async () => {
      // Arrange
      const params: CreateProposalParams = {
        type: 'consensus',
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test staked proposal',
        expiresIn: 3600,
        stakeRequired: 1000n,
      };
      const proposalEvent = proposalCreator.create(params);
      const proposal = proposalParser.parse(proposalEvent);

      // Add stakes to proposal
      proposal.stakes?.set(participant1Pubkey, 1000n);
      proposal.stakes?.set(participant2Pubkey, 1000n);

      // Create votes (one approves, one rejects)
      const vote1Creator = new VoteCreator(participant1PrivateKeyHex);
      const vote2Creator = new VoteCreator(participant2PrivateKeyHex);

      const voteParams1: CreateVoteParams = {
        proposal,
        vote: 'approve',
      };
      const voteParams2: CreateVoteParams = {
        proposal,
        vote: 'reject',
      };

      const vote1Event = vote1Creator.create(voteParams1);
      const vote2Event = vote2Creator.create(voteParams2);

      const votes = new Map<string, Vote>([
        [participant1Pubkey, vote1Creator.toVote(vote1Event)],
        [participant2Pubkey, vote2Creator.toVote(vote2Event)],
      ]);

      // Mock logger to capture logs
      const logSpy = jest.spyOn(testLogger, 'info');

      // Act
      const result = await resultAggregator.createResultWithAction(proposal, votes, 'rejected');

      // Assert
      expect(result.outcome).toBe('rejected');
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: proposal.id,
          outcome: 'rejected',
        }),
        expect.stringContaining('Triggering escrow resolution')
      );
      expect(proposal.stakes?.size).toBe(0); // Stakes cleared after resolution
    });
  });

  describe('Escrow Resolution with Expired Outcome', () => {
    it('should trigger escrow refund when proposal expires', async () => {
      // Arrange
      const params: CreateProposalParams = {
        type: 'threshold',
        participants: [participant1Pubkey, participant2Pubkey, participant3Pubkey],
        threshold: 2,
        description: 'Test staked proposal',
        expiresIn: 3600,
        stakeRequired: 1000n,
      };
      const proposalEvent = proposalCreator.create(params);
      const proposal = proposalParser.parse(proposalEvent);

      // Add stakes to proposal
      proposal.stakes?.set(participant1Pubkey, 1000n);

      // Create single vote (insufficient for threshold)
      const vote1Creator = new VoteCreator(participant1PrivateKeyHex);
      const voteParams1: CreateVoteParams = {
        proposal,
        vote: 'approve',
      };
      const vote1Event = vote1Creator.create(voteParams1);

      const votes = new Map<string, Vote>([[participant1Pubkey, vote1Creator.toVote(vote1Event)]]);

      // Mock logger to capture logs
      const logSpy = jest.spyOn(testLogger, 'info');

      // Act
      const result = await resultAggregator.createResultWithAction(proposal, votes, 'expired');

      // Assert
      expect(result.outcome).toBe('expired');
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: proposal.id,
          outcome: 'expired',
        }),
        expect.stringContaining('Triggering escrow resolution')
      );
      expect(proposal.stakes?.size).toBe(0); // Stakes cleared after resolution
    });
  });

  describe('Escrow Address Format Validation', () => {
    it('should generate escrow addresses with correct hierarchical format', () => {
      // Arrange
      const params: CreateProposalParams = {
        type: 'consensus',
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test staked proposal',
        expiresIn: 3600,
        stakeRequired: 1000n,
      };

      // Act
      const proposalEvent = proposalCreator.create(params);
      const proposal = proposalParser.parse(proposalEvent);

      // Assert
      expect(proposal.escrowAddress).toMatch(/^g\.coordinator\.agent\.escrow\.[a-f0-9]+$/);
    });

    it('should generate unique escrow addresses for different proposals', () => {
      // Arrange
      const params1: CreateProposalParams = {
        type: 'consensus',
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test staked proposal 1',
        expiresIn: 3600,
        stakeRequired: 1000n,
      };
      const params2: CreateProposalParams = {
        type: 'consensus',
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test staked proposal 2',
        expiresIn: 3600,
        stakeRequired: 1000n,
      };

      // Act
      const proposalEvent1 = proposalCreator.create(params1);
      const proposalEvent2 = proposalCreator.create(params2);
      const proposal1 = proposalParser.parse(proposalEvent1);
      const proposal2 = proposalParser.parse(proposalEvent2);

      // Assert
      expect(proposal1.escrowAddress).not.toBe(proposal2.escrowAddress);
    });
  });

  describe('Non-Staked Proposal Flow', () => {
    it('should not trigger escrow resolution for non-staked proposals', async () => {
      // Arrange
      const params: CreateProposalParams = {
        type: 'consensus',
        participants: [participant1Pubkey, participant2Pubkey],
        description: 'Test non-staked proposal',
        expiresIn: 3600,
        // stakeRequired intentionally omitted
      };
      const proposalEvent = proposalCreator.create(params);
      const proposal = proposalParser.parse(proposalEvent);

      // Create votes (all approve)
      const vote1Creator = new VoteCreator(participant1PrivateKeyHex);
      const vote2Creator = new VoteCreator(participant2PrivateKeyHex);

      const voteParams1: CreateVoteParams = {
        proposal,
        vote: 'approve',
      };
      const voteParams2: CreateVoteParams = {
        proposal,
        vote: 'approve',
      };

      const vote1Event = vote1Creator.create(voteParams1);
      const vote2Event = vote2Creator.create(voteParams2);

      const votes = new Map<string, Vote>([
        [participant1Pubkey, vote1Creator.toVote(vote1Event)],
        [participant2Pubkey, vote2Creator.toVote(vote2Event)],
      ]);

      // Mock logger to capture logs - clear previous calls
      const logSpy = jest.spyOn(testLogger, 'info');
      logSpy.mockClear();

      // Act
      const result = await resultAggregator.createResultWithAction(proposal, votes, 'approved');

      // Assert
      expect(result.outcome).toBe('approved');
      // Should NOT log escrow resolution for non-staked proposals
      const escrowResolutionCalls = logSpy.mock.calls.filter(
        (call) =>
          call[1] && typeof call[1] === 'string' && call[1].includes('Triggering escrow resolution')
      );
      expect(escrowResolutionCalls).toHaveLength(0);
    });
  });
});
