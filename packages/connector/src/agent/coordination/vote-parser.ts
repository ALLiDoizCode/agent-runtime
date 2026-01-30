import { NostrEvent, verifyEvent } from 'nostr-tools';
import {
  Vote,
  VoteValue,
  VoteValueSchema,
  Proposal,
  COORDINATION_VOTE_KIND,
  TAG_D,
  TAG_E,
  TAG_VOTE,
  TAG_REASON,
  TAG_RANK,
  InvalidVoteError,
  ProposalMismatchError,
  NotParticipantError,
} from './types';

/**
 * VoteParser - Parses and validates Kind 6910 vote events.
 *
 * This class is responsible for parsing incoming vote events and validating:
 * - Event kind (6910)
 * - Cryptographic signature
 * - Voter is authorized participant
 * - Vote value (approve/reject/abstain)
 * - Proposal reference (e tag with 'proposal' marker)
 * - Proposal ID match (d tag)
 *
 * @example
 * ```typescript
 * const voteParser = new VoteParser();
 * const vote = voteParser.parse(voteEvent, proposal);
 * ```
 */
export class VoteParser {
  /**
   * Parse and validate a Kind 6910 vote event.
   *
   * @param event - The Nostr vote event to parse
   * @param proposal - The proposal being voted on
   * @returns Validated Vote object
   * @throws {InvalidVoteError} If event is malformed or invalid
   * @throws {ProposalMismatchError} If vote references wrong proposal
   * @throws {NotParticipantError} If voter is not a participant
   */
  parse(event: NostrEvent, proposal: Proposal): Vote {
    try {
      // Validate event kind
      if (event.kind !== COORDINATION_VOTE_KIND) {
        throw new InvalidVoteError(
          `Invalid event kind: ${event.kind}. Expected ${COORDINATION_VOTE_KIND}`
        );
      }

      // Validate signature
      this.validateSignature(event);

      // Extract and validate required tags
      const proposalEventId = this.parseProposalEventId(event.tags);
      const proposalId = this.getRequiredTag(event.tags, TAG_D);
      const voteValueStr = this.getRequiredTag(event.tags, TAG_VOTE);

      // Validate proposal ID match
      this.validateProposalId(proposalId, proposal);

      // Validate voter is participant
      this.validateParticipant(event.pubkey, proposal);

      // Validate vote value
      const voteValue = this.validateVoteValue(voteValueStr);

      // Parse optional tags
      const reason = this.parseOptionalTag(event.tags, TAG_REASON);
      const rank = this.parseRank(event.tags);

      // Return typed Vote object
      return {
        kind: event.kind as typeof COORDINATION_VOTE_KIND,
        proposalEventId,
        proposalId,
        vote: voteValue,
        voterPubkey: event.pubkey,
        reason,
        rank,
        event,
      };
    } catch (error) {
      // Re-throw known error types
      if (
        error instanceof InvalidVoteError ||
        error instanceof ProposalMismatchError ||
        error instanceof NotParticipantError
      ) {
        throw error;
      }

      // Wrap unexpected errors with context
      throw new InvalidVoteError(
        `Failed to parse vote event: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validate event signature using nostr-tools verifyEvent.
   *
   * @param event - The Nostr event to validate
   * @throws {InvalidVoteError} If signature verification fails
   */
  private validateSignature(event: NostrEvent): void {
    const isValid = verifyEvent(event);
    if (!isValid) {
      throw new InvalidVoteError(
        `Vote event signature verification failed for voter ${event.pubkey}`
      );
    }
  }

  /**
   * Extract proposal event ID from e tag with 'proposal' marker.
   * Tag format: ['e', eventId, relayHint, 'proposal']
   *
   * @param tags - Event tags array
   * @returns Proposal event ID
   * @throws {InvalidVoteError} If e tag is missing or malformed
   */
  private parseProposalEventId(tags: string[][]): string {
    const eTags = tags.filter((t) => t[0] === TAG_E && t.length >= 4 && t[3] === 'proposal');

    if (eTags.length === 0) {
      throw new InvalidVoteError('Vote event must include an e tag with "proposal" marker');
    }

    if (eTags.length > 1) {
      throw new InvalidVoteError('Vote event must have exactly one e tag with "proposal" marker');
    }

    const eventId = eTags[0]?.[1];
    if (!eventId) {
      throw new InvalidVoteError('E tag is missing event ID');
    }
    return eventId;
  }

  /**
   * Extract a required tag value by tag name.
   *
   * @param tags - Event tags array
   * @param tagName - Tag name to extract
   * @returns Tag value
   * @throws {InvalidVoteError} If tag is missing or empty
   */
  private getRequiredTag(tags: string[][], tagName: string): string {
    const tag = tags.find((t) => t[0] === tagName);

    if (!tag || !tag[1]) {
      throw new InvalidVoteError(`Vote event missing required "${tagName}" tag`);
    }

    return tag[1];
  }

  /**
   * Extract an optional tag value by tag name.
   *
   * @param tags - Event tags array
   * @param tagName - Tag name to extract
   * @returns Tag value or undefined if not present
   */
  private parseOptionalTag(tags: string[][], tagName: string): string | undefined {
    const tag = tags.find((t) => t[0] === tagName);
    return tag?.[1];
  }

  /**
   * Validate vote value matches allowed values (approve, reject, abstain).
   *
   * @param voteValue - Vote value string to validate
   * @returns Typed VoteValue
   * @throws {InvalidVoteError} If vote value is invalid
   */
  private validateVoteValue(voteValue: string): VoteValue {
    const result = VoteValueSchema.safeParse(voteValue);

    if (!result.success) {
      throw new InvalidVoteError(
        `Invalid vote value: "${voteValue}". Must be one of: approve, reject, abstain`
      );
    }

    return result.data;
  }

  /**
   * Validate proposal ID from d tag matches the given proposal.
   *
   * @param voteDTag - Proposal ID from vote's d tag
   * @param proposal - The proposal being voted on
   * @throws {ProposalMismatchError} If d tags don't match
   */
  private validateProposalId(voteDTag: string, proposal: Proposal): void {
    if (voteDTag !== proposal.id) {
      throw new ProposalMismatchError(voteDTag, proposal.id);
    }
  }

  /**
   * Validate voter pubkey is in proposal's participant list.
   *
   * @param voterPubkey - Voter's public key
   * @param proposal - The proposal being voted on
   * @throws {NotParticipantError} If voter is not a participant
   */
  private validateParticipant(voterPubkey: string, proposal: Proposal): void {
    if (!proposal.participants.includes(voterPubkey)) {
      throw new NotParticipantError(voterPubkey, proposal.id);
    }
  }

  /**
   * Parse optional rank tag as number array for ranked choice voting.
   * Tag format: ['rank', '1', '2', '3', ...]
   *
   * @param tags - Event tags array
   * @returns Array of rank numbers or undefined if not present
   * @throws {InvalidVoteError} If rank values are not valid numbers
   */
  private parseRank(tags: string[][]): number[] | undefined {
    const rankTag = tags.find((t) => t[0] === TAG_RANK);

    if (!rankTag || rankTag.length <= 1) {
      return undefined;
    }

    // Extract all values after tag name (rankTag[0])
    const rankValues = rankTag.slice(1);

    const numbers: number[] = [];
    for (const value of rankValues) {
      const num = Number(value);
      if (isNaN(num)) {
        throw new InvalidVoteError(
          `Invalid rank value: "${value}". All rank values must be numbers`
        );
      }
      numbers.push(num);
    }

    return numbers;
  }
}
