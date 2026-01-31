import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { Logger } from 'pino';
import { ResultAggregator } from './result-aggregator';
import { ProposalCreator } from './proposal';
import { VoteCreator } from './vote';
import {
  COORDINATION_RESULT_KIND,
  TAG_E,
  TAG_D,
  TAG_OUTCOME,
  TAG_VOTES,
  TAG_PARTICIPANTS,
  Proposal,
  Vote,
  CreateProposalParams,
} from './types';

describe('ResultAggregator', () => {
  let aggregator: ResultAggregator;
  let coordinatorKeyHex: string;
  let coordinatorPubkey: string;
  let mockLogger: {
    info: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
  };

  let proposalCreator: ProposalCreator;
  let voteCreator1: VoteCreator;
  let voteCreator2: VoteCreator;
  let voteCreator3: VoteCreator;

  let voter1Pubkey: string;
  let voter2Pubkey: string;
  let voter3Pubkey: string;

  beforeEach(() => {
    // Generate real test keys
    const coordinatorKey = generateSecretKey();
    coordinatorKeyHex = bytesToHex(coordinatorKey);
    coordinatorPubkey = getPublicKey(coordinatorKey);

    // Generate voter keys
    const voter1Key = generateSecretKey();
    const voter2Key = generateSecretKey();
    const voter3Key = generateSecretKey();

    voter1Pubkey = getPublicKey(voter1Key);
    voter2Pubkey = getPublicKey(voter2Key);
    voter3Pubkey = getPublicKey(voter3Key);

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    // Create aggregator and other creators
    aggregator = new ResultAggregator(coordinatorKeyHex, mockLogger as unknown as Logger);
    proposalCreator = new ProposalCreator(coordinatorKeyHex, 'g.test.agent');
    voteCreator1 = new VoteCreator(bytesToHex(voter1Key));
    voteCreator2 = new VoteCreator(bytesToHex(voter2Key));
    voteCreator3 = new VoteCreator(bytesToHex(voter3Key));
  });

  describe('constructor', () => {
    it('should create instance with correct pubkey', () => {
      expect(aggregator.pubkey).toBe(coordinatorPubkey);
    });
  });

  describe('createResult', () => {
    let proposal: Proposal;
    let votes: Map<string, Vote>;

    beforeEach(() => {
      // Create test proposal
      const params: CreateProposalParams = {
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 2,
        expiresIn: 3600,
        description: 'Test proposal',
      };
      const proposalEvent = proposalCreator.create(params);
      proposal = proposalCreator.toProposal(proposalEvent);

      // Create test votes
      const vote1Event = voteCreator1.create({
        proposal,

        vote: 'approve',
      });
      const vote2Event = voteCreator2.create({
        proposal,

        vote: 'approve',
      });

      votes = new Map([
        [voter1Pubkey, { ...voteCreator1.toVote(vote1Event), event: vote1Event }],
        [voter2Pubkey, { ...voteCreator2.toVote(vote2Event), event: vote2Event }],
      ]);
    });

    describe('result event structure (AC: 1-8)', () => {
      it('should create result with kind 7910 (AC: 1)', () => {
        const result = aggregator.createResult(proposal, votes, 'approved');
        expect(result.kind).toBe(COORDINATION_RESULT_KIND);
        expect(result.event.kind).toBe(7910);
      });

      it('should include e tag referencing proposal with "proposal" marker (AC: 2)', () => {
        const result = aggregator.createResult(proposal, votes, 'approved');
        const proposalTag = result.event.tags.find((t) => t[0] === TAG_E && t[3] === 'proposal');
        expect(proposalTag).toBeDefined();
        expect(proposalTag?.[1]).toBe(proposal.event.id);
      });

      it('should include d tag matching proposal d tag (AC: 3)', () => {
        const result = aggregator.createResult(proposal, votes, 'approved');
        const dTag = result.event.tags.find((t) => t[0] === TAG_D);
        expect(dTag).toBeDefined();
        expect(dTag?.[1]).toBe(proposal.id);
        expect(result.proposalId).toBe(proposal.id);
      });

      it('should include outcome tag (AC: 4)', () => {
        const result = aggregator.createResult(proposal, votes, 'approved');
        const outcomeTag = result.event.tags.find((t) => t[0] === TAG_OUTCOME);
        expect(outcomeTag).toBeDefined();
        expect(outcomeTag?.[1]).toBe('approved');
        expect(result.outcome).toBe('approved');
      });

      it('should include votes tag with counts (AC: 5)', () => {
        const result = aggregator.createResult(proposal, votes, 'approved');
        const votesTag = result.event.tags.find((t) => t[0] === TAG_VOTES);
        expect(votesTag).toBeDefined();
        expect(votesTag?.[1]).toBe('2'); // approve count
        expect(votesTag?.[2]).toBe('0'); // reject count
        expect(votesTag?.[3]).toBe('0'); // abstain count
        expect(result.votes).toEqual({ approve: 2, reject: 0, abstain: 0 });
      });

      it('should include participants tag with stats (AC: 6)', () => {
        const result = aggregator.createResult(proposal, votes, 'approved');
        const participantsTag = result.event.tags.find((t) => t[0] === TAG_PARTICIPANTS);
        expect(participantsTag).toBeDefined();
        expect(participantsTag?.[1]).toBe('2'); // voted count
        expect(participantsTag?.[2]).toBe('3'); // total count
        expect(result.participants).toEqual({ voted: 2, total: 3 });
      });

      it('should include e tags referencing all vote events with "vote" marker (AC: 7)', () => {
        const result = aggregator.createResult(proposal, votes, 'approved');
        const voteTags = result.event.tags.filter((t) => t[0] === TAG_E && t[3] === 'vote');
        expect(voteTags).toHaveLength(2);

        const voteEventIds = voteTags.map((t) => t[1]);
        expect(voteEventIds).toContain(votes.get(voter1Pubkey)!.event.id);
        expect(voteEventIds).toContain(votes.get(voter2Pubkey)!.event.id);
        expect(result.voteEventIds).toEqual(voteEventIds);
      });

      it('should include result summary in content (AC: 8)', () => {
        const result = aggregator.createResult(proposal, votes, 'approved');
        expect(result.content).toBe('Proposal approved with 2/0/0 votes.');
      });
    });

    describe('outcome variations', () => {
      it('should create result with approved outcome', () => {
        const result = aggregator.createResult(proposal, votes, 'approved');
        expect(result.outcome).toBe('approved');
        expect(result.content).toBe('Proposal approved with 2/0/0 votes.');
      });

      it('should create result with rejected outcome', () => {
        // Create reject votes
        const vote1Event = voteCreator1.create({
          proposal,

          vote: 'reject',
        });
        const vote2Event = voteCreator2.create({
          proposal,

          vote: 'reject',
        });
        const vote3Event = voteCreator3.create({
          proposal,

          vote: 'approve',
        });

        const rejectVotes = new Map([
          [voter1Pubkey, { ...voteCreator1.toVote(vote1Event), event: vote1Event }],
          [voter2Pubkey, { ...voteCreator2.toVote(vote2Event), event: vote2Event }],
          [voter3Pubkey, { ...voteCreator3.toVote(vote3Event), event: vote3Event }],
        ]);

        const result = aggregator.createResult(proposal, rejectVotes, 'rejected');
        expect(result.outcome).toBe('rejected');
        expect(result.content).toBe('Proposal rejected with 1/2/0 votes.');
        expect(result.votes).toEqual({ approve: 1, reject: 2, abstain: 0 });
      });

      it('should create result with expired outcome', () => {
        const result = aggregator.createResult(proposal, votes, 'expired');
        expect(result.outcome).toBe('expired');
        expect(result.content).toBe('Proposal expired with 2/0/0 votes.');
      });

      it('should create result with inconclusive outcome', () => {
        // Create mixed votes
        const vote1Event = voteCreator1.create({
          proposal,

          vote: 'approve',
        });
        const vote2Event = voteCreator2.create({
          proposal,

          vote: 'reject',
        });
        const vote3Event = voteCreator3.create({
          proposal,

          vote: 'abstain',
        });

        const mixedVotes = new Map([
          [voter1Pubkey, { ...voteCreator1.toVote(vote1Event), event: vote1Event }],
          [voter2Pubkey, { ...voteCreator2.toVote(vote2Event), event: vote2Event }],
          [voter3Pubkey, { ...voteCreator3.toVote(vote3Event), event: vote3Event }],
        ]);

        const result = aggregator.createResult(proposal, mixedVotes, 'inconclusive');
        expect(result.outcome).toBe('inconclusive');
        expect(result.content).toBe('Proposal inconclusive with 1/1/1 votes.');
        expect(result.votes).toEqual({ approve: 1, reject: 1, abstain: 1 });
      });
    });

    describe('vote tallying', () => {
      it('should handle empty votes map', () => {
        const emptyVotes = new Map<string, Vote>();
        const result = aggregator.createResult(proposal, emptyVotes, 'expired');
        expect(result.votes).toEqual({ approve: 0, reject: 0, abstain: 0 });
        expect(result.participants).toEqual({ voted: 0, total: 3 });
      });

      it('should tally all approve votes', () => {
        const vote1Event = voteCreator1.create({
          proposal,

          vote: 'approve',
        });
        const vote2Event = voteCreator2.create({
          proposal,

          vote: 'approve',
        });
        const vote3Event = voteCreator3.create({
          proposal,

          vote: 'approve',
        });

        const allApprove = new Map([
          [voter1Pubkey, { ...voteCreator1.toVote(vote1Event), event: vote1Event }],
          [voter2Pubkey, { ...voteCreator2.toVote(vote2Event), event: vote2Event }],
          [voter3Pubkey, { ...voteCreator3.toVote(vote3Event), event: vote3Event }],
        ]);

        const result = aggregator.createResult(proposal, allApprove, 'approved');
        expect(result.votes).toEqual({ approve: 3, reject: 0, abstain: 0 });
      });

      it('should tally all reject votes', () => {
        const vote1Event = voteCreator1.create({
          proposal,

          vote: 'reject',
        });
        const vote2Event = voteCreator2.create({
          proposal,

          vote: 'reject',
        });

        const allReject = new Map([
          [voter1Pubkey, { ...voteCreator1.toVote(vote1Event), event: vote1Event }],
          [voter2Pubkey, { ...voteCreator2.toVote(vote2Event), event: vote2Event }],
        ]);

        const result = aggregator.createResult(proposal, allReject, 'rejected');
        expect(result.votes).toEqual({ approve: 0, reject: 2, abstain: 0 });
      });

      it('should tally all abstain votes', () => {
        const vote1Event = voteCreator1.create({
          proposal,

          vote: 'abstain',
        });

        const allAbstain = new Map([
          [voter1Pubkey, { ...voteCreator1.toVote(vote1Event), event: vote1Event }],
        ]);

        const result = aggregator.createResult(proposal, allAbstain, 'inconclusive');
        expect(result.votes).toEqual({ approve: 0, reject: 0, abstain: 1 });
      });
    });

    describe('participation statistics', () => {
      it('should calculate stats with all participants voted', () => {
        const vote1Event = voteCreator1.create({
          proposal,

          vote: 'approve',
        });
        const vote2Event = voteCreator2.create({
          proposal,

          vote: 'approve',
        });
        const vote3Event = voteCreator3.create({
          proposal,

          vote: 'approve',
        });

        const allVoted = new Map([
          [voter1Pubkey, { ...voteCreator1.toVote(vote1Event), event: vote1Event }],
          [voter2Pubkey, { ...voteCreator2.toVote(vote2Event), event: vote2Event }],
          [voter3Pubkey, { ...voteCreator3.toVote(vote3Event), event: vote3Event }],
        ]);

        const result = aggregator.createResult(proposal, allVoted, 'approved');
        expect(result.participants.voted).toBe(3);
        expect(result.participants.total).toBe(3);
      });

      it('should calculate stats with partial participation', () => {
        const result = aggregator.createResult(proposal, votes, 'inconclusive');
        expect(result.participants.voted).toBe(2);
        expect(result.participants.total).toBe(3);
      });

      it('should calculate stats with no votes', () => {
        const emptyVotes = new Map<string, Vote>();
        const result = aggregator.createResult(proposal, emptyVotes, 'expired');
        expect(result.participants.voted).toBe(0);
        expect(result.participants.total).toBe(3);
      });
    });

    describe('logger calls', () => {
      it('should log result creation', () => {
        const result = aggregator.createResult(proposal, votes, 'approved');
        expect(mockLogger.info).toHaveBeenCalledWith(
          { proposalId: proposal.id, outcome: 'approved', resultEventId: result.event.id },
          'Result created'
        );
      });
    });
  });

  describe('createResultWithAction', () => {
    let proposal: Proposal;
    let votes: Map<string, Vote>;

    beforeEach(() => {
      // Create proposal with action
      const params: CreateProposalParams = {
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 2,
        expiresIn: 3600,
        description: 'Test proposal with action',
        action: {
          kind: 1,
          data: JSON.stringify({ message: 'Action executed' }),
        },
      };
      const proposalEvent = proposalCreator.create(params);
      proposal = proposalCreator.toProposal(proposalEvent);

      // Create test votes
      const vote1Event = voteCreator1.create({
        proposal,

        vote: 'approve',
      });
      const vote2Event = voteCreator2.create({
        proposal,

        vote: 'approve',
      });

      votes = new Map([
        [voter1Pubkey, { ...voteCreator1.toVote(vote1Event), event: vote1Event }],
        [voter2Pubkey, { ...voteCreator2.toVote(vote2Event), event: vote2Event }],
      ]);
    });

    it('should execute action when outcome is approved (AC: 9)', async () => {
      const result = await aggregator.createResultWithAction(proposal, votes, 'approved');
      expect(result.outcome).toBe('approved');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          actionKind: 1,
        }),
        'Action executed'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        { proposalId: proposal.id },
        'Action execution completed'
      );
    });

    it('should skip action when outcome is rejected', async () => {
      const result = await aggregator.createResultWithAction(proposal, votes, 'rejected');
      expect(result.outcome).toBe('rejected');
      // Should not have "Action executed" log
      const actionExecutedCalls = mockLogger.info.mock.calls.filter(
        (call: unknown[]) => call[1] === 'Action executed'
      );
      expect(actionExecutedCalls).toHaveLength(0);
    });

    it('should skip action when outcome is expired', async () => {
      const result = await aggregator.createResultWithAction(proposal, votes, 'expired');
      expect(result.outcome).toBe('expired');
      // Should not have "Action executed" log
      const actionExecutedCalls = mockLogger.info.mock.calls.filter(
        (call: unknown[]) => call[1] === 'Action executed'
      );
      expect(actionExecutedCalls).toHaveLength(0);
    });

    it('should skip action when no action defined', async () => {
      // Create proposal without action
      const paramsNoAction: CreateProposalParams = {
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 2,
        expiresIn: 3600,
        description: 'Test proposal without action',
      };
      const proposalEventNoAction = proposalCreator.create(paramsNoAction);
      const proposalNoAction = proposalCreator.toProposal(proposalEventNoAction);

      const result = await aggregator.createResultWithAction(proposalNoAction, votes, 'approved');
      expect(result.outcome).toBe('approved');
      // Should not have "Action executed" log
      const actionExecutedCalls = mockLogger.info.mock.calls.filter(
        (call: unknown[]) => call[1] === 'Action executed'
      );
      expect(actionExecutedCalls).toHaveLength(0);
    });

    it('should handle invalid action.data JSON gracefully', async () => {
      // Create proposal with invalid JSON in action.data
      const paramsInvalidAction: CreateProposalParams = {
        type: 'threshold',
        participants: [voter1Pubkey, voter2Pubkey, voter3Pubkey],
        threshold: 2,
        expiresIn: 3600,
        description: 'Test proposal with invalid action',
        action: {
          kind: 1,
          data: 'invalid json {',
        },
      };
      const proposalEventInvalid = proposalCreator.create(paramsInvalidAction);
      const proposalInvalid = proposalCreator.toProposal(proposalEventInvalid);

      const result = await aggregator.createResultWithAction(proposalInvalid, votes, 'approved');
      expect(result.outcome).toBe('approved');

      // Should log error about invalid JSON
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: proposalInvalid.id,
          actionKind: 1,
        }),
        'Invalid action.data JSON - skipping execution'
      );

      // Should not have "Action executed" log
      const actionExecutedCalls = mockLogger.info.mock.calls.filter(
        (call: unknown[]) => call[1] === 'Action executed'
      );
      expect(actionExecutedCalls).toHaveLength(0);
    });
  });
});
