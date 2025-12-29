/**
 * Custom React hook for node status state management
 */

import { useState, useEffect, useMemo } from 'react';
import { TelemetryEvent } from './useTelemetry';
import { NodeStatus, parseNodeStatus } from '../types/node';

export interface UseNodeStatusResult {
  /** Currently selected node ID (null if no selection) */
  selectedNodeId: string | null;

  /** Select a node to display in status panel */
  selectNode: (nodeId: string) => void;

  /** Clear node selection (close panel) */
  clearSelection: () => void;

  /** Get currently selected node status */
  getSelectedNode: () => NodeStatus | null;

  /** All node statuses (for debugging or other uses) */
  nodeStatuses: Map<string, NodeStatus>;
}

/**
 * Custom hook to manage node status state and selection
 * Builds node status cache from telemetry events and tracks packet statistics
 */
export function useNodeStatus(events: TelemetryEvent[]): UseNodeStatusResult {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeStatuses, setNodeStatuses] = useState<Map<string, NodeStatus>>(new Map());

  // Build node statuses cache from telemetry events
  useEffect(() => {
    if (events.length === 0) return;

    setNodeStatuses((prevStatuses) => {
      const updatedStatuses = new Map<string, NodeStatus>(prevStatuses);
      let hasChanges = false;

      events.forEach((event) => {
        // Process NODE_STATUS events to build/update node status cache
        if (event.type === 'NODE_STATUS') {
          const nodeStatus = parseNodeStatus(event);
          if (nodeStatus) {
            // Preserve existing statistics if node already exists
            const existingStatus = updatedStatuses.get(nodeStatus.nodeId);
            if (existingStatus) {
              nodeStatus.statistics = existingStatus.statistics;
            }
            updatedStatuses.set(nodeStatus.nodeId, nodeStatus);
            hasChanges = true;
          }
        }

        // Track packet statistics from telemetry events
        const nodeId = event.nodeId;
        const existingNode = updatedStatuses.get(nodeId);

        if (existingNode) {
          if (event.type === 'PACKET_RECEIVED') {
            existingNode.statistics.packetsReceived += 1;
            hasChanges = true;
          } else if (event.type === 'PACKET_SENT') {
            existingNode.statistics.packetsForwarded += 1;
            hasChanges = true;
          } else if (event.type === 'PACKET_REJECT') {
            existingNode.statistics.packetsRejected += 1;
            hasChanges = true;
          }
          if (hasChanges) {
            updatedStatuses.set(nodeId, existingNode);
          }
        }
      });

      return hasChanges ? updatedStatuses : prevStatuses;
    });
  }, [events]);

  const selectNode = (nodeId: string): void => {
    setSelectedNodeId(nodeId);
  };

  const clearSelection = (): void => {
    setSelectedNodeId(null);
  };

  const getSelectedNode = useMemo(() => {
    return (): NodeStatus | null => {
      if (!selectedNodeId) return null;
      return nodeStatuses.get(selectedNodeId) || null;
    };
  }, [selectedNodeId, nodeStatuses]);

  return {
    selectedNodeId,
    selectNode,
    clearSelection,
    getSelectedNode,
    nodeStatuses,
  };
}
