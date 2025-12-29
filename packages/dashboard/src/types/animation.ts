/**
 * Animation-specific types for packet flow visualization
 */

/**
 * Packet type color constants
 * Colors match Tailwind CSS palette for consistency
 */
export const PACKET_COLORS = {
  PREPARE: '#3b82f6', // Tailwind blue-500
  FULFILL: '#10b981', // Tailwind green-500
  REJECT: '#ef4444', // Tailwind red-500
} as const;

/**
 * Animated packet interface representing a packet moving between nodes
 */
export interface AnimatedPacket {
  /** Unique packet identifier (matches packetId from telemetry) */
  id: string;

  /** Packet type for color coding */
  type: 'PREPARE' | 'FULFILL' | 'REJECT';

  /** Source connector node ID */
  sourceNodeId: string;

  /** Destination connector node ID (next hop) */
  targetNodeId: string;

  /** Animation start timestamp (Date.now()) */
  startTime: number;

  /** Animation duration in milliseconds (default 800ms) */
  duration: number;

  /** Hex color based on packet type */
  color: string;
}

/**
 * Packet animation state tracking active and completed packets
 */
export interface PacketAnimationState {
  /** Currently animating packets keyed by packet ID */
  activePackets: Map<string, AnimatedPacket>;

  /** Packet IDs that have completed animation (for cleanup) */
  completedPackets: Set<string>;
}
