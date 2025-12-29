/**
 * Node status types for connector inspection panel
 */

import { TelemetryEvent } from '../hooks/useTelemetry';

/**
 * Connector node status information for inspection panel
 * Aggregated from NODE_STATUS telemetry events and packet statistics
 */
export interface NodeStatus {
  /** Unique connector identifier */
  nodeId: string;

  /** Node health state */
  healthStatus: 'healthy' | 'degraded' | 'down';

  /** Uptime in milliseconds since startup */
  uptime: number;

  /** Current routing table entries */
  routes: RouteEntry[];

  /** BTP peer connection information */
  peers: PeerConnection[];

  /** Packet processing statistics */
  statistics: NodeStatistics;

  /** ISO 8601 timestamp of last status update */
  lastUpdated: string;
}

/**
 * Routing table entry mapping ILP prefix to next-hop peer
 */
export interface RouteEntry {
  /** ILP address prefix (e.g., "g.alice") */
  prefix: string;

  /** Peer identifier for next hop */
  nextHop: string;

  /** Optional route priority for tie-breaking */
  priority?: number;
}

/**
 * BTP peer connection information
 */
export interface PeerConnection {
  /** Unique peer identifier */
  peerId: string;

  /** WebSocket URL for BTP connection */
  url: string;

  /** Current connection state */
  connected: boolean;

  /** ISO 8601 timestamp of last communication */
  lastSeen?: string;
}

/**
 * Packet processing statistics for connector node
 */
export interface NodeStatistics {
  /** Total packets received count */
  packetsReceived: number;

  /** Total packets forwarded count */
  packetsForwarded: number;

  /** Total packets rejected count */
  packetsRejected: number;
}

/**
 * Parse NODE_STATUS telemetry event into NodeStatus object
 * Returns null if event is not NODE_STATUS or missing required fields
 */
export function parseNodeStatus(event: TelemetryEvent): NodeStatus | null {
  if (event.type !== 'NODE_STATUS') return null;

  const nodeId = event.nodeId;
  const health = event.data.health as 'healthy' | 'degraded' | 'down' | undefined;
  const uptime = event.data.uptime as number | undefined;
  const routes = event.data.routes as RouteEntry[] | undefined;
  const peers = event.data.peers as PeerConnection[] | undefined;

  if (!nodeId || !health || uptime === undefined || !routes || !peers) return null;

  return {
    nodeId,
    healthStatus: health,
    uptime,
    routes,
    peers,
    statistics: {
      packetsReceived: 0, // Initialize to 0, updated from PACKET_* events
      packetsForwarded: 0,
      packetsRejected: 0,
    },
    lastUpdated: event.timestamp,
  };
}

/**
 * Format uptime milliseconds as human-readable duration
 */
export function formatUptime(uptimeMs: number): string {
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
