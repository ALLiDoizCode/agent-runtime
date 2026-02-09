/**
 * Agent Runtime Package
 *
 * ILP middleware that forwards packets between the connector and a user-defined
 * business logic service. Uses stateless SHA-256 fulfillment.
 *
 * @packageDocumentation
 */

// Main runtime class
export { AgentRuntime, startFromEnv } from './agent-runtime';

// Type definitions
export {
  // Payment types
  PaymentRequest,
  PaymentResponse,
  // Local delivery types (connector <-> runtime)
  LocalDeliveryRequest,
  LocalDeliveryResponse,
  // Configuration
  AgentRuntimeConfig,
  ResolvedAgentRuntimeConfig,
  DEFAULT_CONFIG,
  REJECT_CODE_MAP,
  // Outbound ILP send types (Epic 20)
  IlpSendRequest,
  IlpSendResponse,
  IPacketSender,
} from './types';

// BTP client for outbound packet injection (Epic 20)
export {
  OutboundBTPClient,
  OutboundBTPClientConfig,
  BTPConnectionError,
  BTPAuthenticationError,
} from './btp/outbound-btp-client';

// Components (for advanced use cases)
export { BusinessClient, BusinessClientConfig } from './business/business-client';
export { PacketHandler, PacketHandlerConfig } from './packet/packet-handler';
export { HttpServer, HttpServerConfig } from './http/http-server';

// Fulfillment utilities
export { computeFulfillmentFromData, generatePaymentId } from './stream/fulfillment';

// CLI entry point
import { startFromEnv as startCli } from './agent-runtime';

if (require.main === module) {
  startCli().catch((error: Error) => {
    console.error('Failed to start agent runtime:', error);
    process.exit(1);
  });
}
