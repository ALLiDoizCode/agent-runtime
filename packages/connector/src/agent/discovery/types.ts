/**
 * Discovery Module Types
 *
 * Types for Epic 18 capability discovery.
 */

import { z } from 'zod';

/**
 * Tag names used in Kind 31990 capability events.
 */
export const TAG_NAMES = {
  IDENTIFIER: 'd',
  KIND: 'k',
  NIP: 'nip',
  AGENT_TYPE: 'agent-type',
  ILP_ADDRESS: 'ilp-address',
  PRICING: 'pricing',
  CAPACITY: 'capacity',
  MODEL: 'model',
  SKILLS: 'skills',
} as const;

/**
 * Agent type classification.
 */
export type AgentType = 'dvm' | 'assistant' | 'specialist' | 'coordinator' | 'relay';

/**
 * Agent metadata from content JSON.
 */
export interface AgentMetadata {
  name?: string;
  about?: string;
  picture?: string;
  [key: string]: unknown;
}

/**
 * Pricing information for a specific event kind.
 */
export interface KindPricing {
  kind: number;
  amount: bigint;
  currency: string;
}

/**
 * Pricing entry from capability event tags.
 */
export interface PricingEntry {
  kind: number;
  amount: bigint;
  currency: 'msat' | 'sat' | 'usd';
}

/**
 * Capacity information for an agent.
 */
export interface CapacityInfo {
  maxConcurrent: number;
  queueDepth: number;
}

/**
 * Agent capability information parsed from Kind 31990 events.
 */
export interface AgentCapability {
  pubkey: string;
  identifier: string;
  supportedKinds: number[];
  supportedNips: string[];
  agentType: AgentType;
  ilpAddress: string;
  pricing: Map<number, PricingEntry>;
  metadata: AgentMetadata;
  createdAt: number;
  capacity?: CapacityInfo;
  model?: string;
  skills?: string[];
}

/**
 * Zod schema for AgentCapability validation.
 */
export const AgentCapabilitySchema = z.object({
  pubkey: z.string().min(64).max(64),
  identifier: z.string().min(1),
  supportedKinds: z.array(z.number()),
  supportedNips: z.array(z.string()),
  agentType: z.enum(['dvm', 'assistant', 'specialist', 'coordinator', 'relay']),
  ilpAddress: z.string().min(1),
  pricing: z.map(
    z.number(),
    z.object({
      kind: z.number(),
      amount: z.bigint(),
      currency: z.enum(['msat', 'sat', 'usd']),
    })
  ),
  metadata: z.record(z.unknown()),
  createdAt: z.number(),
  capacity: z
    .object({
      maxConcurrent: z.number(),
      queueDepth: z.number(),
    })
    .optional(),
  model: z.string().optional(),
  skills: z.array(z.string()).optional(),
});

/**
 * Capability with social distance information.
 */
export interface CapabilityWithDistance extends AgentCapability {
  socialDistance: number;
}

/**
 * Query parameters for finding agent capabilities.
 */
export interface CapabilityQuery {
  pubkeys?: string[];
  requiredKinds?: number[];
  agentTypes?: AgentType[];
  maxPrice?: bigint;
  ilpAddressPrefix?: string;
  limit?: number;
}

/**
 * Configuration for social capability discovery.
 */
export interface SocialDiscoveryConfig {
  extendedHops?: boolean;
  maxDistance?: number;
  cacheEnabled?: boolean;
  cacheTtl?: number;
}

/**
 * Options for discovering capabilities.
 */
export interface DiscoveryOptions {
  extendedHops?: boolean;
  limit?: number;
  useCache?: boolean;
}

/**
 * Cache entry wrapper with timestamps.
 */
export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessTimestamp: number;
}

/**
 * Cache performance metrics.
 */
export interface CacheMetrics {
  hits: number;
  misses: number;
  refreshCount: number;
  size: number;
  evictions: number;
}

/**
 * Configuration for CapabilityCache.
 */
export interface CapabilityCacheConfig {
  ttlMs?: number;
  maxEntries?: number;
  refreshIntervalMs?: number;
  warmupLimit?: number;
}
