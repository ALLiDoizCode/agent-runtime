/**
 * Business Logic Client
 *
 * HTTP client for communicating with the user's business logic container.
 * Handles payment requests.
 */

import { Logger } from 'pino';
import { PaymentRequest, PaymentResponse, REJECT_CODE_MAP } from '../types';

export interface BusinessClientConfig {
  /** URL to business logic handler */
  businessLogicUrl: string;
  /** Request timeout in milliseconds */
  timeout: number;
}

/**
 * HTTP client for calling user's business logic container.
 */
export class BusinessClient {
  private readonly config: BusinessClientConfig;
  private readonly logger: Logger;

  constructor(config: BusinessClientConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'BusinessClient' });
  }

  /**
   * Call the payment handler endpoint.
   *
   * POST /handle-payment
   *
   * @param request - Payment request to process
   * @returns Payment response indicating accept/reject
   */
  async handlePayment(request: PaymentRequest): Promise<PaymentResponse> {
    const url = `${this.config.businessLogicUrl}/handle-payment`;

    this.logger.debug(
      { paymentId: request.paymentId, amount: request.amount, url },
      'Calling payment handler'
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(
          { paymentId: request.paymentId, status: response.status },
          'Payment handler returned error status'
        );

        return {
          accept: false,
          rejectReason: {
            code: 'internal_error',
            message: `Business logic returned status ${response.status}`,
          },
        };
      }

      const result = (await response.json()) as PaymentResponse;

      this.logger.debug(
        { paymentId: request.paymentId, accept: result.accept },
        'Payment handler response'
      );

      return result;
    } catch (error) {
      this.logger.error({ paymentId: request.paymentId, error }, 'Failed to call payment handler');

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          accept: false,
          rejectReason: {
            code: 'timeout',
            message: 'Business logic handler timed out',
          },
        };
      }

      return {
        accept: false,
        rejectReason: {
          code: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error calling business logic',
        },
      };
    }
  }

  /**
   * Map a business logic reject code to an ILP error code.
   *
   * @param code - Business logic reject code
   * @returns ILP error code (defaults to F99 if unknown)
   */
  mapRejectCode(code: string): string {
    return REJECT_CODE_MAP[code] ?? 'F99';
  }

  /**
   * Check if the business logic service is healthy.
   *
   * GET /health
   *
   * @returns true if healthy, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    const url = `${this.config.businessLogicUrl}/health`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return response.ok;
    } catch {
      return false;
    }
  }
}
