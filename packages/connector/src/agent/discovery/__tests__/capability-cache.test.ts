/**
 * Unit tests for CapabilityCache
 *
 * Tests cover:
 * - Factory method initialization
 * - Cache hit/miss behavior
 * - TTL expiration
 * - LRU eviction
 * - Auto-refresh mechanism
 * - Database loading
 * - Metrics tracking
 */

import { CapabilityCache } from '../capability-cache';
import type { CapabilityQueryService } from '../capability-query';
import type { AgentEventDatabase } from '../../event-database';
import type { AgentCapability } from '../types';
import type { Logger } from 'pino';

// TODO: Enable once discovery module is implemented (Epic 18)
describe.skip('CapabilityCache', () => {
  // Mock dependencies
  let mockQueryService: jest.Mocked<CapabilityQueryService>;
  let mockEventDatabase: jest.Mocked<AgentEventDatabase>;
  let mockLogger: jest.Mocked<Logger>;

  // Test data
  const testPubkey1 = 'a'.repeat(64);
  const testPubkey2 = 'b'.repeat(64);
  const testPubkey3 = 'c'.repeat(64);

  const testCapability1: AgentCapability = {
    pubkey: testPubkey1,
    identifier: 'test.agent.1',
    supportedKinds: [5000, 5050],
    supportedNips: ['89'],
    agentType: 'dvm',
    ilpAddress: 'g.agent.test1',
    pricing: new Map([[5000, { kind: 5000, amount: 1000n, currency: 'msat' }]]),
    metadata: { name: 'Test Agent 1' },
    createdAt: Date.now(),
  };

  const testCapability2: AgentCapability = {
    pubkey: testPubkey2,
    identifier: 'test.agent.2',
    supportedKinds: [5050],
    supportedNips: ['89'],
    agentType: 'assistant',
    ilpAddress: 'g.agent.test2',
    pricing: new Map([[5050, { kind: 5050, amount: 2000n, currency: 'msat' }]]),
    metadata: { name: 'Test Agent 2' },
    createdAt: Date.now(),
  };

  const testCapability3: AgentCapability = {
    pubkey: testPubkey3,
    identifier: 'test.agent.3',
    supportedKinds: [5000],
    supportedNips: ['89'],
    agentType: 'specialist',
    ilpAddress: 'g.agent.test3',
    pricing: new Map([[5000, { kind: 5000, amount: 500n, currency: 'msat' }]]),
    metadata: { name: 'Test Agent 3' },
    createdAt: Date.now(),
  };

  beforeEach(() => {
    // Reset mocks
    mockQueryService = {
      findAgents: jest.fn(),
    } as unknown as jest.Mocked<CapabilityQueryService>;

    mockEventDatabase = {
      queryEvents: jest.fn().mockResolvedValue([]),
      storeEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AgentEventDatabase>;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    // Use fake timers
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('create() factory method', () => {
    it('should create and initialize cache', async () => {
      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      expect(cache).toBeInstanceOf(CapabilityCache);
      expect(mockEventDatabase.queryEvents).toHaveBeenCalledWith({
        kinds: [31990],
        limit: 1000,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(expect.any(String));
    });

    it('should load cache from database during create()', async () => {
      const testEvent = {
        id: 'event1',
        pubkey: testPubkey1,
        created_at: Date.now(),
        kind: 31990,
        tags: [
          ['d', 'test.agent.1'],
          ['k', '5000'],
          ['nip', '89'],
          ['agent-type', 'dvm'],
          ['ilp-address', 'g.agent.test1'],
          ['pricing', '5000', '1000', 'msat'],
        ],
        content: JSON.stringify({ name: 'Test Agent 1' }),
        sig: 'sig',
      };

      mockEventDatabase.queryEvents.mockResolvedValue([testEvent]);

      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      const result = await cache.get(testPubkey1);
      expect(result).toBeDefined();
      expect(result?.identifier).toBe('test.agent.1');
    });

    it('should start auto-refresh after initialization', async () => {
      const cache = await CapabilityCache.create(
        { refreshIntervalMs: 1000 },
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ refreshIntervalMs: 1000 }),
        expect.stringContaining('auto-refresh')
      );

      cache.stopAutoRefresh();
    });
  });

  describe('get() method', () => {
    it('should return undefined for missing entry', async () => {
      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      const result = await cache.get(testPubkey1);

      expect(result).toBeUndefined();
      expect(cache.getMetrics().misses).toBe(1);
      expect(cache.getMetrics().hits).toBe(0);

      cache.stopAutoRefresh();
    });

    it('should return capability for valid entry', async () => {
      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      cache.set(testPubkey1, testCapability1);
      const result = await cache.get(testPubkey1);

      expect(result).toEqual(testCapability1);
      expect(cache.getMetrics().hits).toBe(1);
      expect(cache.getMetrics().misses).toBe(0);

      cache.stopAutoRefresh();
    });

    it('should return undefined for expired entry', async () => {
      const cache = await CapabilityCache.create(
        { ttlMs: 1000 },
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      cache.set(testPubkey1, testCapability1);

      // Advance time past TTL
      jest.advanceTimersByTime(1001);

      const result = await cache.get(testPubkey1);

      expect(result).toBeUndefined();
      expect(cache.getMetrics().misses).toBe(1);

      cache.stopAutoRefresh();
    });

    it('should update accessTimestamp on cache hit', async () => {
      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      cache.set(testPubkey1, testCapability1);

      jest.advanceTimersByTime(5000);

      await cache.get(testPubkey1);
      await cache.get(testPubkey1);

      expect(cache.getMetrics().hits).toBe(2);

      cache.stopAutoRefresh();
    });

    it('should increment cacheMisses metric on miss', async () => {
      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      await cache.get(testPubkey1);
      await cache.get(testPubkey2);

      expect(cache.getMetrics().misses).toBe(2);

      cache.stopAutoRefresh();
    });
  });

  describe('set() method', () => {
    it('should add new entry to cache', async () => {
      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      cache.set(testPubkey1, testCapability1);

      expect(cache.getMetrics().size).toBe(1);

      cache.stopAutoRefresh();
    });

    it('should update existing entry', async () => {
      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      cache.set(testPubkey1, testCapability1);

      const updated = { ...testCapability1, identifier: 'updated.agent' };
      cache.set(testPubkey1, updated);

      const result = await cache.get(testPubkey1);
      expect(result?.identifier).toBe('updated.agent');
      expect(cache.getMetrics().size).toBe(1);

      cache.stopAutoRefresh();
    });

    it('should evict LRU entry when at maxEntries capacity', async () => {
      const cache = await CapabilityCache.create(
        { maxEntries: 2 },
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      // Add entries up to capacity
      cache.set(testPubkey1, testCapability1);
      cache.set(testPubkey2, testCapability2);

      // Access first entry to make it more recently used
      jest.advanceTimersByTime(100);
      await cache.get(testPubkey1);

      // Add third entry - should evict testPubkey2 (LRU)
      jest.advanceTimersByTime(100);
      cache.set(testPubkey3, testCapability3);

      expect(cache.getMetrics().size).toBe(2);
      expect(cache.getMetrics().evictions).toBe(1);
      expect(await cache.get(testPubkey1)).toBeDefined();
      expect(await cache.get(testPubkey2)).toBeUndefined();
      expect(await cache.get(testPubkey3)).toBeDefined();

      cache.stopAutoRefresh();
    });

    it('should increment evictions metric on LRU eviction', async () => {
      const cache = await CapabilityCache.create(
        { maxEntries: 1 },
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      cache.set(testPubkey1, testCapability1);
      cache.set(testPubkey2, testCapability2);
      cache.set(testPubkey3, testCapability3);

      expect(cache.getMetrics().evictions).toBe(2);

      cache.stopAutoRefresh();
    });
  });

  describe('refresh() method', () => {
    it('should query database via CapabilityQueryService with pubkeys filter', async () => {
      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      mockQueryService.findAgents.mockResolvedValue([testCapability1]);

      await cache.refresh(testPubkey1);

      expect(mockQueryService.findAgents).toHaveBeenCalledWith({
        pubkeys: [testPubkey1],
        limit: 1,
      });

      cache.stopAutoRefresh();
    });

    it('should update cache with fresh capability', async () => {
      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      mockQueryService.findAgents.mockResolvedValue([testCapability1]);

      await cache.refresh(testPubkey1);

      const result = await cache.get(testPubkey1);
      expect(result).toEqual(testCapability1);

      cache.stopAutoRefresh();
    });

    it('should increment refreshCount metric', async () => {
      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      mockQueryService.findAgents.mockResolvedValue([testCapability1]);

      await cache.refresh(testPubkey1);
      await cache.refresh(testPubkey1);

      expect(cache.getMetrics().refreshCount).toBe(2);

      cache.stopAutoRefresh();
    });

    it('should throw error if capability not found', async () => {
      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      mockQueryService.findAgents.mockResolvedValue([]);

      await expect(cache.refresh(testPubkey1)).rejects.toThrow(
        `Capability not found for pubkey: ${testPubkey1}`
      );

      cache.stopAutoRefresh();
    });
  });

  describe('invalidate() and invalidateAll() methods', () => {
    it('should remove single entry from cache', async () => {
      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      cache.set(testPubkey1, testCapability1);
      cache.set(testPubkey2, testCapability2);

      cache.invalidate(testPubkey1);

      expect(await cache.get(testPubkey1)).toBeUndefined();
      expect(await cache.get(testPubkey2)).toBeDefined();
      expect(cache.getMetrics().size).toBe(1);

      cache.stopAutoRefresh();
    });

    it('should clear entire cache', async () => {
      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      cache.set(testPubkey1, testCapability1);
      cache.set(testPubkey2, testCapability2);

      cache.invalidateAll();

      expect(cache.getMetrics().size).toBe(0);

      cache.stopAutoRefresh();
    });
  });

  describe('auto-refresh mechanism', () => {
    it('should start interval timer', async () => {
      const cache = await CapabilityCache.create(
        { refreshIntervalMs: 5000 },
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ refreshIntervalMs: 5000 }),
        expect.stringContaining('auto-refresh')
      );

      cache.stopAutoRefresh();
    });

    it('should stop interval timer', async () => {
      const cache = await CapabilityCache.create(
        { refreshIntervalMs: 5000 },
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      cache.stopAutoRefresh();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('stopped'));
    });

    it('should refresh stale entries on interval', async () => {
      const cache = await CapabilityCache.create(
        { ttlMs: 10000, refreshIntervalMs: 5000 },
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      cache.set(testPubkey1, testCapability1);

      mockQueryService.findAgents.mockResolvedValue([testCapability1]);

      // Advance time to make entry stale (>80% TTL = >8000ms)
      jest.advanceTimersByTime(8500);

      // Trigger auto-refresh interval
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockQueryService.findAgents).toHaveBeenCalledWith({
        pubkeys: [testPubkey1],
        limit: 1,
      });

      cache.stopAutoRefresh();
    });

    it('should use Promise.allSettled for parallel refreshes', async () => {
      const cache = await CapabilityCache.create(
        { ttlMs: 10000, refreshIntervalMs: 5000 },
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      cache.set(testPubkey1, testCapability1);
      cache.set(testPubkey2, testCapability2);

      mockQueryService.findAgents.mockResolvedValue([testCapability1]);

      // Make both entries stale
      jest.advanceTimersByTime(8500);

      // Trigger auto-refresh
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockQueryService.findAgents).toHaveBeenCalledTimes(2);

      cache.stopAutoRefresh();
    });

    it('should handle errors gracefully in auto-refresh', async () => {
      const cache = await CapabilityCache.create(
        { ttlMs: 10000, refreshIntervalMs: 5000 },
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      cache.set(testPubkey1, testCapability1);

      mockQueryService.findAgents.mockRejectedValue(new Error('Database error'));

      // Make entry stale
      jest.advanceTimersByTime(8500);

      // Trigger auto-refresh - should not throw
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ pubkey: testPubkey1 }),
        expect.stringContaining('failed')
      );

      cache.stopAutoRefresh();
    });
  });

  describe('load() method (via create)', () => {
    it('should restore capabilities from database', async () => {
      const testEvents = [
        {
          id: 'event1',
          pubkey: testPubkey1,
          created_at: Date.now(),
          kind: 31990,
          tags: [
            ['d', 'test.agent.1'],
            ['k', '5000'],
            ['nip', '89'],
            ['agent-type', 'dvm'],
            ['ilp-address', 'g.agent.test1'],
            ['pricing', '5000', '1000', 'msat'],
          ],
          content: JSON.stringify({ name: 'Test Agent 1' }),
          sig: 'sig',
        },
        {
          id: 'event2',
          pubkey: testPubkey2,
          created_at: Date.now(),
          kind: 31990,
          tags: [
            ['d', 'test.agent.2'],
            ['k', '5050'],
            ['nip', '89'],
            ['agent-type', 'assistant'],
            ['ilp-address', 'g.agent.test2'],
            ['pricing', '5050', '2000', 'msat'],
          ],
          content: JSON.stringify({ name: 'Test Agent 2' }),
          sig: 'sig',
        },
      ];

      mockEventDatabase.queryEvents.mockResolvedValue(testEvents);

      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      expect(cache.getMetrics().size).toBe(2);
      expect(await cache.get(testPubkey1)).toBeDefined();
      expect(await cache.get(testPubkey2)).toBeDefined();

      cache.stopAutoRefresh();
    });

    it('should handle parse errors gracefully', async () => {
      const invalidEvent = {
        id: 'invalid',
        pubkey: testPubkey1,
        created_at: Date.now(),
        kind: 31990,
        tags: [], // Missing required tags
        content: 'invalid json',
        sig: 'sig',
      };

      mockEventDatabase.queryEvents.mockResolvedValue([invalidEvent]);

      const cache = await CapabilityCache.create(
        {},
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'invalid' }),
        expect.stringContaining('parse')
      );
      expect(cache.getMetrics().size).toBe(0);

      cache.stopAutoRefresh();
    });

    it('should not throw on database errors', async () => {
      mockEventDatabase.queryEvents.mockRejectedValue(new Error('Database error'));

      await expect(
        CapabilityCache.create({}, mockQueryService, mockEventDatabase, mockLogger)
      ).resolves.toBeInstanceOf(CapabilityCache);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        expect.stringContaining('Failed to load')
      );
    });
  });

  describe('getMetrics() method', () => {
    it('should return accurate metrics snapshot', async () => {
      const cache = await CapabilityCache.create(
        { maxEntries: 2 },
        mockQueryService,
        mockEventDatabase,
        mockLogger
      );

      cache.set(testPubkey1, testCapability1);
      cache.set(testPubkey2, testCapability2);
      await cache.get(testPubkey1); // Hit
      await cache.get(testPubkey3); // Miss

      mockQueryService.findAgents.mockResolvedValue([testCapability1]);
      await cache.refresh(testPubkey1);

      // Trigger eviction
      cache.set(testPubkey3, testCapability3);

      const metrics = cache.getMetrics();

      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(1);
      expect(metrics.refreshCount).toBe(1);
      expect(metrics.size).toBe(2);
      expect(metrics.evictions).toBe(1);

      cache.stopAutoRefresh();
    });
  });
});
