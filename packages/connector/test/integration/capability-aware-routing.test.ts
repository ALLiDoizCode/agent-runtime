/**
 * Capability-Aware Routing Integration Test
 *
 * Tests FollowGraphRouter integration with SocialCapabilityDiscovery
 * to verify capability-aware routing functionality end-to-end.
 */

import { FollowGraphRouter } from '../../src/agent/follow-graph-router';
import { SocialCapabilityDiscovery } from '../../src/agent/discovery/social-discovery';
import type { CapabilityWithDistance } from '../../src/agent/discovery/types';
import pino from 'pino';

// TODO: Enable once routeWithCapabilities is implemented on FollowGraphRouter
describe.skip('Capability-Aware Routing Integration', () => {
  let router: FollowGraphRouter;
  let mockDiscovery: jest.Mocked<SocialCapabilityDiscovery>;
  let logger: pino.Logger;

  const AGENT_A_PUBKEY = 'a'.repeat(64);
  const AGENT_B_PUBKEY = 'b'.repeat(64);
  const AGENT_C_PUBKEY = 'c'.repeat(64);

  const createTestCapability = (
    pubkey: string,
    ilpAddress: string,
    overrides: Partial<CapabilityWithDistance> = {}
  ): CapabilityWithDistance => ({
    pubkey,
    identifier: ilpAddress,
    supportedKinds: [5000],
    supportedNips: ['01'],
    agentType: 'dvm',
    ilpAddress,
    pricing: new Map([[5000, { kind: 5000, amount: 100n, currency: 'msat' }]]),
    metadata: { name: `Agent ${pubkey.substring(0, 4)}` },
    createdAt: Date.now() / 1000,
    socialDistance: 1,
    ...overrides,
  });

  beforeEach(() => {
    logger = pino({ level: 'silent' });

    // Mock SocialCapabilityDiscovery
    mockDiscovery = {
      discoverForKind: jest.fn(),
      getFollowedPubkeys: jest.fn().mockReturnValue([AGENT_B_PUBKEY, AGENT_C_PUBKEY]),
    } as unknown as jest.Mocked<SocialCapabilityDiscovery>;

    // Create router with discovery integration
    router = new FollowGraphRouter({
      agentPubkey: AGENT_A_PUBKEY,
      initialFollows: [
        { pubkey: AGENT_B_PUBKEY, ilpAddress: 'g.agent.b' },
        { pubkey: AGENT_C_PUBKEY, ilpAddress: 'g.agent.c' },
      ],
      discovery: mockDiscovery,
      logger,
    });
  });

  describe('End-to-End Capability-Aware Routing', () => {
    it('should route to agent with required capability', async () => {
      // Arrange - AgentB has Kind 5000 capability
      const agentBCapability = createTestCapability(AGENT_B_PUBKEY, 'g.agent.b', {
        supportedKinds: [5000],
        socialDistance: 1,
      });

      mockDiscovery.discoverForKind.mockResolvedValue([agentBCapability]);

      // Act
      const nextHop = await router.routeWithCapabilities('g.agent.b', {
        requiredKind: 5000,
      });

      // Assert
      expect(nextHop).toBe(AGENT_B_PUBKEY);
      expect(mockDiscovery.discoverForKind).toHaveBeenCalledWith(5000);
    });

    it('should filter by price and route to cheapest agent', async () => {
      // Arrange - AgentB cheap, AgentC expensive
      const agentBCapability = createTestCapability(AGENT_B_PUBKEY, 'g.agent.b', {
        pricing: new Map([[5000, { kind: 5000, amount: 50n, currency: 'msat' }]]),
        socialDistance: 1,
      });

      const agentCCapability = createTestCapability(AGENT_C_PUBKEY, 'g.agent.c', {
        pricing: new Map([[5000, { kind: 5000, amount: 200n, currency: 'msat' }]]),
        socialDistance: 2,
      });

      // Discovery returns both agents, sorted by social distance
      mockDiscovery.discoverForKind.mockResolvedValue([agentBCapability, agentCCapability]);

      // Act - Route with maxPrice filter
      const nextHop = await router.routeWithCapabilities('g.agent.dvm', {
        requiredKind: 5000,
        maxPrice: 100n,
      });

      // Assert - Should route to AgentB (within price), not AgentC (exceeds price)
      expect(nextHop).toBe(AGENT_B_PUBKEY);
    });

    it('should filter by capacity and route to available agent', async () => {
      // Arrange - AgentB available, AgentC exhausted
      const agentBCapability = createTestCapability(AGENT_B_PUBKEY, 'g.agent.b', {
        capacity: { maxConcurrent: 10, queueDepth: 5 },
        socialDistance: 1,
      });

      const agentCCapability = createTestCapability(AGENT_C_PUBKEY, 'g.agent.c', {
        capacity: { maxConcurrent: 10, queueDepth: 0 },
        socialDistance: 2,
      });

      mockDiscovery.discoverForKind.mockResolvedValue([agentBCapability, agentCCapability]);

      // Act - Route with capacity check
      const nextHop = await router.routeWithCapabilities('g.agent.dvm', {
        requiredKind: 5000,
        checkCapacity: true,
      });

      // Assert - Should route to AgentB (available), not AgentC (exhausted)
      expect(nextHop).toBe(AGENT_B_PUBKEY);
    });

    it('should prefer agent with closer social distance', async () => {
      // Arrange - AgentB direct follow (distance=1), AgentC 2-hop (distance=2)
      const agentBCapability = createTestCapability(AGENT_B_PUBKEY, 'g.agent.b', {
        socialDistance: 1,
      });

      const agentCCapability = createTestCapability(AGENT_C_PUBKEY, 'g.agent.c', {
        socialDistance: 2,
      });

      // Discovery returns sorted by social distance (SocialCapabilityDiscovery does this)
      mockDiscovery.discoverForKind.mockResolvedValue([agentBCapability, agentCCapability]);

      // Act
      const nextHop = await router.routeWithCapabilities('g.agent.dvm', {
        requiredKind: 5000,
      });

      // Assert - Should prefer AgentB (distance=1) over AgentC (distance=2)
      expect(nextHop).toBe(AGENT_B_PUBKEY);
    });

    it('should return null when no capable agents found', async () => {
      // Arrange - No agents with required capability
      mockDiscovery.discoverForKind.mockResolvedValue([]);

      // Act
      const nextHop = await router.routeWithCapabilities('g.agent.dvm', {
        requiredKind: 5000,
      });

      // Assert
      expect(nextHop).toBeNull();
    });

    it('should handle combined filters (price + capacity)', async () => {
      // Arrange
      const agentBCapability = createTestCapability(AGENT_B_PUBKEY, 'g.agent.b', {
        pricing: new Map([[5000, { kind: 5000, amount: 50n, currency: 'msat' }]]),
        capacity: { maxConcurrent: 10, queueDepth: 5 },
        socialDistance: 1,
      });

      const agentCExpensive = createTestCapability(AGENT_C_PUBKEY, 'g.agent.c', {
        pricing: new Map([[5000, { kind: 5000, amount: 200n, currency: 'msat' }]]),
        capacity: { maxConcurrent: 10, queueDepth: 5 },
        socialDistance: 2,
      });

      mockDiscovery.discoverForKind.mockResolvedValue([agentBCapability, agentCExpensive]);

      // Act - Apply both filters
      const nextHop = await router.routeWithCapabilities('g.agent.dvm', {
        requiredKind: 5000,
        maxPrice: 100n,
        checkCapacity: true,
      });

      // Assert - Should route to AgentB (passes both filters)
      expect(nextHop).toBe(AGENT_B_PUBKEY);
    });

    it('should fallback to standard routing on discovery error', async () => {
      // Arrange
      mockDiscovery.discoverForKind.mockRejectedValue(new Error('Discovery service unavailable'));

      // Act
      const nextHop = await router.routeWithCapabilities('g.agent.b', {
        requiredKind: 5000,
      });

      // Assert - Should fallback to standard routing (getNextHop)
      expect(nextHop).toBe(AGENT_B_PUBKEY);
    });

    it('should fallback to standard routing when no requiredKind specified', async () => {
      // Act
      const nextHop = await router.routeWithCapabilities('g.agent.b', {});

      // Assert - Should use standard routing
      expect(nextHop).toBe(AGENT_B_PUBKEY);
      expect(mockDiscovery.discoverForKind).not.toHaveBeenCalled();
    });

    it('should route to closest capable agent when multiple match filters', async () => {
      // Arrange - Three agents, all capable, different distances
      const agentBCapability = createTestCapability(AGENT_B_PUBKEY, 'g.agent.b', {
        socialDistance: 1,
        pricing: new Map([[5000, { kind: 5000, amount: 75n, currency: 'msat' }]]),
      });

      const agentCCapability = createTestCapability(AGENT_C_PUBKEY, 'g.agent.c', {
        socialDistance: 2,
        pricing: new Map([[5000, { kind: 5000, amount: 50n, currency: 'msat' }]]),
      });

      // Discovery returns sorted by social distance (direct follows first)
      mockDiscovery.discoverForKind.mockResolvedValue([agentBCapability, agentCCapability]);

      // Act
      const nextHop = await router.routeWithCapabilities('g.agent.dvm', {
        requiredKind: 5000,
        maxPrice: 100n,
      });

      // Assert - Should prefer AgentB (closer) over AgentC (cheaper but farther)
      expect(nextHop).toBe(AGENT_B_PUBKEY);
    });
  });
});
