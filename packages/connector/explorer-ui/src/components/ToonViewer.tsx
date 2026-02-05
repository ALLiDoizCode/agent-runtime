/**
 * ToonViewer Component - Placeholder
 *
 * Displays TOON-encoded Nostr events from telemetry data.
 * TODO: Implement TOON decoding and visualization
 */

import * as React from 'react';

export interface ToonViewerProps {
  data: unknown;
}

/**
 * Check if event data contains a Nostr event
 */
export function hasNostrEvent(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;
  return 'nostrEvent' in obj || 'toonData' in obj;
}

/**
 * ToonViewer component
 *
 * Displays decoded TOON data from Nostr events.
 */
export function ToonViewer({ data }: ToonViewerProps): React.ReactElement {
  return (
    <div className="p-4">
      <div className="text-sm text-muted-foreground mb-4">TOON Viewer - Coming Soon</div>
      <div className="text-xs font-mono bg-muted p-3 rounded">
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    </div>
  );
}
