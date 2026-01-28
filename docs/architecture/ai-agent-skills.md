# AI Agent Skills Architecture

## Overview

The AI Agent system (Epic 16) makes the M2M agent node AI-native by integrating the Vercel AI SDK. The AI agent uses **agent skills** — modular capabilities mapped to Nostr event kinds — to process events, compose responses, and route packets. Each skill encapsulates the logic for a specific event kind, and the AI agent orchestrates which skills to invoke based on the incoming event.

**Related docs:** [coding-standards.md](coding-standards.md) | [test-strategy-and-standards.md](test-strategy-and-standards.md) | [source-tree.md](source-tree.md)

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                      AgentNode                           │
│                                                          │
│  ┌────────────────┐   ┌─────────────────────────────┐   │
│  │ Payment        │   │ AI Agent Dispatcher          │   │
│  │ Validator      │──►│ (Vercel AI SDK generateText) │   │
│  │ (unchanged)    │   │                              │   │
│  └────────────────┘   │  System Prompt               │   │
│                       │  + Event Context              │   │
│                       │         │                     │   │
│                       │  ┌──────▼──────────────┐     │   │
│                       │  │ Agent Skills         │     │   │
│                       │  │ ┌──────┐ ┌────────┐ │     │   │
│                       │  │ │Note  │ │Follow  │ │     │   │
│                       │  │ │Skill │ │Skill   │ │     │   │
│                       │  │ ├──────┤ ├────────┤ │     │   │
│                       │  │ │Delete│ │Query   │ │     │   │
│                       │  │ │Skill │ │Skill   │ │     │   │
│                       │  │ ├──────┤ ├────────┤ │     │   │
│                       │  │ │Fwd   │ │Info    │ │     │   │
│                       │  │ │Skill │ │Skill   │ │     │   │
│                       │  │ └──────┘ └────────┘ │     │   │
│                       │  └─────────────────────┘     │   │
│                       └──────────────┬───────────────┘   │
│                                      │                    │
│                       ┌──────────────▼───────────────┐   │
│                       │ Fallback: Direct Dispatch     │   │
│                       │ (AgentEventHandler - Epic 13) │   │
│                       └──────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Event Processing Flow

```
ILP Packet → TOON Decode → Payment Validation → AI Agent Dispatcher
  │
  ├─ AI disabled?
  │   └─ YES → Direct Handler Dispatch (AgentEventHandler)
  │
  ├─ Budget exhausted?
  │   ├─ fallbackOnExhaustion: true  → Direct Handler Dispatch
  │   └─ fallbackOnExhaustion: false → ILP Reject (T03: budget exhausted)
  │
  ├─ AI dispatch succeeds
  │   ├─ Agent has skill for event kind → Skill execution → ILP Fulfill
  │   ├─ Agent decides to forward → forward_packet skill → ILP Fulfill/Reject
  │   └─ Agent has no matching skill → Reasoned ILP Reject (F99)
  │
  └─ AI dispatch fails (API error / timeout)
      └─ Direct Handler Dispatch (fallback)
```

## Core Components

### AIAgentDispatcher

The central orchestrator. Receives an `EventHandlerContext`, builds a system prompt with event details, and calls `generateText()` with registered skills as AI SDK tools. Falls back to direct `AgentEventHandler` dispatch on error.

**Location:** `packages/connector/src/agent/ai/ai-agent-dispatcher.ts`

**Constructor config:**

```typescript
interface AIAgentDispatcherConfig {
  aiConfig: AIAgentConfig;
  model: LanguageModelV1; // AI SDK language model instance
  skillRegistry: SkillRegistry;
  systemPromptBuilder: SystemPromptBuilder;
  tokenBudget: TokenBudget;
  fallbackHandler: AgentEventHandler; // Direct dispatch fallback
  logger?: Logger; // Pino logger (optional)
  timeoutMs?: number; // Request timeout (default: 10000ms)
}
```

**Methods and properties:**

| Member            | Signature                                                       | Description                                                          |
| ----------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `handleEvent`     | `(context: EventHandlerContext) => Promise<EventHandlerResult>` | Main entry point. Checks enabled/budget, dispatches AI or falls back |
| `getBudgetStatus` | `() => TokenBudgetStatus`                                       | Returns current token budget status                                  |
| `isEnabled`       | `get isEnabled: boolean`                                        | Whether AI dispatch is enabled                                       |
| `skillRegistry`   | `get skillRegistry: SkillRegistry`                              | Access the skill registry                                            |

**Behavior:**

- Default timeout: 10 seconds (`DEFAULT_TIMEOUT_MS = 10000`)
- Max tool steps per event: 5 (`MAX_SKILL_STEPS = 5`)
- Error codes: `T03` (budget exhausted), `F99` (reasoned rejection — AI chose not to handle)
- On API error or timeout: falls back to `AgentEventHandler.handleEvent()`

### SkillRegistry

Manages skill registration and converts skills to AI SDK `tool()` definitions for `generateText()`. Supports dynamic registration for extensibility.

**Location:** `packages/connector/src/agent/ai/skill-registry.ts`

**Key interfaces:**

```typescript
interface AgentSkill<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string; // Unique skill name (e.g., "store_note")
  description: string; // AI-readable description
  parameters: T; // Zod schema for skill parameters
  execute: (params: z.infer<T>, context: SkillExecuteContext) => Promise<EventHandlerResult>;
  eventKinds?: number[]; // Associated Nostr event kind(s)
}

interface SkillExecuteContext extends EventHandlerContext {
  reasoning?: string; // AI agent's reasoning (from generateText)
}

interface SkillSummary {
  name: string;
  description: string;
  eventKinds?: number[];
}
```

**Methods:**

| Method             | Signature                                                    | Description                                             |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------- |
| `register`         | `<T>(skill: AgentSkill<T>) => void`                          | Register a skill (throws if name already registered)    |
| `unregister`       | `(name: string) => boolean`                                  | Remove a skill by name                                  |
| `get`              | `(name: string) => AgentSkill \| undefined`                  | Look up a skill by name                                 |
| `has`              | `(name: string) => boolean`                                  | Check if a skill is registered                          |
| `getSkillNames`    | `() => string[]`                                             | List all registered skill names                         |
| `size`             | `get size: number`                                           | Number of registered skills                             |
| `toTools`          | `(context: SkillExecuteContext) => Record<string, CoreTool>` | Convert all skills to AI SDK tools for `generateText()` |
| `getSkillsForKind` | `(kind: number) => AgentSkill[]`                             | Get skills matching a Nostr event kind                  |
| `getSkillSummary`  | `() => SkillSummary[]`                                       | Get summary of all skills (used by SystemPromptBuilder) |

### SystemPromptBuilder

Constructs the system prompt defining the agent's identity, available skills, protocol context, and decision framework. Appends dynamic event context per request.

**Location:** `packages/connector/src/agent/ai/system-prompt.ts`

**Constructor config:**

```typescript
constructor(config: {
  agentPubkey: string;
  ilpAddress?: string;
  personality?: AIAgentPersonality;
  skillRegistry: SkillRegistry;
})
```

**Methods:**

| Method        | Signature                            | Description                                                |
| ------------- | ------------------------------------ | ---------------------------------------------------------- |
| `build`       | `(context: PromptContext) => string` | Build complete system prompt with dynamic event context    |
| `buildStatic` | `() => string`                       | Build only the static portion (for token counting/caching) |

**PromptContext interface:**

```typescript
interface PromptContext {
  event: NostrEvent; // The incoming Nostr event
  source: string; // Source peer identifier
  amount: bigint; // Payment amount
  destination: string; // ILP destination address
}
```

**Prompt sections (in order):**

1. **Identity** — Agent name, role, pubkey, ILP address
2. **Protocol Context** — How events arrive via ILP packets
3. **Available Skills** — Generated from `SkillRegistry.getSkillSummary()`
4. **Decision Framework** — When to use which skill
5. **Instructions** — Custom personality instructions (if configured)
6. **Current Event** — Dynamic context (kind, author, content preview, tags, payment)

Content is truncated at 500 characters; tags are limited to the first 10. Default identity: "AI Agent", role: "ILP connector and Nostr event relay".

### TokenBudget

Rolling-window token budget tracker. Enforces hourly cost limits and emits telemetry at 80%/95% thresholds. Auto-falls back to direct dispatch when exhausted.

**Location:** `packages/connector/src/agent/ai/token-budget.ts`

**Constructor config:**

```typescript
constructor(config: {
  maxTokensPerWindow: number;
  windowMs?: number;                     // Default: 3600000 (1 hour)
  onTelemetry?: (event: TokenBudgetTelemetryEvent) => void;
})
```

**Methods and properties:**

| Member               | Signature                                              | Description                               |
| -------------------- | ------------------------------------------------------ | ----------------------------------------- |
| `canSpend`           | `(estimatedTokens?: number) => boolean`                | Check if budget is available              |
| `recordUsage`        | `(usage: Omit<TokenUsageRecord, 'timestamp'>) => void` | Record token usage and check thresholds   |
| `getStatus`          | `() => TokenBudgetStatus`                              | Get current budget status                 |
| `getRemainingBudget` | `() => number`                                         | Get remaining tokens in window            |
| `reset`              | `() => void`                                           | Clear all records and reset warning flags |
| `onTelemetry`        | `set onTelemetry: ((event) => void) \| undefined`      | Set telemetry callback                    |

**Key types:**

```typescript
interface TokenUsageRecord {
  timestamp: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface TokenBudgetStatus {
  tokensUsedInWindow: number;
  maxTokensPerWindow: number;
  remainingTokens: number;
  usagePercent: number; // 0-100
  isExhausted: boolean;
  requestCount: number;
  windowMs: number;
}

interface TokenBudgetTelemetryEvent {
  type: 'AI_TOKEN_USAGE' | 'AI_BUDGET_WARNING' | 'AI_BUDGET_EXHAUSTED';
  timestamp: string;
  tokensUsed: number;
  tokensRemaining: number;
  usagePercent: number;
  windowMs: number;
}
```

**Telemetry events:**

- `AI_TOKEN_USAGE` — Emitted on every `recordUsage()` call
- `AI_BUDGET_WARNING` — Emitted at 80% and 95% usage thresholds
- `AI_BUDGET_EXHAUSTED` — Emitted when remaining tokens reach 0

Warning flags reset when usage drops below threshold after window pruning.

### ProviderFactory

Creates AI SDK language model instances from the `provider:model` configuration string. Dynamically imports the appropriate provider package.

**Location:** `packages/connector/src/agent/ai/provider-factory.ts`

**Function:**

```typescript
async function createModelFromConfig(config: AIAgentConfig): Promise<LanguageModelV1>;
```

**Supported providers:**

| Provider    | Package             | Example Model String         |
| ----------- | ------------------- | ---------------------------- |
| `anthropic` | `@ai-sdk/anthropic` | `anthropic:claude-haiku-4-5` |
| `openai`    | `@ai-sdk/openai`    | `openai:gpt-4o-mini`         |

Throws an error if the provider is unsupported or the corresponding `@ai-sdk/*` package is not installed.

### AIAgentConfig

Configuration types and parsing for the AI agent module.

**Location:** `packages/connector/src/agent/ai/ai-agent-config.ts`

**Key types:**

```typescript
interface AIAgentConfig {
  enabled: boolean; // Whether AI dispatch is enabled
  model: string; // "provider:model" format
  apiKey?: string; // API key for the AI provider
  maxTokensPerRequest: number; // Max tokens per request (default: 1024)
  budget: AIBudgetConfig;
  personality?: AIAgentPersonality;
}

interface AIBudgetConfig {
  maxTokensPerHour: number; // Max tokens per rolling hour (default: 100000)
  fallbackOnExhaustion: boolean; // Fall back to direct dispatch (default: true)
}

interface AIAgentPersonality {
  name?: string; // Display name for the agent
  role?: string; // Role description
  instructions?: string; // Additional behavioral instructions
}

interface AIYamlConfig {
  // Raw YAML structure (optional fields)
  enabled?: boolean;
  model?: string;
  apiKey?: string;
  maxTokensPerRequest?: number;
  budget?: { maxTokensPerHour?: number; fallbackOnExhaustion?: boolean };
  personality?: AIAgentPersonality;
}
```

**Functions:**

| Function             | Signature                                    | Description                                                   |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `parseAIConfig`      | `(yaml?: AIYamlConfig) => AIAgentConfig`     | Parse and validate config with defaults and env var overrides |
| `isValidModelString` | `(model: string) => boolean`                 | Validate `provider:model` format                              |
| `parseModelString`   | `(model: string) => { provider, modelName }` | Split model string into provider and model name               |

**Defaults (`AI_AGENT_DEFAULTS`):**

```typescript
const AI_AGENT_DEFAULTS: AIAgentConfig = {
  enabled: true,
  model: 'anthropic:claude-haiku-4-5',
  maxTokensPerRequest: 1024,
  budget: {
    maxTokensPerHour: 100000,
    fallbackOnExhaustion: true,
  },
};
```

## How to Create a New Agent Skill

This guide walks through creating a new skill for a specific Nostr event kind (NIP).

### Step 1: Create the Skill File

Create a new file in `packages/connector/src/agent/ai/skills/`:

```typescript
// packages/connector/src/agent/ai/skills/my-new-skill.ts

import { z } from 'zod';
import type { AgentSkill, SkillExecuteContext } from '../skill-registry';
import type { EventHandlerResult } from '../../event-handler';

// Step 2: Define the Zod input schema
const MyNewSkillParams = z.object({
  reason: z.string().describe('Brief reason for invoking this skill'),
  // Add any additional parameters the AI should provide
});

// Step 3: Create and export the skill factory function
export function createMyNewSkill(): AgentSkill<typeof MyNewSkillParams> {
  return {
    name: 'my_new_skill',

    // Step 4: Write a clear tool description
    // This is what the AI reads to decide when to use the skill.
    // Be specific about WHEN to use it and what it does.
    description:
      'Process a Kind XXXX event that does Y. ' +
      'Use this when receiving a valid Kind XXXX Nostr event. ' +
      'The event content contains Z.',

    parameters: MyNewSkillParams,

    // Associate with event kind(s)
    eventKinds: [
      /* your kind number */
    ],

    // Step 5: Implement the execute function
    execute: async (
      params: z.infer<typeof MyNewSkillParams>,
      context: SkillExecuteContext
    ): Promise<EventHandlerResult> => {
      // Access the event, database, and other context
      const { event, database, agentPubkey } = context;

      // Implement your handler logic here
      // This should mirror what an existing handler does

      // Return success with optional response events
      return {
        success: true,
        // responseEvent: { ... },     // Single response
        // responseEvents: [ ... ],    // Multiple responses
      };

      // Or return failure
      // return {
      //   success: false,
      //   error: { code: 'F99', message: 'Reason' },
      // };
    },
  };
}
```

### Step 6: Register the Skill

Add your skill to `packages/connector/src/agent/ai/skills/index.ts`:

```typescript
import { createMyNewSkill } from './my-new-skill';

export function registerBuiltInSkills(registry: SkillRegistry, config: RegisterSkillsConfig): void {
  // ... existing skills ...
  registry.register(createMyNewSkill());
}

export { createMyNewSkill } from './my-new-skill';
```

The `RegisterSkillsConfig` interface provides dependencies for skills that need external services:

```typescript
interface RegisterSkillsConfig {
  followGraphRouter: FollowGraphRouter; // For routing and follow graph access
  registeredKinds: () => number[]; // Returns supported event kinds
  queryMaxResults?: number; // Max query results (default: 100)
}
```

### Step 7: Write Tests

Create a test file verifying your skill's execute function:

```typescript
// packages/connector/src/agent/ai/__tests__/my-new-skill.test.ts

it('should handle Kind XXXX events correctly', async () => {
  const registry = new SkillRegistry();
  registerBuiltInSkills(registry, {
    /* config */
  });

  const skill = registry.get('my_new_skill')!;
  const context = createSkillContext({ kind: XXXX, content: '...' });

  const result = await skill.execute({ reason: 'test' }, context);
  expect(result.success).toBe(true);
});
```

See the [Testing Skills](#testing-skills) section for detailed testing guidance.

## Skill Anatomy (Annotated Example)

Here's the `store_note` skill annotated:

```typescript
import { z } from 'zod';
import type { AgentSkill, SkillExecuteContext } from '../skill-registry';
import type { EventHandlerResult } from '../../event-handler';
import { DatabaseSizeExceededError } from '../../event-database';

// Zod schema — defines what the AI passes to this skill.
// Keep it minimal. The AI doesn't need to pass event data
// (that's already in the context).
const StoreNoteParams = z.object({
  reason: z
    .string()
    .describe('Brief reason for storing this note (e.g., "valid text note from known peer")'),
});

export function createStoreNoteSkill(): AgentSkill<typeof StoreNoteParams> {
  return {
    name: 'store_note', // Unique name — used as tool name

    // Description is critical — it's what the AI reads to decide
    // whether to invoke this skill. Be clear about:
    // 1. WHAT it does
    // 2. WHEN to use it (which event kind)
    // 3. WHERE the data comes from
    description:
      'Store a Kind 1 text note event in the local event database. ' +
      'Use this skill when receiving a valid Kind 1 Nostr event that ' +
      'should be persisted. The note content and metadata are taken ' +
      'from the incoming event context.',

    parameters: StoreNoteParams,

    eventKinds: [1], // Maps to Nostr Kind 1

    // Execute receives the AI's params + full handler context
    execute: async (_params, context): Promise<EventHandlerResult> => {
      try {
        // Reuses existing handler logic — just call the database
        await context.database.storeEvent(context.event);
        return { success: true };
      } catch (error) {
        // Handle known errors gracefully
        if (error instanceof DatabaseSizeExceededError) {
          return {
            success: false,
            error: { code: 'T00', message: 'Storage limit exceeded' },
          };
        }
        throw error; // Unknown errors propagate to dispatcher
      }
    },
  };
}
```

## Configuration Reference

The `ai` section in agent YAML configuration:

```yaml
ai:
  # Whether AI dispatch is enabled (default: true)
  enabled: true

  # Model in provider:model format
  # Supported providers: anthropic, openai
  model: 'anthropic:claude-haiku-4-5'

  # API key (or use AI_API_KEY environment variable)
  apiKey: '${AI_API_KEY}'

  # Max tokens per AI request (default: 1024)
  maxTokensPerRequest: 1024

  # Token budget for cost management
  budget:
    # Max tokens in a rolling 1-hour window (default: 100000)
    maxTokensPerHour: 100000
    # Fall back to direct dispatch when exhausted (default: true)
    fallbackOnExhaustion: true

  # Optional agent personality
  personality:
    name: 'Agent Alice'
    role: 'Network relay and storage service'
    instructions: 'Be concise. Prefer local handling over forwarding.'
```

### Environment Variable Overrides

| Variable                    | Description                 | Default                      |
| --------------------------- | --------------------------- | ---------------------------- |
| `AI_API_KEY`                | API key for the AI provider | —                            |
| `AI_AGENT_ENABLED`          | Override `ai.enabled`       | `true`                       |
| `AI_AGENT_MODEL`            | Override `ai.model`         | `anthropic:claude-haiku-4-5` |
| `AI_MAX_TOKENS_PER_REQUEST` | Override per-request limit  | `1024`                       |
| `AI_MAX_TOKENS_PER_HOUR`    | Override hourly budget      | `100000`                     |

Parsing priority: YAML config > environment variable > default. See `parseAIConfig()` in `ai-agent-config.ts`.

## Decision Framework: New Skill vs. Extend Existing

| Create a new skill when...             | Extend an existing skill when...            |
| -------------------------------------- | ------------------------------------------- |
| Handling a new Nostr event kind        | Adding a variant to an existing kind        |
| The logic is fundamentally different   | The logic is similar with minor differences |
| A separate AI decision point is needed | The same decision applies                   |
| Different parameters are required      | Parameters are compatible                   |

**Guidance:**

- Each Nostr event kind should typically map to one skill (1:1 mapping).
- Skills without `eventKinds` (like `forward_packet`, `get_agent_info`) serve cross-cutting concerns and can be invoked for any event kind.
- If a new NIP requires fundamentally different handling, create a new skill. If it's a minor variation of an existing kind handler, extend the existing skill's execute function.

## Built-in Skills Reference

| Skill            | Event Kind(s) | Description                                                     |
| ---------------- | ------------- | --------------------------------------------------------------- |
| `store_note`     | Kind 1        | Store text notes in the event database                          |
| `update_follow`  | Kind 3        | Update follow graph and routing table from follow list event    |
| `delete_events`  | Kind 5        | Delete events by ID with authorship verification (NIP-09)       |
| `query_events`   | Kind 10000    | Query the event database with NIP-01 filters (max results: 100) |
| `forward_packet` | —             | Forward an event to a peer via follow graph routing table       |
| `get_agent_info` | —             | Return agent identity, supported kinds, and connected peer info |

**Skill dependency injection:**

| Skill            | Factory Function               | Dependencies                                           |
| ---------------- | ------------------------------ | ------------------------------------------------------ |
| `store_note`     | `createStoreNoteSkill()`       | None                                                   |
| `update_follow`  | `createUpdateFollowSkill(r)`   | `followGraphRouter: FollowGraphRouter`                 |
| `delete_events`  | `createDeleteEventsSkill()`    | None                                                   |
| `query_events`   | `createQueryEventsSkill(n?)`   | `maxResults?: number` (default: 100)                   |
| `forward_packet` | `createForwardPacketSkill(r)`  | `followGraphRouter: FollowGraphRouter`                 |
| `get_agent_info` | `createGetAgentInfoSkill(r,k)` | `followGraphRouter`, `registeredKinds: () => number[]` |

All skill factory functions are re-exported from `packages/connector/src/agent/ai/skills/index.ts`.

## Testing Skills

This section explains how to test custom agent skills. See also [test-strategy-and-standards.md](test-strategy-and-standards.md) for project-wide testing conventions.

### Test File Location

Skill tests live in the `__tests__/` directory alongside the AI module source:

```
packages/connector/src/agent/ai/
  __tests__/
    ai-agent-config.test.ts
    ai-agent-dispatcher.test.ts
    integration.test.ts
    provider-factory.test.ts
    skill-registry.test.ts
    system-prompt.test.ts
    token-budget.test.ts
  skills/
    store-note-skill.ts
    ...
```

Convention: `packages/connector/src/agent/ai/__tests__/<component>.test.ts`

### Mocking SkillExecuteContext

`SkillExecuteContext` extends `EventHandlerContext` with an optional `reasoning` field. Create a mock context using a factory function:

```typescript
import type { SkillExecuteContext } from '../skill-registry';
import type { NostrEvent } from '../../toon-codec';

function createTestContext(overrides?: Partial<SkillExecuteContext>): SkillExecuteContext {
  return {
    event: {
      id: 'a'.repeat(64),
      pubkey: 'b'.repeat(64),
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: 'Test',
      sig: 'c'.repeat(128),
    } as NostrEvent,
    packet: {
      type: 12,
      amount: 1000n,
      destination: 'g.agent.test',
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date(),
      data: Buffer.alloc(0),
    },
    amount: 1000n,
    source: 'peer-1',
    agentPubkey: 'd'.repeat(64),
    database: {} as any,
    ...overrides,
  };
}
```

### AAA Test Pattern

Follow the **Arrange, Act, Assert** pattern with clear test descriptions:

```typescript
import { z } from 'zod';
import { SkillRegistry, type AgentSkill } from '../skill-registry';

function createTestSkill(overrides?: Partial<AgentSkill>): AgentSkill {
  return {
    name: 'test_skill',
    description: 'A test skill',
    parameters: z.object({ reason: z.string() }),
    execute: async () => ({ success: true }),
    eventKinds: [1],
    ...overrides,
  };
}

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    // Arrange: fresh instance for each test
    registry = new SkillRegistry();
  });

  it('should register a skill', () => {
    // Arrange
    const skill = createTestSkill();

    // Act
    registry.register(skill);

    // Assert
    expect(registry.has('test_skill')).toBe(true);
    expect(registry.size).toBe(1);
  });

  it('should throw if skill name is already registered', () => {
    // Arrange
    registry.register(createTestSkill());

    // Act & Assert
    expect(() => registry.register(createTestSkill())).toThrow('Skill already registered');
  });

  it('should convert skills to AI SDK tools', () => {
    // Arrange
    const executeFn = jest.fn().mockResolvedValue({ success: true });
    registry.register(createTestSkill({ execute: executeFn }));
    const context = createTestContext();

    // Act
    const tools = registry.toTools(context);

    // Assert
    expect(tools).toHaveProperty('test_skill');
    const tool = tools['test_skill'] as any;
    expect(tool.description).toBe('A test skill');
    expect(typeof tool.execute).toBe('function');
  });
});
```

### Testing Skill Registration via SkillRegistry

Test that skills register correctly and are retrievable:

```typescript
it('should return skills for a specific event kind', () => {
  registry.register(createTestSkill({ name: 'note', eventKinds: [1] }));
  registry.register(createTestSkill({ name: 'follow', eventKinds: [3] }));

  const kind1Skills = registry.getSkillsForKind(1);
  expect(kind1Skills).toHaveLength(1);
  expect(kind1Skills[0]!.name).toBe('note');
});

it('should return skill summary for prompt generation', () => {
  registry.register(createTestSkill({ name: 'note', description: 'Store notes', eventKinds: [1] }));
  const summary = registry.getSkillSummary();
  expect(summary).toEqual([{ name: 'note', description: 'Store notes', eventKinds: [1] }]);
});
```

### Coverage Requirements

Per [test-strategy-and-standards.md](test-strategy-and-standards.md), the connector package requires >80% line coverage. All AI module components currently achieve 98-100% test coverage. When adding new skills, ensure your tests cover:

- Successful execution (happy path)
- Error handling (known error types)
- Event kind validation (if the skill checks `context.event.kind`)
- Edge cases (empty content, missing tags, etc.)
