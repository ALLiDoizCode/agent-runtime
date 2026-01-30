/**
 * Delegate Task Skill
 *
 * Delegates a task to another capable agent via the social graph.
 * Discovers agents with the required capability, sends a Kind 5900 task request,
 * and returns the Kind 6900 result.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import type { AgentSkill, SkillExecuteContext } from '../skill-registry';
import type { EventHandlerResult } from '../../event-handler';
import type { NostrEvent } from '../../toon-codec';
import { ToonCodec } from '../../toon-codec';
import {
  PacketType,
  type ILPPreparePacket,
  type ILPFulfillPacket,
  type ILPRejectPacket,
} from '@m2m/shared';
import * as crypto from 'crypto';
import type { Logger } from 'pino';

// ============================================
// Constants
// ============================================

/** Default maximum number of retry attempts */
const DEFAULT_MAX_RETRIES = 3;

/** Base backoff delay in milliseconds */
const DEFAULT_BASE_BACKOFF_MS = 1000;

/** Maximum backoff delay in milliseconds */
const DEFAULT_MAX_BACKOFF_MS = 30000;

// ============================================
// Error Types
// ============================================

/**
 * Error thrown when no capable agents are found for a target kind.
 */
export class NoCapableAgentError extends Error {
  constructor(public readonly targetKind: number) {
    super(`No capable agents found for kind ${targetKind}`);
    this.name = 'NoCapableAgentError';
  }
}

/**
 * Error thrown when the preferred agent is not found or not capable.
 */
export class PreferredAgentNotFoundError extends Error {
  constructor(public readonly preferredAgent: string) {
    super(`Preferred agent ${preferredAgent} not found or not capable`);
    this.name = 'PreferredAgentNotFoundError';
  }
}

/**
 * Error thrown when task delegation times out.
 */
export class DelegationTimeoutError extends Error {
  constructor(public readonly timeout: number) {
    super(`Task delegation timed out after ${timeout}s`);
    this.name = 'DelegationTimeoutError';
  }
}

// ============================================
// Skill Schema
// ============================================

/**
 * Zod schema for delegate_task skill parameters.
 */
const DelegateTaskParams = z.object({
  taskDescription: z.string().describe('Task description/prompt for the delegate agent'),
  targetKind: z.number().int().describe('Event kind the delegate agent must support'),
  timeout: z.number().int().positive().optional().default(30).describe('Timeout in seconds'),
  preferredAgent: z.string().optional().describe('ILP address of preferred agent'),
});

// ============================================
// Skill Factory Function
// ============================================

/**
 * Creates the delegate_task skill.
 *
 * This skill uses Epic 18 capability discovery to find agents that support
 * the target event kind, then sends a Kind 5900 task delegation request
 * via ILP and awaits the Kind 6900 result.
 *
 * @param logger - Optional logger for delegation operations
 * @returns The delegate_task skill
 */
export function createDelegateTaskSkill(logger?: Logger): AgentSkill<typeof DelegateTaskParams> {
  const codec = new ToonCodec();

  return {
    name: 'delegate_task',
    description:
      'Delegate a task to another capable agent via the social graph. ' +
      'Discovers agents with the required capability, sends a Kind 5900 task request, ' +
      'and returns the Kind 6900 result. Use when you need specialized capabilities ' +
      'that this agent does not have.',
    parameters: DelegateTaskParams,
    eventKinds: [5900],
    execute: async (params, context: SkillExecuteContext): Promise<EventHandlerResult> => {
      logger?.info(
        { taskDescription: params.taskDescription, targetKind: params.targetKind },
        'Starting task delegation'
      );

      try {
        // Check for required dependencies
        if (!context.discovery) {
          logger?.error('Discovery service not available');
          return {
            success: false,
            error: {
              code: 'T00',
              message: 'Discovery service not configured - task delegation not available',
            },
          };
        }

        if (!context.sendPacket) {
          logger?.error('Send packet function not available');
          return {
            success: false,
            error: {
              code: 'T00',
              message: 'ILP send function not configured - task delegation not available',
            },
          };
        }

        // Task 3: Discover capable agents via Epic 18 capability discovery
        logger?.debug({ targetKind: params.targetKind }, 'Discovering capable agents');
        const capabilities = await context.discovery.discoverForKind(params.targetKind);

        if (capabilities.length === 0) {
          logger?.warn({ targetKind: params.targetKind }, 'No capable agents found');
          throw new NoCapableAgentError(params.targetKind);
        }

        logger?.info({ agentCount: capabilities.length }, 'Discovered capable agents');

        // Task 3: Select agent (preferredAgent or first capable)
        const selected = params.preferredAgent
          ? capabilities.find((c) => c.ilpAddress === params.preferredAgent)
          : capabilities[0]; // Already sorted by social distance

        if (!selected) {
          if (params.preferredAgent) {
            logger?.warn({ preferredAgent: params.preferredAgent }, 'Preferred agent not found');
            throw new PreferredAgentNotFoundError(params.preferredAgent);
          }
          // This shouldn't happen since we checked capabilities.length > 0, but TypeScript doesn't know that
          throw new NoCapableAgentError(params.targetKind);
        }

        logger?.info(
          {
            selectedAgent: selected.ilpAddress,
            socialDistance: selected.socialDistance,
            preferred: !!params.preferredAgent,
          },
          'Selected agent'
        );

        // Task 4: Create Kind 5900 task delegation request event
        const taskEvent: NostrEvent = {
          kind: 5900,
          pubkey: context.agentPubkey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['i', params.taskDescription, 'text'],
            ['output', 'application/json'],
            ['timeout', params.timeout.toString()],
            ['p', selected.pubkey],
            ['priority', 'normal'],
          ],
          content: params.taskDescription,
          id: '', // Placeholder - would be computed during signing
          sig: '', // Placeholder - would be computed during signing
        };

        logger?.debug(
          { kind: taskEvent.kind, targetPubkey: selected.pubkey },
          'Created task event'
        );

        // Task 4/5: Encode event as TOON and wrap in ILP PREPARE packet
        const toonEncoded = codec.encode(taskEvent);

        // Get payment amount from capability pricing
        const pricingEntry = selected.pricing.get(5900);
        const paymentAmount = pricingEntry?.amount ?? 0n;

        logger?.debug(
          { amount: paymentAmount.toString(), destination: selected.ilpAddress },
          'Preparing ILP packet'
        );

        // Create execution condition (SHA-256 hash of a fulfillment)
        // For agent services, we use a deterministic condition
        const fulfillment = Buffer.alloc(32, 0);
        const executionCondition = crypto.createHash('sha256').update(fulfillment).digest();

        const ilpPacket: ILPPreparePacket = {
          type: PacketType.PREPARE,
          destination: selected.ilpAddress,
          amount: paymentAmount,
          data: toonEncoded,
          executionCondition,
          expiresAt: new Date(Date.now() + params.timeout * 1000),
        };

        logger?.info(
          { destination: selected.ilpAddress, amount: paymentAmount.toString() },
          'Sending ILP packet with task request'
        );

        // Task 6: Send via ILP with timeout and retry
        // context.sendPacket is guaranteed to be defined due to the guard above
        const sendPacketFn = context.sendPacket!;
        const response = await sendWithRetry(
          sendPacketFn,
          selected.ilpAddress,
          ilpPacket,
          params.timeout * 1000,
          logger
        );

        logger?.debug({ responseType: response.type }, 'Received ILP response');

        // Task 5: Parse Kind 6900 result from ILP FULFILL
        if (response.type !== PacketType.FULFILL) {
          logger?.error({ responseType: response.type }, 'Received ILP REJECT instead of FULFILL');
          return {
            success: false,
            error: {
              code: 'F99',
              message: 'Task delegation failed - received rejection from delegate agent',
            },
          };
        }

        // Decode TOON-encoded Kind 6900 result
        if (!response.data || response.data.length === 0) {
          logger?.warn('Received empty response data');
          return {
            success: true,
            responseEvent: undefined,
          };
        }

        const resultEvent = codec.decode(response.data);

        logger?.info(
          { resultKind: resultEvent.kind, runtime: extractRuntimeMetadata(resultEvent) },
          'Successfully delegated task'
        );

        // Task 7: Return result to AI agent
        return {
          success: true,
          responseEvent: resultEvent,
        };
      } catch (error) {
        if (
          error instanceof NoCapableAgentError ||
          error instanceof PreferredAgentNotFoundError ||
          error instanceof DelegationTimeoutError
        ) {
          logger?.error({ error: error.message }, 'Task delegation failed');
          return {
            success: false,
            error: {
              code: 'F99',
              message: error.message,
            },
          };
        }
        logger?.error({ error }, 'Unexpected error during task delegation');
        throw error;
      }
    },
  };
}

/**
 * Send ILP packet with exponential backoff retry logic.
 *
 * @param sendPacket - Packet sender function
 * @param ilpAddress - Destination ILP address
 * @param packet - ILP PREPARE packet to send
 * @param timeoutMs - Overall timeout in milliseconds
 * @param logger - Optional logger
 * @returns ILP response (Fulfill or Reject)
 */
async function sendWithRetry(
  sendPacket: (
    ilpAddress: string,
    packet: ILPPreparePacket
  ) => Promise<ILPFulfillPacket | ILPRejectPacket>,
  ilpAddress: string,
  packet: ILPPreparePacket,
  timeoutMs: number,
  logger?: Logger
): Promise<ILPFulfillPacket | ILPRejectPacket> {
  const maxRetries = DEFAULT_MAX_RETRIES;
  let lastError: Error | undefined;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check if we've exceeded the overall timeout
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      logger?.error({ elapsed, timeout: timeoutMs }, 'Overall timeout exceeded');
      throw new DelegationTimeoutError(timeoutMs / 1000);
    }

    try {
      logger?.debug({ attempt, maxRetries }, 'Sending ILP packet');
      const response = await sendPacket(ilpAddress, packet);
      logger?.info({ attempt }, 'ILP packet sent successfully');
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger?.warn(
        { attempt, error: lastError.message, retriesLeft: maxRetries - attempt },
        'ILP packet send failed'
      );

      // Check if error is retryable
      if (!isRetryableError(lastError)) {
        logger?.error({ error: lastError.message }, 'Non-retryable error encountered');
        throw lastError;
      }

      // Don't retry if this was the last attempt
      if (attempt >= maxRetries) {
        break;
      }

      // Calculate exponential backoff delay
      const backoffMs = Math.min(
        DEFAULT_BASE_BACKOFF_MS * Math.pow(2, attempt),
        DEFAULT_MAX_BACKOFF_MS
      );

      logger?.debug({ backoffMs, attempt }, 'Waiting before retry');
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  logger?.error({ maxRetries }, 'Max retries exceeded');
  throw new DelegationTimeoutError(timeoutMs / 1000);
}

/**
 * Determine if an error is retryable.
 *
 * @param error - Error to check
 * @returns true if error should be retried
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  // Network errors, timeouts, and temporary failures are retryable
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('connection') ||
    message.includes('busy') ||
    message.includes('unavailable')
  );
}

/**
 * Extract runtime metadata from Kind 6900 result event.
 *
 * @param event - Kind 6900 result event
 * @returns Runtime in milliseconds if present
 */
function extractRuntimeMetadata(event: NostrEvent): number | undefined {
  const runtimeTag = event.tags.find((tag) => tag[0] === 'runtime');
  if (runtimeTag && runtimeTag[1]) {
    const runtime = parseInt(runtimeTag[1], 10);
    return isNaN(runtime) ? undefined : runtime;
  }
  return undefined;
}
