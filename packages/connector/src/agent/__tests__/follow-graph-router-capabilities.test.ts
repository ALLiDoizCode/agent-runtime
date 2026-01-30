import { FollowGraphRouter } from '../follow-graph-router';
import type { SocialCapabilityDiscovery } from '../discovery/social-discovery';
import type { CapabilityWithDistance } from '../discovery/types';
import type { Logger } from 'pino';
import pino from 'pino';

/**
 * Creates a mock logger with trackable spy functions for testing log output.
 */
function createSpyLogger(): jest.Mocked<Logger> & { calls: { method: string; args: unknown[] }[] } {
  const calls: { method: string; args: unknown[] }[] = [];
  const mockLogger = {
    calls,
    debug: jest.fn((...args: unknown[]) => {
      calls.push({ method: 'debug', args });
    }),
    info: jest.fn((...args: unknown[]) => {
      calls.push({ method: 'info', args });
    }),
    warn: jest.fn((...args: unknown[]) => {
      calls.push({ method: 'warn', args });
    }),
    error: jest.fn((...args: unknown[]) => {
      calls.push({ method: 'error', args });
    }),
    fatal: jest.fn(),
    trace: jest.fn(),
    silent: jest.fn(),
    level: 'debug',
    child: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Logger> & { calls: { method: string; args: unknown[] }[] };
  return mockLogger;
}

describe('FollowGraphRouter - Capability-Aware Routing', () => {
  let router: FollowGraphRouter;
  let mockDiscovery: jest.Mocked<SocialCapabilityDiscovery>;
  let logger: pino.Logger;

  // Test data: Create test capabilities with varying attributes
  const createTestCapability = (
    overrides: Partial<CapabilityWithDistance>
  ): CapabilityWithDistance => {
    return {
      pubkey: 'test-pubkey-' + Math.random().toString(36).substring(7),
      identifier: 'g.agent.test',
      supportedKinds: [5000],
      supportedNips: ['01'],
      agentType: 'dvm',
      ilpAddress: 'g.agent.test',
      pricing: new Map([[5000, { kind: 5000, amount: 100n, currency: 'msat' }]]),
      metadata: {
        name: 'Test Agent',
      },
      createdAt: Date.now() / 1000,
      socialDistance: 1,
      ...overrides,
    };
  };

  beforeEach(() => {
    logger = pino({ level: 'silent' });

    // Create mock discovery service
    mockDiscovery = {
      discoverForKind: jest.fn(),
      getFollowedPubkeys: jest.fn(),
    } as unknown as jest.Mocked<SocialCapabilityDiscovery>;

    // Create router with initial follows and discovery service
    router = new FollowGraphRouter({
      agentPubkey: 'my-agent-pubkey',
      initialFollows: [
        { pubkey: 'alice-pubkey', ilpAddress: 'g.agent.alice' },
        { pubkey: 'bob-pubkey', ilpAddress: 'g.agent.bob' },
      ],
      discovery: mockDiscovery,
      logger,
    });
  });

  describe('routeWithCapabilities', () => {
    it('should return next-hop pubkey when capable agent found', async () => {
      // Arrange
      const testCapability = createTestCapability({
        pubkey: 'alice-pubkey',
        ilpAddress: 'g.agent.alice',
        supportedKinds: [5000],
        pricing: new Map([[5000, { kind: 5000, amount: 100n, currency: 'msat' }]]),
        socialDistance: 1,
      });

      mockDiscovery.discoverForKind.mockResolvedValue([testCapability]);

      // Act
      const result = await router.routeWithCapabilities('g.agent.alice', {
        requiredKind: 5000,
      });

      // Assert
      expect(result).toBe('alice-pubkey');
      expect(mockDiscovery.discoverForKind).toHaveBeenCalledWith(5000);
    });

    it('should filter by requiredKind', async () => {
      // Arrange
      const capability5000 = createTestCapability({
        pubkey: 'alice-pubkey',
        ilpAddress: 'g.agent.alice',
        supportedKinds: [5000],
        pricing: new Map([[5000, { kind: 5000, amount: 100n, currency: 'msat' }]]),
      });

      mockDiscovery.discoverForKind.mockResolvedValue([capability5000]);

      // Act
      const result = await router.routeWithCapabilities('g.agent.alice', {
        requiredKind: 5000,
      });

      // Assert
      expect(result).toBe('alice-pubkey');
      expect(mockDiscovery.discoverForKind).toHaveBeenCalledWith(5000);
    });

    it('should filter by maxPrice', async () => {
      // Arrange
      const cheapCapability = createTestCapability({
        pubkey: 'alice-pubkey',
        ilpAddress: 'g.agent.alice',
        pricing: new Map([[5000, { kind: 5000, amount: 50n, currency: 'msat' }]]),
      });

      const expensiveCapability = createTestCapability({
        pubkey: 'bob-pubkey',
        ilpAddress: 'g.agent.bob',
        pricing: new Map([[5000, { kind: 5000, amount: 200n, currency: 'msat' }]]),
        socialDistance: 2,
      });

      mockDiscovery.discoverForKind.mockResolvedValue([cheapCapability, expensiveCapability]);

      // Act
      const result = await router.routeWithCapabilities('g.agent.alice', {
        requiredKind: 5000,
        maxPrice: 100n,
      });

      // Assert - Should route to alice (cheap) not bob (expensive)
      expect(result).toBe('alice-pubkey');
    });

    it('should filter by capacity when checkCapacity enabled', async () => {
      // Arrange
      const availableCapability = createTestCapability({
        pubkey: 'alice-pubkey',
        ilpAddress: 'g.agent.alice',
        capacity: { maxConcurrent: 10, queueDepth: 5 },
      });

      const exhaustedCapability = createTestCapability({
        pubkey: 'bob-pubkey',
        ilpAddress: 'g.agent.bob',
        capacity: { maxConcurrent: 10, queueDepth: 0 },
        socialDistance: 2,
      });

      mockDiscovery.discoverForKind.mockResolvedValue([availableCapability, exhaustedCapability]);

      // Act
      const result = await router.routeWithCapabilities('g.agent.alice', {
        requiredKind: 5000,
        checkCapacity: true,
      });

      // Assert - Should route to alice (available) not bob (exhausted)
      expect(result).toBe('alice-pubkey');
    });

    it('should prefer direct follows over 2-hop', async () => {
      // Arrange
      const directFollow = createTestCapability({
        pubkey: 'alice-pubkey',
        ilpAddress: 'g.agent.alice',
        socialDistance: 1,
      });

      const twoHopFollow = createTestCapability({
        pubkey: 'charlie-pubkey',
        ilpAddress: 'g.agent.charlie',
        socialDistance: 2,
      });

      // Discovery returns sorted by social distance (SocialCapabilityDiscovery does this)
      mockDiscovery.discoverForKind.mockResolvedValue([directFollow, twoHopFollow]);

      // Act
      const result = await router.routeWithCapabilities('g.agent.alice', {
        requiredKind: 5000,
      });

      // Assert - Should prefer alice (distance=1) over charlie (distance=2)
      expect(result).toBe('alice-pubkey');
    });

    it('should return null when no capable agents found after filtering', async () => {
      // Arrange - All agents exceed max price
      const expensiveCapability = createTestCapability({
        pubkey: 'alice-pubkey',
        ilpAddress: 'g.agent.alice',
        pricing: new Map([[5000, { kind: 5000, amount: 200n, currency: 'msat' }]]),
      });

      mockDiscovery.discoverForKind.mockResolvedValue([expensiveCapability]);

      // Act
      const result = await router.routeWithCapabilities('g.agent.alice', {
        requiredKind: 5000,
        maxPrice: 100n,
      });

      // Assert
      expect(result).toBeNull();
    });

    it('should fallback to standard routing when discovery service not provided', async () => {
      // Arrange - Create router without discovery service
      const routerWithoutDiscovery = new FollowGraphRouter({
        agentPubkey: 'my-agent-pubkey',
        initialFollows: [{ pubkey: 'alice-pubkey', ilpAddress: 'g.agent.alice' }],
        logger,
      });

      // Act
      const result = await routerWithoutDiscovery.routeWithCapabilities('g.agent.alice', {
        requiredKind: 5000,
      });

      // Assert - Should use standard routing (getNextHop)
      expect(result).toBe('alice-pubkey');
    });

    it('should fallback to standard routing when requiredKind not specified', async () => {
      // Act
      const result = await router.routeWithCapabilities('g.agent.alice', {});

      // Assert - Should use standard routing (getNextHop)
      expect(result).toBe('alice-pubkey');
      expect(mockDiscovery.discoverForKind).not.toHaveBeenCalled();
    });

    it('should fallback to standard routing when discovery throws error', async () => {
      // Arrange
      mockDiscovery.discoverForKind.mockRejectedValue(new Error('Discovery service unavailable'));

      // Act
      const result = await router.routeWithCapabilities('g.agent.alice', {
        requiredKind: 5000,
      });

      // Assert - Should fallback to standard routing
      expect(result).toBe('alice-pubkey');
    });

    it('should log routing decision with capability context', async () => {
      // Arrange
      const spyLogger = createSpyLogger();

      const routerWithLogger = new FollowGraphRouter({
        agentPubkey: 'my-agent-pubkey',
        initialFollows: [{ pubkey: 'alice-pubkey', ilpAddress: 'g.agent.alice' }],
        discovery: mockDiscovery,
        logger: spyLogger,
      });

      const testCapability = createTestCapability({
        pubkey: 'alice-pubkey',
        ilpAddress: 'g.agent.alice',
        pricing: new Map([[5000, { kind: 5000, amount: 100n, currency: 'msat' }]]),
        socialDistance: 1,
      });

      mockDiscovery.discoverForKind.mockResolvedValue([testCapability]);

      // Act
      await routerWithLogger.routeWithCapabilities('g.agent.alice', {
        requiredKind: 5000,
        maxPrice: 200n,
      });

      // Assert - Should log with capability context
      const routingDecisionLog = spyLogger.calls.find(
        (call) => call.method === 'info' && call.args[1] === 'Capability-aware routing decision'
      );

      expect(routingDecisionLog).toBeDefined();
      expect(routingDecisionLog!.args[0]).toMatchObject({
        requiredKind: 5000,
        selectedAgent: 'alice-pubkey',
        ilpAddress: 'g.agent.alice',
        socialDistance: 1,
      });
    });

    it('should log warning when no capable agents found with reason', async () => {
      // Arrange
      const spyLogger = createSpyLogger();

      const routerWithLogger = new FollowGraphRouter({
        agentPubkey: 'my-agent-pubkey',
        initialFollows: [{ pubkey: 'alice-pubkey', ilpAddress: 'g.agent.alice' }],
        discovery: mockDiscovery,
        logger: spyLogger,
      });

      // No capabilities found
      mockDiscovery.discoverForKind.mockResolvedValue([]);

      // Act
      await routerWithLogger.routeWithCapabilities('g.agent.alice', {
        requiredKind: 5000,
      });

      // Assert - Should log warning with reason
      const noAgentsLog = spyLogger.calls.find(
        (call) =>
          call.method === 'warn' && call.args[1] === 'No capable agents found after filtering'
      );

      expect(noAgentsLog).toBeDefined();
      expect(noAgentsLog!.args[0]).toMatchObject({
        requiredKind: 5000,
        followCount: 0,
        reason: 'no peers with required kind',
      });
    });

    it('should log debug messages for filter steps', async () => {
      // Arrange
      const spyLogger = createSpyLogger();

      const routerWithLogger = new FollowGraphRouter({
        agentPubkey: 'my-agent-pubkey',
        initialFollows: [{ pubkey: 'alice-pubkey', ilpAddress: 'g.agent.alice' }],
        discovery: mockDiscovery,
        logger: spyLogger,
      });

      const testCapability = createTestCapability({
        pubkey: 'alice-pubkey',
        ilpAddress: 'g.agent.alice',
        pricing: new Map([[5000, { kind: 5000, amount: 50n, currency: 'msat' }]]),
        capacity: { maxConcurrent: 10, queueDepth: 5 },
      });

      mockDiscovery.discoverForKind.mockResolvedValue([testCapability]);

      // Act
      await routerWithLogger.routeWithCapabilities('g.agent.alice', {
        requiredKind: 5000,
        maxPrice: 100n,
        checkCapacity: true,
      });

      // Assert - Should log filter steps
      const pricingFilterLog = spyLogger.calls.find(
        (call) => call.method === 'debug' && call.args[1] === 'Filtered by pricing'
      );
      expect(pricingFilterLog).toBeDefined();
      expect(pricingFilterLog!.args[0]).toMatchObject({
        beforeCount: 1,
        afterCount: 1,
      });

      const capacityFilterLog = spyLogger.calls.find(
        (call) => call.method === 'debug' && call.args[1] === 'Filtered by capacity'
      );
      expect(capacityFilterLog).toBeDefined();
      expect(capacityFilterLog!.args[0]).toMatchObject({
        beforeCount: 1,
        afterCount: 1,
      });
    });

    it('should handle combined filters (price + capacity)', async () => {
      // Arrange
      const goodCapability = createTestCapability({
        pubkey: 'alice-pubkey',
        ilpAddress: 'g.agent.alice',
        pricing: new Map([[5000, { kind: 5000, amount: 50n, currency: 'msat' }]]),
        capacity: { maxConcurrent: 10, queueDepth: 5 },
        socialDistance: 1,
      });

      const tooExpensive = createTestCapability({
        pubkey: 'bob-pubkey',
        ilpAddress: 'g.agent.bob',
        pricing: new Map([[5000, { kind: 5000, amount: 200n, currency: 'msat' }]]),
        capacity: { maxConcurrent: 10, queueDepth: 5 },
        socialDistance: 2,
      });

      const noCapacity = createTestCapability({
        pubkey: 'charlie-pubkey',
        ilpAddress: 'g.agent.charlie',
        pricing: new Map([[5000, { kind: 5000, amount: 50n, currency: 'msat' }]]),
        capacity: { maxConcurrent: 10, queueDepth: 0 },
        socialDistance: 2,
      });

      mockDiscovery.discoverForKind.mockResolvedValue([goodCapability, tooExpensive, noCapacity]);

      // Act
      const result = await router.routeWithCapabilities('g.agent.alice', {
        requiredKind: 5000,
        maxPrice: 100n,
        checkCapacity: true,
      });

      // Assert - Should only route to alice (passes both filters)
      expect(result).toBe('alice-pubkey');
    });
  });
});
