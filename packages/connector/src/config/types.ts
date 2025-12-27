/**
 * Configuration Types for ILP Connector
 *
 * Defines TypeScript interfaces for YAML configuration schema.
 * These types support defining network topology, peer connections,
 * and routing tables in a declarative configuration file.
 *
 * Example YAML Configuration:
 *
 * ```yaml
 * # Connector Configuration (Linear Topology - Middle Node)
 * nodeId: connector-b
 * btpServerPort: 3001
 * healthCheckPort: 8080
 * logLevel: info
 *
 * # Peer connector definitions
 * peers:
 *   - id: connector-a
 *     url: ws://connector-a:3000
 *     authToken: secret-a-to-b
 *
 *   - id: connector-c
 *     url: ws://connector-c:3002
 *     authToken: secret-b-to-c
 *
 * # Routing table entries
 * routes:
 *   - prefix: g.connectora
 *     nextHop: connector-a
 *     priority: 0
 *
 *   - prefix: g.connectorc
 *     nextHop: connector-c
 *     priority: 0
 * ```
 *
 * @packageDocumentation
 */

/**
 * Peer Configuration Interface
 *
 * Defines connection parameters for a peer connector in the network.
 * Peers are other ILP connectors that this node will establish
 * BTP (Bilateral Transfer Protocol) connections with.
 *
 * @property id - Unique peer identifier used in route definitions
 * @property url - WebSocket URL for peer connection (ws:// or wss://)
 * @property authToken - Shared secret for BTP authentication
 *
 * @example
 * ```typescript
 * const peer: PeerConfig = {
 *   id: 'connector-a',
 *   url: 'ws://connector-a:3000',
 *   authToken: 'shared-secret-123'
 * };
 * ```
 */
export interface PeerConfig {
  /**
   * Unique identifier for this peer
   * Used as reference in route nextHop fields
   * Must be unique across all peers in the configuration
   */
  id: string;

  /**
   * WebSocket URL for connecting to peer's BTP server
   * Format: ws://hostname:port or wss://hostname:port
   * Examples:
   * - ws://connector-a:3000
   * - wss://secure-connector.example.com:3001
   */
  url: string;

  /**
   * Shared secret for BTP authentication
   * Used to authenticate this connector to the peer
   * Should be a strong, randomly generated token
   */
  authToken: string;
}

/**
 * Route Configuration Interface
 *
 * Defines a routing table entry mapping ILP address prefixes
 * to peer connectors. Routes determine packet forwarding decisions.
 *
 * @property prefix - ILP address prefix pattern (RFC-0015 format)
 * @property nextHop - Peer ID to forward packets to
 * @property priority - Optional priority for tie-breaking (default: 0)
 *
 * @example
 * ```typescript
 * const route: RouteConfig = {
 *   prefix: 'g.alice',
 *   nextHop: 'connector-b',
 *   priority: 10
 * };
 * ```
 */
export interface RouteConfig {
  /**
   * ILP address prefix for route matching
   * Format: RFC-0015 compliant address prefix
   * Pattern: lowercase alphanumeric characters, dots, underscores, tildes, hyphens
   * Examples:
   * - g.alice
   * - g.bob.usd
   * - g.exchange.crypto
   */
  prefix: string;

  /**
   * Peer ID to forward matching packets to
   * Must reference an existing peer ID from the peers list
   * Used to determine which BTP connection to use
   */
  nextHop: string;

  /**
   * Route priority for tie-breaking when multiple routes match
   * Higher priority routes are preferred
   * Optional - defaults to 0 if not specified
   */
  priority?: number;
}

/**
 * Connector Configuration Interface
 *
 * Top-level configuration for an ILP connector node.
 * Defines node identity, network settings, peers, and routing.
 *
 * @property nodeId - Unique identifier for this connector instance
 * @property btpServerPort - Port for incoming BTP connections
 * @property healthCheckPort - Optional HTTP health endpoint port (default: 8080)
 * @property logLevel - Optional logging verbosity (default: 'info')
 * @property peers - List of peer connectors to connect to
 * @property routes - Initial routing table entries
 * @property dashboardTelemetryUrl - Optional WebSocket URL for telemetry
 *
 * @example
 * ```typescript
 * const config: ConnectorConfig = {
 *   nodeId: 'connector-b',
 *   btpServerPort: 3001,
 *   healthCheckPort: 8080,
 *   logLevel: 'info',
 *   peers: [
 *     { id: 'connector-a', url: 'ws://connector-a:3000', authToken: 'secret-a' }
 *   ],
 *   routes: [
 *     { prefix: 'g.connectora', nextHop: 'connector-a', priority: 0 }
 *   ]
 * };
 * ```
 */
export interface ConnectorConfig {
  /**
   * Unique identifier for this connector instance
   * Used in logging, telemetry, and network identification
   * Should be descriptive and unique across the network
   *
   * Examples: 'connector-a', 'hub-node', 'spoke-1'
   */
  nodeId: string;

  /**
   * Port number for BTP server to listen on
   * Accepts incoming BTP connections from peer connectors
   * Valid range: 1-65535
   *
   * Common ports: 3000, 3001, 3002, etc.
   */
  btpServerPort: number;

  /**
   * Port number for HTTP health check endpoint
   * Optional - defaults to 8080 if not specified
   * Valid range: 1-65535
   *
   * Used by orchestration systems (Docker, Kubernetes) for health monitoring
   */
  healthCheckPort?: number;

  /**
   * Logging verbosity level
   * Optional - defaults to 'info' if not specified
   *
   * Levels:
   * - 'debug': Detailed debugging information
   * - 'info': General informational messages
   * - 'warn': Warning messages
   * - 'error': Error messages only
   */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';

  /**
   * List of peer connectors to establish BTP connections with
   * Each peer represents another connector in the network
   * Can be an empty array if this node only accepts incoming connections
   *
   * Peer IDs must be unique within this list
   */
  peers: PeerConfig[];

  /**
   * Initial routing table entries
   * Defines how to forward packets based on destination address
   * Can be an empty array for nodes with no predefined routes
   *
   * Route nextHop values must reference peer IDs from the peers list
   */
  routes: RouteConfig[];

  /**
   * Optional WebSocket URL for sending telemetry to dashboard
   * Used for real-time monitoring and visualization
   * Format: ws://hostname:port or wss://hostname:port
   *
   * Example: 'ws://dashboard.example.com:8080'
   */
  dashboardTelemetryUrl?: string;
}
