import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  TelemetryEvent,
  EVENT_TYPE_COLORS,
  PACKET_TYPE_COLORS,
  formatRelativeTime,
  getClaimBlockchain,
  getClaimAmount,
  getClaimSuccess,
  getClaimVerified,
  getClaimMessageId,
  formatClaimAmount,
  getBlockchainBadgeColor,
  getIlpPacketType,
} from '../lib/event-types';
import { getExplorerUrl, detectAddressType } from '../lib/explorer-links';
import { Badge } from '@/components/ui/badge';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation';
import {
  Radio,
  WifiOff,
  SearchX,
  Check,
  X,
  Circle,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Wallet,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface EventTableProps {
  events: TelemetryEvent[];
  onEventClick?: (event: TelemetryEvent) => void;
  loading?: boolean;
  showPagination?: boolean;
  total?: number;
  onLoadMore?: () => void;
  connectionStatus?: 'connecting' | 'connected' | 'disconnected' | 'error';
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onScrollStateChange?: (isAtTop: boolean) => void;
}

const ROW_HEIGHT = 48;

/**
 * Check if event is a claim event (Story 17.6)
 */
function isClaimEvent(event: TelemetryEvent): boolean {
  return (
    event.type === 'CLAIM_SENT' ||
    event.type === 'CLAIM_RECEIVED' ||
    event.type === 'CLAIM_REDEEMED'
  );
}

/**
 * Event direction for visual indicators
 */
type EventDirection = 'incoming' | 'outgoing' | 'internal' | 'none';

/**
 * Get display type - ILP packet type (prepare/fulfill/reject) for ILP events, event type otherwise
 * For ILP packet events, prominently displays the packet type using ILP terminology
 */
function getDisplayType(event: TelemetryEvent): {
  label: string;
  colorClass: string;
  isIlpPacket: boolean;
  direction: EventDirection;
  icon: 'incoming' | 'outgoing' | 'balance' | 'none';
} {
  // Check if this is an ILP packet event
  const ilpPacketType = getIlpPacketType(event);

  if (ilpPacketType) {
    // Display ILP packet type prominently (prepare/fulfill/reject)
    const colorClass = PACKET_TYPE_COLORS[ilpPacketType] || 'bg-gray-500';

    // Determine direction from event type
    let direction: EventDirection = 'none';
    let icon: 'incoming' | 'outgoing' | 'balance' | 'none' = 'none';
    if (event.type === 'PACKET_RECEIVED') {
      direction = 'incoming';
      icon = 'incoming';
    } else if (event.type === 'PACKET_FORWARDED') {
      direction = 'outgoing';
      icon = 'outgoing';
    } else if (event.type === 'AGENT_CHANNEL_PAYMENT_SENT') {
      direction = 'outgoing';
      icon = 'outgoing';
    }

    return {
      label: ilpPacketType.toUpperCase(),
      colorClass,
      isIlpPacket: true,
      direction,
      icon,
    };
  }

  // For ACCOUNT_BALANCE events
  if (event.type === 'ACCOUNT_BALANCE') {
    return {
      label: 'BALANCE',
      colorClass: EVENT_TYPE_COLORS[event.type] || 'bg-blue-500',
      isIlpPacket: false,
      direction: 'internal',
      icon: 'balance',
    };
  }

  // Fallback to event type for non-ILP events
  return {
    label: event.type.replace(/_/g, ' '),
    colorClass: EVENT_TYPE_COLORS[event.type] || 'bg-gray-500',
    isIlpPacket: false,
    direction: 'none',
    icon: 'none',
  };
}

/**
 * Address info for display - can be ILP address, wallet address, or peer ID
 */
interface AddressInfo {
  display: string; // What to show in the UI
  full: string; // Full address for tooltip
  type: 'ilp' | 'wallet' | 'peer' | 'unknown';
  explorerUrl?: string; // Block explorer URL if applicable
}

/**
 * Parse an address and return display info
 */
function parseAddress(value: string | null | undefined): AddressInfo | null {
  if (!value || value === '-') return null;

  // Check if it's an Ethereum wallet address
  const addressType = detectAddressType(value);
  if (addressType === 'evm') {
    const explorerUrl = getExplorerUrl(value, 'address') || undefined;
    return {
      display: `${value.slice(0, 6)}...${value.slice(-4)}`,
      full: value,
      type: 'wallet',
      explorerUrl,
    };
  }

  // Check if it's an ILP address (starts with g.)
  if (value.startsWith('g.')) {
    return {
      display: value.length > 20 ? `${value.slice(0, 12)}...${value.slice(-6)}` : value,
      full: value,
      type: 'ilp',
    };
  }

  // Check if it looks like a peer ID (peer1, peer2, etc.)
  if (/^peer\d+$/i.test(value)) {
    return {
      display: value,
      full: `g.${value}`,
      type: 'peer',
    };
  }

  // Unknown format - show as-is
  return {
    display: value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value,
    full: value,
    type: 'unknown',
  };
}

/**
 * Get the "from" address (packet sender) with full ILP address when available
 */
function getFrom(event: TelemetryEvent): AddressInfo | null {
  // For ACCOUNT_BALANCE events, show the node that owns the account
  if (event.type === 'ACCOUNT_BALANCE') {
    const nodeId = 'nodeId' in event && typeof event.nodeId === 'string' ? event.nodeId : null;
    if (nodeId) {
      return {
        display: nodeId,
        full: nodeId.startsWith('g.') ? nodeId : `g.${nodeId}`,
        type: 'peer',
      };
    }
    return null;
  }

  // Try explicit 'from' field first
  if ('from' in event && typeof event.from === 'string' && event.from) {
    return parseAddress(event.from);
  }

  // Try 'fromAddress' field
  if ('fromAddress' in event && typeof event.fromAddress === 'string') {
    return parseAddress(event.fromAddress as string);
  }

  // For PACKET_RECEIVED, the source is the incoming peer
  if (event.type === 'PACKET_RECEIVED' && 'peerId' in event && typeof event.peerId === 'string') {
    const peerId = event.peerId as string;
    return {
      display: peerId,
      full: peerId.startsWith('g.') ? peerId : `g.${peerId}`,
      type: 'peer',
    };
  }

  // Fallback for older events
  if ('agentId' in event && typeof event.agentId === 'string') {
    return parseAddress(event.agentId as string);
  }

  return null;
}

/**
 * Get the "to" address (next hop) with full ILP address when available
 */
function getTo(event: TelemetryEvent): AddressInfo | null {
  // For ACCOUNT_BALANCE events, show the peer account
  if (event.type === 'ACCOUNT_BALANCE') {
    const peerId = 'peerId' in event && typeof event.peerId === 'string' ? event.peerId : null;
    if (peerId) {
      return {
        display: peerId,
        full: peerId.startsWith('g.') ? peerId : `g.${peerId}`,
        type: 'peer',
      };
    }
    return null;
  }

  // Try explicit 'to' field first
  if ('to' in event && typeof event.to === 'string' && event.to) {
    return parseAddress(event.to);
  }

  // Try 'toAddress' field
  if ('toAddress' in event && typeof event.toAddress === 'string') {
    return parseAddress(event.toAddress as string);
  }

  // For PACKET_FORWARDED, the destination is the next hop peer
  if (event.type === 'PACKET_FORWARDED' && 'peerId' in event && typeof event.peerId === 'string') {
    const peerId = event.peerId as string;
    return {
      display: peerId,
      full: peerId.startsWith('g.') ? peerId : `g.${peerId}`,
      type: 'peer',
    };
  }

  // Fallback for older events
  if ('peerId' in event && typeof event.peerId === 'string') {
    return parseAddress(event.peerId as string);
  }

  return null;
}

/**
 * Extract amount from event
 */
function getAmount(event: TelemetryEvent): string | null {
  const amountFields = [
    'amount',
    'settledAmount',
    'netBalance',
    'change',
    'claimAmount',
    'finalBalance',
  ];
  for (const field of amountFields) {
    if (field in event && event[field]) {
      return event[field] as string;
    }
  }
  return null;
}

/**
 * Format amount for display (truncate large numbers)
 */
function formatAmount(amount: string): string {
  try {
    const num = BigInt(amount);
    if (num > BigInt(1e18)) {
      return `${(Number(num) / 1e18).toFixed(4)} ETH`;
    }
    if (num > BigInt(1e12)) {
      return `${(Number(num) / 1e12).toFixed(2)}T`;
    }
    if (num > BigInt(1e9)) {
      return `${(Number(num) / 1e9).toFixed(2)}B`;
    }
    if (num > BigInt(1e6)) {
      return `${(Number(num) / 1e6).toFixed(2)}M`;
    }
    if (num > BigInt(1e3)) {
      return `${(Number(num) / 1e3).toFixed(2)}K`;
    }
    return amount;
  } catch {
    return amount;
  }
}

/**
 * Normalize timestamp to number
 */
function normalizeTimestamp(ts: string | number): number {
  if (typeof ts === 'number') return ts;
  return new Date(ts).getTime();
}

/**
 * Extract destination ILP address from event
 * For ACCOUNT_BALANCE events, shows token and settlement state
 */
function getDestination(event: TelemetryEvent): string | null {
  // For ACCOUNT_BALANCE events, show token ID and settlement state as destination
  if (event.type === 'ACCOUNT_BALANCE') {
    const tokenId = 'tokenId' in event && typeof event.tokenId === 'string' ? event.tokenId : null;
    const settlementState =
      'settlementState' in event && typeof event.settlementState === 'string'
        ? event.settlementState
        : null;

    if (tokenId) {
      return settlementState && settlementState !== 'IDLE'
        ? `${tokenId} (${settlementState})`
        : `${tokenId} Account`;
    }
    return 'Balance Update';
  }

  const destFields = ['destination', 'destinationAddress', 'to', 'toAddress'];
  for (const field of destFields) {
    if (field in event && typeof event[field] === 'string') {
      return event[field] as string;
    }
  }
  return null;
}

/**
 * Truncate ILP address for display
 */
function formatDestination(destination: string): string {
  if (destination.length <= 30) return destination;
  return `${destination.slice(0, 20)}...${destination.slice(-8)}`;
}

/**
 * Determine event status (success/failure/pending/neutral)
 */
type EventStatus = 'success' | 'failure' | 'pending' | 'neutral';

/**
 * Build a map of packet_id -> resolved status from FULFILL/REJECT packets
 * This is used to show the resolved status for PREPARE packets
 */
function buildPacketStatusMap(events: TelemetryEvent[]): Map<string, 'success' | 'failure'> {
  const statusMap = new Map<string, 'success' | 'failure'>();

  for (const event of events) {
    const ilpPacketType = getIlpPacketType(event);
    if (!ilpPacketType) continue;

    const packetId = getPacketId(event);
    if (!packetId) continue;

    if (ilpPacketType === 'fulfill') {
      statusMap.set(packetId, 'success');
    } else if (ilpPacketType === 'reject') {
      statusMap.set(packetId, 'failure');
    }
  }

  return statusMap;
}

/**
 * Get packet ID from event
 */
function getPacketId(event: TelemetryEvent): string | null {
  if ('packetId' in event && typeof event.packetId === 'string') {
    return event.packetId;
  }
  return null;
}

function getEventStatus(
  event: TelemetryEvent,
  resolvedStatus?: 'success' | 'failure'
): EventStatus {
  const type = event.type;

  // For ILP packet events, status is based on packet type
  const ilpPacketType = getIlpPacketType(event);
  if (ilpPacketType) {
    if (ilpPacketType === 'fulfill') return 'success';
    if (ilpPacketType === 'reject') return 'failure';
    // For PREPARE packets, use the resolved status if available
    if (ilpPacketType === 'prepare') {
      return resolvedStatus || 'pending';
    }
  }

  // For claim events, status is based on success/verified fields (Story 17.6)
  if (isClaimEvent(event)) {
    if (type === 'CLAIM_SENT') {
      const success = getClaimSuccess(event);
      return success === true ? 'success' : success === false ? 'failure' : 'neutral';
    }
    if (type === 'CLAIM_RECEIVED') {
      const verified = getClaimVerified(event);
      return verified === true ? 'success' : verified === false ? 'failure' : 'neutral';
    }
    if (type === 'CLAIM_REDEEMED') {
      const success = getClaimSuccess(event);
      return success === true ? 'success' : success === false ? 'failure' : 'neutral';
    }
  }

  const successTypes = [
    'PACKET_FORWARDED',
    'SETTLEMENT_COMPLETED',
    'FUNDING_TRANSACTION_CONFIRMED',
    'PAYMENT_CHANNEL_SETTLED',
    'XRP_CHANNEL_CLAIMED',
    'AGENT_WALLET_FUNDED',
    // Channel opened events are emitted after successful on-chain confirmation
    'PAYMENT_CHANNEL_OPENED',
    'XRP_CHANNEL_OPENED',
    'AGENT_CHANNEL_OPENED',
  ];

  const failureTypes = [
    'FUNDING_TRANSACTION_FAILED',
    'WALLET_BALANCE_MISMATCH',
    'SUSPICIOUS_ACTIVITY_DETECTED',
    'RATE_LIMIT_EXCEEDED',
    'FUNDING_RATE_LIMIT_EXCEEDED',
  ];

  const pendingTypes = ['SETTLEMENT_TRIGGERED'];

  if (successTypes.includes(type)) return 'success';
  if (failureTypes.includes(type)) return 'failure';
  if (pendingTypes.includes(type)) return 'pending';
  return 'neutral';
}

/**
 * Get status display with icon and color (Story 18.3 AC 4)
 * Uses lucide-react icons for better visual consistency
 */
function getStatusDisplay(status: EventStatus): {
  icon: React.ReactNode;
  text: string;
  className: string;
} {
  switch (status) {
    case 'success':
      return {
        icon: <Check className="h-4 w-4" />,
        text: 'Success',
        className: 'text-emerald-500',
      };
    case 'failure':
      return {
        icon: <X className="h-4 w-4" />,
        text: 'Failed',
        className: 'text-rose-500',
      };
    case 'pending':
      return {
        icon: <Circle className="h-4 w-4 animate-pulse" />,
        text: 'Pending',
        className: 'text-cyan-500',
      };
    default:
      return {
        icon: <Circle className="h-4 w-4" />,
        text: 'N/A',
        className: 'text-muted-foreground',
      };
  }
}

/**
 * AddressLink component - handles ILP addresses, wallet addresses, and peer IDs
 * Shows full address in tooltip, links to explorer when applicable
 * NOTE: Requires TooltipProvider to be present in parent component
 */
const AddressLink = React.memo(function AddressLink({
  address,
  showIcon = true,
}: {
  address: AddressInfo | null;
  showIcon?: boolean;
}) {
  if (!address) return <span className="text-muted-foreground">—</span>;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    if (address.explorerUrl) {
      window.open(address.explorerUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Icon based on address type
  const icon = showIcon ? (
    address.type === 'wallet' ? (
      <Wallet className="h-3 w-3 shrink-0 text-emerald-500" />
    ) : address.type === 'ilp' || address.type === 'peer' ? (
      <Globe className="h-3 w-3 shrink-0 text-cyan-500" />
    ) : null
  ) : null;

  // For wallet addresses with explorer links
  if (address.explorerUrl) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline focus:outline-none focus:ring-1 focus:ring-blue-400 rounded font-mono text-xs"
          >
            {icon}
            <span>{address.display}</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-mono text-xs break-all">{address.full}</p>
          <p className="text-xs text-muted-foreground mt-1">Click to view on explorer</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // For ILP addresses and peer IDs - only show tooltip if address differs from display
  if (address.full !== address.display) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 font-mono text-xs cursor-default">
            {icon}
            <span>{address.display}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-mono text-xs break-all">{address.full}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // No tooltip needed if full address is already shown
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs" title={address.full}>
      {icon}
      <span>{address.display}</span>
    </span>
  );
});

/**
 * Memoized row component for better performance
 */
/**
 * Direction icon component for the Type column
 */
const DirectionIcon = React.memo(function DirectionIcon({
  icon,
}: {
  icon: 'incoming' | 'outgoing' | 'balance' | 'none';
}) {
  switch (icon) {
    case 'incoming':
      return <ArrowDownLeft className="h-3.5 w-3.5 text-cyan-400" />;
    case 'outgoing':
      return <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />;
    case 'balance':
      return <Wallet className="h-3.5 w-3.5 text-blue-400" />;
    default:
      return null;
  }
});

const EventRow = React.memo(function EventRow({
  event,
  onSelect,
  index,
  style,
  resolvedStatus,
  isSelected,
  isNew,
}: {
  event: TelemetryEvent;
  onSelect?: (index: number) => void;
  index: number;
  style: React.CSSProperties;
  resolvedStatus?: 'success' | 'failure';
  isSelected?: boolean;
  isNew?: boolean;
}) {
  const handleClick = React.useCallback(() => {
    onSelect?.(index);
  }, [onSelect, index]);
  const displayType = getDisplayType(event);
  const from = getFrom(event);
  const to = getTo(event);
  const amount = getAmount(event);
  const timestamp = normalizeTimestamp(event.timestamp);
  const destination = getDestination(event);
  const status = getEventStatus(event, resolvedStatus);
  const statusDisplay = getStatusDisplay(status);

  // Claim event specific data (Story 17.6)
  const isClaim = isClaimEvent(event);
  const claimBlockchain = isClaim ? getClaimBlockchain(event) : null;
  const claimMessageId = isClaim ? getClaimMessageId(event) : null;
  const claimAmount = isClaim ? getClaimAmount(event) : null;

  return (
    <div
      className={`flex items-center border-b border-border cursor-pointer hover:bg-muted/50 ${isSelected ? 'bg-muted/50 ring-1 ring-primary' : ''} ${isNew ? 'animate-fadeIn' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {/* Time column */}
      <div className="w-[10%] min-w-[70px] px-2 font-mono text-xs text-muted-foreground truncate">
        {formatRelativeTime(timestamp)}
      </div>

      {/* Type column - redesigned with direction icon */}
      <div className="w-[14%] min-w-[110px] px-2">
        <div className="flex items-center gap-1.5">
          {/* Direction indicator */}
          <DirectionIcon icon={displayType.icon} />

          {/* Type badge */}
          <Badge
            variant="secondary"
            className={`${displayType.colorClass} text-white text-[10px] font-semibold px-1.5 py-0`}
          >
            {displayType.label}
          </Badge>

          {/* Blockchain badge for claim events */}
          {isClaim && claimBlockchain && (
            <Badge
              variant="outline"
              className={`text-[10px] border px-1 py-0 ${getBlockchainBadgeColor(claimBlockchain)}`}
            >
              {claimBlockchain.toUpperCase()}
            </Badge>
          )}
        </div>
      </div>

      {/* From column - full address with tooltip */}
      <div className="w-[18%] min-w-[120px] px-2 truncate">
        <AddressLink address={from} />
      </div>

      {/* To column - full address with tooltip */}
      <div className="w-[18%] min-w-[120px] px-2 flex items-center gap-1">
        {from && to && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
        <div className="truncate">
          <AddressLink address={to} />
        </div>
      </div>

      {/* Destination column */}
      <div
        className="hidden lg:block w-[18%] min-w-[130px] px-2 font-mono text-xs truncate"
        title={destination || undefined}
      >
        {isClaim && claimMessageId ? (
          <span className="text-muted-foreground">msg:{claimMessageId.slice(0, 8)}...</span>
        ) : destination ? (
          <span className="cursor-default">{formatDestination(destination)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {/* Amount column */}
      <div className="hidden md:block w-[10%] min-w-[70px] px-2 font-mono text-xs truncate text-right">
        {isClaim && claimAmount && claimBlockchain ? (
          formatClaimAmount(claimAmount, claimBlockchain)
        ) : amount ? (
          formatAmount(amount)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {/* Status column */}
      <div
        className={`w-[12%] min-w-[80px] px-2 text-xs ${statusDisplay.className} flex items-center gap-1`}
      >
        <span title={statusDisplay.text} className="flex items-center gap-1">
          {statusDisplay.icon}
          <span className="hidden md:inline">{statusDisplay.text}</span>
        </span>
      </div>
    </div>
  );
});

export function EventTable({
  events,
  onEventClick,
  loading,
  showPagination,
  total,
  onLoadMore,
  onScrollStateChange,
  ...emptyStateProps
}: EventTableProps) {
  const { connectionStatus, hasActiveFilters, onClearFilters } = emptyStateProps;
  const parentRef = React.useRef<HTMLDivElement>(null);
  const eventsRef = React.useRef(events);
  eventsRef.current = events;

  // Build a map of packet_id -> resolved status for PREPARE packets
  const packetStatusMap = React.useMemo(() => buildPacketStatusMap(events), [events]);

  // Track new events for fade-in animation (live mode only)
  const prevEventCountRef = React.useRef(events.length);
  const newEventCountRef = React.useRef(0);
  const isLiveMode = !showPagination;

  React.useEffect(() => {
    const prevCount = prevEventCountRef.current;
    const currentCount = events.length;
    if (isLiveMode && currentCount > prevCount) {
      // New events were prepended at the beginning
      newEventCountRef.current = currentCount - prevCount;
      // Clear new event markers after animation duration
      const timer = setTimeout(() => {
        newEventCountRef.current = 0;
      }, 500);
      prevEventCountRef.current = currentCount;
      return () => clearTimeout(timer);
    }
    prevEventCountRef.current = currentCount;
  }, [events.length, isLiveMode]);

  // Stable callback that uses ref-based lookup to avoid events array dependency
  const handleRowSelect = React.useCallback(
    (index: number) => {
      onEventClick?.(eventsRef.current[index]);
    },
    [onEventClick]
  );

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  // Stable scrollToIndex callback for keyboard navigation
  const scrollToIndex = React.useCallback(
    (index: number) => {
      virtualizer.scrollToIndex(index, { align: 'auto' });
    },
    [virtualizer]
  );

  // Keyboard navigation for event rows (j/k/Enter)
  const { selectedIndex } = useKeyboardNavigation({
    events,
    onEventClick: onEventClick || (() => {}),
    scrollToIndex,
  });

  // Monitor scroll position for auto-switch to live
  const lastIsAtTopRef = React.useRef(true);
  React.useEffect(() => {
    const scrollEl = parentRef.current;
    if (!scrollEl || !onScrollStateChange) return;

    const handleScroll = () => {
      const isAtTop = scrollEl.scrollTop <= 10;
      if (isAtTop !== lastIsAtTopRef.current) {
        lastIsAtTopRef.current = isAtTop;
        onScrollStateChange(isAtTop);
      }
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [onScrollStateChange]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <TooltipProvider>
      <div className="flex flex-col h-[calc(100vh-280px)]">
        {/* Header */}
        <div className="flex items-center border-b border-border bg-muted/50 h-10 shrink-0 min-w-0 shadow-sm">
          <div className="w-[10%] min-w-[70px] px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Time
          </div>
          <div className="w-[14%] min-w-[110px] px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Type
          </div>
          <div className="w-[18%] min-w-[120px] px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            From
          </div>
          <div className="w-[18%] min-w-[120px] px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            To
          </div>
          <div className="hidden lg:block w-[18%] min-w-[130px] px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Destination
          </div>
          <div className="hidden md:block w-[10%] min-w-[70px] px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">
            Amount
          </div>
          <div className="w-[12%] min-w-[80px] px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Status
          </div>
        </div>

        {/* Body with virtual scrolling */}
        <div ref={parentRef} className="flex-1 overflow-auto">
          {loading ? (
            <div className="w-full">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center border-b border-border h-12">
                  <div className="w-[10%] min-w-[70px] px-2">
                    <div className="h-3 w-14 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="w-[14%] min-w-[110px] px-2">
                    <div className="h-5 w-20 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="w-[18%] min-w-[120px] px-2">
                    <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="w-[18%] min-w-[120px] px-2">
                    <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="hidden lg:block w-[18%] min-w-[130px] px-2">
                    <div className="h-3 w-28 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="hidden md:block w-[10%] min-w-[70px] px-2">
                    <div className="h-3 w-12 bg-muted animate-pulse rounded ml-auto" />
                  </div>
                  <div className="w-[12%] min-w-[80px] px-2">
                    <div className="h-3 w-14 bg-muted animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : connectionStatus === 'disconnected' || connectionStatus === 'error' ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <WifiOff className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium text-foreground">Disconnected</h3>
              <p className="text-sm">Unable to connect to agent. Attempting to reconnect...</p>
            </div>
          ) : events.length === 0 && hasActiveFilters ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <SearchX className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium text-foreground">No packets match your filters</h3>
              <p className="text-sm">Try adjusting or clearing your filters</p>
              {onClearFilters && (
                <Button variant="outline" size="sm" onClick={onClearFilters} className="mt-2">
                  Clear filters
                </Button>
              )}
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <Radio className="h-12 w-12 text-cyan-500 animate-pulse" />
              <h3 className="text-lg font-medium text-foreground">
                Waiting for packet activity...
              </h3>
              <p className="text-sm">
                Packets will appear here when your node receives or forwards ILP traffic
              </p>
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualItems.map((virtualRow) => {
                const event = events[virtualRow.index];
                const timestamp = normalizeTimestamp(event.timestamp);
                const packetId = getPacketId(event);
                const resolvedStatus = packetId ? packetStatusMap.get(packetId) : undefined;

                return (
                  <EventRow
                    key={`${timestamp}-${virtualRow.index}`}
                    event={event}
                    onSelect={handleRowSelect}
                    index={virtualRow.index}
                    resolvedStatus={resolvedStatus}
                    isSelected={selectedIndex === virtualRow.index}
                    isNew={isLiveMode && virtualRow.index < newEventCountRef.current}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination footer */}
        {showPagination && total !== undefined && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border shrink-0">
            <span className="text-sm text-muted-foreground">
              Showing {events.length} of {total.toLocaleString()} events
            </span>
            {events.length < total && onLoadMore && (
              <button
                onClick={onLoadMore}
                className="px-4 py-2 text-sm font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
              >
                Load More
              </button>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
