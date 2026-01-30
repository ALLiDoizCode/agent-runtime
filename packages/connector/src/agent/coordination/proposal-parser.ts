import {
  Proposal,
  CoordinationType,
  CoordinationTypeSchema,
  ProposalAction,
  ProposalExpiredError,
  COORDINATION_PROPOSAL_KIND,
  TAG_D,
  TAG_TYPE,
  TAG_P,
  TAG_THRESHOLD,
  TAG_QUORUM,
  TAG_EXPIRES,
  TAG_ACTION,
  TAG_WEIGHT,
} from './types';
import { NostrEvent } from '../toon-codec';

// Security limits to prevent DOS attacks
const MAX_PARTICIPANTS = 1000;
const MAX_WEIGHT_VALUE = 1e9;
const MAX_ACTION_DATA_LENGTH = 102400; // 100KB

/**
 * Parses and validates Kind 5910 coordination proposal events.
 *
 * ProposalParser validates all required and optional fields of a
 * coordination proposal, ensuring:
 * - Correct event kind (5910)
 * - Valid coordination type
 * - Valid participant pubkeys
 * - Threshold doesn't exceed participant count
 * - Proposal hasn't expired
 * - Action payload is valid JSON (if present)
 * - Security limits are enforced
 */
export class ProposalParser {
  /**
   * Parse and validate a Kind 5910 Nostr event into a Proposal.
   *
   * @param event - The Nostr event to parse
   * @returns A validated Proposal object
   * @throws Error if event is invalid or expired
   * @throws ProposalExpiredError if proposal has expired
   */
  parse(event: NostrEvent): Proposal {
    try {
      // Validate event kind
      this.validateKind(event);

      const tags = event.tags;

      // Extract and validate required tags
      const id = this.getRequiredTag(tags, TAG_D);
      const type = this.parseCoordinationType(tags);
      const participants = this.getPTags(tags);
      const expires = this.parseExpires(tags);

      // Validate expiration
      this.validateNotExpired(expires);

      // Extract optional tags
      const threshold = this.parseOptionalNumber(tags, TAG_THRESHOLD);
      const quorum = this.parseOptionalNumber(tags, TAG_QUORUM);

      // Validate threshold if present
      if (threshold !== undefined) {
        this.validateThreshold(tags, participants.length);
      }

      // Parse optional action and weights
      const action = this.parseAction(tags);
      const weights = this.parseWeights(tags);

      return {
        kind: COORDINATION_PROPOSAL_KIND,
        id,
        type,
        participants,
        threshold,
        quorum,
        expires,
        action,
        weights,
        content: event.content,
        event,
      };
    } catch (error) {
      // Re-throw ProposalExpiredError without wrapping
      if (error instanceof ProposalExpiredError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new Error(`Failed to parse proposal: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Check if a proposal is still active (not expired).
   *
   * @param proposal - The proposal to check
   * @returns true if proposal has not expired
   */
  isActive(proposal: Proposal): boolean {
    return !this.isExpired(proposal);
  }

  /**
   * Check if a proposal has expired.
   *
   * @param proposal - The proposal to check
   * @returns true if current time > proposal.expires
   */
  isExpired(proposal: Proposal): boolean {
    return Math.floor(Date.now() / 1000) > proposal.expires;
  }

  /**
   * Validates that the event kind is 5910.
   *
   * @param event - The Nostr event to validate
   * @throws Error if kind is not 5910
   */
  private validateKind(event: NostrEvent): void {
    if (event.kind !== COORDINATION_PROPOSAL_KIND) {
      throw new Error(`Invalid event kind: ${event.kind}. Expected ${COORDINATION_PROPOSAL_KIND}`);
    }
  }

  /**
   * Extracts and validates the coordination type from tags.
   *
   * @param tags - The event tags array
   * @returns A valid CoordinationType
   * @throws Error if type tag is missing or invalid
   */
  private parseCoordinationType(tags: string[][]): CoordinationType {
    const typeValue = this.getRequiredTag(tags, TAG_TYPE);

    const result = CoordinationTypeSchema.safeParse(typeValue);
    if (!result.success) {
      throw new Error(
        `Invalid coordination type: "${typeValue}". Must be one of: consensus, majority, threshold, ranked, allocation`
      );
    }

    return result.data;
  }

  /**
   * Extracts all participant pubkeys from p tags.
   *
   * @param tags - The event tags array
   * @returns Array of validated participant pubkeys
   * @throws Error if no participants or invalid pubkey format
   */
  private getPTags(tags: string[][]): string[] {
    const participants = this.getAllTags(tags, TAG_P);

    if (participants.length === 0) {
      throw new Error('At least one participant required');
    }

    if (participants.length > MAX_PARTICIPANTS) {
      throw new Error(`Maximum ${MAX_PARTICIPANTS} participants allowed`);
    }

    // Validate each pubkey format
    for (const pubkey of participants) {
      if (!this.isValidPubkey(pubkey)) {
        throw new Error(`Invalid pubkey format: ${pubkey}. Must be 64-character hex string`);
      }
    }

    return participants;
  }

  /**
   * Validates that threshold doesn't exceed participant count.
   *
   * @param tags - The event tags array
   * @param participantCount - Number of participants
   * @throws Error if threshold > participantCount
   */
  private validateThreshold(tags: string[][], participantCount: number): void {
    const threshold = this.parseOptionalNumber(tags, TAG_THRESHOLD);

    if (threshold !== undefined && threshold > participantCount) {
      throw new Error(`Threshold ${threshold} exceeds participant count ${participantCount}`);
    }
  }

  /**
   * Extracts and validates the expires tag.
   *
   * @param tags - The event tags array
   * @returns Unix timestamp for expiration
   * @throws Error if expires tag is missing or invalid
   */
  private parseExpires(tags: string[][]): number {
    const expiresStr = this.getRequiredTag(tags, TAG_EXPIRES);
    const expires = parseInt(expiresStr, 10);

    if (isNaN(expires) || expires <= 0) {
      throw new Error('Invalid expires value: must be a positive Unix timestamp');
    }

    return expires;
  }

  /**
   * Validates that the proposal hasn't expired.
   *
   * @param expires - The expiration Unix timestamp
   * @throws ProposalExpiredError if proposal has expired
   */
  private validateNotExpired(expires: number): void {
    const now = Math.floor(Date.now() / 1000);
    if (now > expires) {
      throw new ProposalExpiredError('unknown'); // ID not yet extracted
    }
  }

  /**
   * Parses the optional action tag.
   *
   * @param tags - The event tags array
   * @returns ProposalAction or undefined
   * @throws Error if action tag is malformed
   */
  private parseAction(tags: string[][]): ProposalAction | undefined {
    const actionTag = tags.find((t) => t[0] === TAG_ACTION);
    if (!actionTag) {
      return undefined;
    }

    // Validate action tag has 3 elements: ['action', kindString, jsonData]
    if (actionTag.length < 3 || !actionTag[1] || !actionTag[2]) {
      throw new Error('Invalid action tag: must have kind and data');
    }

    const kindStr = actionTag[1];
    const data = actionTag[2];

    // Validate kind is a positive integer
    const kind = parseInt(kindStr, 10);
    if (isNaN(kind) || kind <= 0) {
      throw new Error(`Invalid action kind: "${kindStr}". Must be a positive integer`);
    }

    // Validate data length
    if (data.length > MAX_ACTION_DATA_LENGTH) {
      throw new Error(`Action data exceeds maximum length of ${MAX_ACTION_DATA_LENGTH} bytes`);
    }

    // Validate data is valid JSON
    try {
      JSON.parse(data);
    } catch {
      throw new Error('Invalid action data: not valid JSON');
    }

    return { kind, data };
  }

  /**
   * Parses weight tags into a Map.
   *
   * @param tags - The event tags array
   * @returns Map of pubkey to weight, or undefined if no weights
   * @throws Error if weight value is invalid
   */
  private parseWeights(tags: string[][]): Map<string, number> | undefined {
    const weightTags = tags.filter((t) => t[0] === TAG_WEIGHT && t[1] && t[2]);

    if (weightTags.length === 0) {
      return undefined;
    }

    const weights = new Map<string, number>();

    for (const tag of weightTags) {
      // TypeScript now knows these are defined due to filter
      const pubkey = tag[1] as string;
      const weightStr = tag[2] as string;

      const weight = parseFloat(weightStr);
      if (isNaN(weight) || weight < 0) {
        throw new Error(`Invalid weight value: "${weightStr}". Must be a non-negative number`);
      }

      if (weight > MAX_WEIGHT_VALUE) {
        throw new Error(`Weight value ${weight} exceeds maximum ${MAX_WEIGHT_VALUE}`);
      }

      weights.set(pubkey, weight);
    }

    return weights;
  }

  /**
   * Validates that a pubkey is a 64-character hex string.
   *
   * @param pubkey - The pubkey to validate
   * @returns true if valid
   */
  private isValidPubkey(pubkey: string): boolean {
    return /^[0-9a-f]{64}$/.test(pubkey);
  }

  /**
   * Extracts a required tag value.
   *
   * @param tags - The event tags array
   * @param tagName - The tag name to extract
   * @returns The tag value
   * @throws Error if tag is missing
   */
  private getRequiredTag(tags: string[][], tagName: string): string {
    const tag = tags.find((t) => t[0] === tagName);
    if (!tag || !tag[1]) {
      throw new Error(`Missing required tag: ${tagName}`);
    }
    return tag[1];
  }

  /**
   * Extracts an optional tag value.
   *
   * @param tags - The event tags array
   * @param tagName - The tag name to extract
   * @returns The tag value or undefined
   */
  private getOptionalTag(tags: string[][], tagName: string): string | undefined {
    const tag = tags.find((t) => t[0] === tagName);
    return tag?.[1];
  }

  /**
   * Extracts all values for a repeated tag.
   *
   * @param tags - The event tags array
   * @param tagName - The tag name to extract
   * @returns Array of all tag values
   */
  private getAllTags(tags: string[][], tagName: string): string[] {
    return tags
      .filter((t) => t[0] === tagName && t[1])
      .map((t) => t[1])
      .filter((v): v is string => v !== undefined);
  }

  /**
   * Parses an optional number tag.
   *
   * @param tags - The event tags array
   * @param tagName - The tag name to extract
   * @returns The parsed number or undefined
   */
  private parseOptionalNumber(tags: string[][], tagName: string): number | undefined {
    const value = this.getOptionalTag(tags, tagName);
    if (value === undefined) {
      return undefined;
    }

    const num = parseInt(value, 10);
    if (isNaN(num)) {
      throw new Error(`Invalid ${tagName} value: "${value}". Must be a number`);
    }

    return num;
  }
}
