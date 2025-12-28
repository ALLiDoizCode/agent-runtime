/**
 * Network graph data models for ILP connector topology visualization
 */

/**
 * Represents a single connector node in the network graph
 */
export interface NetworkNode {
  /** Unique connector identifier (matches nodeId from telemetry) */
  id: string;
  /** Display name for node (defaults to id) */
  label: string;
  /** Health state for color coding */
  healthStatus: 'healthy' | 'unhealthy' | 'starting';
  /** Optional fixed position for layout */
  position?: { x: number; y: number };
  /** Number of active BTP connections */
  peersConnected: number;
  /** Total configured peers */
  totalPeers: number;
  /** Seconds since connector started */
  uptime: number;
}

/**
 * Represents a BTP connection between two connector nodes
 */
export interface NetworkEdge {
  /** Unique edge identifier (e.g., "connectorA-connectorB") */
  id: string;
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** BTP connection active state */
  connected: boolean;
  /** Optional edge label (e.g., peer name) */
  label?: string;
}

/**
 * Complete network graph data structure
 */
export interface NetworkGraphData {
  /** Array of all connector nodes */
  nodes: NetworkNode[];
  /** Array of all BTP connections */
  edges: NetworkEdge[];
}
