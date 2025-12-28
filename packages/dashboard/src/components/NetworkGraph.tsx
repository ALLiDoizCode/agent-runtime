/**
 * NetworkGraph component - Cytoscape.js network topology visualization
 * Displays ILP connector nodes and BTP connections with interactive graph
 */

import React, { useRef, useMemo, useEffect, useCallback } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import { NetworkGraphData } from '../types/network';
import Cytoscape from 'cytoscape';

export interface NetworkGraphProps {
  graphData: NetworkGraphData;
}

/**
 * NetworkGraph component renders network topology using Cytoscape.js
 * Features: interactive zoom/pan/drag, health status color coding, automatic layout
 * Optimized with React.memo to prevent unnecessary re-renders
 */
const NetworkGraphComponent = ({ graphData }: NetworkGraphProps): JSX.Element => {
  const cyRef = useRef<Cytoscape.Core | null>(null);

  // Convert NetworkGraphData to Cytoscape element format
  const elements = useMemo(() => {
    const nodeElements = graphData.nodes.map((node) => ({
      data: {
        id: node.id,
        label: node.label,
        healthStatus: node.healthStatus,
      },
    }));

    const edgeElements = graphData.edges.map((edge) => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        connected: edge.connected,
      },
    }));

    return [...nodeElements, ...edgeElements];
  }, [graphData]);

  // Cytoscape stylesheet for nodes and edges
  const stylesheet: Cytoscape.StylesheetStyle[] = useMemo(
    () => [
      {
        selector: 'node',
        style: {
          'background-color': (ele: Cytoscape.NodeSingular) => {
            const status = ele.data('healthStatus');
            return status === 'healthy'
              ? '#10b981'
              : status === 'unhealthy'
                ? '#ef4444'
                : '#f59e0b';
          },
          label: 'data(label)',
          width: 60,
          height: 60,
          'font-family': 'Courier New, monospace',
          'font-size': '12px',
          color: '#f3f4f6',
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 5,
          'border-width': 2,
          'border-color': '#1f2937',
        },
      },
      {
        selector: 'edge',
        style: {
          'line-color': '#6b7280',
          width: 2,
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#6b7280',
          'curve-style': 'bezier',
        },
      },
      {
        selector: 'edge[connected = false]',
        style: {
          'line-style': 'dashed',
          opacity: 0.3,
        },
      },
    ],
    []
  );

  // Layout algorithm configuration (breadth-first for linear topology)
  const layout = useMemo(
    () => ({
      name: 'breadth-first',
      spacingFactor: 1.5,
    } as Cytoscape.LayoutOptions),
    []
  );

  // Fit graph to viewport on initial load and re-run layout on topology changes
  useEffect(() => {
    if (cyRef.current && elements.length > 0) {
      // Re-run layout when new nodes are added
      const layout = cyRef.current.layout({
        name: 'breadth-first',
        spacingFactor: 1.5,
        animate: true,
        animationDuration: 300,
      } as Cytoscape.LayoutOptions);
      layout.run();

      // Fit to viewport after layout completes
      setTimeout(() => {
        if (cyRef.current) {
          cyRef.current.fit();
        }
      }, 350);
    }
  }, [elements.length]); // Trigger on element count change

  // Animate node color changes on health status update
  useEffect(() => {
    if (cyRef.current) {
      graphData.nodes.forEach((node) => {
        const cyNode = cyRef.current?.getElementById(node.id);
        if (cyNode) {
          const currentStatus = cyNode.data('healthStatus');
          if (currentStatus !== node.healthStatus) {
            // Update health status and trigger animation
            cyNode.data('healthStatus', node.healthStatus);
            cyNode.animate({
              style: {
                'background-color':
                  node.healthStatus === 'healthy'
                    ? '#10b981'
                    : node.healthStatus === 'unhealthy'
                      ? '#ef4444'
                      : '#f59e0b',
              },
              duration: 300,
            });
          }
        }
      });

      // Animate edge opacity changes on connection state change
      graphData.edges.forEach((edge) => {
        const cyEdge = cyRef.current?.getElementById(edge.id);
        if (cyEdge) {
          const currentConnected = cyEdge.data('connected');
          if (currentConnected !== edge.connected) {
            cyEdge.data('connected', edge.connected);
            cyEdge.animate({
              style: {
                opacity: edge.connected ? 1 : 0.3,
              },
              duration: 300,
            });
          }
        }
      });
    }
  }, [graphData]);

  // Handle Cytoscape instance initialization
  const handleCyInit = useCallback((cy: Cytoscape.Core) => {
    cyRef.current = cy;

    // Fit to viewport on initialization
    cy.fit();

    // Enable performance optimizations
    cy.ready(() => {
      cy.fit();
    });

    // Add double-click to reset layout
    cy.on('dblclick', (event) => {
      if (event.target === cy) {
        // Double-click on background resets layout
        cy.layout(layout).run();
      }
    });
  }, [layout]);

  return (
    <div className="network-graph-container">
      <CytoscapeComponent
        elements={elements}
        stylesheet={stylesheet}
        layout={layout}
        style={{
          width: '100%',
          height: '600px',
          backgroundColor: '#111827',
        }}
        cy={handleCyInit}
        userZoomingEnabled={true}
        userPanningEnabled={true}
        boxSelectionEnabled={false}
        autoungrabify={false}
        minZoom={0.5}
        maxZoom={2.0}
        wheelSensitivity={0.2}
      />
    </div>
  );
};

NetworkGraphComponent.displayName = 'NetworkGraph';

export const NetworkGraph = React.memo(NetworkGraphComponent);
