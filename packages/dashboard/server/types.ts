/**
 * Server-specific TypeScript types for telemetry messages
 * @packageDocumentation
 */

export interface TelemetryMessage {
  type: 'NODE_STATUS' | 'PACKET_SENT' | 'PACKET_RECEIVED' | 'ROUTE_LOOKUP' | 'CLIENT_CONNECT';
  nodeId: string;
  timestamp: string;
  data: object;
}

export interface NodeStatusMessage extends TelemetryMessage {
  type: 'NODE_STATUS';
  data: {
    routes: { prefix: string; nextHop: string }[];
    peers: { id: string; url: string; connected: boolean }[];
    health: 'healthy' | 'unhealthy' | 'starting';
    uptime: number;
    peersConnected: number;
    totalPeers: number;
  };
}

export interface PacketSentMessage extends TelemetryMessage {
  type: 'PACKET_SENT';
  data: {
    packetId: string;
    nextHop: string;
    timestamp: string;
  };
}

export interface PacketReceivedMessage extends TelemetryMessage {
  type: 'PACKET_RECEIVED';
  data: {
    packetId: string;
    packetType: 'PREPARE' | 'FULFILL' | 'REJECT';
    source: string;
    destination: string;
    amount: string;
  };
}

export interface RouteLookupMessage extends TelemetryMessage {
  type: 'ROUTE_LOOKUP';
  data: {
    destination: string;
    selectedPeer: string;
    reason: string;
  };
}

/**
 * Type guard to validate if a message is a valid TelemetryMessage
 */
export function isTelemetryMessage(msg: any): msg is TelemetryMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof msg.type === 'string' &&
    typeof msg.nodeId === 'string' &&
    typeof msg.timestamp === 'string' &&
    typeof msg.data === 'object' &&
    msg.data !== null
  );
}

/**
 * Type guard for NODE_STATUS messages
 */
export function isNodeStatusMessage(msg: any): msg is NodeStatusMessage {
  if (!isTelemetryMessage(msg) || msg.type !== 'NODE_STATUS') {
    return false;
  }

  const data = msg.data as any;
  return (
    Array.isArray(data.routes) &&
    Array.isArray(data.peers) &&
    typeof data.health === 'string' &&
    ['healthy', 'unhealthy', 'starting'].includes(data.health) &&
    typeof data.uptime === 'number' &&
    typeof data.peersConnected === 'number' &&
    typeof data.totalPeers === 'number'
  );
}

/**
 * Type guard for PACKET_SENT messages
 */
export function isPacketSentMessage(msg: any): msg is PacketSentMessage {
  if (!isTelemetryMessage(msg) || msg.type !== 'PACKET_SENT') {
    return false;
  }

  const data = msg.data as any;
  return (
    typeof data.packetId === 'string' &&
    typeof data.nextHop === 'string' &&
    typeof data.timestamp === 'string'
  );
}

/**
 * Type guard for PACKET_RECEIVED messages
 */
export function isPacketReceivedMessage(msg: any): msg is PacketReceivedMessage {
  if (!isTelemetryMessage(msg) || msg.type !== 'PACKET_RECEIVED') {
    return false;
  }

  const data = msg.data as any;
  return (
    typeof data.packetId === 'string' &&
    typeof data.packetType === 'string' &&
    ['PREPARE', 'FULFILL', 'REJECT'].includes(data.packetType) &&
    typeof data.source === 'string' &&
    typeof data.destination === 'string' &&
    typeof data.amount === 'string'
  );
}

/**
 * Type guard for ROUTE_LOOKUP messages
 */
export function isRouteLookupMessage(msg: any): msg is RouteLookupMessage {
  if (!isTelemetryMessage(msg) || msg.type !== 'ROUTE_LOOKUP') {
    return false;
  }

  const data = msg.data as any;
  return (
    typeof data.destination === 'string' &&
    typeof data.selectedPeer === 'string' &&
    typeof data.reason === 'string'
  );
}
