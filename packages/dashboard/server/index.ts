/**
 * Dashboard Backend Entry Point
 * Starts the telemetry WebSocket server
 * @packageDocumentation
 */

import { TelemetryServer } from './telemetry-server.js';
import { logger } from './logger.js';

export const version = '0.1.0';

// Get telemetry server port from environment variable or use default
const TELEMETRY_WS_PORT = parseInt(process.env.TELEMETRY_WS_PORT || '9000', 10);

// Create and start telemetry server
let telemetryServer: TelemetryServer | null = null;

export async function main(): Promise<void> {
  try {
    telemetryServer = new TelemetryServer(TELEMETRY_WS_PORT, logger);
    telemetryServer.start();
    logger.info('Dashboard backend started successfully');
  } catch (error) {
    logger.fatal('Failed to start dashboard backend', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler for SIGTERM and SIGINT signals
 */
function handleShutdown(signal: string): void {
  logger.info(`${signal} received, shutting down gracefully`);
  if (telemetryServer) {
    telemetryServer.stop();
  }
  process.exit(0);
}

// Graceful shutdown handlers
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.fatal('Unhandled error during startup', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  });
}
