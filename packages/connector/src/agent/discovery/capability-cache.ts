/**
 * Capability Cache
 *
 * In-memory LRU cache for agent capabilities with TTL and auto-refresh.
 * Provides fast lookups with automatic background refresh of stale entries.
 *
 * @packageDocumentation
 */

import type { Logger } from 'pino';
import type { AgentEventDatabase } from '../event-database';
import type { CapabilityQueryService } from './capability-query';
import type { AgentCapability, CacheEntry, CacheMetrics, CapabilityCacheConfig } from './types';
import { TAG_NAMES, type AgentMetadata, type PricingEntry } from './types';

/**
 * Default configuration values for CapabilityCache
 */
const DEFAULT_CONFIG: Required<CapabilityCacheConfig> = {
  /** 24 hours in milliseconds */
  ttlMs: 86400000,
  /** Maximum 1000 entries */
  maxEntries: 1000,
  /** Auto-refresh every 1 hour */
  refreshIntervalMs: 3600000,
  /** Load 1000 most recent capabilities on startup */
  warmupLimit: 1000,
};

/**
 * In-memory LRU cache for agent capabilities with TTL and auto-refresh.
 *
 * Features:
 * - LRU eviction based on access time when at capacity
 * - TTL-based expiration (default: 24 hours)
 * - Automatic background refresh of stale entries (>80% TTL)
 * - Database persistence for restart recovery
 * - Cache metrics tracking (hits, misses, refreshes, evictions)
 *
 * Usage:
 * ```typescript
 * const cache = await CapabilityCache.create(config, queryService, eventDatabase, logger);
 * const capability = await cache.get(pubkey); // Returns AgentCapability or undefined
 * cache.set(pubkey, capability); // Add/update entry
 * await cache.refresh(pubkey); // Manual refresh from database
 * const metrics = cache.getMetrics(); // Get performance metrics
 * cache.stopAutoRefresh(); // Clean up when done
 * ```
 */
export class CapabilityCache {
  private readonly _cache: Map<string, CacheEntry<AgentCapability>>;
  private readonly _ttlMs: number;
  private readonly _maxEntries: number;
  private readonly _refreshIntervalMs: number;
  private readonly _warmupLimit: number;
  private readonly _queryService: CapabilityQueryService;
  private readonly _eventDatabase: AgentEventDatabase;
  private readonly _logger?: Logger;

  // Metrics
  private _cacheHits = 0;
  private _cacheMisses = 0;
  private _refreshCount = 0;
  private _evictions = 0;

  // Auto-refresh interval ID
  private _refreshInterval: NodeJS.Timeout | null = null;

  /**
   * Private constructor - use static create() method instead.
   *
   * @param config - Cache configuration
   * @param queryService - Capability query service for refresh operations
   * @param eventDatabase - Event database for persistence
   * @param logger - Optional Pino logger
   */
  private constructor(
    config: CapabilityCacheConfig,
    queryService: CapabilityQueryService,
    eventDatabase: AgentEventDatabase,
    logger?: Logger
  ) {
    this._cache = new Map();
    this._ttlMs = config.ttlMs ?? DEFAULT_CONFIG.ttlMs;
    this._maxEntries = config.maxEntries ?? DEFAULT_CONFIG.maxEntries;
    this._refreshIntervalMs = config.refreshIntervalMs ?? DEFAULT_CONFIG.refreshIntervalMs;
    this._warmupLimit = config.warmupLimit ?? DEFAULT_CONFIG.warmupLimit;
    this._queryService = queryService;
    this._eventDatabase = eventDatabase;
    this._logger = logger;
  }

  /**
   * Factory method to create and initialize cache (async).
   *
   * Performs async initialization including loading from database and starting auto-refresh.
   *
   * @param config - Cache configuration
   * @param queryService - Capability query service for refresh operations
   * @param eventDatabase - Event database for persistence
   * @param logger - Optional Pino logger
   * @returns Initialized CapabilityCache instance
   */
  static async create(
    config: CapabilityCacheConfig,
    queryService: CapabilityQueryService,
    eventDatabase: AgentEventDatabase,
    logger?: Logger
  ): Promise<CapabilityCache> {
    const cache = new CapabilityCache(config, queryService, eventDatabase, logger);
    await cache.load();
    cache.startAutoRefresh();
    logger?.info('CapabilityCache created and initialized');
    return cache;
  }

  /**
   * Get capability from cache (undefined if missing or expired).
   *
   * Updates access timestamp on cache hit for LRU tracking.
   * Increments cache hit/miss metrics.
   *
   * @param pubkey - Agent public key (64-character hex)
   * @returns AgentCapability if found and not expired, undefined otherwise
   */
  async get(pubkey: string): Promise<AgentCapability | undefined> {
    const entry = this._cache.get(pubkey);

    if (!entry) {
      this._cacheMisses++;
      this._logger?.debug({ pubkey, cacheHit: false }, 'Cache miss');
      return undefined;
    }

    // Check if expired
    if (this._isExpired(entry)) {
      this._cacheMisses++;
      this._logger?.debug({ pubkey, cacheHit: false, reason: 'expired' }, 'Cache miss');
      return undefined;
    }

    // Update access timestamp for LRU tracking
    entry.accessTimestamp = Date.now();
    this._cacheHits++;
    this._logger?.debug({ pubkey, cacheHit: true }, 'Cache hit');

    return entry.value;
  }

  /**
   * Add or update capability in cache.
   *
   * Performs LRU eviction if cache is at maxEntries capacity.
   *
   * @param pubkey - Agent public key
   * @param capability - Agent capability to cache
   */
  set(pubkey: string, capability: AgentCapability): void {
    const now = Date.now();

    // Check if we need to evict LRU entry
    if (this._cache.size >= this._maxEntries && !this._cache.has(pubkey)) {
      this._evictLRU();
    }

    // Add/update entry
    const entry: CacheEntry<AgentCapability> = {
      value: capability,
      timestamp: now,
      accessTimestamp: now,
    };

    this._cache.set(pubkey, entry);
    this._logger?.debug({ pubkey, cacheSize: this._cache.size }, 'Cache entry set');
  }

  /**
   * Refresh capability from database and update cache.
   *
   * Queries capability using CapabilityQueryService with pubkeys filter.
   * Increments refresh count metric.
   *
   * @param pubkey - Agent public key to refresh
   * @returns Updated AgentCapability
   * @throws Error if capability not found in database
   */
  async refresh(pubkey: string): Promise<AgentCapability> {
    this._logger?.debug({ pubkey }, 'Refreshing capability from database');

    const results = await this._queryService.findAgents({ pubkeys: [pubkey], limit: 1 });

    if (results.length === 0 || !results[0]) {
      throw new Error(`Capability not found for pubkey: ${pubkey}`);
    }

    const capability: AgentCapability = results[0];
    this.set(pubkey, capability);
    this._refreshCount++;

    this._logger?.debug({ pubkey, refreshCount: this._refreshCount }, 'Capability refreshed');
    return capability;
  }

  /**
   * Remove single entry from cache.
   *
   * @param pubkey - Agent public key to remove
   */
  invalidate(pubkey: string): void {
    this._cache.delete(pubkey);
    this._logger?.debug({ pubkey, cacheSize: this._cache.size }, 'Cache entry invalidated');
  }

  /**
   * Clear entire cache.
   */
  invalidateAll(): void {
    this._cache.clear();
    this._logger?.info('Cache invalidated (all entries cleared)');
  }

  /**
   * Get current cache metrics.
   *
   * @returns CacheMetrics snapshot
   */
  getMetrics(): CacheMetrics {
    return {
      hits: this._cacheHits,
      misses: this._cacheMisses,
      refreshCount: this._refreshCount,
      size: this._cache.size,
      evictions: this._evictions,
    };
  }

  /**
   * Start background auto-refresh of stale entries.
   *
   * Refreshes entries that have exceeded 80% of TTL in parallel.
   * Errors are logged as warnings but don't stop the refresh loop.
   */
  startAutoRefresh(): void {
    this._logger?.info(
      { refreshIntervalMs: this._refreshIntervalMs },
      'Starting auto-refresh background task'
    );

    this._refreshInterval = setInterval(async () => {
      const staleEntries = this._getStaleEntries();

      if (staleEntries.length === 0) {
        this._logger?.debug('No stale entries to refresh');
        return;
      }

      this._logger?.debug({ staleCount: staleEntries.length }, 'Refreshing stale cache entries');

      const results = await Promise.allSettled(
        staleEntries.map(([pubkey]) =>
          this.refresh(pubkey).catch((err) => {
            this._logger?.warn({ pubkey, err }, 'Auto-refresh failed');
            return null;
          })
        )
      );

      const successes = results.filter((r) => r.status === 'fulfilled').length;
      const failures = results.filter((r) => r.status === 'rejected').length;
      this._logger?.info({ successes, failures }, 'Auto-refresh cycle completed');
    }, this._refreshIntervalMs);
  }

  /**
   * Stop background auto-refresh.
   */
  stopAutoRefresh(): void {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
      this._logger?.info('Auto-refresh background task stopped');
    }
  }

  /**
   * Load cache from database (called by create(), not exposed publicly).
   *
   * Queries Kind 31990 events and populates cache for warm start.
   * Handles parse errors gracefully (logs warning, continues).
   *
   * @private
   */
  private async load(): Promise<void> {
    try {
      this._logger?.debug({ warmupLimit: this._warmupLimit }, 'Loading cache from database');

      const events = await this._eventDatabase.queryEvents({
        kinds: [31990],
        limit: this._warmupLimit,
      });

      for (const event of events) {
        try {
          const capability = this._parseCapability(event);
          this.set(capability.pubkey, capability);
        } catch (error) {
          this._logger?.warn({ eventId: event.id, error }, 'Failed to parse capability, skipping');
        }
      }

      this._logger?.info({ count: this._cache.size }, 'Cache loaded from database');
    } catch (error) {
      this._logger?.error({ error }, 'Failed to load cache from database');
      // Don't throw - cache is optional optimization
    }
  }

  /**
   * Check if cache entry is expired.
   *
   * @param entry - Cache entry to check
   * @returns True if expired, false otherwise
   * @private
   */
  private _isExpired(entry: CacheEntry<AgentCapability>): boolean {
    return Date.now() - entry.timestamp > this._ttlMs;
  }

  /**
   * Evict least recently used entry from cache.
   *
   * Finds entry with oldest accessTimestamp and removes it.
   * @private
   */
  private _evictLRU(): void {
    let oldestPubkey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [pubkey, entry] of this._cache.entries()) {
      if (entry.accessTimestamp < oldestTimestamp) {
        oldestTimestamp = entry.accessTimestamp;
        oldestPubkey = pubkey;
      }
    }

    if (oldestPubkey) {
      this._cache.delete(oldestPubkey);
      this._evictions++;
      this._logger?.debug(
        { pubkey: oldestPubkey, evictions: this._evictions },
        'LRU eviction performed'
      );
    }
  }

  /**
   * Get stale entries (>80% of TTL elapsed).
   *
   * @returns Array of [pubkey, entry] tuples for stale entries
   * @private
   */
  private _getStaleEntries(): [string, CacheEntry<AgentCapability>][] {
    const staleThreshold = this._ttlMs * 0.8; // 80% of TTL
    const now = Date.now();

    return Array.from(this._cache.entries()).filter(([_, entry]) => {
      const age = now - entry.timestamp;
      return age > staleThreshold;
    });
  }

  /**
   * Parse a Kind 31990 event into an AgentCapability object.
   *
   * This is a simplified parser for cache loading. For full validation,
   * use CapabilityQueryService._parseCapability().
   *
   * @param event - Nostr event to parse
   * @returns Parsed AgentCapability object
   * @throws Error if event structure is invalid
   * @private
   */
  private _parseCapability(event: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
  }): AgentCapability {
    // Parse tags
    let identifier = '';
    const supportedKinds: number[] = [];
    const supportedNips: string[] = [];
    let agentType: 'dvm' | 'assistant' | 'specialist' | 'coordinator' | 'relay' = 'assistant';
    let ilpAddress = '';
    const pricingMap = new Map<number, PricingEntry>();
    let capacity:
      | {
          maxConcurrent: number;
          queueDepth: number;
        }
      | undefined;
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
        agentType = tag[1] as 'dvm' | 'assistant' | 'specialist' | 'coordinator' | 'relay';
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
        skills.push(...tag.slice(1));
      }
    }

    // Validate required fields
    if (!identifier) {
      throw new Error('Missing required field: identifier (d tag)');
    }
    if (!ilpAddress) {
      throw new Error('Missing required field: ilpAddress (ilp-address tag)');
    }
    if (supportedKinds.length === 0) {
      throw new Error('Missing required field: supportedKinds (k tags)');
    }

    // Parse content JSON for metadata
    let metadata: AgentMetadata;
    try {
      metadata = JSON.parse(event.content);
    } catch {
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

    return capability;
  }
}
