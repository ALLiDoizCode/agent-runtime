/**
 * Mock for react-cytoscapejs component
 */

import React from 'react';

interface CytoscapeComponentProps {
  elements?: unknown[];
  stylesheet?: unknown[];
  layout?: unknown;
  style?: React.CSSProperties;
  cy?: (cy: unknown) => void;
  [key: string]: unknown;
}

const CytoscapeComponent: React.FC<CytoscapeComponentProps> = (props) => {
  return <div data-testid="cytoscape-mock" {...props} />;
};

export default CytoscapeComponent;
