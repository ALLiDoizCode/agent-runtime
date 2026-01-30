import { Logger } from 'pino';
import { Proposal, Vote, VoteTally, CoordinationOutcome } from './types';

/**
 * WeightedVoting evaluates coordination proposals using weighted vote tallies.
 *
 * Extends basic threshold consensus by applying participant-specific weights
 * to vote counts. Supports:
 * - Stake-based voting (vote weight proportional to ILP balance)
 * - Reputation-weighted voting (vote weight based on trust score)
 * - Proportional voting (different participants have different voting power)
 *
 * Weight Application:
 * - Each participant has a weight (default 1 if not specified)
 * - Vote tallies are calculated by summing weights of votes in each category
 * - Threshold is calculated proportionally based on total weight
 * - Outcome determined by comparing weighted tallies to weighted threshold
 */
export class WeightedVoting {
  constructor(private readonly logger: Logger) {}

  /**
   * Evaluate a proposal using weighted voting.
   *
   * @param proposal - The proposal to evaluate
   * @param votes - Map of voter pubkey to Vote objects
   * @returns Object containing weighted tally and outcome
   */
  evaluate(
    proposal: Proposal,
    votes: Map<string, Vote>
  ): { weighted: VoteTally; outcome: CoordinationOutcome | 'pending' } {
    // Parse weights from proposal
    const weights = this.parseWeights(proposal);

    // Calculate weighted tally and total weight
    const { weighted, totalWeight } = this.calculateWeightedTally(proposal, votes, weights);

    // Calculate weighted threshold
    const threshold = this.calculateWeightedThreshold(proposal, totalWeight);

    // Log weighted tallies for observability
    this.logger.debug(
      {
        proposalId: proposal.id,
        weightedTally: {
          approve: weighted.approve,
          reject: weighted.reject,
          abstain: weighted.abstain,
        },
        totalWeight,
        threshold,
      },
      'Weighted voting evaluation'
    );

    // Evaluate outcome using weighted values
    const outcome = this.evaluateOutcome(proposal, votes, weighted, totalWeight, threshold);

    // Log final outcome
    this.logger.debug(
      {
        proposalId: proposal.id,
        outcome,
      },
      'Weighted voting evaluation completed'
    );

    return { weighted, outcome };
  }

  /**
   * Parse weights from proposal.
   * Returns proposal.weights if defined, otherwise returns empty Map.
   *
   * @param proposal - The proposal to extract weights from
   * @returns Map of participant pubkey to weight
   */
  private parseWeights(proposal: Proposal): Map<string, number> {
    // Return proposal weights if defined
    if (proposal.weights !== undefined) {
      // Validate weight values are positive numbers
      for (const [pubkey, weight] of proposal.weights.entries()) {
        if (weight <= 0) {
          this.logger.warn(
            {
              pubkey,
              weight,
              proposalId: proposal.id,
            },
            'Participant has zero or negative weight, defaulting to 1'
          );
        }
      }
      return proposal.weights;
    }

    // Return empty Map if weights not defined (all participants get default weight)
    return new Map<string, number>();
  }

  /**
   * Calculate weighted tally by summing weights for each vote category.
   *
   * @param proposal - The proposal being evaluated
   * @param votes - Map of voter pubkey to Vote objects
   * @param weights - Map of participant pubkey to weight
   * @returns Object containing weighted VoteTally and totalWeight
   */
  private calculateWeightedTally(
    proposal: Proposal,
    votes: Map<string, Vote>,
    weights: Map<string, number>
  ): { weighted: VoteTally; totalWeight: number } {
    let approveWeight = 0;
    let rejectWeight = 0;
    let abstainWeight = 0;
    let totalWeight = 0;

    // Iterate all participants (not just voters) to calculate totalWeight
    for (const pubkey of proposal.participants) {
      // Get weight (default 1 if not in weights Map or if weight <= 0)
      let weight = weights.get(pubkey) ?? 1;
      if (weight <= 0) {
        weight = 1; // Default to 1 for zero or negative weights
      }

      totalWeight += weight;

      // If participant has voted, add weight to corresponding vote type tally
      const vote = votes.get(pubkey);
      if (vote) {
        if (vote.vote === 'approve') {
          approveWeight += weight;
        } else if (vote.vote === 'reject') {
          rejectWeight += weight;
        } else {
          abstainWeight += weight;
        }
      }
    }

    // Log warning if participant missing from weight map
    for (const pubkey of proposal.participants) {
      if (!weights.has(pubkey) && weights.size > 0) {
        this.logger.debug(
          {
            pubkey,
            proposalId: proposal.id,
          },
          'Participant missing from weight map, using default weight 1'
        );
      }
    }

    return {
      weighted: {
        approve: approveWeight,
        reject: rejectWeight,
        abstain: abstainWeight,
      },
      totalWeight,
    };
  }

  /**
   * Calculate weighted threshold.
   * Converts participant-count-based thresholds to weight-based thresholds.
   *
   * @param proposal - The proposal being evaluated
   * @param totalWeight - Sum of all participant weights
   * @returns Weighted threshold value
   */
  private calculateWeightedThreshold(proposal: Proposal, totalWeight: number): number {
    // If proposal.threshold is defined: calculate proportional threshold
    if (proposal.threshold !== undefined) {
      // Formula: (proposal.threshold / proposal.participants.length) * totalWeight
      // Example: threshold=2, participants=4, totalWeight=100 → (2/4) * 100 = 50
      const threshold = (proposal.threshold / proposal.participants.length) * totalWeight;
      return threshold;
    }

    // If proposal.threshold is undefined: use majority (totalWeight / 2 + 1)
    return totalWeight / 2 + 1;
  }

  /**
   * Evaluate outcome based on weighted tallies and threshold.
   *
   * @param proposal - The proposal being evaluated
   * @param votes - Map of voter pubkey to Vote objects
   * @param weightedTally - Weighted vote counts
   * @param totalWeight - Sum of all participant weights
   * @param threshold - Weighted threshold value
   * @returns CoordinationOutcome or 'pending'
   */
  private evaluateOutcome(
    proposal: Proposal,
    votes: Map<string, Vote>,
    weightedTally: VoteTally,
    totalWeight: number,
    threshold: number
  ): CoordinationOutcome | 'pending' {
    const { approve: approveWeight, reject: rejectWeight } = weightedTally;

    // Check if proposal has expired
    const isExpired = this.isExpired(proposal);

    // Approved: approveWeight >= threshold
    if (approveWeight >= threshold) {
      return 'approved';
    }

    // Rejected: rejectWeight > totalWeight - threshold (approval impossible)
    // Example: totalWeight=100, threshold=60, rejectWeight=41 → approval impossible
    if (rejectWeight > totalWeight - threshold) {
      return 'rejected';
    }

    // Check if all participants have voted
    const allVoted = votes.size === proposal.participants.length;

    // Inconclusive: All voted but no threshold reached OR proposal expired
    if (allVoted || isExpired) {
      return 'inconclusive';
    }

    // Pending: Not all voted and not expired
    return 'pending';
  }

  /**
   * Check if proposal has expired.
   *
   * @param proposal - The proposal to check
   * @returns true if current time > expires timestamp
   */
  private isExpired(proposal: Proposal): boolean {
    const now = Math.floor(Date.now() / 1000); // Unix timestamp (seconds)
    return now > proposal.expires;
  }
}

/**
 * Future Integration: Stake-Weighted Voting
 *
 * Story 20.7 implements weighted voting infrastructure but defers ILP balance
 * integration to a future epic. When implementing stake-weighted voting:
 *
 * TODO Epic XX: Integrate with ILP balance tracking
 * - Fetch ILP balance for each participant from connector accounting
 * - Use balance as weight (stake-weighted voting)
 * - Update weights dynamically based on balance changes
 * - Add balance threshold for voting eligibility
 *
 * Implementation approach:
 * 1. Create getStakeWeights(proposal: Proposal): Map<string, number> method
 * 2. Fetch ILP balance for each participant in proposal.participants
 * 3. Return Map of pubkey -> balance as weight
 * 4. Call from evaluate() to merge with proposal.weights
 */
