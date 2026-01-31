import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
import { Logger } from 'pino';
import { NostrEvent } from '../toon-codec';
import {
  Proposal,
  Vote,
  CoordinationResult,
  CoordinationOutcome,
  VoteTally,
  ParticipationStats,
  COORDINATION_RESULT_KIND,
  ProposalAction,
  TAG_E,
  TAG_D,
  TAG_OUTCOME,
  TAG_VOTES,
  TAG_PARTICIPANTS,
} from './types';
import { EscrowCoordinator } from './escrow-coordinator';

/**
 * Creates coordination result events (Kind 7910).
 *
 * ResultAggregator handles the creation of signed Nostr events for
 * coordination result aggregation. Each result includes:
 * - Reference to original proposal event
 * - Final outcome (approved/rejected/expired/inconclusive)
 * - Vote tally (approve/reject/abstain counts)
 * - Participation statistics (voted/total)
 * - References to all vote events
 * - Execution of approved actions
 */
export class ResultAggregator {
  private readonly _privateKey: Uint8Array;
  private readonly _pubkey: string;

  /**
   * Creates a new ResultAggregator instance.
   *
   * @param privateKeyHex - The coordinator's private key as a hex string
   * @param logger - Pino logger for structured logging
   * @param escrowCoordinator - Optional escrow coordinator for staked proposals
   */
  constructor(
    privateKeyHex: string,
    private readonly logger: Logger,
    private readonly escrowCoordinator?: EscrowCoordinator
  ) {
    this._privateKey = hexToBytes(privateKeyHex);
    this._pubkey = getPublicKey(this._privateKey);
  }

  /**
   * Gets the public key of this coordinator.
   */
  get pubkey(): string {
    return this._pubkey;
  }

  /**
   * Tally votes by counting approve/reject/abstain votes.
   *
   * @param votes - Map of voter pubkey to Vote objects
   * @returns VoteTally with approve, reject, abstain counts
   */
  private tallyVotes(votes: Map<string, Vote>): VoteTally {
    let approve = 0;
    let reject = 0;
    let abstain = 0;

    for (const vote of votes.values()) {
      if (vote.vote === 'approve') {
        approve++;
      } else if (vote.vote === 'reject') {
        reject++;
      } else {
        abstain++;
      }
    }

    return { approve, reject, abstain };
  }

  /**
   * Calculate participation statistics.
   *
   * @param proposal - The proposal being evaluated
   * @param votes - Map of voter pubkey to Vote objects
   * @returns ParticipationStats with voted and total counts
   */
  private calculateParticipationStats(
    proposal: Proposal,
    votes: Map<string, Vote>
  ): ParticipationStats {
    return {
      voted: votes.size,
      total: proposal.participants.length,
    };
  }

  /**
   * Generate human-readable result summary.
   *
   * @param outcome - The coordination outcome
   * @param tally - The vote tally
   * @returns Formatted result summary string
   */
  private generateResultSummary(outcome: CoordinationOutcome, tally: VoteTally): string {
    return `Proposal ${outcome} with ${tally.approve}/${tally.reject}/${tally.abstain} votes.`;
  }

  /**
   * Parse result event back into CoordinationResult interface.
   *
   * @param event - The signed Kind 7910 NostrEvent
   * @returns CoordinationResult object
   */
  private parseResultEvent(event: NostrEvent): CoordinationResult {
    // Extract proposal event reference (e tag with 'proposal' marker)
    const proposalEventId = event.tags.find((t) => t[0] === TAG_E && t[3] === 'proposal')?.[1];
    if (!proposalEventId) {
      throw new Error('Result event missing proposal reference');
    }

    // Extract proposal ID (d tag)
    const proposalId = event.tags.find((t) => t[0] === TAG_D)?.[1];
    if (!proposalId) {
      throw new Error('Result event missing proposal ID');
    }

    // Extract outcome
    const outcomeTag = event.tags.find((t) => t[0] === TAG_OUTCOME);
    if (!outcomeTag) {
      throw new Error('Result event missing outcome tag');
    }
    const outcome = outcomeTag[1] as CoordinationOutcome;

    // Extract vote counts (parse strings to numbers)
    const votesTag = event.tags.find((t) => t[0] === TAG_VOTES);
    if (!votesTag || votesTag.length < 4) {
      throw new Error('Result event missing votes tag');
    }
    const votes: VoteTally = {
      approve: parseInt(votesTag[1] as string, 10),
      reject: parseInt(votesTag[2] as string, 10),
      abstain: parseInt(votesTag[3] as string, 10),
    };

    // Extract participation stats (parse strings to numbers)
    const participantsTag = event.tags.find((t) => t[0] === TAG_PARTICIPANTS);
    if (!participantsTag || participantsTag.length < 3) {
      throw new Error('Result event missing participants tag');
    }
    const participants: ParticipationStats = {
      voted: parseInt(participantsTag[1] as string, 10),
      total: parseInt(participantsTag[2] as string, 10),
    };

    // Extract vote event IDs (all e tags with 'vote' marker)
    const voteEventIds = event.tags
      .filter((t) => t[0] === TAG_E && t[3] === 'vote')
      .map((t) => t[1] as string);

    return {
      kind: COORDINATION_RESULT_KIND,
      proposalEventId,
      proposalId,
      outcome,
      votes,
      participants,
      voteEventIds,
      content: event.content,
      event,
    };
  }

  /**
   * Execute approved proposal action by emitting configured event.
   *
   * @param action - The proposal action to execute
   * @param proposalId - The proposal ID for logging
   */
  private async executeAction(action: ProposalAction, proposalId: string): Promise<void> {
    // Validate action.data is valid JSON
    let actionContent: string;
    try {
      const parsed = JSON.parse(action.data);
      actionContent = JSON.stringify(parsed);
    } catch (error) {
      this.logger.error(
        { proposalId, actionKind: action.kind, error: (error as Error).message },
        'Invalid action.data JSON - skipping execution'
      );
      return;
    }

    // Create unsigned event template with action kind and content
    const eventTemplate = {
      kind: action.kind,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: actionContent,
    };

    // Sign action event
    const actionEvent = finalizeEvent(eventTemplate, this._privateKey);

    // Log action execution
    this.logger.info(
      { actionKind: action.kind, proposalId, actionEventId: actionEvent.id },
      'Action executed'
    );

    // TODO: Epic XX: Integrate with skill execution for coordinated actions
    // TODO: Epic XX: Consider whitelist of allowed action.kind values for security
  }

  /**
   * Create coordination result event (Kind 7910).
   *
   * @param proposal - The proposal being evaluated
   * @param votes - Map of voter pubkey to Vote objects
   * @param outcome - The coordination outcome
   * @returns CoordinationResult object
   */
  createResult(
    proposal: Proposal,
    votes: Map<string, Vote>,
    outcome: CoordinationOutcome
  ): CoordinationResult {
    // Tally votes
    const tally = this.tallyVotes(votes);

    // Calculate participation stats
    const stats = this.calculateParticipationStats(proposal, votes);

    // Generate result summary
    const resultSummary = this.generateResultSummary(outcome, tally);

    // Build tags array
    const tags: string[][] = [];

    // e tag - proposal reference (AC: 2)
    tags.push([TAG_E, proposal.event.id, '', 'proposal']);

    // d tag - proposal ID (AC: 3)
    tags.push([TAG_D, proposal.id]);

    // outcome tag (AC: 4)
    tags.push([TAG_OUTCOME, outcome]);

    // votes tag (AC: 5)
    tags.push([
      TAG_VOTES,
      tally.approve.toString(),
      tally.reject.toString(),
      tally.abstain.toString(),
    ]);

    // participants tag (AC: 6)
    tags.push([TAG_PARTICIPANTS, stats.voted.toString(), stats.total.toString()]);

    // e tags for each vote (AC: 7)
    for (const vote of votes.values()) {
      tags.push([TAG_E, vote.event.id, '', 'vote']);
    }

    // Create unsigned event template
    const eventTemplate = {
      kind: COORDINATION_RESULT_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: resultSummary,
    };

    // Sign event
    const resultEvent = finalizeEvent(eventTemplate, this._privateKey);

    // Log result creation
    this.logger.info(
      { proposalId: proposal.id, outcome, resultEventId: resultEvent.id },
      'Result created'
    );

    // Parse event into CoordinationResult
    return this.parseResultEvent(resultEvent as NostrEvent);
  }

  /**
   * Create coordination result event with action execution.
   *
   * @param proposal - The proposal being evaluated
   * @param votes - Map of voter pubkey to Vote objects
   * @param outcome - The coordination outcome
   * @returns CoordinationResult object
   */
  async createResultWithAction(
    proposal: Proposal,
    votes: Map<string, Vote>,
    outcome: CoordinationOutcome
  ): Promise<CoordinationResult> {
    // Create result
    const result = this.createResult(proposal, votes, outcome);

    // Trigger escrow resolution if stake required
    if (proposal.stakeRequired && this.escrowCoordinator) {
      this.logger.info({ proposalId: proposal.id, outcome }, 'Triggering escrow resolution');
      await this.escrowCoordinator.releaseEscrow(proposal, outcome);
    }

    // Execute action if approved and action defined
    if (outcome === 'approved' && proposal.action) {
      await this.executeAction(proposal.action, proposal.id);
      this.logger.info({ proposalId: proposal.id }, 'Action execution completed');
    }

    return result;
  }
}
