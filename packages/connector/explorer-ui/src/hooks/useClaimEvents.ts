/**
 * useClaimEvents Hook - Story 17.6
 *
 * Hook to fetch and filter claim events by messageId for timeline display.
 * Queries all claim events (CLAIM_SENT, CLAIM_RECEIVED, CLAIM_REDEEMED)
 * associated with a specific message ID.
 */

import * as React from 'react';
import type { ClaimTimelineEvent } from '../components/ClaimTimeline';

/**
 * Hook to fetch claim events by messageId
 *
 * @param messageId - The claim message ID to filter by
 * @returns Ordered array of claim events for the timeline
 */
export function useClaimEvents(messageId: string | null): ClaimTimelineEvent[] {
  const [events, setEvents] = React.useState<ClaimTimelineEvent[]>([]);

  React.useEffect(() => {
    if (!messageId) {
      setEvents([]);
      return;
    }

    // TODO: Implement actual API call to fetch claim events
    // For now, return empty array
    // In a real implementation, this would query the EventStore API
    // with a filter for claim events matching the messageId:
    //
    // fetch(`/api/events?types=CLAIM_SENT,CLAIM_RECEIVED,CLAIM_REDEEMED&messageId=${messageId}`)
    //   .then(res => res.json())
    //   .then(data => {
    //     const claimEvents = data.events.map(transformToClaimTimelineEvent);
    //     setEvents(claimEvents);
    //   });

    setEvents([]);
  }, [messageId]);

  return events;
}

/**
 * Extract messageId from a telemetry event
 * Works with both TelemetryEvent and StoredEvent types
 */
export function extractMessageId(event: Record<string, unknown>): string | null {
  // Check payload first (for StoredEvent)
  if (event.payload && typeof event.payload === 'object') {
    const payload = event.payload as Record<string, unknown>;
    if (typeof payload.messageId === 'string') {
      return payload.messageId;
    }
  }

  // Check direct field (for TelemetryEvent)
  if (typeof event.messageId === 'string') {
    return event.messageId;
  }

  return null;
}

/**
 * Check if an event type is a claim event
 */
export function isClaimEventType(eventType: string): boolean {
  return (
    eventType === 'CLAIM_SENT' || eventType === 'CLAIM_RECEIVED' || eventType === 'CLAIM_REDEEMED'
  );
}
