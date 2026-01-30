import {
  Proposal,
  Vote,
  CoordinationOutcome,
  VoteTally,
  UnsupportedCoordinationTypeError,
} from './types';

/**
 * ThresholdConsensus evaluates coordination proposals to determine outcomes
 * based on vote tallies and coordination type rules.
 *
 * Supports three coordination types:
 * - consensus: All participants must approve for approval
 * - majority: >50% must approve or reject for definitive outcome
 * - threshold: N votes required for approval (from proposal.threshold or default to majority)
 *
 * Stateless class - all methods are pure functions using parameters only.
 */
export class ThresholdConsensus {
  /**
   * Evaluate a proposal based on current votes and coordination type rules.
   *
   * @param proposal - The proposal to evaluate
   * @param votes - Map of voter pubkey to Vote objects
   * @returns CoordinationOutcome if consensus determined, 'pending' if still in progress
   */
  evaluate(proposal: Proposal, votes: Map<string, Vote>): CoordinationOutcome | 'pending' {
    // Tally all votes
    const tally = this.tallyVotes(votes);

    // Check quorum requirements
    const quorumStatus = this.checkQuorum(proposal, votes);
    if (quorumStatus === 'failed') {
      return 'inconclusive';
    }
    if (quorumStatus === 'pending' && !this.isExpired(proposal)) {
      return 'pending';
    }

    // Route to appropriate evaluation method based on coordination type
    switch (proposal.type) {
      case 'consensus':
        return this.evaluateConsensus(proposal, votes, tally);
      case 'majority':
        return this.evaluateMajority(proposal, votes, tally);
      case 'threshold':
        return this.evaluateThreshold(proposal, votes, tally);
      case 'ranked':
      case 'allocation':
        throw new UnsupportedCoordinationTypeError(proposal.type);
      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = proposal.type;
        throw new UnsupportedCoordinationTypeError(_exhaustive);
      }
    }
  }

  /**
   * Tally votes by counting approve, reject, and abstain votes.
   *
   * @param votes - Map of voter pubkey to Vote objects
   * @returns VoteTally with vote counts
   */
  private tallyVotes(votes: Map<string, Vote>): VoteTally {
    const tally: VoteTally = {
      approve: 0,
      reject: 0,
      abstain: 0,
    };

    for (const vote of votes.values()) {
      switch (vote.vote) {
        case 'approve':
          tally.approve++;
          break;
        case 'reject':
          tally.reject++;
          break;
        case 'abstain':
          tally.abstain++;
          break;
      }
    }

    return tally;
  }

  /**
   * Check if proposal has expired.
   *
   * @param proposal - The proposal to check
   * @returns true if current time >= expires timestamp
   */
  private isExpired(proposal: Proposal): boolean {
    const now = Math.floor(Date.now() / 1000); // Unix timestamp (seconds)
    return now > proposal.expires;
  }

  /**
   * Evaluate consensus type proposal.
   * Consensus requires ALL participants to approve for approval.
   * Any rejection immediately fails the proposal.
   *
   * @param proposal - The proposal to evaluate
   * @param votes - Map of voter pubkey to Vote objects
   * @param tally - Vote counts
   * @returns CoordinationOutcome or 'pending'
   */
  private evaluateConsensus(
    proposal: Proposal,
    votes: Map<string, Vote>,
    tally: VoteTally
  ): CoordinationOutcome | 'pending' {
    const totalParticipants = proposal.participants.length;

    // All participants approved - consensus reached
    if (tally.approve === totalParticipants) {
      return 'approved';
    }

    // Any rejection fails consensus
    if (tally.reject > 0) {
      return 'rejected';
    }

    // Not all voted yet
    if (votes.size < totalParticipants) {
      // Check if expired
      if (this.isExpired(proposal)) {
        return 'inconclusive';
      }
      return 'pending';
    }

    // All voted but not all approved (some abstained)
    return 'inconclusive';
  }

  /**
   * Evaluate majority type proposal.
   * Majority requires >50% approval or rejection for definitive outcome.
   *
   * @param proposal - The proposal to evaluate
   * @param votes - Map of voter pubkey to Vote objects
   * @param tally - Vote counts
   * @returns CoordinationOutcome or 'pending'
   */
  private evaluateMajority(
    proposal: Proposal,
    votes: Map<string, Vote>,
    tally: VoteTally
  ): CoordinationOutcome | 'pending' {
    const totalParticipants = proposal.participants.length;
    const majority = Math.floor(totalParticipants / 2) + 1;

    // Check if majority approval reached
    if (tally.approve >= majority) {
      return 'approved';
    }

    // Check if majority rejection reached
    if (tally.reject >= majority) {
      return 'rejected';
    }

    // Check if all voted
    if (votes.size === totalParticipants) {
      // All voted but no majority reached
      return 'inconclusive';
    }

    // Not all voted - check if expired
    if (this.isExpired(proposal)) {
      return 'inconclusive';
    }

    return 'pending';
  }

  /**
   * Evaluate threshold type proposal.
   * Threshold requires N votes to approve (N from proposal.threshold or default to majority).
   *
   * @param proposal - The proposal to evaluate
   * @param votes - Map of voter pubkey to Vote objects
   * @param tally - Vote counts
   * @returns CoordinationOutcome or 'pending'
   */
  private evaluateThreshold(
    proposal: Proposal,
    votes: Map<string, Vote>,
    tally: VoteTally
  ): CoordinationOutcome | 'pending' {
    const totalParticipants = proposal.participants.length;
    // Use custom threshold or default to majority
    const threshold = proposal.threshold ?? Math.floor(totalParticipants / 2) + 1;

    // Threshold reached - approved
    if (tally.approve >= threshold) {
      return 'approved';
    }

    // Calculate remaining votes that could potentially approve
    const remainingVotes = totalParticipants - votes.size;

    // Check if it's impossible to reach threshold
    if (tally.approve + remainingVotes < threshold) {
      return 'rejected';
    }

    // Threshold not reached but still possible
    return 'pending';
  }

  /**
   * Check if quorum requirements are met.
   *
   * @param proposal - The proposal to check
   * @param votes - Map of voter pubkey to Vote objects
   * @returns 'met' if quorum satisfied, 'pending' if not yet met, 'failed' if expired without quorum
   */
  private checkQuorum(proposal: Proposal, votes: Map<string, Vote>): 'met' | 'pending' | 'failed' {
    // No quorum requirement
    if (proposal.quorum === undefined) {
      return 'met';
    }

    // Quorum met
    if (votes.size >= proposal.quorum) {
      return 'met';
    }

    // Quorum not met - check if expired
    if (this.isExpired(proposal)) {
      return 'failed';
    }

    // Quorum not yet met but not expired
    return 'pending';
  }
}
