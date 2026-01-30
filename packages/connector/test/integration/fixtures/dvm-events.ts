/**
 * DVM Event Fixtures for Integration Tests
 *
 * Provides reusable event fixtures for testing NIP-90 DVM functionality.
 */

import type { NostrEvent } from '../../../src/agent/toon-codec';
import { getPublicKey } from 'nostr-tools';
import * as crypto from 'crypto';

// ============================================
// Test Agent Keys
// ============================================

export const DVM_AGENT_A_PRIVKEY = 'a'.repeat(64); // General agent
export const DVM_AGENT_B_PRIVKEY = 'b'.repeat(64); // Translation agent
export const DVM_AGENT_C_PRIVKEY = 'c'.repeat(64); // Summarization agent

export const DVM_AGENT_A_PUBKEY = getPublicKey(Buffer.from(DVM_AGENT_A_PRIVKEY, 'hex'));
export const DVM_AGENT_B_PUBKEY = getPublicKey(Buffer.from(DVM_AGENT_B_PRIVKEY, 'hex'));
export const DVM_AGENT_C_PUBKEY = getPublicKey(Buffer.from(DVM_AGENT_C_PRIVKEY, 'hex'));

// ============================================
// Event Fixture Helpers
// ============================================

/**
 * Generates a unique event ID for fixtures.
 */
function generateEventId(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Creates a Kind 5000 DVM query request.
 *
 * @param overrides - Partial event fields to override
 * @returns NostrEvent for Kind 5000 query
 */
export function createKind5000QueryEvent(overrides?: Partial<NostrEvent>): NostrEvent {
  return {
    id: generateEventId(),
    pubkey: DVM_AGENT_A_PUBKEY,
    created_at: Math.floor(Date.now() / 1000),
    kind: 5000,
    tags: [
      ['i', 'test query', 'text'],
      ['output', 'application/json'],
      ['param', 'filter', 'kind=1'],
      ['bid', '1000'],
    ],
    content: 'Query for notes',
    sig: crypto.randomBytes(64).toString('hex'),
    ...overrides,
  };
}

/**
 * Creates a Kind 10000 legacy query request (backward compatibility).
 *
 * @param overrides - Partial event fields to override
 * @returns NostrEvent for Kind 10000 query
 */
export function createKind10000QueryEvent(overrides?: Partial<NostrEvent>): NostrEvent {
  return {
    id: generateEventId(),
    pubkey: DVM_AGENT_A_PUBKEY,
    created_at: Math.floor(Date.now() / 1000),
    kind: 10000,
    tags: [['filter', JSON.stringify({ kinds: [1], limit: 10 })]],
    content: 'Legacy query',
    sig: crypto.randomBytes(64).toString('hex'),
    ...overrides,
  };
}

/**
 * Creates a Kind 5900 task delegation request.
 *
 * @param preferredAgent - Optional preferred agent pubkey
 * @param overrides - Partial event fields to override
 * @returns NostrEvent for Kind 5900 delegation
 */
export function createKind5900DelegationEvent(
  preferredAgent?: string,
  overrides?: Partial<NostrEvent>
): NostrEvent {
  const tags: string[][] = [
    ['i', 'translate to Spanish', 'text'],
    ['output', 'text/plain'],
    ['timeout', '30'],
    ['priority', 'normal'],
  ];

  if (preferredAgent) {
    tags.push(['p', preferredAgent]);
  }

  return {
    id: generateEventId(),
    pubkey: DVM_AGENT_A_PUBKEY,
    created_at: Math.floor(Date.now() / 1000),
    kind: 5900,
    tags,
    content: 'Delegate translation task',
    sig: crypto.randomBytes(64).toString('hex'),
    ...overrides,
  };
}

/**
 * Creates a Kind 5100 translation job request.
 *
 * @param overrides - Partial event fields to override
 * @returns NostrEvent for Kind 5100 translation
 */
export function createKind5100TranslationEvent(overrides?: Partial<NostrEvent>): NostrEvent {
  return {
    id: generateEventId(),
    pubkey: DVM_AGENT_A_PUBKEY,
    created_at: Math.floor(Date.now() / 1000),
    kind: 5100,
    tags: [
      ['i', 'Hello, world!', 'text'],
      ['output', 'text/plain'],
      ['param', 'language', 'es'],
      ['bid', '500'],
    ],
    content: 'Translate to Spanish',
    sig: crypto.randomBytes(64).toString('hex'),
    ...overrides,
  };
}

/**
 * Creates a Kind 5200 summarization job request.
 *
 * @param dependencyEventId - Optional dependency event ID for chaining
 * @param overrides - Partial event fields to override
 * @returns NostrEvent for Kind 5200 summarization
 */
export function createKind5200SummarizationEvent(
  dependencyEventId?: string,
  overrides?: Partial<NostrEvent>
): NostrEvent {
  const tags: string[][] = [
    ['i', 'Long text to summarize...', 'text'],
    ['output', 'text/plain'],
    ['param', 'max_length', '100'],
    ['bid', '800'],
  ];

  if (dependencyEventId) {
    tags.push(['e', dependencyEventId, '', 'dependency']);
    tags.push(['i', dependencyEventId, 'job']);
  }

  return {
    id: generateEventId(),
    pubkey: DVM_AGENT_A_PUBKEY,
    created_at: Math.floor(Date.now() / 1000),
    kind: 5200,
    tags,
    content: 'Summarize text',
    sig: crypto.randomBytes(64).toString('hex'),
    ...overrides,
  };
}

/**
 * Creates a Kind 6000 DVM result event.
 *
 * @param requestEventId - The ID of the request event being responded to
 * @param requesterPubkey - The pubkey of the requester
 * @param status - Result status (success, error, partial)
 * @param overrides - Partial event fields to override
 * @returns NostrEvent for Kind 6000 result
 */
export function createKind6000ResultEvent(
  requestEventId: string,
  requesterPubkey: string,
  status: 'success' | 'error' | 'partial' = 'success',
  overrides?: Partial<NostrEvent>
): NostrEvent {
  return {
    id: generateEventId(),
    pubkey: DVM_AGENT_B_PUBKEY,
    created_at: Math.floor(Date.now() / 1000),
    kind: 6000,
    tags: [
      ['e', requestEventId],
      ['p', requesterPubkey],
      ['request', JSON.stringify({ kind: 5000, id: requestEventId })],
      ['status', status],
      ['amount', '1000'],
    ],
    content: JSON.stringify([{ id: 'note1', content: 'Test note' }]),
    sig: crypto.randomBytes(64).toString('hex'),
    ...overrides,
  };
}

/**
 * Creates a Kind 6900 task delegation result event.
 *
 * @param requestEventId - The ID of the request event being responded to
 * @param requesterPubkey - The pubkey of the requester
 * @param runtime - Execution time in milliseconds
 * @param status - Result status (success, error, partial)
 * @param overrides - Partial event fields to override
 * @returns NostrEvent for Kind 6900 result
 */
export function createKind6900TaskResultEvent(
  requestEventId: string,
  requesterPubkey: string,
  runtime: number = 150,
  status: 'success' | 'error' | 'partial' = 'success',
  overrides?: Partial<NostrEvent>
): NostrEvent {
  return {
    id: generateEventId(),
    pubkey: DVM_AGENT_B_PUBKEY,
    created_at: Math.floor(Date.now() / 1000),
    kind: 6900,
    tags: [
      ['e', requestEventId],
      ['p', requesterPubkey],
      ['request', JSON.stringify({ kind: 5900, id: requestEventId })],
      ['status', status],
      ['amount', '1000'],
      ['runtime', runtime.toString()],
    ],
    content: 'Task completed successfully',
    sig: crypto.randomBytes(64).toString('hex'),
    ...overrides,
  };
}

/**
 * Creates a Kind 7000 feedback event.
 *
 * @param requestEventId - The ID of the request event being responded to
 * @param requesterPubkey - The pubkey of the requester
 * @param status - Feedback status
 * @param overrides - Partial event fields to override
 * @returns NostrEvent for Kind 7000 feedback
 */
export function createKind7000FeedbackEvent(
  requestEventId: string,
  requesterPubkey: string,
  status: 'payment-required' | 'processing' | 'error' | 'success' | 'partial' = 'processing',
  overrides?: Partial<NostrEvent>
): NostrEvent {
  const tags: string[][] = [
    ['e', requestEventId],
    ['p', requesterPubkey],
    ['status', status],
  ];

  if (status === 'payment-required') {
    tags.push(['amount', '1000']);
  }

  return {
    id: generateEventId(),
    pubkey: DVM_AGENT_B_PUBKEY,
    created_at: Math.floor(Date.now() / 1000),
    kind: 7000,
    tags,
    content: `Job status: ${status}`,
    sig: crypto.randomBytes(64).toString('hex'),
    ...overrides,
  };
}

/**
 * Creates an oversized event exceeding maxInputSize for security testing.
 *
 * @param kind - Event kind (default: 5000)
 * @param size - Size in bytes (default: 70000, exceeds 65536 limit)
 * @returns NostrEvent with oversized content
 */
export function createOversizedEvent(kind: number = 5000, size: number = 70000): NostrEvent {
  const largeContent = 'x'.repeat(size);
  return {
    id: generateEventId(),
    pubkey: DVM_AGENT_A_PUBKEY,
    created_at: Math.floor(Date.now() / 1000),
    kind,
    tags: [['i', largeContent, 'text']],
    content: 'Oversized input test',
    sig: crypto.randomBytes(64).toString('hex'),
  };
}

/**
 * Creates a malformed event with invalid signature for security testing.
 *
 * @param kind - Event kind (default: 5000)
 * @returns NostrEvent with invalid signature
 */
export function createMalformedEvent(kind: number = 5000): NostrEvent {
  return {
    id: 'invalid-id',
    pubkey: 'invalid-pubkey',
    created_at: Math.floor(Date.now() / 1000),
    kind,
    tags: [['i', 'test', 'text']],
    content: 'Malformed event test',
    sig: 'invalid-signature',
  };
}

/**
 * Creates a SQL injection attempt in query parameters.
 *
 * @returns NostrEvent with SQL injection payload
 */
export function createSQLInjectionEvent(): NostrEvent {
  return {
    id: generateEventId(),
    pubkey: DVM_AGENT_A_PUBKEY,
    created_at: Math.floor(Date.now() / 1000),
    kind: 5000,
    tags: [
      ['i', "'; DROP TABLE events; --", 'text'],
      ['param', 'filter', "kind=1 OR '1'='1"],
    ],
    content: 'SQL injection test',
    sig: crypto.randomBytes(64).toString('hex'),
  };
}
