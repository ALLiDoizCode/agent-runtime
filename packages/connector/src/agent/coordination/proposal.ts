import { randomBytes } from 'crypto';
import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
import { NostrEvent } from '../toon-codec';
import {
  CreateProposalParams,
  CreateProposalParamsSchema,
  Proposal,
  COORDINATION_PROPOSAL_KIND,
  TAG_D,
  TAG_TYPE,
  TAG_P,
  TAG_THRESHOLD,
  TAG_QUORUM,
  TAG_EXPIRES,
  TAG_ACTION,
  TAG_WEIGHT,
  TAG_STAKE,
} from './types';

/**
 * Creates coordination proposal events (Kind 5910).
 *
 * ProposalCreator handles the creation of signed Nostr events for
 * multi-agent coordination proposals. Each proposal includes:
 * - Unique proposal ID (d tag)
 * - Coordination type (consensus, majority, threshold, ranked, allocation)
 * - Participant list (p tags)
 * - Optional threshold, quorum, action, and vote weights
 * - Expiration timestamp
 */
export class ProposalCreator {
  private readonly _privateKey: Uint8Array;
  private readonly _pubkey: string;
  private readonly _ilpAddress: string;

  /**
   * Creates a new ProposalCreator instance.
   *
   * @param privateKeyHex - The coordinator's private key as a hex string
   * @param ilpAddress - The coordinator's ILP address for escrow address generation
   */
  constructor(privateKeyHex: string, ilpAddress: string) {
    this._privateKey = hexToBytes(privateKeyHex);
    this._pubkey = getPublicKey(this._privateKey);
    this._ilpAddress = ilpAddress;
  }

  /**
   * Gets the public key of this coordinator.
   */
  get pubkey(): string {
    return this._pubkey;
  }

  /**
   * Generates a unique proposal ID.
   *
   * @returns A 32-character hex string for use as the d tag
   */
  generateProposalId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Builds the Nostr tags array for a proposal event.
   *
   * @param proposalId - The unique proposal ID
   * @param params - The proposal parameters
   * @param expires - The expiration Unix timestamp
   * @returns Array of Nostr tags
   */
  private buildTags(proposalId: string, params: CreateProposalParams, expires: number): string[][] {
    const tags: string[][] = [];

    // d tag - unique identifier (AC: 1)
    tags.push([TAG_D, proposalId]);

    // type tag - coordination type (AC: 2)
    tags.push([TAG_TYPE, params.type]);

    // p tags - participants (AC: 3)
    for (const pubkey of params.participants) {
      tags.push([TAG_P, pubkey]);
    }

    // threshold tag - when defined (AC: 4)
    if (params.threshold !== undefined) {
      tags.push([TAG_THRESHOLD, params.threshold.toString()]);
    }

    // quorum tag - when defined (AC: 5)
    if (params.quorum !== undefined) {
      tags.push([TAG_QUORUM, params.quorum.toString()]);
    }

    // expires tag - Unix timestamp (AC: 6)
    tags.push([TAG_EXPIRES, expires.toString()]);

    // action tag - when defined (AC: 7)
    if (params.action) {
      tags.push([TAG_ACTION, params.action.kind.toString(), params.action.data]);
    }

    // weight tags - for weighted voting (AC: 8)
    if (params.weights) {
      for (const [pubkey, weight] of Object.entries(params.weights)) {
        tags.push([TAG_WEIGHT, pubkey, weight.toString()]);
      }
    }

    // stake tag - when stake required (AC: 1, 6)
    if (params.stakeRequired !== undefined) {
      tags.push([TAG_STAKE, params.stakeRequired.toString()]);
    }

    return tags;
  }

  /**
   * Generates escrow ILP address for a proposal.
   *
   * @param proposalId - The unique proposal ID
   * @returns Escrow ILP address in format: {ilpAddress}.escrow.{proposalId}
   */
  generateEscrowAddress(proposalId: string): string {
    return `${this._ilpAddress}.escrow.${proposalId}`;
  }

  /**
   * Creates a signed coordination proposal event (Kind 5910).
   *
   * @param params - The proposal parameters
   * @returns A signed NostrEvent
   * @throws ZodError if params validation fails
   */
  create(params: CreateProposalParams): NostrEvent {
    // Validate params using Zod schema
    CreateProposalParamsSchema.parse(params);

    // Calculate expiration timestamp
    const expires = Math.floor(Date.now() / 1000) + params.expiresIn;

    // Generate unique proposal ID
    const proposalId = this.generateProposalId();

    // Build tags array
    const tags = this.buildTags(proposalId, params, expires);

    // Generate escrow address if stake required
    let contentWithEscrow = params.description;
    if (params.stakeRequired !== undefined) {
      const escrowAddress = this.generateEscrowAddress(proposalId);
      contentWithEscrow += `\n\nEscrow Address: ${escrowAddress}`;
    }

    // Create unsigned event template
    const eventTemplate = {
      kind: COORDINATION_PROPOSAL_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: contentWithEscrow, // AC: 9
    };

    // Sign event with coordinator's private key (AC: 10)
    const signedEvent = finalizeEvent(eventTemplate, this._privateKey);

    return signedEvent as NostrEvent;
  }

  /**
   * Converts a NostrEvent back to a Proposal interface.
   *
   * This helper method parses the tags from a Kind 5910 event
   * and constructs a Proposal object for easier consumption.
   *
   * @param event - A Kind 5910 NostrEvent
   * @returns A Proposal object
   */
  toProposal(event: NostrEvent): Proposal {
    const tags = event.tags;

    // Extract d tag (proposal ID)
    const dTag = tags.find((t) => t[0] === TAG_D);
    const id = dTag?.[1] ?? '';

    // Extract type tag
    const typeTag = tags.find((t) => t[0] === TAG_TYPE);
    const type = (typeTag?.[1] ?? 'consensus') as Proposal['type'];

    // Extract p tags (participants)
    const participants = tags
      .filter((t) => t[0] === TAG_P)
      .map((t) => t[1])
      .filter((p): p is string => p !== undefined);

    // Extract threshold tag
    const thresholdTag = tags.find((t) => t[0] === TAG_THRESHOLD);
    const threshold = thresholdTag?.[1] ? parseInt(thresholdTag[1], 10) : undefined;

    // Extract quorum tag
    const quorumTag = tags.find((t) => t[0] === TAG_QUORUM);
    const quorum = quorumTag?.[1] ? parseInt(quorumTag[1], 10) : undefined;

    // Extract expires tag
    const expiresTag = tags.find((t) => t[0] === TAG_EXPIRES);
    const expires = expiresTag?.[1] ? parseInt(expiresTag[1], 10) : 0;

    // Extract action tag
    const actionTag = tags.find((t) => t[0] === TAG_ACTION);
    const action =
      actionTag?.[1] && actionTag[2]
        ? { kind: parseInt(actionTag[1], 10), data: actionTag[2] }
        : undefined;

    // Extract weight tags and convert to Map
    const weightTags = tags.filter((t) => t[0] === TAG_WEIGHT && t[1] && t[2]);
    const weights =
      weightTags.length > 0
        ? new Map(weightTags.map((t) => [t[1] as string, parseFloat(t[2] as string)]))
        : undefined;

    // Extract stake tag
    const stakeTag = tags.find((t) => t[0] === TAG_STAKE);
    const stakeRequired = stakeTag?.[1] ? BigInt(stakeTag[1]) : undefined;

    // Extract escrow address from content
    const escrowMatch = event.content.match(/Escrow Address: (.+)/);
    const escrowAddress = escrowMatch?.[1] ?? undefined;

    // Initialize stakes Map if stake required
    const stakes = stakeRequired !== undefined ? new Map<string, bigint>() : undefined;

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
      stakeRequired,
      escrowAddress,
      stakes,
    };
  }
}
