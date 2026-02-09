/**
 * Agent Business Logic Server - TypeScript Boilerplate
 *
 * This server handles payment requests from Agent Runtime.
 * Implement your custom business logic in the handler functions below.
 *
 * Endpoints:
 *   POST /handle-payment  - Process incoming payments
 *   GET  /health          - Health check
 *
 * Usage:
 *   npm install
 *   npm run build
 *   npm start
 *
 * Or for development:
 *   npm run dev
 */

import express, { Request, Response } from 'express';
import { PaymentRequest, PaymentResponse } from './types';

const app = express();
const PORT = process.env.PORT || 8080;

// Parse JSON bodies
app.use(express.json());

// ============================================================
// IMPLEMENT YOUR BUSINESS LOGIC HERE
// ============================================================

/**
 * Handle incoming payment.
 *
 * This is the main entry point for your business logic.
 * Called for each payment message that arrives.
 *
 * @param request - Payment details from Agent Runtime
 * @returns Response indicating accept/reject
 *
 * Example use cases:
 * - E-commerce: Check inventory, create order, fulfill payment
 * - API monetization: Track usage, enforce rate limits
 * - Micropayments: Accumulate small payments, provide access
 * - Streaming: Accept payment chunks for ongoing service
 */
async function handlePayment(request: PaymentRequest): Promise<PaymentResponse> {
  const { paymentId, amount, destination, data, expiresAt, metadata } = request;

  // eslint-disable-next-line no-console
  console.log('Payment received:', {
    paymentId,
    amount,
    destination,
    hasData: !!data,
    expiresAt,
    metadata,
  });

  // --------------------------------------------------------
  // TODO: Implement your business logic here
  // --------------------------------------------------------

  // Optional: Decode the application data if present
  if (data) {
    const appData = Buffer.from(data, 'base64');
    // Process application data (invoices, receipts, etc.)
    // Example: const invoice = JSON.parse(appData.toString('utf8'));
    // eslint-disable-next-line no-console
    console.log('Received application data:', appData.length, 'bytes');
  }

  // Example 1: Accept all payments under a limit
  const amountBigInt = BigInt(amount);
  const maxAmount = BigInt(1_000_000); // 1 million units

  if (amountBigInt > maxAmount) {
    return {
      accept: false,
      rejectReason: {
        code: 'invalid_amount',
        message: `Amount ${amount} exceeds maximum ${maxAmount.toString()}`,
      },
    };
  }

  // Example 2: Check payment metadata
  if (metadata?.productId) {
    // Validate product exists, check inventory, etc.
    // eslint-disable-next-line no-console
    console.log('Payment for product:', metadata.productId);
  }

  // Example 3: Track payments (in production, use a database)
  // await database.recordPayment(paymentId, amount);

  // Accept the payment
  return {
    accept: true,
    // Optional: Include data in the fulfill packet
    // data: Buffer.from('Thank you for your payment!').toString('base64'),
  };
}

// ============================================================
// HTTP ROUTES (no changes needed below)
// ============================================================

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

/**
 * Payment handler endpoint
 */
app.post('/handle-payment', async (req: Request, res: Response) => {
  try {
    const request = req.body as PaymentRequest;

    // Validate required fields
    if (!request.paymentId || !request.amount || !request.destination) {
      res.status(400).json({
        accept: false,
        rejectReason: {
          code: 'invalid_request',
          message: 'Missing required fields: paymentId, amount, destination',
        },
      });
      return;
    }

    const response = await handlePayment(request);
    res.json(response);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error handling payment:', error);
    res.status(500).json({
      accept: false,
      rejectReason: {
        code: 'internal_error',
        message: error instanceof Error ? error.message : 'Internal error',
      },
    });
  }
});

// Start server
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           Agent Business Logic Server Started              ║
╠════════════════════════════════════════════════════════════╣
║  Port:     ${String(PORT).padEnd(46)}║
║                                                            ║
║  Endpoints:                                                ║
║    POST /handle-payment  - Process payments                ║
║    GET  /health          - Health check                    ║
║                                                            ║
║  Ready to receive payments from Agent Runtime!             ║
╚════════════════════════════════════════════════════════════╝
  `);
});
