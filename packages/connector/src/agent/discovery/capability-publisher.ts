/**
 * Capability Publisher
 *
 * Placeholder for Epic 18 capability publishing.
 * Publishes Kind 31990 capability events.
 * TODO: Implement fully in Epic 18.
 */

import type { Logger } from 'pino';
import type { AgentEventDatabase } from '../event-database';
import type { SkillRegistry } from '../ai/skill-registry';
import type { NostrEvent } from '../toon-codec';

export interface CapabilityPublisherConfig {
  pubkey: string;
  privateKey: string;
  ilpAddress: string;
  agentType: string;
  metadata?: {
    name?: string;
    about?: string;
    picture?: string;
  };
  capacity?: {
    maxConcurrent: number;
    queueDepth: number;
  };
  model?: string;
}

/**
 * Publishes agent capability events (Kind 31990).
 */
export class CapabilityPublisher {
  constructor(
    private readonly config: CapabilityPublisherConfig,
    private readonly skillRegistry: SkillRegistry,
    private readonly eventDatabase: AgentEventDatabase,
    private readonly logger?: Logger
  ) {}

  /**
   * Publish a capability event.
   * @returns The published event
   */
  async publish(): Promise<NostrEvent> {
    const skills = this.skillRegistry.getSkillSummary();

    // Extract supported kinds from skills
    const supportedKinds = new Set<number>();
    const pricing = new Map<number, { base: bigint }>();

    for (const skill of skills) {
      if (skill.eventKinds) {
        for (const kind of skill.eventKinds) {
          supportedKinds.add(kind);
          if (skill.pricing) {
            pricing.set(kind, skill.pricing);
          }
        }
      }
    }

    // Build tags
    const tags: string[][] = [
      ['d', this.config.ilpAddress],
      ['agent-type', this.config.agentType],
      ['ilp-address', this.config.ilpAddress],
    ];

    for (const kind of supportedKinds) {
      tags.push(['k', kind.toString()]);
      const p = pricing.get(kind);
      if (p) {
        tags.push(['pricing', kind.toString(), p.base.toString(), 'msat']);
      }
    }

    if (this.config.capacity) {
      tags.push([
        'capacity',
        this.config.capacity.maxConcurrent.toString(),
        this.config.capacity.queueDepth.toString(),
      ]);
    }

    if (this.config.model) {
      tags.push(['model', this.config.model]);
    }

    // Create event template
    const eventTemplate = {
      kind: 31990,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: JSON.stringify(this.config.metadata || {}),
    };

    // Sign event (using nostr-tools)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { finalizeEvent } = require('nostr-tools');
    const event = finalizeEvent(eventTemplate, Buffer.from(this.config.privateKey, 'hex'));

    // Store in database
    await this.eventDatabase.storeEvent(event);

    this.logger?.info({ eventId: event.id }, 'Published capability event');

    return event;
  }
}
