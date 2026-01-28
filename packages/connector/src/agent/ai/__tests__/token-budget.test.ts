import { TokenBudget, type TokenBudgetTelemetryEvent } from '../token-budget';

describe('TokenBudget', () => {
  let budget: TokenBudget;

  beforeEach(() => {
    budget = new TokenBudget({
      maxTokensPerWindow: 1000,
      windowMs: 60000, // 1 minute for tests
    });
  });

  describe('canSpend', () => {
    it('should allow spending when budget is available', () => {
      expect(budget.canSpend()).toBe(true);
    });

    it('should allow spending with estimated tokens within budget', () => {
      expect(budget.canSpend(500)).toBe(true);
    });

    it('should deny spending when estimated tokens exceed budget', () => {
      expect(budget.canSpend(1001)).toBe(false);
    });

    it('should deny spending when budget is exhausted', () => {
      budget.recordUsage({ promptTokens: 500, completionTokens: 500, totalTokens: 1000 });
      expect(budget.canSpend()).toBe(false);
    });

    it('should account for previous usage', () => {
      budget.recordUsage({ promptTokens: 400, completionTokens: 400, totalTokens: 800 });
      expect(budget.canSpend(100)).toBe(true);
      expect(budget.canSpend(201)).toBe(false);
    });
  });

  describe('recordUsage', () => {
    it('should record token usage', () => {
      budget.recordUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
      const status = budget.getStatus();
      expect(status.tokensUsedInWindow).toBe(150);
    });

    it('should accumulate multiple usage records', () => {
      budget.recordUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
      budget.recordUsage({ promptTokens: 200, completionTokens: 100, totalTokens: 300 });
      expect(budget.getStatus().tokensUsedInWindow).toBe(450);
    });
  });

  describe('getStatus', () => {
    it('should return correct initial status', () => {
      const status = budget.getStatus();
      expect(status.tokensUsedInWindow).toBe(0);
      expect(status.maxTokensPerWindow).toBe(1000);
      expect(status.remainingTokens).toBe(1000);
      expect(status.usagePercent).toBe(0);
      expect(status.isExhausted).toBe(false);
      expect(status.requestCount).toBe(0);
    });

    it('should show exhausted when budget fully used', () => {
      budget.recordUsage({ promptTokens: 500, completionTokens: 500, totalTokens: 1000 });
      const status = budget.getStatus();
      expect(status.isExhausted).toBe(true);
      expect(status.remainingTokens).toBe(0);
      expect(status.usagePercent).toBe(100);
    });

    it('should calculate usage percentage', () => {
      budget.recordUsage({ promptTokens: 250, completionTokens: 250, totalTokens: 500 });
      expect(budget.getStatus().usagePercent).toBe(50);
    });
  });

  describe('getRemainingBudget', () => {
    it('should return full budget initially', () => {
      expect(budget.getRemainingBudget()).toBe(1000);
    });

    it('should decrease after usage', () => {
      budget.recordUsage({ promptTokens: 100, completionTokens: 100, totalTokens: 200 });
      expect(budget.getRemainingBudget()).toBe(800);
    });

    it('should not go below zero', () => {
      budget.recordUsage({ promptTokens: 600, completionTokens: 600, totalTokens: 1200 });
      expect(budget.getRemainingBudget()).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear all records', () => {
      budget.recordUsage({ promptTokens: 100, completionTokens: 100, totalTokens: 200 });
      budget.reset();
      expect(budget.getStatus().tokensUsedInWindow).toBe(0);
      expect(budget.getStatus().requestCount).toBe(0);
    });

    it('should reset warning flags', () => {
      const events: TokenBudgetTelemetryEvent[] = [];
      budget.onTelemetry = (event) => events.push(event);

      // Trigger 80% warning
      budget.recordUsage({ promptTokens: 400, completionTokens: 400, totalTokens: 800 });
      const warningsBefore = events.filter((e) => e.type === 'AI_BUDGET_WARNING').length;
      expect(warningsBefore).toBe(1);

      // Reset and record same usage - should trigger warning again
      budget.reset();
      events.length = 0;
      budget.recordUsage({ promptTokens: 400, completionTokens: 400, totalTokens: 800 });
      const warningsAfter = events.filter((e) => e.type === 'AI_BUDGET_WARNING').length;
      expect(warningsAfter).toBe(1);
    });
  });

  describe('default configuration', () => {
    it('should use default windowMs of 1 hour (3600000ms)', () => {
      const defaultBudget = new TokenBudget({
        maxTokensPerWindow: 1000,
      });
      const status = defaultBudget.getStatus();
      expect(status.windowMs).toBe(3600000);
    });
  });

  describe('status windowMs field', () => {
    it('should include windowMs in status', () => {
      const status = budget.getStatus();
      expect(status.windowMs).toBe(60000);
    });
  });

  describe('rolling window', () => {
    it('should expire old records', () => {
      // Create budget with very short window
      const shortBudget = new TokenBudget({
        maxTokensPerWindow: 1000,
        windowMs: 50, // 50ms window
      });

      shortBudget.recordUsage({ promptTokens: 500, completionTokens: 500, totalTokens: 1000 });
      expect(shortBudget.canSpend()).toBe(false);

      // Wait for window to expire
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(shortBudget.canSpend()).toBe(true);
          expect(shortBudget.getStatus().tokensUsedInWindow).toBe(0);
          resolve();
        }, 100);
      });
    });

    it('should reset warning flags when usage drops below threshold after pruning', () => {
      const events: TokenBudgetTelemetryEvent[] = [];
      const shortBudget = new TokenBudget({
        maxTokensPerWindow: 1000,
        windowMs: 50, // 50ms window
        onTelemetry: (event) => events.push(event),
      });

      // Record 80% usage to trigger warning
      shortBudget.recordUsage({ promptTokens: 400, completionTokens: 400, totalTokens: 800 });
      const firstWarnings = events.filter((e) => e.type === 'AI_BUDGET_WARNING').length;
      expect(firstWarnings).toBe(1);

      // Wait for window to expire (usage drops to 0%)
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Trigger a prune by checking status - this resets flags since usage is now 0%
          const status = shortBudget.getStatus();
          expect(status.tokensUsedInWindow).toBe(0);

          events.length = 0;
          // Record 80% again - should trigger warning again since flags were reset
          shortBudget.recordUsage({ promptTokens: 400, completionTokens: 400, totalTokens: 800 });
          const secondWarnings = events.filter((e) => e.type === 'AI_BUDGET_WARNING').length;
          expect(secondWarnings).toBe(1);
          resolve();
        }, 100);
      });
    });
  });

  describe('telemetry', () => {
    it('should emit AI_TOKEN_USAGE on each recordUsage', () => {
      const events: TokenBudgetTelemetryEvent[] = [];
      budget.onTelemetry = (event) => events.push(event);

      budget.recordUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('AI_TOKEN_USAGE');
      expect(events[0]!.tokensUsed).toBe(150);
    });

    it('should emit AI_BUDGET_WARNING at 80% usage', () => {
      const events: TokenBudgetTelemetryEvent[] = [];
      budget.onTelemetry = (event) => events.push(event);

      budget.recordUsage({ promptTokens: 400, completionTokens: 400, totalTokens: 800 });

      const warningEvents = events.filter((e) => e.type === 'AI_BUDGET_WARNING');
      expect(warningEvents.length).toBe(1);
      expect(warningEvents[0]!.usagePercent).toBe(80);
    });

    it('should emit AI_BUDGET_WARNING at 95% usage', () => {
      const events: TokenBudgetTelemetryEvent[] = [];
      budget.onTelemetry = (event) => events.push(event);

      budget.recordUsage({ promptTokens: 475, completionTokens: 475, totalTokens: 950 });

      const warningEvents = events.filter((e) => e.type === 'AI_BUDGET_WARNING');
      expect(warningEvents.length).toBe(1);
      expect(warningEvents[0]!.usagePercent).toBe(95);
    });

    it('should emit AI_BUDGET_EXHAUSTED when fully used', () => {
      const events: TokenBudgetTelemetryEvent[] = [];
      budget.onTelemetry = (event) => events.push(event);

      budget.recordUsage({ promptTokens: 500, completionTokens: 500, totalTokens: 1000 });

      const exhaustedEvents = events.filter((e) => e.type === 'AI_BUDGET_EXHAUSTED');
      expect(exhaustedEvents.length).toBe(1);
    });

    it('should not throw if telemetry callback throws', () => {
      budget.onTelemetry = () => {
        throw new Error('telemetry error');
      };

      // Should not throw
      expect(() => {
        budget.recordUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
      }).not.toThrow();
    });

    it('should allow setting onTelemetry callback via setter', () => {
      const events: TokenBudgetTelemetryEvent[] = [];

      // Set callback via setter (not constructor)
      budget.onTelemetry = (event) => events.push(event);

      budget.recordUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]!.type).toBe('AI_TOKEN_USAGE');
    });

    it('should include all required fields in TokenBudgetTelemetryEvent', () => {
      const events: TokenBudgetTelemetryEvent[] = [];
      budget.onTelemetry = (event) => events.push(event);

      budget.recordUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });

      const event = events[0]!;
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('tokensUsed');
      expect(event).toHaveProperty('tokensRemaining');
      expect(event).toHaveProperty('usagePercent');
      expect(event).toHaveProperty('windowMs');

      // Verify types
      expect(typeof event.type).toBe('string');
      expect(typeof event.timestamp).toBe('string');
      expect(typeof event.tokensUsed).toBe('number');
      expect(typeof event.tokensRemaining).toBe('number');
      expect(typeof event.usagePercent).toBe('number');
      expect(typeof event.windowMs).toBe('number');

      // Verify timestamp is ISO format
      expect(() => new Date(event.timestamp)).not.toThrow();
      expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    });

    it('should emit warning only once per threshold crossing', () => {
      const events: TokenBudgetTelemetryEvent[] = [];
      budget.onTelemetry = (event) => events.push(event);

      // First record at 40% - no warning
      budget.recordUsage({ promptTokens: 200, completionTokens: 200, totalTokens: 400 });
      expect(events.filter((e) => e.type === 'AI_BUDGET_WARNING').length).toBe(0);

      // Second record pushes to 80% - warning emitted
      budget.recordUsage({ promptTokens: 200, completionTokens: 200, totalTokens: 400 });
      expect(events.filter((e) => e.type === 'AI_BUDGET_WARNING').length).toBe(1);

      // Third record at 85% - no additional warning (already at 80%+ and flag set)
      budget.recordUsage({ promptTokens: 25, completionTokens: 25, totalTokens: 50 });
      expect(events.filter((e) => e.type === 'AI_BUDGET_WARNING').length).toBe(1);
    });

    it('should emit 95% warning only once even with multiple records above 95%', () => {
      const events: TokenBudgetTelemetryEvent[] = [];
      budget.onTelemetry = (event) => events.push(event);

      // Jump straight to 95%
      budget.recordUsage({ promptTokens: 475, completionTokens: 475, totalTokens: 950 });
      const warningsAt95 = events.filter(
        (e) => e.type === 'AI_BUDGET_WARNING' && e.usagePercent >= 95
      ).length;
      expect(warningsAt95).toBe(1);

      // Add more usage above 95% - no additional warning
      budget.recordUsage({ promptTokens: 10, completionTokens: 10, totalTokens: 20 });
      const warningsAfter = events.filter(
        (e) => e.type === 'AI_BUDGET_WARNING' && e.usagePercent >= 95
      ).length;
      expect(warningsAfter).toBe(1);
    });
  });
});
