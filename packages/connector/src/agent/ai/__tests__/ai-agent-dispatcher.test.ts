/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { AIAgentDispatcher, type AIAgentDispatcherConfig } from '../ai-agent-dispatcher';
import { SkillRegistry } from '../skill-registry';
import { SystemPromptBuilder } from '../system-prompt';
import { TokenBudget } from '../token-budget';
import type { AIAgentConfig } from '../ai-agent-config';
import type { EventHandlerContext } from '../../event-handler';
import { AgentEventHandler } from '../../event-handler';
import type { NostrEvent } from '../../toon-codec';
import type { Logger } from 'pino';

// ============================================
// Mock AI model
// ============================================

// Mock the 'ai' module
jest.mock('ai', () => ({
  generateText: jest.fn(),
  tool: jest.fn((config: any) => ({
    ...config,
    type: 'function',
  })),
}));

import { generateText } from 'ai';
const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;

// ============================================
// Test Utilities
// ============================================

function createMockLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Logger>;
}

function createTestAIConfig(overrides?: Partial<AIAgentConfig>): AIAgentConfig {
  return {
    enabled: true,
    model: 'anthropic:claude-haiku-4-5',
    maxTokensPerRequest: 1024,
    budget: {
      maxTokensPerHour: 100000,
      fallbackOnExhaustion: true,
    },
    ...overrides,
  };
}

function createTestContext(overrides?: Partial<EventHandlerContext>): EventHandlerContext {
  return {
    event: {
      id: 'a'.repeat(64),
      pubkey: 'b'.repeat(64),
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: 'Test note',
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
    database: {
      storeEvent: jest.fn().mockResolvedValue(undefined),
      queryEvents: jest.fn().mockResolvedValue([]),
      deleteEvents: jest.fn().mockResolvedValue(0),
    } as any,
    ...overrides,
  };
}

function createTestDispatcher(overrides?: Partial<AIAgentDispatcherConfig>): AIAgentDispatcher {
  const skillRegistry = new SkillRegistry();
  skillRegistry.register({
    name: 'store_note',
    description: 'Store a text note',
    parameters: z.object({ reason: z.string() }),
    execute: async (_params, context) => {
      await context.database.storeEvent(context.event);
      return { success: true };
    },
    eventKinds: [1],
  });

  const systemPromptBuilder = new SystemPromptBuilder({
    agentPubkey: 'd'.repeat(64),
    skillRegistry,
  });

  const tokenBudget = new TokenBudget({
    maxTokensPerWindow: 100000,
  });

  const fallbackHandler = new AgentEventHandler({
    agentPubkey: 'd'.repeat(64),
    database: {} as any,
  });

  return new AIAgentDispatcher({
    aiConfig: createTestAIConfig(),
    model: {} as any,
    skillRegistry,
    systemPromptBuilder,
    tokenBudget,
    fallbackHandler,
    logger: createMockLogger(),
    ...overrides,
  });
}

// ============================================
// Tests
// ============================================

describe('AIAgentDispatcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleEvent', () => {
    it('should use direct handler when AI is disabled', async () => {
      const fallbackHandler = new AgentEventHandler({
        agentPubkey: 'd'.repeat(64),
        database: {} as any,
      });

      const handleEventSpy = jest
        .spyOn(fallbackHandler, 'handleEvent')
        .mockResolvedValue({ success: true });

      const dispatcher = createTestDispatcher({
        aiConfig: createTestAIConfig({ enabled: false }),
        fallbackHandler,
      });

      const context = createTestContext();
      const result = await dispatcher.handleEvent(context);

      expect(handleEventSpy).toHaveBeenCalledWith(context);
      expect(result.success).toBe(true);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('should fall back when budget is exhausted with fallbackOnExhaustion', async () => {
      const tokenBudget = new TokenBudget({
        maxTokensPerWindow: 100,
      });
      // Exhaust budget
      tokenBudget.recordUsage({ promptTokens: 50, completionTokens: 50, totalTokens: 100 });

      const fallbackHandler = new AgentEventHandler({
        agentPubkey: 'd'.repeat(64),
        database: {} as any,
      });
      const handleEventSpy = jest
        .spyOn(fallbackHandler, 'handleEvent')
        .mockResolvedValue({ success: true });

      const dispatcher = createTestDispatcher({
        tokenBudget,
        fallbackHandler,
      });

      const result = await dispatcher.handleEvent(createTestContext());
      expect(handleEventSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should return error when budget exhausted without fallback', async () => {
      const tokenBudget = new TokenBudget({
        maxTokensPerWindow: 100,
      });
      tokenBudget.recordUsage({ promptTokens: 50, completionTokens: 50, totalTokens: 100 });

      const dispatcher = createTestDispatcher({
        aiConfig: createTestAIConfig({
          budget: { maxTokensPerHour: 100, fallbackOnExhaustion: false },
        }),
        tokenBudget,
      });

      const result = await dispatcher.handleEvent(createTestContext());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('T03');
      expect(result.error?.message).toContain('budget exhausted');
    });

    it('should call generateText with AI model and tools', async () => {
      mockGenerateText.mockResolvedValue({
        text: '',
        toolResults: [{ success: true }],
        toolCalls: [{ toolName: 'store_note', args: { reason: 'valid note' } }],
        steps: [],
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'tool-calls',
        response: {} as any,
        request: {} as any,
        warnings: [],
        experimental_providerMetadata: {},
        providerMetadata: {},
        reasoning: undefined,
        reasoningDetails: [],
        sources: [],
        files: [],
        responseMessages: [],
        toJsonResponse: jest.fn(),
      } as any);

      const dispatcher = createTestDispatcher();
      const result = await dispatcher.handleEvent(createTestContext());

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('Identity'),
          maxSteps: 5,
          maxTokens: 1024,
        })
      );
      expect(result.success).toBe(true);
    });

    it('should record token usage after AI call', async () => {
      mockGenerateText.mockResolvedValue({
        text: '',
        toolResults: [{ success: true }],
        toolCalls: [],
        steps: [],
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        finishReason: 'tool-calls',
        response: {} as any,
        request: {} as any,
        warnings: [],
        experimental_providerMetadata: {},
        providerMetadata: {},
        reasoning: undefined,
        reasoningDetails: [],
        sources: [],
        files: [],
        responseMessages: [],
        toJsonResponse: jest.fn(),
      } as any);

      const tokenBudget = new TokenBudget({ maxTokensPerWindow: 100000 });
      const dispatcher = createTestDispatcher({ tokenBudget });

      await dispatcher.handleEvent(createTestContext());

      const status = tokenBudget.getStatus();
      expect(status.tokensUsedInWindow).toBe(300);
    });

    it('should fall back to direct handler on AI error', async () => {
      mockGenerateText.mockRejectedValue(new Error('API error'));

      const fallbackHandler = new AgentEventHandler({
        agentPubkey: 'd'.repeat(64),
        database: {} as any,
      });
      const handleEventSpy = jest
        .spyOn(fallbackHandler, 'handleEvent')
        .mockResolvedValue({ success: true });

      const dispatcher = createTestDispatcher({ fallbackHandler });

      const result = await dispatcher.handleEvent(createTestContext());
      expect(handleEventSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should return reasoned rejection when AI calls no tools', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'I cannot handle this event kind.',
        toolResults: [],
        toolCalls: [],
        steps: [],
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        finishReason: 'stop',
        response: {} as any,
        request: {} as any,
        warnings: [],
        experimental_providerMetadata: {},
        providerMetadata: {},
        reasoning: undefined,
        reasoningDetails: [],
        sources: [],
        files: [],
        responseMessages: [],
        toJsonResponse: jest.fn(),
      } as any);

      const dispatcher = createTestDispatcher();
      const result = await dispatcher.handleEvent(createTestContext());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('F99');
      expect(result.error?.message).toContain('cannot handle');
    });
  });

  describe('isEnabled', () => {
    it('should reflect AI config enabled state', () => {
      const enabledDispatcher = createTestDispatcher({
        aiConfig: createTestAIConfig({ enabled: true }),
      });
      expect(enabledDispatcher.isEnabled).toBe(true);

      const disabledDispatcher = createTestDispatcher({
        aiConfig: createTestAIConfig({ enabled: false }),
      });
      expect(disabledDispatcher.isEnabled).toBe(false);
    });
  });

  describe('getBudgetStatus', () => {
    it('should return current budget status', () => {
      const dispatcher = createTestDispatcher();
      const status = dispatcher.getBudgetStatus();
      expect(status.maxTokensPerWindow).toBe(100000);
      expect(status.tokensUsedInWindow).toBe(0);
    });
  });

  describe('skillRegistry', () => {
    it('should expose the skill registry for external inspection', () => {
      const skillRegistry = new SkillRegistry();
      skillRegistry.register({
        name: 'test_skill',
        description: 'Test skill',
        parameters: z.object({ value: z.string() }),
        execute: async () => ({ success: true }),
        eventKinds: [1],
      });

      const dispatcher = createTestDispatcher({ skillRegistry });
      expect(dispatcher.skillRegistry).toBe(skillRegistry);
      expect(dispatcher.skillRegistry.getSkillNames()).toHaveLength(1);
    });
  });

  describe('timeout handling', () => {
    it('should fall back to direct handler when AI times out', async () => {
      // Mock generateText to take longer than timeout
      mockGenerateText.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                text: '',
                toolResults: [{ success: true }],
                toolCalls: [],
                steps: [],
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                finishReason: 'tool-calls',
              } as any),
            500 // Longer than timeout
          );
        });
      });

      const fallbackHandler = new AgentEventHandler({
        agentPubkey: 'd'.repeat(64),
        database: {} as any,
      });
      const handleEventSpy = jest
        .spyOn(fallbackHandler, 'handleEvent')
        .mockResolvedValue({ success: true, responseEvent: { id: 'fallback' } as any });

      const dispatcher = createTestDispatcher({
        fallbackHandler,
        timeoutMs: 50, // Very short timeout
      });

      const result = await dispatcher.handleEvent(createTestContext());
      expect(handleEventSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should use custom timeout configuration', async () => {
      mockGenerateText.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                text: '',
                toolResults: [{ success: true }],
                toolCalls: [],
                steps: [],
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                finishReason: 'tool-calls',
              } as any),
            200 // Takes 200ms
          );
        });
      });

      const fallbackHandler = new AgentEventHandler({
        agentPubkey: 'd'.repeat(64),
        database: {} as any,
      });
      const handleEventSpy = jest.spyOn(fallbackHandler, 'handleEvent');

      // With 500ms timeout, should NOT timeout
      const dispatcher = createTestDispatcher({
        fallbackHandler,
        timeoutMs: 500,
      });

      await dispatcher.handleEvent(createTestContext());
      // Should complete normally without fallback
      expect(handleEventSpy).not.toHaveBeenCalled();
    });
  });

  describe('prompt context', () => {
    it('should build prompt with destination from packet', async () => {
      let capturedPrompt = '';
      mockGenerateText.mockImplementation(async ({ system }: any) => {
        capturedPrompt = system;
        return {
          text: '',
          toolResults: [{ success: true }],
          toolCalls: [],
          steps: [],
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          finishReason: 'tool-calls',
        } as any;
      });

      const dispatcher = createTestDispatcher();
      const context = createTestContext({
        packet: {
          type: 12,
          amount: 5000n,
          destination: 'g.agent.custom-destination',
          executionCondition: Buffer.alloc(32),
          expiresAt: new Date(),
          data: Buffer.alloc(0),
        },
      });

      await dispatcher.handleEvent(context);
      expect(capturedPrompt).toContain('g.agent.custom-destination');
    });
  });

  describe('logger configuration', () => {
    it('should create child logger with component name when logger provided', () => {
      const mockLogger = createMockLogger();
      createTestDispatcher({ logger: mockLogger });
      expect(mockLogger.child).toHaveBeenCalledWith({ component: 'AIAgentDispatcher' });
    });

    it('should work without logger (no-op logger)', async () => {
      mockGenerateText.mockResolvedValue({
        text: '',
        toolResults: [{ success: true }],
        toolCalls: [],
        steps: [],
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'tool-calls',
        response: {} as any,
        request: {} as any,
        warnings: [],
        experimental_providerMetadata: {},
        providerMetadata: {},
        reasoning: undefined,
        reasoningDetails: [],
        sources: [],
        files: [],
        responseMessages: [],
        toJsonResponse: jest.fn(),
      } as any);

      const skillRegistry = new SkillRegistry();
      skillRegistry.register({
        name: 'store_note',
        description: 'Store a text note',
        parameters: z.object({ reason: z.string() }),
        execute: async () => ({ success: true }),
        eventKinds: [1],
      });

      const systemPromptBuilder = new SystemPromptBuilder({
        agentPubkey: 'd'.repeat(64),
        skillRegistry,
      });

      const tokenBudget = new TokenBudget({ maxTokensPerWindow: 100000 });

      const fallbackHandler = new AgentEventHandler({
        agentPubkey: 'd'.repeat(64),
        database: {} as any,
      });

      // Create without logger - should not throw
      const dispatcher = new AIAgentDispatcher({
        aiConfig: createTestAIConfig(),
        model: {} as any,
        skillRegistry,
        systemPromptBuilder,
        tokenBudget,
        fallbackHandler,
        // No logger provided
      });

      // Should work normally
      const result = await dispatcher.handleEvent(createTestContext());
      expect(result.success).toBe(true);
    });
  });

  describe('result extraction from steps', () => {
    it('should extract result from nested step.toolResults array', async () => {
      mockGenerateText.mockResolvedValue({
        text: '',
        toolResults: [], // Empty top-level
        toolCalls: [],
        steps: [
          {
            toolResults: [
              {
                result: {
                  success: true,
                  responseEvent: { id: 'from-step' },
                },
              },
            ],
          },
        ],
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'tool-calls',
        response: {} as any,
        request: {} as any,
        warnings: [],
        experimental_providerMetadata: {},
        providerMetadata: {},
        reasoning: undefined,
        reasoningDetails: [],
        sources: [],
        files: [],
        responseMessages: [],
        toJsonResponse: jest.fn(),
      } as any);

      const dispatcher = createTestDispatcher();
      const result = await dispatcher.handleEvent(createTestContext());

      expect(result.success).toBe(true);
      expect(result.responseEvent).toEqual({ id: 'from-step' });
    });
  });
});
