/**
 * DVM Test Utilities for Integration Tests
 *
 * Provides multi-agent test setup, ILP packet helpers, and test utilities
 * for NIP-90 DVM integration testing.
 */

import * as crypto from 'crypto';
import { AgentNode } from '../../../src/agent/agent-node';
import type { AgentNodeConfig } from '../../../src/agent/agent-node';
import { ToonCodec } from '../../../src/agent/toon-codec';
import type { NostrEvent } from '../../../src/agent/toon-codec';
import { ILPPreparePacket, PacketType, ILPErrorCode } from '@m2m/shared';
import {
  DVM_AGENT_A_PRIVKEY,
  DVM_AGENT_B_PRIVKEY,
  DVM_AGENT_C_PRIVKEY,
  DVM_AGENT_A_PUBKEY,
  DVM_AGENT_B_PUBKEY,
  DVM_AGENT_C_PUBKEY,
} from '../fixtures/dvm-events';

// ============================================
// Constants
// ============================================

/**
 * Deterministic fulfillment for DVM test requests.
 */
export const DVM_FULFILLMENT = Buffer.alloc(32, 0);
export const DVM_CONDITION = crypto.createHash('sha256').update(DVM_FULFILLMENT).digest();

/**
 * Default pricing for DVM tests.
 */
export const DVM_TEST_PRICING = {
  noteStorage: 100n,
  followUpdate: 50n,
  deletion: 10n,
  queryBase: 200n,
  queryPerResult: 5n,
};

/**
 * Maximum input size for DVM requests (65536 bytes per Epic 17).
 */
export const MAX_INPUT_SIZE = 65536;

// ============================================
// Agent Capabilities
// ============================================

/**
 * Agent capability configuration for multi-agent tests.
 */
export interface AgentCapabilities {
  /** Unique identifier for the agent */
  id: string;
  /** Agent's Nostr private key */
  privkey: string;
  /** Agent's Nostr public key */
  pubkey: string;
  /** Capabilities this agent supports */
  capabilities: string[];
  /** ILP address for this agent */
  ilpAddress: string;
}

/**
 * Pre-configured agent capabilities for standard test scenarios.
 */
export const STANDARD_AGENT_CAPABILITIES: AgentCapabilities[] = [
  {
    id: 'agent-a',
    privkey: DVM_AGENT_A_PRIVKEY,
    pubkey: DVM_AGENT_A_PUBKEY,
    capabilities: ['general', 'query'],
    ilpAddress: 'test.agent.a',
  },
  {
    id: 'agent-b',
    privkey: DVM_AGENT_B_PRIVKEY,
    pubkey: DVM_AGENT_B_PUBKEY,
    capabilities: ['translation'],
    ilpAddress: 'test.agent.b',
  },
  {
    id: 'agent-c',
    privkey: DVM_AGENT_C_PRIVKEY,
    pubkey: DVM_AGENT_C_PUBKEY,
    capabilities: ['summarization'],
    ilpAddress: 'test.agent.c',
  },
];

// ============================================
// TOON Codec
// ============================================

export const toonCodec = new ToonCodec();

// ============================================
// Multi-Agent Setup
// ============================================

/**
 * Multi-agent test environment with initialized agents and databases.
 */
export interface MultiAgentTestEnv {
  /** Array of initialized AgentNode instances */
  agents: AgentNode[];
  /** Agent capabilities configuration */
  capabilities: AgentCapabilities[];
  /** Cleanup function to stop all agents */
  cleanup: () => Promise<void>;
}

/**
 * Creates and initializes multiple test agents with different capabilities.
 *
 * @param count - Number of agents to create (default: 3)
 * @param customCapabilities - Optional custom capabilities (uses STANDARD_AGENT_CAPABILITIES if not provided)
 * @returns MultiAgentTestEnv with initialized agents
 */
export async function startTestAgents(
  count: number = 3,
  customCapabilities?: AgentCapabilities[]
): Promise<MultiAgentTestEnv> {
  const capabilities = customCapabilities ?? STANDARD_AGENT_CAPABILITIES.slice(0, count);
  const agents: AgentNode[] = [];

  for (let i = 0; i < count; i++) {
    const cap = capabilities[i];
    if (!cap) {
      throw new Error(`Missing capability configuration for agent ${i}`);
    }

    const config: AgentNodeConfig = {
      agentPubkey: cap.pubkey,
      agentPrivkey: cap.privkey,
      databasePath: ':memory:', // In-memory libSQL for isolation
      pricing: { ...DVM_TEST_PRICING },
      enableBuiltInHandlers: true,
      maxSubscriptionsPerPeer: 10,
    };

    const agent = new AgentNode(config);
    await agent.initialize();

    // Register test DVM handlers (Kind 5000, 5900, etc.)
    registerTestDVMHandlers(agent);

    agents.push(agent);
  }

  const cleanup = async (): Promise<void> => {
    for (const agent of agents) {
      await agent.shutdown();
    }
  };

  return { agents, capabilities, cleanup };
}

/**
 * Registers test DVM handlers for Kind 5000 and Kind 5900.
 * These are simplified handlers for testing without requiring AI.
 *
 * @param agent - AgentNode to register handlers on
 */
function registerTestDVMHandlers(agent: AgentNode): void {
  const eventHandler = agent['_eventHandler'];

  // Register Kind 5000 (DVM Query) handler
  eventHandler.registerHandler({
    kind: 5000,
    description: 'Test DVM query handler',
    requiredPayment: 1000n,
    handler: async (context) => {
      // Simple test handler that returns empty query results
      const resultEvent: NostrEvent = {
        id: crypto.randomBytes(32).toString('hex'),
        pubkey: context.agentPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 6000, // Result kind
        tags: [
          ['e', context.event.id],
          ['p', context.event.pubkey],
          ['request', JSON.stringify({ kind: 5000, id: context.event.id })],
          ['status', 'success'],
          ['amount', context.amount.toString()],
        ],
        content: JSON.stringify([]), // Empty result array
        sig: crypto.randomBytes(64).toString('hex'),
      };

      // Emit Kind 7000 feedback (processing status)
      const feedbackEvent: NostrEvent = {
        id: crypto.randomBytes(32).toString('hex'),
        pubkey: context.agentPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 7000,
        tags: [
          ['e', context.event.id],
          ['p', context.event.pubkey],
          ['status', 'processing'],
        ],
        content: 'Processing query',
        sig: crypto.randomBytes(64).toString('hex'),
      };

      // Store feedback event in database
      await context.database.storeEvent(feedbackEvent);

      return {
        success: true,
        responseEvent: resultEvent,
      };
    },
  });

  // Register Kind 5900 (Task Delegation) handler
  eventHandler.registerHandler({
    kind: 5900,
    description: 'Test task delegation handler',
    requiredPayment: 1000n,
    handler: async (context) => {
      const resultEvent: NostrEvent = {
        id: crypto.randomBytes(32).toString('hex'),
        pubkey: context.agentPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 6900, // Task result kind
        tags: [
          ['e', context.event.id],
          ['p', context.event.pubkey],
          ['request', JSON.stringify({ kind: 5900, id: context.event.id })],
          ['status', 'success'],
          ['amount', context.amount.toString()],
          ['runtime', '150'], // Mock runtime
        ],
        content: 'Task completed successfully',
        sig: crypto.randomBytes(64).toString('hex'),
      };

      return {
        success: true,
        responseEvent: resultEvent,
      };
    },
  });

  // Register Kind 10000 (Legacy Query) handler for backward compatibility testing
  eventHandler.registerHandler({
    kind: 10000,
    description: 'Test legacy query handler (deprecated)',
    requiredPayment: 1000n,
    handler: async (context) => {
      const resultEvent: NostrEvent = {
        id: crypto.randomBytes(32).toString('hex'),
        pubkey: context.agentPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 11000, // Legacy result kind
        tags: [
          ['e', context.event.id],
          ['p', context.event.pubkey],
          ['status', 'success'],
          ['amount', context.amount.toString()],
        ],
        content: JSON.stringify([]), // Empty result array
        sig: crypto.randomBytes(64).toString('hex'),
      };

      return {
        success: true,
        responseEvent: resultEvent,
      };
    },
  });

  // Register Kind 5100 (Translation) handler for job chaining tests
  eventHandler.registerHandler({
    kind: 5100,
    description: 'Test translation handler',
    requiredPayment: 500n,
    handler: async (context) => {
      const resultEvent: NostrEvent = {
        id: crypto.randomBytes(32).toString('hex'),
        pubkey: context.agentPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 6100,
        tags: [
          ['e', context.event.id],
          ['p', context.event.pubkey],
          ['status', 'success'],
          ['amount', context.amount.toString()],
        ],
        content: 'Translated text',
        sig: crypto.randomBytes(64).toString('hex'),
      };

      return {
        success: true,
        responseEvent: resultEvent,
      };
    },
  });

  // Register Kind 5200 (Summarization) handler for job chaining tests
  eventHandler.registerHandler({
    kind: 5200,
    description: 'Test summarization handler',
    requiredPayment: 800n,
    handler: async (context) => {
      const resultEvent: NostrEvent = {
        id: crypto.randomBytes(32).toString('hex'),
        pubkey: context.agentPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 6200,
        tags: [
          ['e', context.event.id],
          ['p', context.event.pubkey],
          ['status', 'success'],
          ['amount', context.amount.toString()],
        ],
        content: 'Summarized text',
        sig: crypto.randomBytes(64).toString('hex'),
      };

      return {
        success: true,
        responseEvent: resultEvent,
      };
    },
  });
}

// ============================================
// ILP Packet Helpers
// ============================================

/**
 * Creates an ILP PREPARE packet containing a TOON-encoded Nostr event.
 *
 * @param event - Nostr event to encode
 * @param amount - Payment amount in base units
 * @param destination - ILP destination address
 * @returns ILPPreparePacket
 */
export function createDVMPreparePacket(
  event: NostrEvent,
  amount: bigint,
  destination: string
): ILPPreparePacket {
  return {
    type: PacketType.PREPARE,
    amount,
    destination,
    executionCondition: DVM_CONDITION,
    expiresAt: new Date(Date.now() + 30000), // 30 seconds
    data: toonCodec.encode(event),
  };
}

/**
 * Creates a malformed TOON-encoded packet for security testing.
 *
 * @param destination - ILP destination address
 * @returns ILPPreparePacket with malformed data
 */
export function createMalformedTOONPacket(destination: string): ILPPreparePacket {
  return {
    type: PacketType.PREPARE,
    amount: 1000n,
    destination,
    executionCondition: DVM_CONDITION,
    expiresAt: new Date(Date.now() + 30000),
    data: Buffer.from('MALFORMED-TOON-DATA', 'utf-8'),
  };
}

// ============================================
// Type Guards
// ============================================

/**
 * Type guard to check if response is a FULFILL packet.
 */
export function isFulfill(response: {
  type: PacketType;
}): response is { type: PacketType.FULFILL; fulfillment: Buffer; data: Buffer } {
  return response.type === PacketType.FULFILL;
}

/**
 * Type guard to check if response is a REJECT packet.
 */
export function isReject(response: {
  type: PacketType;
}): response is { type: PacketType.REJECT; code: ILPErrorCode; message: string; data: Buffer } {
  return response.type === PacketType.REJECT;
}

// ============================================
// Performance Measurement
// ============================================

/**
 * High-resolution timer for performance benchmarking.
 */
export class HRTimer {
  private startTime: bigint = 0n;

  /**
   * Starts the timer.
   */
  start(): void {
    this.startTime = process.hrtime.bigint();
  }

  /**
   * Stops the timer and returns elapsed time in milliseconds.
   *
   * @returns Elapsed time in milliseconds
   */
  stop(): number {
    const endTime = process.hrtime.bigint();
    const nanos = endTime - this.startTime;
    return Number(nanos) / 1_000_000; // Convert nanoseconds to milliseconds
  }

  /**
   * Resets the timer.
   */
  reset(): void {
    this.startTime = 0n;
  }
}

/**
 * Performance sample for statistical analysis.
 */
export interface PerformanceSample {
  /** Sample value in milliseconds */
  value: number;
  /** Timestamp of the sample */
  timestamp: number;
}

/**
 * Collects performance samples and calculates statistics.
 */
export class PerformanceCollector {
  private samples: PerformanceSample[] = [];

  /**
   * Adds a performance sample.
   *
   * @param value - Sample value in milliseconds
   */
  addSample(value: number): void {
    this.samples.push({
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Calculates percentile from collected samples.
   *
   * @param percentile - Percentile value (0-1, e.g., 0.95 for p95)
   * @returns Percentile value in milliseconds
   */
  percentile(percentile: number): number {
    if (this.samples.length === 0) return 0;

    const sorted = this.samples.map((s) => s.value).sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile);
    return sorted[index] ?? 0;
  }

  /**
   * Calculates average of all samples.
   *
   * @returns Average in milliseconds
   */
  average(): number {
    if (this.samples.length === 0) return 0;
    const sum = this.samples.reduce((acc, s) => acc + s.value, 0);
    return sum / this.samples.length;
  }

  /**
   * Returns minimum sample value.
   *
   * @returns Minimum in milliseconds
   */
  min(): number {
    if (this.samples.length === 0) return 0;
    return Math.min(...this.samples.map((s) => s.value));
  }

  /**
   * Returns maximum sample value.
   *
   * @returns Maximum in milliseconds
   */
  max(): number {
    if (this.samples.length === 0) return 0;
    return Math.max(...this.samples.map((s) => s.value));
  }

  /**
   * Returns p50 (median).
   *
   * @returns Median in milliseconds
   */
  p50(): number {
    return this.percentile(0.5);
  }

  /**
   * Returns p95.
   *
   * @returns p95 in milliseconds
   */
  p95(): number {
    return this.percentile(0.95);
  }

  /**
   * Returns p99.
   *
   * @returns p99 in milliseconds
   */
  p99(): number {
    return this.percentile(0.99);
  }

  /**
   * Returns all samples.
   *
   * @returns Array of samples
   */
  getSamples(): PerformanceSample[] {
    return [...this.samples];
  }

  /**
   * Returns sample count.
   *
   * @returns Number of samples collected
   */
  count(): number {
    return this.samples.length;
  }

  /**
   * Clears all samples.
   */
  clear(): void {
    this.samples = [];
  }
}

// ============================================
// Event Database Helpers
// ============================================

/**
 * Waits for an event to appear in the agent's event database.
 *
 * @param agent - AgentNode to query
 * @param eventKind - Event kind to wait for
 * @param timeout - Maximum wait time in milliseconds (default: 5000)
 * @returns Promise<NostrEvent> that resolves when event is found
 */
export async function waitForEventKind(
  agent: AgentNode,
  eventKind: number,
  timeout: number = 5000
): Promise<NostrEvent> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const events = await agent['_database'].queryEvents({
      kinds: [eventKind],
      limit: 1,
    });

    if (events.length > 0) {
      return events[0]!;
    }

    // Wait 50ms before next check
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timeout waiting for event kind ${eventKind} after ${timeout}ms`);
}

/**
 * Waits for an event with a specific tag value to appear in the database.
 *
 * @param agent - AgentNode to query
 * @param eventKind - Event kind to wait for
 * @param tagName - Tag name to match (e.g., 'e', 'p', 'status')
 * @param tagValue - Tag value to match
 * @param timeout - Maximum wait time in milliseconds (default: 5000)
 * @returns Promise<NostrEvent> that resolves when event is found
 */
export async function waitForEventWithTag(
  agent: AgentNode,
  eventKind: number,
  tagName: string,
  tagValue: string,
  timeout: number = 5000
): Promise<NostrEvent> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const events = await agent['_database'].queryEvents({
      kinds: [eventKind],
    });

    const matchingEvent = events.find((event: NostrEvent) =>
      event.tags.some((tag: string[]) => tag[0] === tagName && tag[1] === tagValue)
    );

    if (matchingEvent) {
      return matchingEvent;
    }

    // Wait 50ms before next check
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(
    `Timeout waiting for event kind ${eventKind} with tag ${tagName}=${tagValue} after ${timeout}ms`
  );
}

// ============================================
// Re-exports
// ============================================

export { PacketType, ILPErrorCode };
export type { AgentNode, AgentNodeConfig, NostrEvent };
export {
  DVM_AGENT_A_PRIVKEY,
  DVM_AGENT_B_PRIVKEY,
  DVM_AGENT_C_PRIVKEY,
  DVM_AGENT_A_PUBKEY,
  DVM_AGENT_B_PUBKEY,
  DVM_AGENT_C_PUBKEY,
};
