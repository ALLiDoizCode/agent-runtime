/**
 * Health status response interface for health check endpoint
 * @description Represents the current operational status of a connector node
 */
export interface HealthStatus {
  /**
   * Overall health state of the connector
   * - 'healthy': All critical systems operational, ≥50% peers connected
   * - 'unhealthy': <50% peers connected, indicating network partition or peer failures
   * - 'starting': Connector initialization in progress, BTP server not yet listening
   */
  status: 'healthy' | 'unhealthy' | 'starting';

  /**
   * Seconds since connector started
   * Calculated as: Math.floor((Date.now() - startTime) / 1000)
   */
  uptime: number;

  /**
   * Number of peers currently connected via BTP
   * Obtained from BTPClientManager.getConnectedPeerCount()
   */
  peersConnected: number;

  /**
   * Total number of configured peers
   * Obtained from config.peers.length
   */
  totalPeers: number;

  /**
   * ISO 8601 timestamp of when this health check was performed
   * Example: "2025-12-27T10:30:00.000Z"
   */
  timestamp: string;

  /**
   * Optional connector node identifier from configuration
   * Useful for debugging in multi-node deployments
   */
  nodeId?: string;

  /**
   * Optional connector version from package.json
   * Example: "1.0.0"
   */
  version?: string;
}

/**
 * Interface for components that can provide health status
 * @description Implemented by ConnectorNode to supply health data to HealthServer
 * @example
 * class ConnectorNode implements HealthStatusProvider {
 *   getHealthStatus(): HealthStatus {
 *     return {
 *       status: this.calculateStatus(),
 *       uptime: Math.floor((Date.now() - this._startTime.getTime()) / 1000),
 *       peersConnected: this._btpClientManager.getConnectedPeerCount(),
 *       totalPeers: this._config.peers.length,
 *       timestamp: new Date().toISOString()
 *     };
 *   }
 * }
 */
export interface HealthStatusProvider {
  /**
   * Returns the current health status of the connector
   * @returns HealthStatus object with all current health metrics
   */
  getHealthStatus(): HealthStatus;
}
