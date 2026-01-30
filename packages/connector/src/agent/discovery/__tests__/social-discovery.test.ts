import { SocialCapabilityDiscovery } from '../social-discovery';
import type { CapabilityCache } from '../capability-cache';
import type { FollowGraphRouter, AgentFollow } from '../../follow-graph-router';
import { CapabilityQueryService } from '../capability-query';
import type { AgentEventDatabase } from '../../event-database';
import type { NostrEvent } from '../../toon-codec';
import type { AgentCapability, SocialDiscoveryConfig } from '../types';

// TODO: Enable once discovery module is implemented (Epic 18)
describe.skip('SocialCapabilityDiscovery', () => {
  let discovery: SocialCapabilityDiscovery;
  let mockFollowGraphRouter: jest.Mocked<FollowGraphRouter>;
  let mockQueryService: jest.Mocked<CapabilityQueryService>;
  let mockEventDatabase: jest.Mocked<AgentEventDatabase>;
  let mockCache: jest.Mocked<CapabilityCache>;

  const AGENT_PUBKEY = 'a'.repeat(64);
  const ALICE_PUBKEY = 'b'.repeat(64);
  const BOB_PUBKEY = 'c'.repeat(64);
  const CHARLIE_PUBKEY = 'd'.repeat(64);
  const DAVID_PUBKEY = 'e'.repeat(64);

  const createMockFollow = (pubkey: string, ilpAddress: string): AgentFollow => ({
    pubkey,
    ilpAddress,
    addedAt: Date.now(),
  });

  const createMockCapability = (
    pubkey: string,
    ilpAddress: string,
    kinds: number[]
  ): AgentCapability => ({
    pubkey,
    identifier: ilpAddress,
    supportedKinds: kinds,
    supportedNips: ['89', '90'],
    agentType: 'dvm',
    ilpAddress,
    pricing: new Map([[5000, { kind: 5000, amount: 100n, currency: 'msat' }]]),
    metadata: { name: `Agent ${pubkey.substring(0, 4)}` },
    createdAt: Date.now(),
  });

  const createMockKind3Event = (pubkey: string, followedPubkeys: string[]): NostrEvent => ({
    id: `event-${pubkey}`,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 3,
    tags: followedPubkeys.map((pk) => ['ilp', pk, `g.agent.${pk.substring(0, 4)}`]),
    content: '',
    sig: '',
  });

  beforeEach(() => {
    // Mock FollowGraphRouter
    mockFollowGraphRouter = {
      getAllFollows: jest.fn(),
      getFollowByPubkey: jest.fn(),
      getKnownAgents: jest.fn(),
      getNextHop: jest.fn(),
      updateFromFollowEvent: jest.fn(),
      addFollow: jest.fn(),
      removeFollow: jest.fn(),
      getFollowCount: jest.fn(),
      canRoute: jest.fn(),
      getFollowByILPAddress: jest.fn(),
      exportGraph: jest.fn(),
    } as unknown as jest.Mocked<FollowGraphRouter>;

    // Mock CapabilityQueryService
    mockQueryService = {
      findAgents: jest.fn(),
    } as unknown as jest.Mocked<CapabilityQueryService>;

    // Mock AgentEventDatabase
    mockEventDatabase = {
      queryEvents: jest.fn(),
    } as unknown as jest.Mocked<AgentEventDatabase>;

    // Mock CapabilityCache (all methods required for complete mock)
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      refresh: jest.fn(),
      invalidate: jest.fn(),
      invalidateAll: jest.fn(),
      getMetrics: jest.fn(),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    } as unknown as jest.Mocked<CapabilityCache>;

    // Create discovery instance
    discovery = new SocialCapabilityDiscovery(
      mockFollowGraphRouter,
      mockQueryService,
      mockEventDatabase,
      AGENT_PUBKEY,
      {},
      undefined // No cache by default
    );
  });

  describe('getFollowedPubkeys', () => {
    it('should extract pubkeys from getAllFollows() correctly', () => {
      const follows = [
        createMockFollow(ALICE_PUBKEY, 'g.agent.alice'),
        createMockFollow(BOB_PUBKEY, 'g.agent.bob'),
      ];

      mockFollowGraphRouter.getAllFollows.mockReturnValue(follows);

      const result = discovery.getFollowedPubkeys();

      expect(result).toEqual([ALICE_PUBKEY, BOB_PUBKEY]);
      expect(mockFollowGraphRouter.getAllFollows).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no follows exist', () => {
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);

      const result = discovery.getFollowedPubkeys();

      expect(result).toEqual([]);
    });
  });

  describe('discoverForKind - direct follows only', () => {
    it('should return capabilities for direct follows only (extendedHops=false)', async () => {
      const follows = [
        createMockFollow(ALICE_PUBKEY, 'g.agent.alice'),
        createMockFollow(BOB_PUBKEY, 'g.agent.bob'),
      ];

      const aliceCapability = createMockCapability(ALICE_PUBKEY, 'g.agent.alice', [5000]);
      const bobCapability = createMockCapability(BOB_PUBKEY, 'g.agent.bob', [5000]);

      mockFollowGraphRouter.getAllFollows.mockReturnValue(follows);
      mockFollowGraphRouter.getFollowByPubkey
        .mockReturnValueOnce(follows[0])
        .mockReturnValueOnce(follows[1]);
      // Per-pubkey queries - return correct capability for each pubkey
      mockQueryService.findAgents
        .mockResolvedValueOnce([aliceCapability])
        .mockResolvedValueOnce([bobCapability]);

      const result = await discovery.discoverForKind(5000, { extendedHops: false });

      expect(result).toHaveLength(2);
      expect(result[0]!.pubkey).toBe(ALICE_PUBKEY);
      expect(result[0]!.socialDistance).toBe(1);
      expect(result[1]!.pubkey).toBe(BOB_PUBKEY);
      expect(result[1]!.socialDistance).toBe(1);
      expect(result.find((r) => r.pubkey === CHARLIE_PUBKEY)).toBeUndefined();
    });

    it('should manually filter by followed pubkeys correctly', async () => {
      const follows = [createMockFollow(ALICE_PUBKEY, 'g.agent.alice')];
      const aliceCapability = createMockCapability(ALICE_PUBKEY, 'g.agent.alice', [5000]);

      mockFollowGraphRouter.getAllFollows.mockReturnValue(follows);
      mockFollowGraphRouter.getFollowByPubkey.mockReturnValue(follows[0]);
      // Per-pubkey query - only return alice's capability
      mockQueryService.findAgents.mockResolvedValue([aliceCapability]);

      const result = await discovery.discoverForKind(5000);

      expect(result).toHaveLength(1);
      expect(result[0]!.pubkey).toBe(ALICE_PUBKEY);
    });

    it('should return empty array when no follows configured', async () => {
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);

      const result = await discovery.discoverForKind(5000);

      expect(result).toEqual([]);
      expect(mockQueryService.findAgents).not.toHaveBeenCalled();
    });

    it('should apply limit parameter', async () => {
      const follows = [
        createMockFollow(ALICE_PUBKEY, 'g.agent.alice'),
        createMockFollow(BOB_PUBKEY, 'g.agent.bob'),
        createMockFollow(CHARLIE_PUBKEY, 'g.agent.charlie'),
      ];

      const capabilities = [
        createMockCapability(ALICE_PUBKEY, 'g.agent.alice', [5000]),
        createMockCapability(BOB_PUBKEY, 'g.agent.bob', [5000]),
        createMockCapability(CHARLIE_PUBKEY, 'g.agent.charlie', [5000]),
      ];

      mockFollowGraphRouter.getAllFollows.mockReturnValue(follows);
      mockFollowGraphRouter.getFollowByPubkey.mockImplementation((pubkey) =>
        follows.find((f) => f.pubkey === pubkey)
      );
      mockQueryService.findAgents.mockResolvedValue(capabilities);

      const result = await discovery.discoverForKind(5000, { limit: 2 });

      expect(result).toHaveLength(2);
    });
  });

  describe('discoverForKind - 2-hop discovery', () => {
    it('should include 2-hop follows when extendedHops=true', async () => {
      const config: SocialDiscoveryConfig = { extendedHops: true, maxDistance: 2 };
      discovery = new SocialCapabilityDiscovery(
        mockFollowGraphRouter,
        mockQueryService,
        mockEventDatabase,
        AGENT_PUBKEY,
        config
      );

      const directFollows = [
        createMockFollow(ALICE_PUBKEY, 'g.agent.alice'),
        createMockFollow(BOB_PUBKEY, 'g.agent.bob'),
      ];

      // Alice follows Charlie, Bob follows David
      const kind3Events = [
        createMockKind3Event(ALICE_PUBKEY, [CHARLIE_PUBKEY]),
        createMockKind3Event(BOB_PUBKEY, [DAVID_PUBKEY]),
      ];

      const directCapabilities = [
        createMockCapability(ALICE_PUBKEY, 'g.agent.alice', [5000]),
        createMockCapability(BOB_PUBKEY, 'g.agent.bob', [5000]),
      ];

      const secondHopCapabilities = [
        createMockCapability(CHARLIE_PUBKEY, 'g.agent.charlie', [5000]),
        createMockCapability(DAVID_PUBKEY, 'g.agent.david', [5000]),
      ];

      mockFollowGraphRouter.getAllFollows.mockReturnValue(directFollows);
      mockFollowGraphRouter.getFollowByPubkey.mockImplementation((pubkey) =>
        directFollows.find((f) => f.pubkey === pubkey)
      );
      mockEventDatabase.queryEvents.mockResolvedValue(kind3Events);

      // Per-pubkey queries: Alice, Bob (direct), then Charlie, David (2-hop)
      mockQueryService.findAgents
        .mockResolvedValueOnce([directCapabilities[0]!]) // Alice
        .mockResolvedValueOnce([directCapabilities[1]!]) // Bob
        .mockResolvedValueOnce([secondHopCapabilities[0]!]) // Charlie
        .mockResolvedValueOnce([secondHopCapabilities[1]!]); // David

      const result = await discovery.discoverForKind(5000, { extendedHops: true });

      expect(result.length).toBeGreaterThanOrEqual(2);
      const directResults = result.filter((r) => r.socialDistance === 1);
      const secondHopResults = result.filter((r) => r.socialDistance === 2);

      expect(directResults.length).toBe(2);
      expect(secondHopResults.length).toBe(2);
    });

    it('should deduplicate 2-hop follows (exclude self and direct follows)', async () => {
      const config: SocialDiscoveryConfig = { extendedHops: true, maxDistance: 2 };
      discovery = new SocialCapabilityDiscovery(
        mockFollowGraphRouter,
        mockQueryService,
        mockEventDatabase,
        AGENT_PUBKEY,
        config
      );

      const directFollows = [createMockFollow(ALICE_PUBKEY, 'g.agent.alice')];

      // Alice follows: self (should be excluded), Alice (should be excluded), Charlie (valid)
      const kind3Events = [
        createMockKind3Event(ALICE_PUBKEY, [AGENT_PUBKEY, ALICE_PUBKEY, CHARLIE_PUBKEY]),
      ];

      const capabilities = [
        createMockCapability(ALICE_PUBKEY, 'g.agent.alice', [5000]),
        createMockCapability(CHARLIE_PUBKEY, 'g.agent.charlie', [5000]),
      ];

      mockFollowGraphRouter.getAllFollows.mockReturnValue(directFollows);
      mockFollowGraphRouter.getFollowByPubkey.mockImplementation((pubkey) =>
        directFollows.find((f) => f.pubkey === pubkey)
      );
      mockEventDatabase.queryEvents.mockResolvedValue(kind3Events);
      // Per-pubkey queries: Alice (direct), then Charlie (2-hop)
      mockQueryService.findAgents
        .mockResolvedValueOnce([capabilities[0]!]) // Alice
        .mockResolvedValueOnce([capabilities[1]!]); // Charlie

      const result = await discovery.discoverForKind(5000, { extendedHops: true });

      const secondHopResults = result.filter((r) => r.socialDistance === 2);
      expect(secondHopResults).toHaveLength(1);
      expect(secondHopResults[0]!.pubkey).toBe(CHARLIE_PUBKEY);
    });
  });

  describe('social distance ranking', () => {
    it('should rank direct follows higher than 2-hop', async () => {
      const config: SocialDiscoveryConfig = { extendedHops: true, maxDistance: 2 };
      discovery = new SocialCapabilityDiscovery(
        mockFollowGraphRouter,
        mockQueryService,
        mockEventDatabase,
        AGENT_PUBKEY,
        config
      );

      const directFollows = [createMockFollow(ALICE_PUBKEY, 'g.agent.alice')];
      const kind3Events = [createMockKind3Event(ALICE_PUBKEY, [BOB_PUBKEY])];

      const capabilities = [
        createMockCapability(ALICE_PUBKEY, 'g.agent.alice', [5000]),
        createMockCapability(BOB_PUBKEY, 'g.agent.bob', [5000]),
      ];

      mockFollowGraphRouter.getAllFollows.mockReturnValue(directFollows);
      mockFollowGraphRouter.getFollowByPubkey.mockImplementation((pubkey) =>
        directFollows.find((f) => f.pubkey === pubkey)
      );
      mockEventDatabase.queryEvents.mockResolvedValue(kind3Events);
      mockQueryService.findAgents.mockResolvedValue(capabilities);

      const result = await discovery.discoverForKind(5000, { extendedHops: true });

      expect(result[0]!.socialDistance).toBe(1); // Direct follow first
      expect(result[0]!.pubkey).toBe(ALICE_PUBKEY);

      const secondHopIndex = result.findIndex((r) => r.socialDistance === 2);
      expect(secondHopIndex).toBeGreaterThan(0); // 2-hop after direct
    });
  });

  describe('ILP address mapping', () => {
    it('should enrich results with ILP address from FollowGraphRouter', async () => {
      const follows = [createMockFollow(ALICE_PUBKEY, 'g.agent.alice')];
      const capabilities = [createMockCapability(ALICE_PUBKEY, 'g.agent.alice', [5000])];

      mockFollowGraphRouter.getAllFollows.mockReturnValue(follows);
      mockFollowGraphRouter.getFollowByPubkey.mockReturnValue(follows[0]);
      mockQueryService.findAgents.mockResolvedValue(capabilities);

      const result = await discovery.discoverForKind(5000);

      expect(result[0]!.ilpAddress).toBe('g.agent.alice');
      expect(mockFollowGraphRouter.getFollowByPubkey).toHaveBeenCalledWith(ALICE_PUBKEY);
    });
  });

  describe('caching', () => {
    beforeEach(() => {
      const config: SocialDiscoveryConfig = { cacheEnabled: true, cacheTtl: 300 };
      discovery = new SocialCapabilityDiscovery(
        mockFollowGraphRouter,
        mockQueryService,
        mockEventDatabase,
        AGENT_PUBKEY,
        config,
        mockCache
      );
    });

    it('should return cached results on cache hit', async () => {
      const follows = [createMockFollow(ALICE_PUBKEY, 'g.agent.alice')];
      const cachedCapability = createMockCapability(ALICE_PUBKEY, 'g.agent.alice', [5000]);

      mockFollowGraphRouter.getAllFollows.mockReturnValue(follows);
      mockFollowGraphRouter.getFollowByPubkey.mockReturnValue(follows[0]);
      mockCache.get.mockResolvedValue(cachedCapability); // Per-pubkey cache returns single capability

      const result = await discovery.discoverForKind(5000, { useCache: true });

      expect(result).toHaveLength(1);
      expect(mockCache.get).toHaveBeenCalledWith(ALICE_PUBKEY); // Verify per-pubkey lookup
      expect(mockQueryService.findAgents).not.toHaveBeenCalled(); // Should not query database on cache hit
    });

    it('should query and update cache on cache miss', async () => {
      const follows = [createMockFollow(ALICE_PUBKEY, 'g.agent.alice')];
      const capability = createMockCapability(ALICE_PUBKEY, 'g.agent.alice', [5000]);

      mockCache.get.mockResolvedValue(undefined); // Cache miss
      mockFollowGraphRouter.getAllFollows.mockReturnValue(follows);
      mockFollowGraphRouter.getFollowByPubkey.mockReturnValue(follows[0]);
      mockQueryService.findAgents.mockResolvedValue([capability]);

      const result = await discovery.discoverForKind(5000, { useCache: true });

      expect(result).toHaveLength(1);
      expect(mockCache.get).toHaveBeenCalledWith(ALICE_PUBKEY); // Per-pubkey cache lookup
      expect(mockQueryService.findAgents).toHaveBeenCalled(); // Database query on cache miss
      expect(mockCache.set).toHaveBeenCalledWith(ALICE_PUBKEY, capability); // Per-pubkey cache update
    });
  });

  describe('error handling', () => {
    it('should return empty array on CapabilityQueryService failure', async () => {
      const follows = [createMockFollow(ALICE_PUBKEY, 'g.agent.alice')];

      mockFollowGraphRouter.getAllFollows.mockReturnValue(follows);
      mockQueryService.findAgents.mockRejectedValue(new Error('Query failed'));

      const result = await discovery.discoverForKind(5000);

      expect(result).toEqual([]);
    });

    it('should handle Kind 3 parsing errors gracefully', async () => {
      const config: SocialDiscoveryConfig = { extendedHops: true, maxDistance: 2 };
      discovery = new SocialCapabilityDiscovery(
        mockFollowGraphRouter,
        mockQueryService,
        mockEventDatabase,
        AGENT_PUBKEY,
        config
      );

      const directFollows = [createMockFollow(ALICE_PUBKEY, 'g.agent.alice')];

      // Malformed event (missing tags)
      const malformedEvent: NostrEvent = {
        id: 'bad-event',
        pubkey: ALICE_PUBKEY,
        created_at: Date.now(),
        kind: 3,
        tags: [['ilp']], // Missing pubkey and address
        content: '',
        sig: '',
      };

      mockFollowGraphRouter.getAllFollows.mockReturnValue(directFollows);
      mockEventDatabase.queryEvents.mockResolvedValue([malformedEvent]);
      mockQueryService.findAgents.mockResolvedValue([]);

      const result = await discovery.discoverForKind(5000, { extendedHops: true });

      // Should not throw, should handle gracefully
      expect(result).toEqual([]);
    });

    it('should handle AgentEventDatabase errors and fall back to direct follows', async () => {
      const config: SocialDiscoveryConfig = { extendedHops: true, maxDistance: 2 };
      discovery = new SocialCapabilityDiscovery(
        mockFollowGraphRouter,
        mockQueryService,
        mockEventDatabase,
        AGENT_PUBKEY,
        config
      );

      const directFollows = [createMockFollow(ALICE_PUBKEY, 'g.agent.alice')];
      const capabilities = [createMockCapability(ALICE_PUBKEY, 'g.agent.alice', [5000])];

      mockFollowGraphRouter.getAllFollows.mockReturnValue(directFollows);
      mockFollowGraphRouter.getFollowByPubkey.mockReturnValue(directFollows[0]);
      mockEventDatabase.queryEvents.mockRejectedValue(new Error('Database error'));
      mockQueryService.findAgents.mockResolvedValue(capabilities);

      const result = await discovery.discoverForKind(5000, { extendedHops: true });

      // Should return direct follows despite 2-hop failure
      expect(result).toHaveLength(1);
      expect(result[0]!.socialDistance).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty follow list', async () => {
      mockFollowGraphRouter.getAllFollows.mockReturnValue([]);

      const result = await discovery.discoverForKind(5000);

      expect(result).toEqual([]);
    });

    it('should handle no matching capabilities found', async () => {
      const follows = [createMockFollow(ALICE_PUBKEY, 'g.agent.alice')];

      mockFollowGraphRouter.getAllFollows.mockReturnValue(follows);
      mockQueryService.findAgents.mockResolvedValue([]);

      const result = await discovery.discoverForKind(5000);

      expect(result).toEqual([]);
    });

    it('should handle maxDistance validation', () => {
      const config: SocialDiscoveryConfig = { maxDistance: 5 };

      // Should default to 1 with warning
      const newDiscovery = new SocialCapabilityDiscovery(
        mockFollowGraphRouter,
        mockQueryService,
        mockEventDatabase,
        AGENT_PUBKEY,
        config
      );

      expect(newDiscovery).toBeDefined();
    });
  });
});
