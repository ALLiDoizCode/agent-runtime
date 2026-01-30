import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
import { NostrEvent } from '../toon-codec';
import {
  CreateVoteParams,
  CreateVoteParamsSchema,
  Vote,
  VoteValue,
  Proposal,
  COORDINATION_VOTE_KIND,
  TAG_D,
  TAG_E,
  TAG_VOTE,
  TAG_REASON,
  TAG_RANK,
  NotParticipantError,
} from './types';

/**
 * Creates coordination vote events (Kind 6910).
 *
 * VoteCreator handles the creation of signed Nostr events for
 * voting on multi-agent coordination proposals. Each vote includes:
 * - Reference to proposal event (e tag with 'proposal' marker)
 * - Proposal ID (d tag matching proposal's d tag)
 * - Vote value (approve/reject/abstain)
 * - Optional reason for justification
 * - Optional rank array for ranked choice voting
 */
export class VoteCreator {
  private readonly _privateKey: Uint8Array;
  private readonly _pubkey: string;

  /**
   * Creates a new VoteCreator instance.
   *
   * @param privateKeyHex - The voter's private key as a hex string
   */
  constructor(privateKeyHex: string) {
    this._privateKey = hexToBytes(privateKeyHex);
    this._pubkey = getPublicKey(this._privateKey);
  }

  /**
   * Gets the public key of this voter.
   */
  get pubkey(): string {
    return this._pubkey;
  }

  /**
   * Validates that the voter is a participant in the proposal.
   *
   * @param proposal - The proposal being voted on
   * @param voterPubkey - The voter's public key
   * @throws NotParticipantError if voter is not in participant list
   */
  private validateParticipant(proposal: Proposal, voterPubkey: string): void {
    if (!proposal.participants.includes(voterPubkey)) {
      throw new NotParticipantError(voterPubkey, proposal.id);
    }
  }

  /**
   * Validates the CreateVoteParams using Zod schema.
   *
   * This validates:
   * - Proposal is valid (kind === 5910)
   * - Vote value is valid (approve/reject/abstain)
   * - Reason length ≤ MAX_REASON_LENGTH (500 characters)
   * - Rank array length ≤ MAX_RANK_VALUES (100 values)
   *
   * @param params - The vote parameters to validate
   * @throws ZodError if validation fails
   */
  private validateParams(params: CreateVoteParams): void {
    CreateVoteParamsSchema.parse(params);
  }

  /**
   * Creates a signed vote event (Kind 6910).
   *
   * @param params - The vote parameters
   * @returns A signed NostrEvent
   * @throws NotParticipantError if voter is not in proposal participants
   * @throws ZodError if params validation fails
   */
  create(params: CreateVoteParams): NostrEvent {
    // Validate params using Zod schema (validates all fields including security limits)
    this.validateParams(params);

    // Validate voter is participant in proposal
    this.validateParticipant(params.proposal, this._pubkey);

    // Build tags array
    const tags: string[][] = [];

    // e tag - reference to proposal event with 'proposal' marker (AC: 2)
    tags.push([TAG_E, params.proposal.event.id, '', 'proposal']);

    // d tag - matches proposal's d tag (AC: 3)
    tags.push([TAG_D, params.proposal.id]);

    // vote tag - vote value (AC: 4)
    tags.push([TAG_VOTE, params.vote]);

    // reason tag - optional justification (AC: 5)
    if (params.reason !== undefined) {
      tags.push([TAG_REASON, params.reason]);
    }

    // rank tag - optional ranked choice values (AC: 6)
    if (params.rank !== undefined && params.rank.length > 0) {
      tags.push([TAG_RANK, ...params.rank.map(String)]);
    }

    // Content contains vote justification (AC: 7)
    const content = params.reason ?? '';

    // Create unsigned event template
    const eventTemplate = {
      kind: COORDINATION_VOTE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    };

    // Sign event with voter's private key (AC: 8)
    const signedEvent = finalizeEvent(eventTemplate, this._privateKey);

    return signedEvent as NostrEvent;
  }

  /**
   * Converts a NostrEvent back to a Vote interface.
   *
   * This helper method parses the tags from a Kind 6910 event
   * and constructs a Vote object for easier consumption.
   *
   * No validation is performed - this is a simple conversion helper.
   *
   * @param event - A Kind 6910 NostrEvent
   * @returns A Vote object
   */
  toVote(event: NostrEvent): Vote {
    const tags = event.tags;

    // Extract vote value from 'vote' tag
    const voteTag = tags.find((t) => t[0] === TAG_VOTE);
    const vote = (voteTag?.[1] ?? 'abstain') as VoteValue;

    // Extract optional reason from 'reason' tag
    const reasonTag = tags.find((t) => t[0] === TAG_REASON);
    const reason = reasonTag?.[1];

    // Extract optional rank from 'rank' tag (parse strings to numbers)
    const rankTag = tags.find((t) => t[0] === TAG_RANK);
    const rank = rankTag
      ? rankTag
          .slice(1) // Skip tag name
          .map((v) => parseInt(v, 10))
          .filter((v) => !isNaN(v))
      : undefined;

    // Extract proposal event ID from 'e' tag with 'proposal' marker
    const eTag = tags.find((t) => t[0] === TAG_E && t[3] === 'proposal');
    const proposalEventId = eTag?.[1] ?? '';

    // Extract proposal ID from 'd' tag
    const dTag = tags.find((t) => t[0] === TAG_D);
    const proposalId = dTag?.[1] ?? '';

    return {
      kind: COORDINATION_VOTE_KIND,
      proposalEventId,
      proposalId,
      vote,
      reason,
      rank: rank && rank.length > 0 ? rank : undefined,
      voterPubkey: event.pubkey,
      event,
    };
  }
}
