/**
 * Type declarations for react-cytoscapejs
 * This package doesn't have official TypeScript types
 */

declare module 'react-cytoscapejs' {
  import { ComponentType } from 'react';
  import Cytoscape from 'cytoscape';

  interface CytoscapeComponentProps {
    elements?: Cytoscape.ElementDefinition[];
    stylesheet?: Cytoscape.StylesheetStyle[];
    layout?: Cytoscape.LayoutOptions;
    style?: React.CSSProperties;
    cy?: (cy: Cytoscape.Core) => void;
    userZoomingEnabled?: boolean;
    userPanningEnabled?: boolean;
    boxSelectionEnabled?: boolean;
    autoungrabify?: boolean;
    minZoom?: number;
    maxZoom?: number;
    wheelSensitivity?: number;
  }

  const CytoscapeComponent: ComponentType<CytoscapeComponentProps>;
  export default CytoscapeComponent;
}
