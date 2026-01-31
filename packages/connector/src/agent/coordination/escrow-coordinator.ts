import { Logger } from 'pino';
import { Proposal, CoordinationOutcome } from './types';

/**
 * Configuration for EscrowCoordinator.
 */
export interface EscrowCoordinatorConfig {
  /** Agent's ILP address for escrow namespacing */
  ilpAddress: string;
  /** Pino logger for structured logging */
  logger: Logger;
}

/**
 * Manages stake requirements and escrow resolution for coordination proposals.
 *
 * EscrowCoordinator implements the escrow data model and outcome determination logic
 * for staked coordination proposals. This story focuses on determining WHAT should
 * happen (release vs refund) based on coordination outcomes.
 *
 * Note: Actual ILP payment execution (HOW to release/refund) is deferred to a future epic
 * that will integrate with AgentWallet or SettlementCoordinator.
 */
export class EscrowCoordinator {
  constructor(private readonly config: EscrowCoordinatorConfig) {}

  /**
   * Generates escrow ILP address for a proposal.
   *
   * Format: {agentIlpAddress}.escrow.{proposalId}
   *
   * @param proposalId - The unique proposal ID
   * @returns Escrow ILP address following RFC-0015 hierarchical addressing
   */
  generateEscrowAddress(proposalId: string): string {
    return `${this.config.ilpAddress}.escrow.${proposalId}`;
  }

  /**
   * Prepares escrow metadata for a proposal requiring stake.
   *
   * This method:
   * - Generates the escrow ILP address
   * - Stores escrow address in the proposal object
   * - Initializes the stakes Map for tracking participant stakes
   * - Logs escrow creation with structured logging
   *
   * Note: This method prepares escrow metadata only. Actual payment tracking
   * (monitoring ILP Prepare packets, validating stake amounts) is deferred to
   * a future epic integrating with AgentWallet.
   *
   * @param proposal - The proposal requiring stake
   * @param amount - The required stake amount
   */
  async requireStake(proposal: Proposal, amount: bigint): Promise<void> {
    const escrowAddress = this.generateEscrowAddress(proposal.id);

    // Store escrow address in proposal (update in-place)
    proposal.escrowAddress = escrowAddress;

    // Initialize stakes Map if not present
    if (!proposal.stakes) {
      proposal.stakes = new Map<string, bigint>();
    }

    // Log escrow creation with structured logging
    this.config.logger.info(
      {
        proposalId: proposal.id,
        amount: amount.toString(),
        escrowAddress,
        participantCount: proposal.participants.length,
      },
      'Escrow required for coordination proposal'
    );
  }

  /**
   * Resolves escrow based on coordination outcome.
   *
   * This method implements outcome-based escrow resolution logic:
   * - approved: Log "release to recipient" (payment execution deferred)
   * - rejected/expired/inconclusive: Log "refund to participants" (refund execution deferred)
   *
   * After logging the intended action, the stakes Map is cleared to mark the
   * escrow as processed.
   *
   * Note: This story implements outcome determination logic only. Actual ILP
   * payment execution (sending payments to recipient, refunding participants)
   * is deferred to a future epic integrating with AgentWallet or SettlementCoordinator.
   *
   * @param proposal - The proposal with escrow
   * @param outcome - The coordination outcome
   */
  async releaseEscrow(proposal: Proposal, outcome: CoordinationOutcome): Promise<void> {
    try {
      // No-op if proposal doesn't require stake
      if (!proposal.stakeRequired || !proposal.stakes) {
        return;
      }

      const stakeCount = proposal.stakes.size;

      if (outcome === 'approved') {
        // Approved: Release escrow to recipient
        this.config.logger.info(
          {
            proposalId: proposal.id,
            outcome,
            escrowAddress: proposal.escrowAddress,
            stakeCount,
          },
          'Escrow release to recipient (payment logic deferred)'
        );
        // TODO: Future epic - integrate with ILP payment execution
      } else {
        // Rejected, expired, or inconclusive: Refund to participants
        this.config.logger.info(
          {
            proposalId: proposal.id,
            outcome,
            escrowAddress: proposal.escrowAddress,
            stakeCount,
          },
          'Escrow refund to participants (payment logic deferred)'
        );
        // TODO: Future epic - integrate with ILP payment refunds
      }

      // Clear stakes Map to mark as processed
      proposal.stakes.clear();
    } catch (error) {
      // Log error but don't throw - escrow failure should not block result event creation
      this.config.logger.error(
        {
          error,
          proposalId: proposal.id,
          outcome,
        },
        'Failed to release escrow'
      );
    }
  }
}
