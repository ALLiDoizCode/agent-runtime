/**
 * Capability Discovery Integration Tests
 *
 * Tests the end-to-end flow of capability publishing and querying:
 * - CapabilityPublisher creates Kind 31990 events
 * - Events are stored in AgentEventDatabase
 * - CapabilityQueryService queries and parses events
 *
 * Story 18.4: Validates roundtrip: publish → query → parse
 */

// Mock toon-codec to avoid ESM transformation issues
jest.mock('../../src/agent/toon-codec', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  },
}));

// Mock nostr-tools to provide a consistent signing implementation
jest.mock('nostr-tools', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto');
  return {
    finalizeEvent: jest.fn((eventTemplate, _privateKey) => {
      const content = JSON.stringify({
        ...eventTemplate,
        pubkey: 'agent'.padEnd(64, '0'),
      });
      const id = crypto.createHash('sha256').update(content).digest('hex');
      return {
        ...eventTemplate,
        id,
        pubkey: 'agent'.padEnd(64, '0'),
        sig: '0'.repeat(128),
      };
    }),
  };
});

import { AgentEventDatabase } from '../../src/agent/event-database';
import { CapabilityPublisher } from '../../src/agent/discovery/capability-publisher';
import { CapabilityQueryService } from '../../src/agent/discovery/capability-query';
import type { SkillRegistry } from '../../src/agent/ai/skill-registry';
import pino from 'pino';

// TODO: Enable once discovery module is implemented (Epic 18)
describe.skip('Capability Discovery Integration', () => {
  let eventDatabase: AgentEventDatabase;
  let publisher: CapabilityPublisher;
  let queryService: CapabilityQueryService;
  let mockSkillRegistry: jest.Mocked<SkillRegistry>;
  let logger: pino.Logger;

  const TEST_PUBKEY = 'agent'.padEnd(64, '0');
  const TEST_PRIVATE_KEY = 'privatekey'.padEnd(64, '0');
  const TEST_ILP_ADDRESS = 'g.agent.test';

  beforeEach(async () => {
    logger = pino({ level: 'silent' });

    // Initialize real database (in-memory)
    eventDatabase = new AgentEventDatabase({ path: ':memory:' });
    await eventDatabase.initialize();

    // Mock skill registry
    mockSkillRegistry = {
      getSkillSummary: jest.fn().mockReturnValue([
        {
          name: 'query-events',
          description: 'Query Nostr events',
          eventKinds: [5000],
          pricing: { base: 100n },
        },
        {
          name: 'translate',
          description: 'Translate text',
          eventKinds: [5100],
          pricing: { base: 200n },
        },
      ]),
    } as unknown as jest.Mocked<SkillRegistry>;

    // Create publisher
    publisher = new CapabilityPublisher(
      {
        pubkey: TEST_PUBKEY,
        privateKey: TEST_PRIVATE_KEY,
        ilpAddress: TEST_ILP_ADDRESS,
        agentType: 'dvm',
        metadata: {
          name: 'Test Agent',
          about: 'Integration test agent',
        },
        capacity: {
          maxConcurrent: 10,
          queueDepth: 100,
        },
        model: 'anthropic:claude-haiku-4-5',
      },
      mockSkillRegistry,
      eventDatabase,
      logger
    );

    // Create query service
    queryService = new CapabilityQueryService(eventDatabase, logger);
  });

  afterEach(async () => {
    await eventDatabase.close();
  });

  describe('Publish → Query → Parse Roundtrip', () => {
    it('should publish capability event and query it back', async () => {
      // Publish capability event
      const publishedEvent = await publisher.publish();

      // Verify event was published
      expect(publishedEvent.kind).toBe(31990);
      expect(publishedEvent.pubkey).toBe(TEST_PUBKEY);

      // Query capabilities
      const capabilities = await queryService.findAgents({});

      // Should find the published capability
      expect(capabilities).toHaveLength(1);
      const cap = capabilities[0]!;

      // Verify parsed fields match published data
      expect(cap.pubkey).toBe(TEST_PUBKEY);
      expect(cap.identifier).toBe(TEST_ILP_ADDRESS);
      expect(cap.ilpAddress).toBe(TEST_ILP_ADDRESS);
      expect(cap.agentType).toBe('dvm');
      expect(cap.supportedKinds).toContain(5000);
      expect(cap.supportedKinds).toContain(5100);
      expect(cap.metadata.name).toBe('Test Agent');
      expect(cap.capacity?.maxConcurrent).toBe(10);
      expect(cap.model).toBe('anthropic:claude-haiku-4-5');
    });

    it('should preserve pricing through roundtrip', async () => {
      // Publish
      await publisher.publish();

      // Query
      const capabilities = await queryService.findAgents({});
      const cap = capabilities[0]!;

      // Verify pricing is correctly parsed
      expect(cap.pricing.size).toBe(2);
      expect(cap.pricing.get(5000)?.amount).toBe(100n);
      expect(cap.pricing.get(5000)?.currency).toBe('msat');
      expect(cap.pricing.get(5100)?.amount).toBe(200n);
      expect(cap.pricing.get(5100)?.currency).toBe('msat');
    });

    it('should filter published capabilities by required kinds', async () => {
      // Publish capability with kinds 5000 and 5100
      await publisher.publish();

      // Query for kind 5000 only
      const capabilities = await queryService.findAgents({
        requiredKinds: [5000],
      });

      expect(capabilities).toHaveLength(1);
      expect(capabilities[0]!.supportedKinds).toContain(5000);
    });

    it('should filter published capabilities by agent type', async () => {
      // Publish DVM capability
      await publisher.publish();

      // Query for DVMs only
      const dvmCaps = await queryService.findAgents({
        agentTypes: ['dvm'],
      });
      expect(dvmCaps).toHaveLength(1);

      // Query for assistants (should find nothing)
      const assistantCaps = await queryService.findAgents({
        agentTypes: ['assistant'],
      });
      expect(assistantCaps).toHaveLength(0);
    });

    it('should filter published capabilities by max price', async () => {
      // Publish capability with pricing 100 and 200 msat
      await publisher.publish();

      // Query with maxPrice below cheapest pricing (should find nothing for expensive kind)
      const cheapCaps = await queryService.findAgents({
        requiredKinds: [5100], // This kind costs 200 msat
        maxPrice: 150n, // Budget only 150 msat
      });
      expect(cheapCaps).toHaveLength(0);

      // Query with sufficient budget
      const affordableCaps = await queryService.findAgents({
        requiredKinds: [5000], // This kind costs 100 msat
        maxPrice: 150n, // Budget 150 msat
      });
      expect(affordableCaps).toHaveLength(1);
    });

    it('should filter published capabilities by ILP address prefix', async () => {
      // Publish capability with ILP address g.agent.test
      await publisher.publish();

      // Query by matching prefix
      const matchingCaps = await queryService.findAgents({
        ilpAddressPrefix: 'g.agent',
      });
      expect(matchingCaps).toHaveLength(1);

      // Query by non-matching prefix
      const nonMatchingCaps = await queryService.findAgents({
        ilpAddressPrefix: 'g.other',
      });
      expect(nonMatchingCaps).toHaveLength(0);
    });
  });

  describe('Multiple Publishers', () => {
    it('should query capabilities from multiple publishers', async () => {
      // Create second publisher with different config
      const publisher2 = new CapabilityPublisher(
        {
          pubkey: 'agent2'.padEnd(64, '0'),
          privateKey: 'privatekey2'.padEnd(64, '0'),
          ilpAddress: 'g.agent.second',
          agentType: 'assistant',
          metadata: {
            name: 'Second Agent',
          },
        },
        {
          getSkillSummary: jest.fn().mockReturnValue([
            {
              name: 'chat',
              description: 'Chat skill',
              eventKinds: [5200],
              pricing: { base: 50n },
            },
          ]),
        } as unknown as SkillRegistry,
        eventDatabase,
        logger
      );

      // Publish from both
      await publisher.publish();
      await publisher2.publish();

      // Query all
      const allCaps = await queryService.findAgents({});
      expect(allCaps).toHaveLength(2);

      // Query by agent type
      const dvmCaps = await queryService.findAgents({ agentTypes: ['dvm'] });
      expect(dvmCaps).toHaveLength(1);
      expect(dvmCaps[0]!.metadata.name).toBe('Test Agent');

      const assistantCaps = await queryService.findAgents({ agentTypes: ['assistant'] });
      expect(assistantCaps).toHaveLength(1);
      expect(assistantCaps[0]!.metadata.name).toBe('Second Agent');
    });

    it('should sort multiple capabilities by pricing', async () => {
      // Create cheaper publisher
      const cheapPublisher = new CapabilityPublisher(
        {
          pubkey: 'cheap'.padEnd(64, '0'),
          privateKey: 'cheap_pk'.padEnd(64, '0'),
          ilpAddress: 'g.agent.cheap',
          agentType: 'dvm',
          metadata: { name: 'Cheap Agent' },
        },
        {
          getSkillSummary: jest
            .fn()
            .mockReturnValue([{ name: 'query', eventKinds: [5000], pricing: { base: 10n } }]),
        } as unknown as SkillRegistry,
        eventDatabase,
        logger
      );

      // Create expensive publisher
      const expensivePublisher = new CapabilityPublisher(
        {
          pubkey: 'expensive'.padEnd(64, '0'),
          privateKey: 'expensive_pk'.padEnd(64, '0'),
          ilpAddress: 'g.agent.expensive',
          agentType: 'dvm',
          metadata: { name: 'Expensive Agent' },
        },
        {
          getSkillSummary: jest
            .fn()
            .mockReturnValue([{ name: 'query', eventKinds: [5000], pricing: { base: 1000n } }]),
        } as unknown as SkillRegistry,
        eventDatabase,
        logger
      );

      // Publish in reverse order (expensive first)
      await expensivePublisher.publish();
      await cheapPublisher.publish();

      // Query with required kinds to trigger price sorting
      const sortedCaps = await queryService.findAgents({
        requiredKinds: [5000],
      });

      // Should be sorted by price (cheapest first)
      expect(sortedCaps).toHaveLength(2);
      expect(sortedCaps[0]!.metadata.name).toBe('Cheap Agent');
      expect(sortedCaps[1]!.metadata.name).toBe('Expensive Agent');
    });
  });

  describe('Database Query with #k Tag Filter', () => {
    it('should use #k tag filter when querying with requiredKinds', async () => {
      // Publish capability
      await publisher.publish();

      // Spy on queryEvents to verify filter is passed
      const querySpy = jest.spyOn(eventDatabase, 'queryEvents');

      // Query with required kinds
      await queryService.findAgents({
        requiredKinds: [5000],
      });

      // Verify #k filter was passed to database
      expect(querySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          kinds: [31990],
          '#k': ['5000'],
        })
      );
    });
  });
});
