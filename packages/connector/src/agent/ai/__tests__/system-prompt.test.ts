import { SystemPromptBuilder, type PromptContext } from '../system-prompt';
import { SkillRegistry } from '../skill-registry';
import { z } from 'zod';
import type { NostrEvent } from '../../toon-codec';

function createTestPromptContext(overrides?: Partial<PromptContext>): PromptContext {
  return {
    event: {
      id: 'a'.repeat(64),
      pubkey: 'b'.repeat(64),
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: 'Hello, world!',
      sig: 'c'.repeat(128),
    } as NostrEvent,
    source: 'peer-1',
    amount: 1000n,
    destination: 'g.agent.test',
    ...overrides,
  };
}

function createTestRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  registry.register({
    name: 'store_note',
    description: 'Store a text note',
    parameters: z.object({ reason: z.string() }),
    execute: async () => ({ success: true }),
    eventKinds: [1],
  });
  registry.register({
    name: 'query_events',
    description: 'Query the event database',
    parameters: z.object({ reason: z.string() }),
    execute: async () => ({ success: true }),
    eventKinds: [10000],
  });
  return registry;
}

describe('SystemPromptBuilder', () => {
  let builder: SystemPromptBuilder;
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = createTestRegistry();
    builder = new SystemPromptBuilder({
      agentPubkey: 'a'.repeat(64),
      ilpAddress: 'g.agent.alice',
      skillRegistry: registry,
    });
  });

  describe('build', () => {
    it('should include agent identity', () => {
      const prompt = builder.build(createTestPromptContext());
      expect(prompt).toContain('a'.repeat(64));
      expect(prompt).toContain('g.agent.alice');
    });

    it('should include protocol context', () => {
      const prompt = builder.build(createTestPromptContext());
      expect(prompt).toContain('Nostr events');
      expect(prompt).toContain('ILP');
    });

    it('should include available skills', () => {
      const prompt = builder.build(createTestPromptContext());
      expect(prompt).toContain('store_note');
      expect(prompt).toContain('query_events');
      expect(prompt).toContain('Store a text note');
    });

    it('should include decision framework', () => {
      const prompt = builder.build(createTestPromptContext());
      expect(prompt).toContain('Decision Framework');
    });

    it('should include event context', () => {
      const context = createTestPromptContext();
      const prompt = builder.build(context);
      expect(prompt).toContain('Kind: 1');
      expect(prompt).toContain('peer-1');
      expect(prompt).toContain('Hello, world!');
    });

    it('should truncate long content', () => {
      const context = createTestPromptContext({
        event: {
          id: 'a'.repeat(64),
          pubkey: 'b'.repeat(64),
          created_at: Math.floor(Date.now() / 1000),
          kind: 1,
          tags: [],
          content: 'x'.repeat(600),
          sig: 'c'.repeat(128),
        } as NostrEvent,
      });
      const prompt = builder.build(context);
      expect(prompt).toContain('...');
      expect(prompt).not.toContain('x'.repeat(600));
    });

    it('should include tags summary', () => {
      const context = createTestPromptContext({
        event: {
          id: 'a'.repeat(64),
          pubkey: 'b'.repeat(64),
          created_at: Math.floor(Date.now() / 1000),
          kind: 1,
          tags: [
            ['e', 'eventid123'],
            ['p', 'pubkey456'],
          ],
          content: 'Test',
          sig: 'c'.repeat(128),
        } as NostrEvent,
      });
      const prompt = builder.build(context);
      expect(prompt).toContain('Tags (2 total)');
    });
  });

  describe('personality', () => {
    it('should include personality name and role', () => {
      const personalizedBuilder = new SystemPromptBuilder({
        agentPubkey: 'a'.repeat(64),
        personality: {
          name: 'Agent Alice',
          role: 'Network relay',
          instructions: 'Be concise.',
        },
        skillRegistry: registry,
      });
      const prompt = personalizedBuilder.build(createTestPromptContext());
      expect(prompt).toContain('Agent Alice');
      expect(prompt).toContain('Network relay');
      expect(prompt).toContain('Be concise.');
    });

    it('should use defaults when no personality configured', () => {
      const prompt = builder.build(createTestPromptContext());
      expect(prompt).toContain('AI Agent');
    });
  });

  describe('buildStatic', () => {
    it('should not include event-specific context', () => {
      const staticPrompt = builder.buildStatic();
      expect(staticPrompt).toContain('Identity');
      expect(staticPrompt).toContain('store_note');
      expect(staticPrompt).not.toContain('Current Event');
    });

    it('should include instructions in static prompt when configured', () => {
      const builderWithInstructions = new SystemPromptBuilder({
        agentPubkey: 'a'.repeat(64),
        personality: {
          name: 'Agent Bob',
          instructions: 'Always be helpful.',
        },
        skillRegistry: registry,
      });
      const staticPrompt = builderWithInstructions.buildStatic();
      expect(staticPrompt).toContain('## Instructions');
      expect(staticPrompt).toContain('Always be helpful.');
    });
  });

  describe('ILP address handling', () => {
    it('should include ILP address when provided', () => {
      const prompt = builder.build(createTestPromptContext());
      expect(prompt).toContain('Your ILP address: g.agent.alice');
    });

    it('should omit ILP address when not provided', () => {
      const builderNoIlp = new SystemPromptBuilder({
        agentPubkey: 'a'.repeat(64),
        skillRegistry: registry,
      });
      const prompt = builderNoIlp.build(createTestPromptContext());
      expect(prompt).not.toContain('Your ILP address');
    });
  });

  describe('event context formatting', () => {
    it('should format amount as string from bigint', () => {
      const context = createTestPromptContext({ amount: 123456789n });
      const prompt = builder.build(context);
      expect(prompt).toContain('Payment amount: 123456789');
    });

    it('should format created_at as ISO date', () => {
      const timestamp = 1700000000; // 2023-11-14T22:13:20.000Z
      const context = createTestPromptContext({
        event: {
          id: 'a'.repeat(64),
          pubkey: 'b'.repeat(64),
          created_at: timestamp,
          kind: 1,
          tags: [],
          content: 'Test',
          sig: 'c'.repeat(128),
        } as NostrEvent,
      });
      const prompt = builder.build(context);
      expect(prompt).toContain('Created at: 2023-11-14T22:13:20.000Z');
    });

    it('should not include Content line when content is empty', () => {
      const context = createTestPromptContext({
        event: {
          id: 'a'.repeat(64),
          pubkey: 'b'.repeat(64),
          created_at: Math.floor(Date.now() / 1000),
          kind: 1,
          tags: [],
          content: '',
          sig: 'c'.repeat(128),
        } as NostrEvent,
      });
      const prompt = builder.build(context);
      expect(prompt).not.toContain('- Content:');
    });
  });

  describe('tags handling', () => {
    it('should show ellipsis when more than 10 tags', () => {
      const tags = Array.from({ length: 15 }, (_, i) => ['t', `tag${i}`]);
      const context = createTestPromptContext({
        event: {
          id: 'a'.repeat(64),
          pubkey: 'b'.repeat(64),
          created_at: Math.floor(Date.now() / 1000),
          kind: 1,
          tags,
          content: 'Test',
          sig: 'c'.repeat(128),
        } as NostrEvent,
      });
      const prompt = builder.build(context);
      expect(prompt).toContain('Tags (15 total)');
      expect(prompt).toContain('...');
      expect(prompt).not.toContain('tag14'); // 15th tag should not be shown
    });
  });

  describe('decision framework', () => {
    it('should contain all 5 decision rules', () => {
      const prompt = builder.build(createTestPromptContext());
      expect(prompt).toContain('1. If the event kind matches');
      expect(prompt).toContain('2. If the event should be relayed');
      expect(prompt).toContain('3. If you cannot handle the event kind');
      expect(prompt).toContain('4. Prefer local handling');
      expect(prompt).toContain('5. Always invoke exactly one skill');
    });
  });

  describe('protocol context', () => {
    it('should mention both Nostr and ILP', () => {
      const prompt = builder.build(createTestPromptContext());
      expect(prompt).toContain('Nostr');
      expect(prompt).toContain('ILP');
      expect(prompt).toContain('Interledger Protocol');
    });
  });

  describe('multiple skills', () => {
    it('should list all registered skills with kinds', () => {
      const prompt = builder.build(createTestPromptContext());
      expect(prompt).toContain('**store_note** (Kind 1)');
      expect(prompt).toContain('**query_events** (Kind 10000)');
    });

    it('should list skill without event kinds (no kind suffix)', () => {
      const regWithNoKind = new SkillRegistry();
      regWithNoKind.register({
        name: 'generic_skill',
        description: 'A skill with no event kinds',
        parameters: z.object({}),
        execute: async () => ({ success: true }),
        // No eventKinds specified
      });
      const builderNoKind = new SystemPromptBuilder({
        agentPubkey: 'a'.repeat(64),
        skillRegistry: regWithNoKind,
      });
      const prompt = builderNoKind.build(createTestPromptContext());
      expect(prompt).toContain('**generic_skill**: A skill with no event kinds');
      expect(prompt).not.toContain('**generic_skill** (Kind');
    });
  });
});
