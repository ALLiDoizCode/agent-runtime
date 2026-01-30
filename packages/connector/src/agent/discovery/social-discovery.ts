import type { Logger } from 'pino';
import type { FollowGraphRouter } from '../follow-graph-router';
import type { AgentEventDatabase } from '../event-database';
import type { NostrEvent } from '../toon-codec';
import { CapabilityQueryService } from './capability-query';
import type { CapabilityCache } from './capability-cache';
import type {
  AgentCapability,
  SocialDiscoveryConfig,
  DiscoveryOptions,
  CapabilityWithDistance,
} from './types';

/**
 * SocialCapabilityDiscovery discovers capable agents through the social graph.
 * Leverages the follow graph to find trusted peers with required capabilities,
 * supporting both direct follows and 2-hop (follows of follows) discovery.
 */
export class SocialCapabilityDiscovery {
  private readonly followGraphRouter: FollowGraphRouter;
  private readonly queryService: CapabilityQueryService;
  private readonly eventDatabase: AgentEventDatabase;
  private readonly cache?: CapabilityCache;
  private readonly config: SocialDiscoveryConfig;
  private readonly logger: Logger;
  private readonly agentPubkey: string;

  /**
   * Creates a new SocialCapabilityDiscovery instance
   *
   * @param followGraphRouter - Router for follow graph management
   * @param queryService - Service for querying capabilities
   * @param eventDatabase - Database for Nostr event queries
   * @param agentPubkey - This agent's pubkey (for excluding self from 2-hop)
   * @param config - Discovery configuration
   * @param cache - Optional capability cache (Story 18.7 - per-pubkey caching)
   * @param logger - Pino logger instance
   */
  constructor(
    followGraphRouter: FollowGraphRouter,
    queryService: CapabilityQueryService,
    eventDatabase: AgentEventDatabase,
    agentPubkey: string,
    config: SocialDiscoveryConfig = {},
    cache?: CapabilityCache,
    logger?: Logger
  ) {
    this.followGraphRouter = followGraphRouter;
    this.queryService = queryService;
    this.eventDatabase = eventDatabase;
    this.agentPubkey = agentPubkey;
    this.cache = cache;
    this.config = {
      extendedHops: config.extendedHops ?? false,
      maxDistance: config.maxDistance ?? 1,
      cacheEnabled: config.cacheEnabled ?? false,
      cacheTtl: config.cacheTtl ?? 300,
    };

    // Create child logger or no-op logger
    this.logger = logger
      ? (logger.child({ component: 'SocialCapabilityDiscovery' }) as Logger)
      : ({
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          child: () => this.logger,
        } as unknown as Logger);

    // Validate config
    if (this.config.maxDistance! < 1 || this.config.maxDistance! > 2) {
      this.logger.warn(
        { maxDistance: this.config.maxDistance },
        'maxDistance must be 1 or 2, defaulting to 1'
      );
      this.config.maxDistance = 1;
    }
  }

  /**
   * Gets followed pubkeys from FollowGraphRouter
   *
   * @returns Array of followed agent pubkeys
   */
  getFollowedPubkeys(): string[] {
    const follows = this.followGraphRouter.getAllFollows();
    const pubkeys = follows.map((f) => f.pubkey);

    this.logger.debug({ followCount: pubkeys.length }, 'Retrieved followed pubkeys');

    return pubkeys;
  }

  /**
   * Discovers agents with required capability through the social graph
   *
   * Cache integration (Story 18.7): Uses per-pubkey caching in _discoverDirectFollows
   * and _discover2HopFollows for transparent performance optimization.
   *
   * @param kind - Required event kind
   * @param options - Discovery options
   * @returns Array of capabilities sorted by social distance
   */
  async discoverForKind(
    kind: number,
    options: DiscoveryOptions = {}
  ): Promise<CapabilityWithDistance[]> {
    try {
      // Merge options with config defaults
      const extendedHops = options.extendedHops ?? this.config.extendedHops ?? false;
      const limit = options.limit;

      // Discover direct follows (uses cache if provided)
      const directCapabilities = await this._discoverDirectFollows(kind, limit);

      // Optionally discover 2-hop follows (uses cache if provided)
      let allCapabilities: CapabilityWithDistance[];
      if (extendedHops && this.config.maxDistance! >= 2) {
        const secondHopCapabilities = await this._discover2HopFollows(kind, limit);
        allCapabilities = [...directCapabilities, ...secondHopCapabilities];
      } else {
        allCapabilities = directCapabilities;
      }

      // Sort by social distance, then by existing ranking
      const sorted = this._sortByDistance(allCapabilities);

      // Apply limit if specified
      const results = limit ? sorted.slice(0, limit) : sorted;

      this.logger.info(
        { kind, resultCount: results.length, extendedHops },
        'Completed capability discovery'
      );

      return results;
    } catch (error) {
      this.logger.error({ error, kind }, 'Failed to discover capabilities');
      return [];
    }
  }

  /**
   * Discovers capabilities from direct follows
   *
   * Uses per-pubkey cache (Story 18.7) if provided for performance optimization.
   *
   * @param kind - Required event kind
   * @param limit - Optional result limit
   * @returns Capabilities with distance = 1
   */
  private async _discoverDirectFollows(
    kind: number,
    limit?: number
  ): Promise<CapabilityWithDistance[]> {
    try {
      // Get followed pubkeys
      const followedPubkeys = this.getFollowedPubkeys();

      if (followedPubkeys.length === 0) {
        this.logger.debug('No follows configured, returning empty results');
        return [];
      }

      const followedCapabilities: CapabilityWithDistance[] = [];

      // Check cache for each pubkey if cache is available
      for (const pubkey of followedPubkeys) {
        let capability: AgentCapability | undefined;

        // Try cache first if available
        if (this.cache) {
          capability = await this.cache.get(pubkey);
          if (capability) {
            this.logger.debug({ pubkey, cacheHit: true }, 'Cache hit for direct follow capability');
          } else {
            this.logger.debug(
              { pubkey, cacheHit: false },
              'Cache miss for direct follow capability'
            );
          }
        }

        // If cache miss or no cache, query database
        if (!capability) {
          const results = await this.queryService.findAgents({
            pubkeys: [pubkey],
            requiredKinds: [kind],
            limit: 1,
          });

          if (results.length > 0 && results[0]) {
            capability = results[0];
            // Update cache if available
            if (this.cache) {
              this.cache.set(pubkey, capability);
            }
          }
        }

        // Filter by required kind and add to results
        if (capability && capability.supportedKinds.includes(kind)) {
          followedCapabilities.push(this._enrichWithRoutingInfo(capability, 1));
        }

        // Apply limit if specified
        if (limit && followedCapabilities.length >= limit) {
          break;
        }
      }

      this.logger.debug(
        { kind, followedCount: followedCapabilities.length, cacheEnabled: !!this.cache },
        'Discovered direct follow capabilities'
      );

      return followedCapabilities;
    } catch (error) {
      this.logger.error({ error, kind }, 'Failed to discover direct follow capabilities');
      return [];
    }
  }

  /**
   * Discovers capabilities from 2-hop follows (follows of follows)
   *
   * Uses per-pubkey cache (Story 18.7) if provided for performance optimization.
   *
   * @param kind - Required event kind
   * @param limit - Optional result limit
   * @returns Capabilities with distance = 2
   */
  private async _discover2HopFollows(
    kind: number,
    limit?: number
  ): Promise<CapabilityWithDistance[]> {
    try {
      // Get direct follows
      const directFollows = this.getFollowedPubkeys();

      if (directFollows.length === 0) {
        return [];
      }

      // Query Kind 3 events for direct follows
      const kind3Events = await this.eventDatabase.queryEvents({
        kinds: [3],
        authors: directFollows,
      });

      // Extract 2-hop pubkeys from Kind 3 events
      const secondHopPubkeys = this._extract2HopPubkeys(kind3Events, directFollows);

      if (secondHopPubkeys.length === 0) {
        this.logger.debug('No 2-hop follows found');
        return [];
      }

      const secondHopCapabilities: CapabilityWithDistance[] = [];

      // Check cache for each pubkey if cache is available
      for (const pubkey of secondHopPubkeys) {
        let capability: AgentCapability | undefined;

        // Try cache first if available
        if (this.cache) {
          capability = await this.cache.get(pubkey);
          if (capability) {
            this.logger.debug({ pubkey, cacheHit: true }, 'Cache hit for 2-hop capability');
          } else {
            this.logger.debug({ pubkey, cacheHit: false }, 'Cache miss for 2-hop capability');
          }
        }

        // If cache miss or no cache, query database
        if (!capability) {
          const results = await this.queryService.findAgents({
            pubkeys: [pubkey],
            requiredKinds: [kind],
            limit: 1,
          });

          if (results.length > 0 && results[0]) {
            capability = results[0];
            // Update cache if available
            if (this.cache) {
              this.cache.set(pubkey, capability);
            }
          }
        }

        // Filter by required kind and add to results
        if (capability && capability.supportedKinds.includes(kind)) {
          secondHopCapabilities.push(this._enrichWithRoutingInfo(capability, 2));
        }

        // Apply limit if specified
        if (limit && secondHopCapabilities.length >= limit) {
          break;
        }
      }

      this.logger.debug(
        { kind, secondHopCount: secondHopCapabilities.length, cacheEnabled: !!this.cache },
        'Discovered 2-hop follow capabilities'
      );

      return secondHopCapabilities;
    } catch (error) {
      this.logger.error({ error, kind }, 'Failed to discover 2-hop capabilities, returning empty');
      return [];
    }
  }

  /**
   * Extracts 2-hop pubkeys from Kind 3 follow events
   *
   * @param kind3Events - Kind 3 Nostr events
   * @param directFollows - Direct follow pubkeys to exclude
   * @returns Deduplicated 2-hop pubkeys
   */
  private _extract2HopPubkeys(kind3Events: NostrEvent[], directFollows: string[]): string[] {
    const directFollowSet = new Set(directFollows);
    const secondHopSet = new Set<string>();

    for (const event of kind3Events) {
      try {
        // Parse 'ilp' tags: ['ilp', '<pubkey>', '<ilp-address>']
        const ilpTags = event.tags.filter((tag) => tag[0] === 'ilp');

        for (const tag of ilpTags) {
          const pubkey = tag[1];

          if (!pubkey) {
            continue;
          }

          // Exclude self and direct follows
          if (pubkey === this.agentPubkey || directFollowSet.has(pubkey)) {
            continue;
          }

          secondHopSet.add(pubkey);
        }
      } catch (error) {
        this.logger.warn({ error, eventId: event.id }, 'Failed to parse Kind 3 event tags');
      }
    }

    const secondHopPubkeys = Array.from(secondHopSet);

    this.logger.debug(
      { kind3Count: kind3Events.length, secondHopCount: secondHopPubkeys.length },
      'Extracted 2-hop pubkeys'
    );

    return secondHopPubkeys;
  }

  /**
   * Enriches capability with routing information and social distance
   *
   * @param capability - Agent capability
   * @param distance - Social distance (1 or 2)
   * @returns Capability with distance and verified routing info
   */
  private _enrichWithRoutingInfo(
    capability: AgentCapability,
    distance: number
  ): CapabilityWithDistance {
    // Get ILP address from FollowGraphRouter
    const follow = this.followGraphRouter.getFollowByPubkey(capability.pubkey);
    const routerIlpAddress = follow?.ilpAddress;

    // Warn if ILP addresses don't match
    if (routerIlpAddress && routerIlpAddress !== capability.ilpAddress) {
      this.logger.warn(
        {
          pubkey: capability.pubkey,
          capabilityAddress: capability.ilpAddress,
          routerAddress: routerIlpAddress,
        },
        'ILP address mismatch between capability and router'
      );
    }

    return {
      ...capability,
      socialDistance: distance,
    };
  }

  /**
   * Sorts capabilities by social distance (primary) and existing ranking (secondary)
   *
   * @param capabilities - Capabilities with distance
   * @returns Sorted array (direct follows first, then 2-hop)
   */
  private _sortByDistance(capabilities: CapabilityWithDistance[]): CapabilityWithDistance[] {
    // Use stable sort to preserve CapabilityQueryService ranking within each distance tier
    return capabilities.slice().sort((a, b) => {
      // Primary: social distance (ascending - prefer closer)
      if (a.socialDistance !== b.socialDistance) {
        return a.socialDistance - b.socialDistance;
      }

      // Secondary: preserve existing order (CapabilityQueryService ranking)
      return 0;
    });
  }
}
