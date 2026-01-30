/**
 * Tests for CapabilityQueryService
 *
 * Validates querying, filtering, sorting, and parsing of capability events.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { CapabilityQueryService } from '../capability-query';
import type { AgentEventDatabase } from '../../event-database';
import type { NostrEvent } from '../../toon-codec';
import type { CapabilityQuery } from '../types';
import { TAG_NAMES } from '../types';
import type { Logger } from 'pino';

// TODO: Enable once discovery module is implemented (Epic 18)
describe.skip('CapabilityQueryService', () => {
  let mockEventDatabase: jest.Mocked<AgentEventDatabase>;
  let service: CapabilityQueryService;

  // Helper to create capability event
  const createCapabilityEvent = (overrides: Partial<NostrEvent> = {}): NostrEvent => {
    return {
      id: '0'.repeat(64),
      pubkey: 'agent'.padEnd(64, '0'),
      created_at: Math.floor(Date.now() / 1000),
      kind: 31990,
      tags: [],
      content: JSON.stringify({ name: 'Test Agent' }),
      sig: '0'.repeat(128),
      ...overrides,
    };
  };

  beforeEach(() => {
    mockEventDatabase = {
      queryEvents: jest.fn(),
    } as unknown as jest.Mocked<AgentEventDatabase>;

    service = new CapabilityQueryService(mockEventDatabase);
  });

  describe('findAgents', () => {
    it('should query local storage for Kind 31990 events', async () => {
      mockEventDatabase.queryEvents.mockResolvedValue([
        createCapabilityEvent({
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.test'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.test'],
          ],
        }),
      ]);

      const query: CapabilityQuery = {};
      const results = await service.findAgents(query);

      expect(mockEventDatabase.queryEvents).toHaveBeenCalledWith({
        kinds: [31990],
      });
      expect(results).toHaveLength(1);
      expect(results[0]!.identifier).toBe('g.agent.test');
    });

    it('should filter by required kinds', async () => {
      mockEventDatabase.queryEvents.mockResolvedValue([
        createCapabilityEvent({
          id: '1'.repeat(64),
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.a'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.KIND, '5100'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.a'],
          ],
        }),
        createCapabilityEvent({
          id: '2'.repeat(64),
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.b'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.b'],
          ],
        }),
      ]);

      const query: CapabilityQuery = {
        requiredKinds: [5000, 5100], // Agent must support BOTH
      };
      const results = await service.findAgents(query);

      expect(results).toHaveLength(1);
      expect(results[0]!.identifier).toBe('g.agent.a'); // Only agent A supports both
    });

    it('should filter by agent type', async () => {
      mockEventDatabase.queryEvents.mockResolvedValue([
        createCapabilityEvent({
          id: '1'.repeat(64),
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.dvm'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.dvm'],
          ],
        }),
        createCapabilityEvent({
          id: '2'.repeat(64),
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.assistant'],
            [TAG_NAMES.AGENT_TYPE, 'assistant'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.assistant'],
          ],
        }),
      ]);

      const query: CapabilityQuery = {
        agentTypes: ['dvm'],
      };
      const results = await service.findAgents(query);

      expect(results).toHaveLength(1);
      expect(results[0]!.agentType).toBe('dvm');
    });

    it('should filter by max price', async () => {
      mockEventDatabase.queryEvents.mockResolvedValue([
        createCapabilityEvent({
          id: '1'.repeat(64),
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.cheap'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.PRICING, '5000', '100', 'msat'], // Cheap
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.cheap'],
          ],
        }),
        createCapabilityEvent({
          id: '2'.repeat(64),
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.expensive'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.PRICING, '5000', '10000', 'msat'], // Expensive
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.expensive'],
          ],
        }),
      ]);

      const query: CapabilityQuery = {
        requiredKinds: [5000],
        maxPrice: 5000n, // Maximum 5000 msat
      };
      const results = await service.findAgents(query);

      expect(results).toHaveLength(1);
      expect(results[0]!.identifier).toBe('g.agent.cheap');
    });

    it('should filter by ILP address prefix', async () => {
      mockEventDatabase.queryEvents.mockResolvedValue([
        createCapabilityEvent({
          id: '1'.repeat(64),
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.alice.test'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.alice.test'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
          ],
        }),
        createCapabilityEvent({
          id: '2'.repeat(64),
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.bob.test'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.bob.test'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
          ],
        }),
      ]);

      const query: CapabilityQuery = {
        ilpAddressPrefix: 'g.agent.alice',
      };
      const results = await service.findAgents(query);

      expect(results).toHaveLength(1);
      expect(results[0]!.ilpAddress).toBe('g.agent.alice.test');
    });

    it('should sort by pricing (lowest first)', async () => {
      mockEventDatabase.queryEvents.mockResolvedValue([
        createCapabilityEvent({
          id: '1'.repeat(64),
          created_at: 1000,
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.expensive'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.PRICING, '5000', '10000', 'msat'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.expensive'],
          ],
        }),
        createCapabilityEvent({
          id: '2'.repeat(64),
          created_at: 2000,
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.cheap'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.PRICING, '5000', '100', 'msat'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.cheap'],
          ],
        }),
      ]);

      const query: CapabilityQuery = {
        requiredKinds: [5000],
      };
      const results = await service.findAgents(query);

      expect(results).toHaveLength(2);
      expect(results[0]!.identifier).toBe('g.agent.cheap'); // Cheaper first
      expect(results[1]!.identifier).toBe('g.agent.expensive');
    });

    it('should sort by capacity when pricing is equal', async () => {
      mockEventDatabase.queryEvents.mockResolvedValue([
        createCapabilityEvent({
          id: '1'.repeat(64),
          created_at: 1000,
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.low'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.PRICING, '5000', '100', 'msat'],
            [TAG_NAMES.CAPACITY, '5', '50'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.low'],
          ],
        }),
        createCapabilityEvent({
          id: '2'.repeat(64),
          created_at: 2000,
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.high'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.PRICING, '5000', '100', 'msat'],
            [TAG_NAMES.CAPACITY, '50', '100'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.high'],
          ],
        }),
      ]);

      const query: CapabilityQuery = {
        requiredKinds: [5000],
      };
      const results = await service.findAgents(query);

      expect(results).toHaveLength(2);
      expect(results[0]!.identifier).toBe('g.agent.high'); // Higher capacity first
      expect(results[0]!.capacity?.maxConcurrent).toBe(50);
    });

    it('should sort by freshness when pricing and capacity are equal', async () => {
      mockEventDatabase.queryEvents.mockResolvedValue([
        createCapabilityEvent({
          id: '1'.repeat(64),
          created_at: 1000,
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.old'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.PRICING, '5000', '100', 'msat'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.old'],
          ],
        }),
        createCapabilityEvent({
          id: '2'.repeat(64),
          created_at: 2000,
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.new'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.PRICING, '5000', '100', 'msat'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.new'],
          ],
        }),
      ]);

      const query: CapabilityQuery = {
        requiredKinds: [5000],
      };
      const results = await service.findAgents(query);

      expect(results).toHaveLength(2);
      expect(results[0]!.identifier).toBe('g.agent.new'); // Newer first
      expect(results[0]!.createdAt).toBe(2000);
    });

    it('should parse capability with all optional fields', async () => {
      mockEventDatabase.queryEvents.mockResolvedValue([
        createCapabilityEvent({
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.full'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.KIND, '5100'],
            [TAG_NAMES.NIP, '89'],
            [TAG_NAMES.NIP, '90'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.full'],
            [TAG_NAMES.PRICING, '5000', '100', 'msat'],
            [TAG_NAMES.PRICING, '5100', '200', 'msat'],
            [TAG_NAMES.CAPACITY, '10', '100'],
            [TAG_NAMES.MODEL, 'anthropic:claude-haiku-4-5'],
            [TAG_NAMES.SKILLS, 'query', 'translate'],
          ],
          content: JSON.stringify({
            name: 'Full Agent',
            about: 'Test agent with all fields',
            picture: 'https://example.com/avatar.png',
          }),
        }),
      ]);

      const results = await service.findAgents({});

      expect(results).toHaveLength(1);
      const cap = results[0]!;
      expect(cap.identifier).toBe('g.agent.full');
      expect(cap.supportedKinds).toEqual([5000, 5100]);
      expect(cap.supportedNips).toEqual(['89', '90']);
      expect(cap.agentType).toBe('dvm');
      expect(cap.ilpAddress).toBe('g.agent.full');
      expect(cap.pricing.get(5000)?.amount).toBe(100n);
      expect(cap.pricing.get(5100)?.amount).toBe(200n);
      expect(cap.capacity).toEqual({ maxConcurrent: 10, queueDepth: 100 });
      expect(cap.model).toBe('anthropic:claude-haiku-4-5');
      expect(cap.skills).toEqual(['query', 'translate']);
      expect(cap.metadata.name).toBe('Full Agent');
    });

    it('should skip invalid events and log warnings', async () => {
      const mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
      };

      const serviceWithLogger = new CapabilityQueryService(
        mockEventDatabase,
        mockLogger as unknown as Logger
      );

      mockEventDatabase.queryEvents.mockResolvedValue([
        createCapabilityEvent({
          // Missing required fields - will fail validation
          tags: [],
          content: 'invalid json {',
        }),
        createCapabilityEvent({
          // Valid event
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.valid'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.valid'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
          ],
        }),
      ]);

      const results = await serviceWithLogger.findAgents({});

      expect(results).toHaveLength(1);
      expect(results[0]!.identifier).toBe('g.agent.valid');
      expect(mockLogger.warn).toHaveBeenCalled(); // Invalid event logged
    });

    it('should combine multiple filters', async () => {
      mockEventDatabase.queryEvents.mockResolvedValue([
        createCapabilityEvent({
          id: '1'.repeat(64),
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.match'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.KIND, '5100'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.match'],
            [TAG_NAMES.PRICING, '5000', '100', 'msat'],
            [TAG_NAMES.PRICING, '5100', '100', 'msat'],
          ],
        }),
        createCapabilityEvent({
          id: '2'.repeat(64),
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.nomatch.type'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.KIND, '5100'],
            [TAG_NAMES.AGENT_TYPE, 'assistant'], // Wrong type
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.nomatch.type'],
            [TAG_NAMES.PRICING, '5000', '100', 'msat'],
            [TAG_NAMES.PRICING, '5100', '100', 'msat'],
          ],
        }),
        createCapabilityEvent({
          id: '3'.repeat(64),
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.nomatch.price'],
            [TAG_NAMES.KIND, '5000'],
            [TAG_NAMES.KIND, '5100'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.nomatch.price'],
            [TAG_NAMES.PRICING, '5000', '10000', 'msat'], // Too expensive
            [TAG_NAMES.PRICING, '5100', '100', 'msat'],
          ],
        }),
      ]);

      const query: CapabilityQuery = {
        requiredKinds: [5000, 5100],
        agentTypes: ['dvm'],
        maxPrice: 1000n,
        ilpAddressPrefix: 'g.agent.match',
      };
      const results = await service.findAgents(query);

      expect(results).toHaveLength(1);
      expect(results[0]!.identifier).toBe('g.agent.match');
    });

    it('should return empty array when no matches found', async () => {
      mockEventDatabase.queryEvents.mockResolvedValue([]);

      const results = await service.findAgents({ requiredKinds: [9999] });

      expect(results).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      mockEventDatabase.queryEvents.mockResolvedValue([
        createCapabilityEvent({
          id: '1'.repeat(64),
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.1'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.1'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
          ],
        }),
        createCapabilityEvent({
          id: '2'.repeat(64),
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.2'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.2'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
          ],
        }),
        createCapabilityEvent({
          id: '3'.repeat(64),
          tags: [
            [TAG_NAMES.IDENTIFIER, 'g.agent.3'],
            [TAG_NAMES.ILP_ADDRESS, 'g.agent.3'],
            [TAG_NAMES.AGENT_TYPE, 'dvm'],
          ],
        }),
      ]);

      const results = await service.findAgents({ limit: 2 });

      expect(results).toHaveLength(2);
    });
  });
});
