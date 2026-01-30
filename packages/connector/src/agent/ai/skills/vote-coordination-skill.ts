/**
 * Vote Coordination Skill
 *
 * AI skill that enables agents to cast votes on coordination proposals.
 * Wraps VoteCreator as an AI SDK tool for declarative voting.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import type { Logger } from 'pino';
import type { AgentSkill, SkillExecuteContext } from '../skill-registry';
import type { EventHandlerResult } from '../../event-handler';
import {
  VoteCreator,
  VoteValueSchema,
  COORDINATION_VOTE_KIND,
  COORDINATION_PROPOSAL_KIND,
} from '../../coordination';
import { ProposalCreator } from '../../coordination/proposal';

/**
 * Vote Coordination Parameters Schema
 *
 * Defines the parameters the AI provides when voting on proposals.
 * Proposal details are fetched from the database, not provided by AI.
 */
const VoteCoordinationParams = z.object({
  proposalId: z.string().describe('The d-tag of the proposal to vote on'),
  vote: VoteValueSchema, // 'approve' | 'reject' | 'abstain'
  reason: z.string().optional().describe('Justification for the vote decision'),
});

/**
 * Creates the vote_coordination skill
 *
 * Factory function that creates an AI skill for voting on coordination proposals.
 * The skill fetches proposal details, validates participant status, and creates votes.
 *
 * @param privateKeyHex - Voter's private key for signing vote events (hex string)
 * @param logger - Pino logger for skill-level structured logging
 * @returns AgentSkill instance for vote_coordination
 *
 * @example
 * ```typescript
 * const skill = createVoteCoordinationSkill(voterPrivateKey, logger);
 * registry.register(skill);
 * ```
 */
export function createVoteCoordinationSkill(
  privateKeyHex: string,
  logger: Logger
): AgentSkill<typeof VoteCoordinationParams> {
  // Create VoteCreator instance inside factory (only needs privateKeyHex)
  const voteCreator = new VoteCreator(privateKeyHex);

  // Create ProposalCreator instance for toProposal helper (parsing proposals)
  const proposalCreator = new ProposalCreator(privateKeyHex);

  return {
    name: 'vote_coordination',
    description:
      'Cast a vote (approve/reject/abstain) on a multi-agent coordination proposal. ' +
      'Use this skill when you receive a coordination proposal (Kind 5910) and need to ' +
      'vote as a participant. Specify the proposal ID (d-tag from the proposal event), ' +
      'your vote value (approve if you agree with the proposal, reject if you disagree, ' +
      'abstain if you want to skip), and optional reasoning to justify your decision. ' +
      'The skill fetches the proposal details from the event database and validates you ' +
      'are a participant before casting the vote. Returns vote confirmation with vote event ID.',
    parameters: VoteCoordinationParams,
    eventKinds: [COORDINATION_VOTE_KIND], // Kind 6910
    execute: async (
      params: z.infer<typeof VoteCoordinationParams>,
      context: SkillExecuteContext
    ): Promise<EventHandlerResult> => {
      try {
        // Fetch proposal from database using proposalId (AC: 3)
        const proposalEvents = await context.database.queryEvents({
          kinds: [COORDINATION_PROPOSAL_KIND], // Kind 5910
          '#d': [params.proposalId], // Filter by d tag (proposal ID)
          limit: 1, // We only need one proposal
        });

        // Check if proposal exists (AC: 3, 8)
        if (proposalEvents.length === 0 || !proposalEvents[0]) {
          logger.error({ proposalId: params.proposalId }, 'Proposal not found');
          return {
            success: false,
            error: {
              code: 'F99',
              message: `Proposal not found: ${params.proposalId}`,
            },
          };
        }

        // Parse proposal event to Proposal object
        const proposalEvent = proposalEvents[0];
        const proposal = proposalCreator.toProposal(proposalEvent);

        // Validate agent is participant (AC: 4, 8)
        if (!proposal.participants.includes(context.agentPubkey)) {
          logger.error(
            {
              proposalId: params.proposalId,
              agentPubkey: context.agentPubkey,
              participants: proposal.participants,
            },
            'Agent is not a participant in this proposal'
          );
          return {
            success: false,
            error: {
              code: 'F99',
              message: `Agent ${context.agentPubkey} is not a participant in proposal ${params.proposalId}`,
            },
          };
        }

        // Build CreateVoteParams object
        const createParams = {
          proposal,
          vote: params.vote,
          reason: params.reason,
        };

        // Create vote (AC: 5)
        const event = voteCreator.create(createParams);

        // Log vote creation (AC: 6)
        logger.info(
          {
            voteId: event.id,
            proposalId: params.proposalId,
            vote: params.vote,
            hasReason: !!params.reason,
            voterPubkey: context.agentPubkey,
          },
          'Coordination vote created via AI skill'
        );

        // Return success with vote event (AC: 6)
        return {
          success: true,
          responseEvent: event, // Kind 6910 vote event
        };
      } catch (error) {
        // Handle all errors (AC: 8)
        logger.error(
          {
            error,
            params,
            agentPubkey: context.agentPubkey,
          },
          'Failed to create vote'
        );
        return {
          success: false,
          error: {
            code: 'F99',
            message: `Failed to create vote: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        };
      }
    },
  };
}
