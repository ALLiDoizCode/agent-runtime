/**
 * Propose Coordination Skill (Kind 5910)
 *
 * Enables AI agents to propose coordinated actions requiring participant agreement.
 * Wraps ProposalCreator to create Kind 5910 coordination proposal events.
 */

import { z } from 'zod';
import type { AgentSkill, SkillExecuteContext } from '../skill-registry';
import type { EventHandlerResult } from '../../event-handler';
import {
  ProposalCreator,
  CreateProposalParams,
  CoordinationTypeSchema,
  ProposalActionSchema,
  ProposalAction,
  COORDINATION_PROPOSAL_KIND,
} from '../../coordination';
import type { Logger } from 'pino';

/**
 * Zod schema for propose_coordination skill parameters.
 *
 * Validates AI-provided parameters for creating coordination proposals.
 */
const ProposeCoordinationParams = z
  .object({
    type: CoordinationTypeSchema.describe(
      'Coordination type: "consensus" (all must approve), "majority" (>50% must approve), or "threshold" (N participants must approve)'
    ),
    participants: z
      .array(z.string())
      .min(2)
      .describe('Pubkeys of participating agents (minimum 2)'),
    threshold: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Required votes for threshold type (only used when type is "threshold")'),
    description: z.string().min(1).max(500).describe('Description of the proposal'),
    action: ProposalActionSchema.optional().describe(
      'Action to execute if approved (object with kind: number, data: string)'
    ),
    expiresIn: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Seconds until proposal expires (default: 3600)'),
    stakeRequired: z
      .string()
      .optional()
      .describe(
        'Required stake amount in smallest unit (e.g., satoshis for Bitcoin, drops for XRP). ' +
          'If specified, participants must stake this amount to the escrow address before voting.'
      ),
  })
  .refine((data) => data.type !== 'threshold' || data.threshold !== undefined, {
    message: 'threshold required when type is "threshold"',
  });

/**
 * Creates the propose_coordination skill.
 *
 * Factory function that injects dependencies (private key, ILP address, logger) and returns
 * an AgentSkill that the AI can invoke to propose coordinated actions.
 *
 * @param privateKeyHex - Coordinator's private key for signing proposals
 * @param ilpAddress - Coordinator's ILP address for escrow address generation
 * @param logger - Pino logger for skill-level structured logging
 * @returns AgentSkill for proposing coordination
 */
export function createProposeCoordinationSkill(
  privateKeyHex: string,
  ilpAddress: string,
  logger: Logger
): AgentSkill<typeof ProposeCoordinationParams> {
  // Create ProposalCreator instance with coordinator's private key and ILP address
  const proposalCreator = new ProposalCreator(privateKeyHex, ilpAddress);

  return {
    name: 'propose_coordination',
    description:
      'Propose a coordinated action requiring multiple agents to vote and reach consensus. ' +
      'Use this skill when you need multiple agents to agree on an action before execution. ' +
      'Specify the coordination type (consensus: all must approve, majority: >50% must approve, ' +
      'threshold: N participants must approve with threshold parameter), participants (agent pubkeys), ' +
      'description of the proposal, optional action to execute if approved (action.kind and action.data), ' +
      'optional expiresIn seconds (default: 3600 = 1 hour), and optional stakeRequired (string representing ' +
      'stake amount in smallest unit, e.g., "1000" for satoshis). ' +
      'Returns the proposal ID for tracking votes and outcomes.',
    parameters: ProposeCoordinationParams,
    eventKinds: [COORDINATION_PROPOSAL_KIND],
    execute: async (
      params: z.infer<typeof ProposeCoordinationParams>,
      _context: SkillExecuteContext
    ): Promise<EventHandlerResult> => {
      try {
        // Validate parameters using Zod schema
        // (AI SDK validates, but we double-check for robustness)
        const validationResult = ProposeCoordinationParams.safeParse(params);
        if (!validationResult.success) {
          logger.error({ error: validationResult.error, params }, 'Invalid skill parameters');
          return {
            success: false,
            error: {
              code: 'F99',
              message: `Invalid parameters: ${validationResult.error.message}`,
            },
          };
        }

        // TODO Epic XX: Validate participant capabilities using getAgentInfo skill
        // TODO Epic XX: Query each participant for supported coordination kinds before proposal
        // TODO Epic XX: Return F99 error if participants don't support coordination

        // Parse stakeRequired string to bigint if provided
        const stakeRequired = params.stakeRequired ? BigInt(params.stakeRequired) : undefined;

        // Build CreateProposalParams object
        const createParams: CreateProposalParams = {
          type: params.type,
          participants: params.participants,
          threshold: params.threshold,
          description: params.description,
          action: params.action as ProposalAction | undefined,
          expiresIn: params.expiresIn ?? 3600, // Default 3600 seconds (1 hour)
          stakeRequired,
        };

        // Create signed proposal event
        const event = proposalCreator.create(createParams);

        // Extract proposal ID from event's d tag
        const proposalId = event.tags.find((t) => t[0] === 'd')?.[1] ?? 'unknown';

        // Extract expiration timestamp from event's expires tag
        const expiresAt = event.tags.find((t) => t[0] === 'expires')?.[1];

        // Log proposal creation with structured logging
        logger.info(
          {
            proposalId,
            participants: params.participants.length,
            type: params.type,
            expiresAt,
            hasAction: !!params.action,
            stakeRequired: stakeRequired?.toString(),
          },
          'Coordination proposal created via AI skill'
        );

        // Return success with proposal event to be published
        return {
          success: true,
          responseEvent: event,
        };
      } catch (error) {
        // Log error with context
        logger.error({ error, params }, 'Failed to create coordination proposal');

        // Return F99 error (reasoned rejection / handler failure)
        return {
          success: false,
          error: {
            code: 'F99',
            message: `Failed to create proposal: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        };
      }
    },
  };
}
