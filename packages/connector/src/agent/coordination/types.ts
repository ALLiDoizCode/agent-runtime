import { z } from 'zod';
import { NostrEvent } from '../toon-codec';

// ============================================================================
// Event Kind Constants
// ============================================================================

/** Kind 5910: Coordination Proposal event */
export const COORDINATION_PROPOSAL_KIND = 5910;

/** Kind 6910: Coordination Vote event */
export const COORDINATION_VOTE_KIND = 6910;

/** Kind 7910: Coordination Result event */
export const COORDINATION_RESULT_KIND = 7910;

// ============================================================================
// Tag Name Constants
// ============================================================================

/** d tag - unique proposal/vote/result identifier */
export const TAG_D = 'd';

/** type tag - coordination type */
export const TAG_TYPE = 'type';

/** p tag - participant pubkey */
export const TAG_P = 'p';

/** threshold tag - required votes for threshold type */
export const TAG_THRESHOLD = 'threshold';

/** quorum tag - minimum participation required */
export const TAG_QUORUM = 'quorum';

/** expires tag - Unix timestamp for expiration */
export const TAG_EXPIRES = 'expires';

/** action tag - action to execute if approved */
export const TAG_ACTION = 'action';

/** weight tag - vote weight for participant */
export const TAG_WEIGHT = 'weight';

/** e tag - event reference */
export const TAG_E = 'e';

/** vote tag - vote value (approve/reject/abstain) */
export const TAG_VOTE = 'vote';

/** reason tag - vote justification */
export const TAG_REASON = 'reason';

/** rank tag - ranked choice values */
export const TAG_RANK = 'rank';

/** outcome tag - coordination outcome */
export const TAG_OUTCOME = 'outcome';

/** votes tag - vote counts */
export const TAG_VOTES = 'votes';

/** participants tag - participation stats */
export const TAG_PARTICIPANTS = 'participants';

// ============================================================================
// Security Limits
// ============================================================================

/** Maximum length for vote reason text (prevents memory exhaustion) */
export const MAX_REASON_LENGTH = 500;

/** Maximum number of rank values in ranked choice voting (prevents DOS) */
export const MAX_RANK_VALUES = 100;

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Coordination type determines how votes are evaluated.
 * - consensus: All participants must agree
 * - majority: >50% must agree
 * - threshold: N of M must agree
 * - ranked: Ranked choice voting
 * - allocation: Distribute resources
 */
export type CoordinationType = 'consensus' | 'majority' | 'threshold' | 'ranked' | 'allocation';

/**
 * Vote value for coordination proposals.
 */
export type VoteValue = 'approve' | 'reject' | 'abstain';

/**
 * Outcome of a coordination proposal.
 */
export type CoordinationOutcome = 'approved' | 'rejected' | 'expired' | 'inconclusive';

// ============================================================================
// Zod Schemas for Type Validation
// ============================================================================

/**
 * Zod schema for coordination type validation.
 */
export const CoordinationTypeSchema = z.enum([
  'consensus',
  'majority',
  'threshold',
  'ranked',
  'allocation',
]);

/**
 * Zod schema for vote value validation.
 */
export const VoteValueSchema = z.enum(['approve', 'reject', 'abstain']);

/**
 * Zod schema for coordination outcome validation.
 */
export const CoordinationOutcomeSchema = z.enum([
  'approved',
  'rejected',
  'expired',
  'inconclusive',
]);

/**
 * Zod schema for NostrEvent validation (minimal for embedding in other schemas).
 */
export const NostrEventSchema = z.object({
  id: z.string(),
  pubkey: z.string(),
  created_at: z.number(),
  kind: z.number(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string(),
});

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Action to execute if proposal is approved.
 */
export interface ProposalAction {
  /** Event kind to emit */
  kind: number;
  /** Action payload (JSON) */
  data: string;
}

/**
 * Zod schema for ProposalAction validation.
 */
export const ProposalActionSchema = z.object({
  kind: z.number(),
  data: z.string(),
});

/**
 * Coordination proposal (Kind 5910).
 */
export interface Proposal {
  /** Event kind (5910) */
  kind: typeof COORDINATION_PROPOSAL_KIND;
  /** Unique proposal ID (d tag) */
  id: string;
  /** Coordination type */
  type: CoordinationType;
  /** Participant pubkeys (p tags) */
  participants: string[];
  /** Required votes for threshold type */
  threshold?: number;
  /** Minimum participation required */
  quorum?: number;
  /** Expiration Unix timestamp */
  expires: number;
  /** Action to execute if approved */
  action?: ProposalAction;
  /** Vote weights per participant */
  weights?: Map<string, number>;
  /** Proposal description */
  content: string;
  /** Original Nostr event */
  event: NostrEvent;
}

/**
 * Parameters for creating a new proposal.
 */
export interface CreateProposalParams {
  /** Coordination type */
  type: CoordinationType;
  /** Participant pubkeys */
  participants: string[];
  /** Required votes for threshold type */
  threshold?: number;
  /** Minimum participation required */
  quorum?: number;
  /** Seconds until expiration */
  expiresIn: number;
  /** Action to execute if approved */
  action?: ProposalAction;
  /** Vote weights per participant (pubkey -> weight) */
  weights?: Record<string, number>;
  /** Proposal description */
  description: string;
}

/**
 * Zod schema for CreateProposalParams validation.
 */
export const CreateProposalParamsSchema = z.object({
  type: CoordinationTypeSchema,
  participants: z.array(z.string()).min(1, 'At least one participant required'),
  threshold: z.number().int().positive().optional(),
  quorum: z.number().int().positive().optional(),
  expiresIn: z.number().int().positive('expiresIn must be positive'),
  action: ProposalActionSchema.optional(),
  weights: z.record(z.string(), z.number()).optional(),
  description: z.string().min(1, 'Description required'),
});

/**
 * Vote tally for counting votes.
 */
export interface VoteTally {
  approve: number;
  reject: number;
  abstain: number;
}

/**
 * Zod schema for VoteTally validation.
 */
export const VoteTallySchema = z.object({
  approve: z.number().int().nonnegative(),
  reject: z.number().int().nonnegative(),
  abstain: z.number().int().nonnegative(),
});

/**
 * Participation statistics.
 */
export interface ParticipationStats {
  voted: number;
  total: number;
}

/**
 * Zod schema for ParticipationStats validation.
 */
export const ParticipationStatsSchema = z.object({
  voted: z.number().int().nonnegative(),
  total: z.number().int().positive(),
});

/**
 * Coordination vote (Kind 6910).
 */
export interface Vote {
  /** Event kind (6910) */
  kind: typeof COORDINATION_VOTE_KIND;
  /** Event ID of the proposal being voted on */
  proposalEventId: string;
  /** Proposal ID (d tag of proposal) */
  proposalId: string;
  /** Vote value */
  vote: VoteValue;
  /** Vote justification */
  reason?: string;
  /** Ranked choice values (for ranked type) */
  rank?: number[];
  /** Voter pubkey */
  voterPubkey: string;
  /** Original Nostr event */
  event: NostrEvent;
}

/**
 * Zod schema for Vote validation.
 */
export const VoteSchema = z.object({
  kind: z.literal(COORDINATION_VOTE_KIND),
  proposalEventId: z.string(),
  proposalId: z.string(),
  vote: VoteValueSchema,
  reason: z.string().optional(),
  rank: z.array(z.number()).optional(),
  voterPubkey: z.string(),
  event: NostrEventSchema,
});

/**
 * Parameters for creating a vote.
 */
export interface CreateVoteParams {
  /** Proposal to vote on */
  proposal: Proposal;
  /** Vote value */
  vote: VoteValue;
  /** Vote justification */
  reason?: string;
  /** Ranked choice values (for ranked type) */
  rank?: number[];
}

/**
 * Zod schema for CreateVoteParams validation.
 */
export const CreateVoteParamsSchema = z.object({
  proposal: z.custom<Proposal>((val) => {
    return (
      typeof val === 'object' &&
      val !== null &&
      'kind' in val &&
      val.kind === COORDINATION_PROPOSAL_KIND
    );
  }, 'Invalid proposal object'),
  vote: VoteValueSchema,
  reason: z
    .string()
    .max(MAX_REASON_LENGTH, `Reason exceeds maximum length of ${MAX_REASON_LENGTH} characters`)
    .optional(),
  rank: z
    .array(z.number().int())
    .max(MAX_RANK_VALUES, `Rank array exceeds maximum length of ${MAX_RANK_VALUES} values`)
    .optional(),
});

/**
 * Coordination result (Kind 7910).
 */
export interface CoordinationResult {
  /** Event kind (7910) */
  kind: typeof COORDINATION_RESULT_KIND;
  /** Event ID of the proposal */
  proposalEventId: string;
  /** Proposal ID (d tag of proposal) */
  proposalId: string;
  /** Coordination outcome */
  outcome: CoordinationOutcome;
  /** Vote tally */
  votes: VoteTally;
  /** Participation statistics */
  participants: ParticipationStats;
  /** Event IDs of all votes */
  voteEventIds: string[];
  /** Result summary */
  content: string;
  /** Original Nostr event */
  event: NostrEvent;
}

/**
 * Zod schema for CoordinationResult validation.
 */
export const CoordinationResultSchema = z.object({
  kind: z.literal(COORDINATION_RESULT_KIND),
  proposalEventId: z.string(),
  proposalId: z.string(),
  outcome: CoordinationOutcomeSchema,
  votes: VoteTallySchema,
  participants: ParticipationStatsSchema,
  voteEventIds: z.array(z.string()),
  content: z.string(),
  event: NostrEventSchema,
});

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown when a participant is not part of a proposal.
 */
export class NotParticipantError extends Error {
  constructor(pubkey: string, proposalId: string) {
    super(`Pubkey ${pubkey} is not a participant in proposal ${proposalId}`);
    this.name = 'NotParticipantError';
  }
}

/**
 * Error thrown when a proposal is not found.
 */
export class ProposalNotFoundError extends Error {
  constructor(proposalId: string) {
    super(`Proposal not found: ${proposalId}`);
    this.name = 'ProposalNotFoundError';
  }
}

/**
 * Error thrown when a duplicate vote is detected.
 */
export class DuplicateVoteError extends Error {
  constructor(pubkey: string) {
    super(`Duplicate vote from pubkey: ${pubkey}`);
    this.name = 'DuplicateVoteError';
  }
}

/**
 * Error thrown when proposal and vote IDs don't match.
 */
export class ProposalMismatchError extends Error {
  constructor(voteDTag: string, proposalId: string) {
    super(`Vote d tag "${voteDTag}" does not match proposal ID "${proposalId}"`);
    this.name = 'ProposalMismatchError';
  }
}

/**
 * Error thrown when a coordination type is not supported.
 */
export class UnsupportedCoordinationTypeError extends Error {
  constructor(type: string) {
    super(`Unsupported coordination type: ${type}`);
    this.name = 'UnsupportedCoordinationTypeError';
  }
}

/**
 * Error thrown when a proposal has expired.
 */
export class ProposalExpiredError extends Error {
  constructor(proposalId: string) {
    super(`Proposal has expired: ${proposalId}`);
    this.name = 'ProposalExpiredError';
  }
}

/**
 * Error thrown when a vote event is malformed or invalid.
 */
export class InvalidVoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidVoteError';
  }
}
