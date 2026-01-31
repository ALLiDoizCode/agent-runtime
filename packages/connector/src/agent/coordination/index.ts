// Coordination module exports
export { ProposalCreator } from './proposal';
export { ProposalParser } from './proposal-parser';
export { VoteCreator } from './vote';
export { VoteParser } from './vote-parser';
export { ThresholdConsensus } from './threshold-consensus';
export { WeightedVoting } from './weighted-voting';
export { ResultAggregator } from './result-aggregator';
export { EscrowCoordinator } from './escrow-coordinator';
export type { EscrowCoordinatorConfig } from './escrow-coordinator';

export {
  // Event Kind Constants
  COORDINATION_PROPOSAL_KIND,
  COORDINATION_VOTE_KIND,
  COORDINATION_RESULT_KIND,
  // Tag Name Constants
  TAG_D,
  TAG_TYPE,
  TAG_P,
  TAG_THRESHOLD,
  TAG_QUORUM,
  TAG_EXPIRES,
  TAG_ACTION,
  TAG_WEIGHT,
  TAG_E,
  TAG_VOTE,
  TAG_REASON,
  TAG_RANK,
  TAG_OUTCOME,
  TAG_VOTES,
  TAG_PARTICIPANTS,
  TAG_STAKE,
  // Zod Schemas
  CoordinationTypeSchema,
  VoteValueSchema,
  CoordinationOutcomeSchema,
  NostrEventSchema,
  ProposalActionSchema,
  CreateProposalParamsSchema,
  VoteTallySchema,
  ParticipationStatsSchema,
  VoteSchema,
  CoordinationResultSchema,
  // Error Classes
  NotParticipantError,
  ProposalNotFoundError,
  DuplicateVoteError,
  ProposalMismatchError,
  UnsupportedCoordinationTypeError,
  ProposalExpiredError,
  InvalidVoteError,
} from './types';

// Type exports
export type {
  CoordinationType,
  VoteValue,
  CoordinationOutcome,
  ProposalAction,
  Proposal,
  CreateProposalParams,
  VoteTally,
  ParticipationStats,
  Vote,
  CreateVoteParams,
  CoordinationResult,
} from './types';
