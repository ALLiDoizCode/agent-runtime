/**
 * Capability Query Service
 *
 * Queries and filters peer capability events from local storage and optionally relays.
 * Parses Kind 31990 events into AgentCapability objects with filtering and sorting.
 *
 * @packageDocumentation
 */

import type { NostrEvent } from '../toon-codec';
import type { AgentEventDatabase } from '../event-database';
import type { Logger } from 'pino';
import {
  TAG_NAMES,
  type AgentCapability,
  type AgentType,
  type AgentMetadata,
  type PricingEntry,
  type CapacityInfo,
  type CapabilityQuery,
  AgentCapabilitySchema,
} from './types';

/**
 * Service for querying and filtering capability events.
 *
 * Provides methods to find agents based on capabilities, pricing, and other criteria.
 * Supports querying from local storage and optionally from relays.
 */
export class CapabilityQueryService {
  private readonly _eventDatabase: AgentEventDatabase;
  private readonly _logger?: Logger;

  constructor(eventDatabase: AgentEventDatabase, logger?: Logger) {
    this._eventDatabase = eventDatabase;
    this._logger = logger;
  }

  /**
   * Find agents matching the given query criteria.
   *
   * @param query - Query parameters for filtering capabilities
   * @returns Array of AgentCapability objects matching the query
   */
  async findAgents(query: CapabilityQuery): Promise<AgentCapability[]> {
    this._logger?.debug({ query }, 'Finding agents with capability query');

    // Build NostrFilter for Kind 31990 events
    const filter: {
      kinds: number[];
      '#k'?: string[];
      authors?: string[];
      limit?: number;
    } = {
      kinds: [31990],
    };

    // Add k tag filter if required kinds specified
    if (query.requiredKinds && query.requiredKinds.length > 0) {
      filter['#k'] = query.requiredKinds.map((k: number) => k.toString());
    }

    // Add authors filter if pubkeys specified
    if (query.pubkeys && query.pubkeys.length > 0) {
      filter.authors = query.pubkeys;
    }

    // Add limit if specified
    if (query.limit) {
      filter.limit = query.limit;
    }

    // Query local database
    const events = await this._eventDatabase.queryEvents(filter);
    this._logger?.debug(
      { eventCount: events.length },
      'Retrieved capability events from local storage'
    );

    // Parse events into AgentCapability objects
    const capabilities: AgentCapability[] = [];
    for (const event of events) {
      try {
        const capability = this._parseCapability(event);
        capabilities.push(capability);
      } catch (error) {
        // Log and skip invalid events
        this._logger?.warn(
          { eventId: event.id, error },
          'Failed to parse capability event, skipping'
        );
      }
    }

    // Apply filters
    let filtered = capabilities;

    // Filter by agent type (OR logic - match any type)
    if (query.agentTypes && query.agentTypes.length > 0) {
      filtered = filtered.filter((c) => query.agentTypes!.includes(c.agentType));
    }

    // Filter by required kinds (AND logic - must support all)
    if (query.requiredKinds && query.requiredKinds.length > 0) {
      filtered = filtered.filter((c) => {
        return query.requiredKinds!.every((kind: number) => c.supportedKinds.includes(kind));
      });
    }

    // Filter by max price
    if (query.maxPrice !== undefined) {
      filtered = filtered.filter((c) => {
        // If max price specified, capability must have pricing for all required kinds
        if (!query.requiredKinds || query.requiredKinds.length === 0) {
          // No required kinds, just check if any pricing exists within budget
          for (const pricing of c.pricing.values()) {
            if (pricing.amount <= query.maxPrice!) {
              return true;
            }
          }
          return false;
        }

        // Check all required kinds have pricing within budget
        for (const kind of query.requiredKinds) {
          const pricing = c.pricing.get(kind);
          if (!pricing || pricing.amount > query.maxPrice!) {
            return false;
          }
        }
        return true;
      });
    }

    // Filter by ILP address prefix (case-sensitive)
    if (query.ilpAddressPrefix) {
      filtered = filtered.filter((c) => c.ilpAddress.startsWith(query.ilpAddressPrefix!));
    }

    // Sort results
    const sorted = this._rankCapabilities(filtered, query.requiredKinds);

    // Apply limit after filtering and sorting
    if (query.limit && sorted.length > query.limit) {
      return sorted.slice(0, query.limit);
    }

    this._logger?.info(
      { matchCount: sorted.length, totalParsed: capabilities.length },
      'Capability query complete'
    );

    return sorted;
  }

  /**
   * Parse a Kind 31990 event into an AgentCapability object.
   *
   * @param event - Nostr event to parse
   * @returns Parsed AgentCapability object
   * @throws Error if event structure is invalid
   */
  private _parseCapability(event: NostrEvent): AgentCapability {
    // Parse tags
    let identifier = '';
    const supportedKinds: number[] = [];
    const supportedNips: string[] = [];
    let agentType: AgentType = 'assistant'; // Default fallback
    let ilpAddress = '';
    const pricingMap = new Map<number, PricingEntry>();
    let capacity: CapacityInfo | undefined;
    let model: string | undefined;
    const skills: string[] = [];

    for (const tag of event.tags) {
      const tagName = tag[0];

      if (tagName === TAG_NAMES.IDENTIFIER && tag[1]) {
        identifier = tag[1];
      } else if (tagName === TAG_NAMES.KIND && tag[1]) {
        const kind = parseInt(tag[1], 10);
        if (!isNaN(kind)) {
          supportedKinds.push(kind);
        }
      } else if (tagName === TAG_NAMES.NIP && tag[1]) {
        supportedNips.push(tag[1]);
      } else if (tagName === TAG_NAMES.AGENT_TYPE && tag[1]) {
        agentType = tag[1] as AgentType;
      } else if (tagName === TAG_NAMES.ILP_ADDRESS && tag[1]) {
        ilpAddress = tag[1];
      } else if (tagName === TAG_NAMES.PRICING && tag[1] && tag[2] && tag[3]) {
        const kind = parseInt(tag[1], 10);
        const amount = BigInt(tag[2]);
        const currency = tag[3] as 'msat' | 'sat' | 'usd';
        if (!isNaN(kind)) {
          pricingMap.set(kind, { kind, amount, currency });
        }
      } else if (tagName === TAG_NAMES.CAPACITY && tag[1] && tag[2]) {
        const maxConcurrent = parseInt(tag[1], 10);
        const queueDepth = parseInt(tag[2], 10);
        if (!isNaN(maxConcurrent) && !isNaN(queueDepth)) {
          capacity = { maxConcurrent, queueDepth };
        }
      } else if (tagName === TAG_NAMES.MODEL && tag[1]) {
        model = tag[1];
      } else if (tagName === TAG_NAMES.SKILLS) {
        // Skills tag has format ['skills', skill1, skill2, ...]
        skills.push(...tag.slice(1));
      }
    }

    // Parse content JSON for metadata
    let metadata: AgentMetadata;
    try {
      metadata = JSON.parse(event.content);
    } catch {
      // Fallback to empty metadata if content is invalid
      metadata = { name: 'Unknown Agent' };
    }

    // Construct capability object
    const capability: AgentCapability = {
      pubkey: event.pubkey,
      identifier,
      supportedKinds,
      supportedNips,
      agentType,
      ilpAddress,
      pricing: pricingMap,
      capacity,
      model,
      skills: skills.length > 0 ? skills : undefined,
      metadata,
      createdAt: event.created_at,
    };

    // Validate with Zod schema
    const validated = AgentCapabilitySchema.parse(capability);

    return validated;
  }

  /**
   * Rank capabilities by pricing, capacity, and freshness.
   *
   * Sorting priority:
   * 1. Pricing (lowest first) - prefer cheaper agents
   * 2. Capacity (highest maxConcurrent first) - prefer higher capacity
   * 3. Freshness (newest first) - prefer recent capability updates
   *
   * @param capabilities - Capabilities to rank
   * @param requiredKinds - Required event kinds for pricing comparison
   * @returns Sorted array of capabilities
   */
  private _rankCapabilities(
    capabilities: AgentCapability[],
    requiredKinds?: number[]
  ): AgentCapability[] {
    return capabilities.sort((a, b) => {
      // 1. Sort by pricing (lowest first)
      if (requiredKinds && requiredKinds.length > 0) {
        // Compare total price for all required kinds
        let totalA = 0n;
        let totalB = 0n;
        let hasA = true;
        let hasB = true;

        for (const kind of requiredKinds) {
          const priceA = a.pricing.get(kind);
          const priceB = b.pricing.get(kind);

          if (!priceA) hasA = false;
          if (!priceB) hasB = false;

          if (priceA) totalA += priceA.amount;
          if (priceB) totalB += priceB.amount;
        }

        // Capabilities with pricing come before those without
        if (hasA && !hasB) return -1;
        if (!hasA && hasB) return 1;

        // If both have pricing, compare totals
        if (hasA && hasB && totalA !== totalB) {
          return totalA < totalB ? -1 : 1;
        }
      }

      // 2. Sort by capacity (highest maxConcurrent first)
      const capacityA = a.capacity?.maxConcurrent ?? 0;
      const capacityB = b.capacity?.maxConcurrent ?? 0;
      if (capacityA !== capacityB) {
        return capacityB - capacityA; // Higher capacity first
      }

      // 3. Sort by freshness (newest first)
      return b.createdAt - a.createdAt; // More recent first
    });
  }
}
