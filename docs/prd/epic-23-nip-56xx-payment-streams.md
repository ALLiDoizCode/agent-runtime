# Epic 23: NIP-56XX Payment Streams Protocol

## Executive Summary

Epic 23 implements NIP-56XX (Payment Streams), defining Nostr event kinds that replace the ILP STREAM protocol for payment coordination over Interledger. This keeps the Agent Society Protocol Nostr-native while leveraging ILP's atomic payment guarantees.

**Key Insight:** STREAM's coordination functions (session setup, flow control, receipts) can be replaced by Nostr events traveling inside ILP packets, while ILP's PREPARE/FULFILL/REJECT cycle handles the actual value transfer.

This epic is **HIGH** priority as it provides the foundation for all streaming payment use cases including live video, pay-per-use services, and continuous micropayments.

## Architecture

### Current vs Proposed

**Current (STREAM over ILP):**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Sender    │     │ Connectors  │     │  Receiver   │
│   STREAM ─────────── ILP Packets ─────── STREAM     │
│  (encrypt)  │     │  (route)    │     │ (decrypt)   │
└─────────────┘     └─────────────┘     └─────────────┘
```

**Proposed (NIP-56XX over ILP):**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Sender    │     │ Connectors  │     │  Receiver   │
│   Agent     │     │             │     │   Agent     │
├─────────────┤     │             │     ├─────────────┤
│  NIP-56XX   │     │             │     │  NIP-56XX   │
│  Events     │     │             │     │  Events     │
│  (TOON)  ─────────── ILP Packets ─────── (TOON)     │
│             │     │  (route)    │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Event Kinds

| Kind | Name              | Purpose                                 |
| ---- | ----------------- | --------------------------------------- |
| 5610 | StreamOpen        | Initialize a payment stream             |
| 5611 | StreamAccept      | Accept stream, return shared secret     |
| 5612 | StreamMoney       | Payment metadata (amount in ILP header) |
| 5613 | StreamReceipt     | Acknowledge received payment            |
| 5614 | StreamFlowControl | Advertise receive capacity              |
| 5615 | StreamClose       | Terminate stream                        |

### Payment Stream Flow

```
Sender Agent                              Receiver Agent
     │                                          │
     │  ILP PREPARE (amount: 0)                 │
     │  Data: TOON(Kind 5610: StreamOpen)       │
     │  stream_id, purpose, rate                │
     │─────────────────────────────────────────>│
     │                                          │
     │  ILP FULFILL                             │
     │  Data: TOON(Kind 5611: StreamAccept)     │
     │  shared_secret (NIP-44 encrypted)        │
     │<─────────────────────────────────────────│
     │                                          │
     │  [Begin streaming payments]              │
     │                                          │
     │  ILP PREPARE (amount: 1000)              │
     │  Condition: HMAC(secret, stream_id:seq)  │
     │  Data: TOON(Kind 5612: StreamMoney)      │
     │─────────────────────────────────────────>│
     │                                          │
     │  ILP FULFILL                             │
     │  Fulfillment: HMAC_preimage              │
     │  Data: TOON(Kind 5613: StreamReceipt)    │
     │<─────────────────────────────────────────│
     │                                          │
     │  [Continue at configured rate...]        │
     │                                          │
     │  ILP PREPARE (amount: 0)                 │
     │  Data: TOON(Kind 5615: StreamClose)      │
     │─────────────────────────────────────────>│
```

### Shared Secret & Condition Generation

Replace current all-zeros fulfillment with stream-aware HMAC:

```typescript
// Shared secret exchanged in StreamAccept (Kind 5611)
// Encrypted with NIP-44 to receiver's pubkey

function generateCondition(sharedSecret: Buffer, streamId: string, sequence: number): Buffer {
  const fulfillment = generateFulfillment(sharedSecret, streamId, sequence);
  return crypto.createHash('sha256').update(fulfillment).digest();
}

function generateFulfillment(sharedSecret: Buffer, streamId: string, sequence: number): Buffer {
  const data = Buffer.from(`${streamId}:${sequence}`);
  return crypto.createHmac('sha256', sharedSecret).update(data).digest();
}
```

## Package Structure

```
packages/connector/src/agent/
├── streams/
│   ├── index.ts
│   ├── types.ts                    # Event types, interfaces
│   ├── stream-open.ts              # Create & parse Kind 5610
│   ├── stream-accept.ts            # Create & parse Kind 5611
│   ├── stream-money.ts             # Create & parse Kind 5612
│   ├── stream-receipt.ts           # Create & parse Kind 5613
│   ├── stream-flow-control.ts      # Create & parse Kind 5614
│   ├── stream-close.ts             # Create & parse Kind 5615
│   ├── stream-manager.ts           # Manage stream lifecycle
│   ├── condition-generator.ts      # HMAC condition/fulfillment
│   └── __tests__/
│       ├── types.test.ts
│       ├── stream-open.test.ts
│       ├── stream-manager.test.ts
│       └── condition-generator.test.ts
├── ai/skills/
│   ├── open-payment-stream-skill.ts
│   ├── send-stream-payment-skill.ts
│   └── close-payment-stream-skill.ts
└── ...
```

## Configuration

```yaml
agent:
  streams:
    enabled: true
    maxOpenStreams: 100 # Max concurrent streams
    defaultExpirySeconds: 3600 # 1 hour default
    maxPaymentRate: 10000 # Max payments per second
    flowControl:
      defaultMaxReceive: 1000000 # Default receive window
      minReceiveThreshold: 10000 # Request more when below this
    conditionGeneration:
      algorithm: 'hmac-sha256' # Condition derivation algorithm
```

## Stories

| Story | Description                                | Status      |
| ----- | ------------------------------------------ | ----------- |
| 23.1  | Payment Stream Types & Schemas             | Not Started |
| 23.2  | StreamOpen Creation (Kind 5610)            | Not Started |
| 23.3  | StreamAccept & Secret Exchange (Kind 5611) | Not Started |
| 23.4  | StreamMoney Creation (Kind 5612)           | Not Started |
| 23.5  | StreamReceipt & Acknowledgment (Kind 5613) | Not Started |
| 23.6  | StreamFlowControl (Kind 5614)              | Not Started |
| 23.7  | StreamClose (Kind 5615)                    | Not Started |
| 23.8  | Condition/Fulfillment Generation           | Not Started |
| 23.9  | Stream Manager Lifecycle                   | Not Started |
| 23.10 | open_payment_stream Skill                  | Not Started |
| 23.11 | send_stream_payment Skill                  | Not Started |
| 23.12 | close_payment_stream Skill                 | Not Started |
| 23.13 | Integration Tests                          | Not Started |

---

## Story 23.1: Payment Stream Types & Schemas

### Description

Define TypeScript types and Zod schemas for payment stream events.

### Acceptance Criteria

1. `StreamPurpose` type: video_access, task_payment, subscription, tip, custom
2. `StreamState` type: pending, open, paused, closed
3. `StreamOpen` interface (Kind 5610) with all fields
4. `StreamAccept` interface (Kind 5611) with encrypted shared secret
5. `StreamMoney` interface (Kind 5612) with sequence and totals
6. `StreamReceipt` interface (Kind 5613) with received amounts
7. `StreamFlowControl` interface (Kind 5614) with window updates
8. `StreamClose` interface (Kind 5615) with final tallies
9. Zod schemas for all types
10. Constants for event kinds (5610-5615) and tag names

### Technical Notes

```typescript
// Event Kinds
const STREAM_OPEN_KIND = 5610;
const STREAM_ACCEPT_KIND = 5611;
const STREAM_MONEY_KIND = 5612;
const STREAM_RECEIPT_KIND = 5613;
const STREAM_FLOW_CONTROL_KIND = 5614;
const STREAM_CLOSE_KIND = 5615;

// Types
type StreamPurpose = 'video_access' | 'task_payment' | 'subscription' | 'tip' | 'custom';
type StreamState = 'pending' | 'open' | 'paused' | 'closed';
type CloseReason = 'complete' | 'cancelled' | 'error' | 'timeout';

interface StreamOpen {
  kind: 5610;
  streamId: string; // Unique stream identifier
  senderPubkey: string; // Sender's Nostr pubkey
  receiverPubkey: string; // Receiver's Nostr pubkey (p tag)
  purpose: StreamPurpose; // Stream purpose
  rate: {
    // Payment rate
    amount: bigint;
    unit: 'second' | 'minute' | 'hour' | 'chunk';
  };
  maxTotal?: bigint; // Maximum total payment
  asset?: string; // Asset code (USD, BTC, etc.)
  senderIlpAddress?: string; // Sender's ILP address (encrypted)
  content: string; // Additional context
  event: NostrEvent;
}

interface StreamAccept {
  kind: 5611;
  streamId: string;
  openEventId: string; // References StreamOpen event
  status: 'accepted' | 'rejected';
  sharedSecret?: string; // NIP-44 encrypted shared secret
  receiverIlpAddress?: string;
  maxReceive: bigint; // Initial flow control window
  assetCode?: string;
  assetScale?: number;
  rejectionReason?: string;
  event: NostrEvent;
}

interface StreamMoney {
  kind: 5612;
  streamId: string;
  sequence: number; // Monotonic sequence number
  totalSent: bigint; // Cumulative amount sent
  chunkRef?: string; // Optional reference to content chunk
  content: string; // Optional metadata
  event: NostrEvent;
}
// NOTE: Actual amount is in ILP PREPARE packet header, not event

interface StreamReceipt {
  kind: 5613;
  streamId: string;
  moneyEventId: string; // References StreamMoney event
  sequence: number;
  received: bigint; // Amount received (after exchange)
  totalReceived: bigint; // Cumulative total
  exchangeRate?: string; // Observed rate
  event: NostrEvent;
}
// NOTE: Fulfillment is in ILP FULFILL packet, not event

interface StreamFlowControl {
  kind: 5614;
  streamId: string;
  maxReceive: bigint; // Updated receive window
  currentOffset: bigint; // Current received amount
  rateLimit?: {
    // Optional rate limit
    amount: bigint;
    unit: 'second' | 'minute';
  };
  blocked?: boolean; // Sender is blocked
  event: NostrEvent;
}

interface StreamClose {
  kind: 5615;
  streamId: string;
  reason: CloseReason;
  finalSent: bigint;
  finalReceived: bigint;
  errorCode?: string;
  errorMessage?: string;
  event: NostrEvent;
}
```

---

## Story 23.2: StreamOpen Creation (Kind 5610)

### Description

Implement creation of StreamOpen events to initiate payment streams.

### Acceptance Criteria

1. Create Kind 5610 event with unique `stream_id` tag
2. Include `p` tag for receiver pubkey
3. Include `purpose` tag for stream purpose
4. Include `rate` tag with amount and unit
5. Optional `max_total` tag for maximum payment
6. Optional `asset` tag for asset code
7. Optional `ilp_address` tag (NIP-44 encrypted sender address)
8. Content contains stream description
9. Sign with sender's Nostr key
10. Return StreamOpen interface on success

### Technical Notes

```typescript
interface CreateStreamOpenParams {
  receiverPubkey: string;
  purpose: StreamPurpose;
  rate: { amount: bigint; unit: 'second' | 'minute' | 'hour' | 'chunk' };
  maxTotal?: bigint;
  asset?: string;
  description: string;
}

class StreamOpenCreator {
  create(params: CreateStreamOpenParams): NostrEvent {
    const streamId = this.generateStreamId(); // UUID or random hex

    const tags = [
      ['stream_id', streamId],
      ['p', params.receiverPubkey],
      ['purpose', params.purpose],
      ['rate', params.rate.amount.toString(), params.rate.unit],
    ];

    if (params.maxTotal !== undefined) {
      tags.push(['max_total', params.maxTotal.toString()]);
    }
    if (params.asset) {
      tags.push(['asset', params.asset]);
    }
    if (this.senderIlpAddress) {
      // Encrypt with receiver's pubkey
      const encrypted = await nip44.encrypt(
        this.senderPrivkey,
        params.receiverPubkey,
        this.senderIlpAddress
      );
      tags.push(['ilp_address', encrypted]);
    }

    return this.signer.createSignedEvent(5610, tags, params.description);
  }
}
```

---

## Story 23.3: StreamAccept & Secret Exchange (Kind 5611)

### Description

Implement StreamAccept to accept streams and exchange shared secrets.

### Acceptance Criteria

1. Create Kind 5611 event in response to StreamOpen
2. Include `e` tag referencing StreamOpen with `open` marker
3. Include `stream_id` tag matching open request
4. Include `status` tag (accepted/rejected)
5. Include `shared_secret` tag (NIP-44 encrypted) on accept
6. Include `max_receive` tag for initial flow control window
7. Include `ilp_address` tag (NIP-44 encrypted receiver address)
8. Optional `asset_code` and `asset_scale` tags
9. Rejection reason in content if rejected
10. Generate cryptographically secure shared secret (32 bytes)

### Technical Notes

```typescript
interface AcceptStreamParams {
  openEvent: StreamOpen;
  maxReceive: bigint;
  assetCode?: string;
  assetScale?: number;
}

interface RejectStreamParams {
  openEvent: StreamOpen;
  reason: string;
}

class StreamAcceptCreator {
  async accept(params: AcceptStreamParams): Promise<{ event: NostrEvent; sharedSecret: Buffer }> {
    // Generate 32-byte shared secret
    const sharedSecret = crypto.randomBytes(32);

    // Encrypt with sender's pubkey using NIP-44
    const encryptedSecret = await nip44.encrypt(
      this.receiverPrivkey,
      params.openEvent.senderPubkey,
      sharedSecret.toString('base64')
    );

    // Encrypt receiver's ILP address
    const encryptedIlpAddress = await nip44.encrypt(
      this.receiverPrivkey,
      params.openEvent.senderPubkey,
      this.receiverIlpAddress
    );

    const tags = [
      ['e', params.openEvent.event.id, '', 'open'],
      ['stream_id', params.openEvent.streamId],
      ['p', params.openEvent.senderPubkey],
      ['status', 'accepted'],
      ['shared_secret', encryptedSecret],
      ['max_receive', params.maxReceive.toString()],
      ['ilp_address', encryptedIlpAddress],
    ];

    if (params.assetCode) {
      tags.push(['asset_code', params.assetCode]);
    }
    if (params.assetScale !== undefined) {
      tags.push(['asset_scale', params.assetScale.toString()]);
    }

    const event = this.signer.createSignedEvent(5611, tags, '');

    return { event, sharedSecret };
  }

  reject(params: RejectStreamParams): NostrEvent {
    const tags = [
      ['e', params.openEvent.event.id, '', 'open'],
      ['stream_id', params.openEvent.streamId],
      ['p', params.openEvent.senderPubkey],
      ['status', 'rejected'],
    ];

    return this.signer.createSignedEvent(5611, tags, params.reason);
  }
}
```

---

## Story 23.4: StreamMoney Creation (Kind 5612)

### Description

Implement StreamMoney events for payment coordination.

### Acceptance Criteria

1. Create Kind 5612 event for each payment
2. Include `stream_id` tag
3. Include `sequence` tag (monotonically increasing)
4. Include `total_sent` tag (cumulative amount)
5. Optional `chunk_ref` tag for content reference
6. Content for optional metadata
7. Validate stream is open before creating
8. Track sequence numbers per stream
9. Coordinate with ILP PREPARE packet creation

### Technical Notes

```typescript
interface CreateStreamMoneyParams {
  stream: ActiveStream; // From StreamManager
  chunkRef?: string;
  metadata?: string;
}

class StreamMoneyCreator {
  create(params: CreateStreamMoneyParams): NostrEvent {
    const sequence = params.stream.nextSequence();
    const totalSent = params.stream.totalSent + params.stream.currentPayment;

    const tags = [
      ['stream_id', params.stream.id],
      ['sequence', sequence.toString()],
      ['total_sent', totalSent.toString()],
    ];

    if (params.chunkRef) {
      tags.push(['chunk_ref', params.chunkRef]);
    }

    return this.signer.createSignedEvent(5612, tags, params.metadata ?? '');
  }
}

// Note: The actual payment amount is in the ILP PREPARE packet
// The StreamMoney event provides coordination metadata
```

---

## Story 23.5: StreamReceipt & Acknowledgment (Kind 5613)

### Description

Implement StreamReceipt events for payment acknowledgment.

### Acceptance Criteria

1. Create Kind 5613 in response to StreamMoney
2. Include `e` tag referencing StreamMoney with `money` marker
3. Include `stream_id` tag
4. Include `sequence` tag matching StreamMoney
5. Include `received` tag (amount after exchange)
6. Include `total_received` tag (cumulative)
7. Optional `exchange_rate` tag
8. Validate sequence matches expected
9. Return in ILP FULFILL packet data

### Technical Notes

```typescript
interface CreateStreamReceiptParams {
  moneyEvent: StreamMoney;
  receivedAmount: bigint;
  totalReceived: bigint;
  exchangeRate?: string;
}

class StreamReceiptCreator {
  create(params: CreateStreamReceiptParams): NostrEvent {
    const tags = [
      ['e', params.moneyEvent.event.id, '', 'money'],
      ['stream_id', params.moneyEvent.streamId],
      ['sequence', params.moneyEvent.sequence.toString()],
      ['received', params.receivedAmount.toString()],
      ['total_received', params.totalReceived.toString()],
    ];

    if (params.exchangeRate) {
      tags.push(['exchange_rate', params.exchangeRate]);
    }

    return this.signer.createSignedEvent(5613, tags, '');
  }
}

// Note: The fulfillment is in the ILP FULFILL packet
// The StreamReceipt event provides confirmation metadata
```

---

## Story 23.6: StreamFlowControl (Kind 5614)

### Description

Implement flow control to manage payment rates.

### Acceptance Criteria

1. Create Kind 5614 to update receive window
2. Include `stream_id` tag
3. Include `max_receive` tag (updated window)
4. Include `current_offset` tag (current position)
5. Optional `rate_limit` tag to throttle payments
6. Optional `blocked` tag when sender should pause
7. Receiver sends proactively when window low
8. Sender respects flow control limits

### Technical Notes

```typescript
interface CreateFlowControlParams {
  streamId: string;
  maxReceive: bigint;
  currentOffset: bigint;
  rateLimit?: { amount: bigint; unit: 'second' | 'minute' };
  blocked?: boolean;
}

class StreamFlowControlCreator {
  create(params: CreateFlowControlParams): NostrEvent {
    const tags = [
      ['stream_id', params.streamId],
      ['max_receive', params.maxReceive.toString()],
      ['current_offset', params.currentOffset.toString()],
    ];

    if (params.rateLimit) {
      tags.push(['rate_limit', params.rateLimit.amount.toString(), params.rateLimit.unit]);
    }
    if (params.blocked) {
      tags.push(['blocked', 'true']);
    }

    return this.signer.createSignedEvent(5614, tags, '');
  }
}
```

---

## Story 23.7: StreamClose (Kind 5615)

### Description

Implement stream closure with final settlement.

### Acceptance Criteria

1. Create Kind 5615 to close stream
2. Include `stream_id` tag
3. Include `reason` tag (complete, cancelled, error, timeout)
4. Include `final_sent` tag
5. Include `final_received` tag
6. Optional `error_code` and `error_message` tags
7. Both parties can initiate close
8. Clean up stream state after close
9. Emit close event in ILP packet

### Technical Notes

```typescript
interface CreateStreamCloseParams {
  streamId: string;
  reason: CloseReason;
  finalSent: bigint;
  finalReceived: bigint;
  errorCode?: string;
  errorMessage?: string;
}

class StreamCloseCreator {
  create(params: CreateStreamCloseParams): NostrEvent {
    const tags = [
      ['stream_id', params.streamId],
      ['reason', params.reason],
      ['final_sent', params.finalSent.toString()],
      ['final_received', params.finalReceived.toString()],
    ];

    if (params.errorCode) {
      tags.push(['error_code', params.errorCode]);
    }

    return this.signer.createSignedEvent(5615, tags, params.errorMessage ?? '');
  }
}
```

---

## Story 23.8: Condition/Fulfillment Generation

### Description

Replace all-zeros fulfillment with stream-aware HMAC generation.

### Acceptance Criteria

1. Generate conditions from shared secret + stream ID + sequence
2. Generate fulfillments that satisfy conditions
3. Verify conditions match fulfillments
4. Use HMAC-SHA256 algorithm
5. Thread-safe condition generation
6. Cache recent conditions for verification
7. Integrate with existing packet handler
8. Backward compatible with non-stream packets

### Technical Notes

```typescript
class ConditionGenerator {
  private cache = new Map<string, { condition: Buffer; fulfillment: Buffer }>();

  generateCondition(sharedSecret: Buffer, streamId: string, sequence: number): Buffer {
    const fulfillment = this.generateFulfillment(sharedSecret, streamId, sequence);
    return crypto.createHash('sha256').update(fulfillment).digest();
  }

  generateFulfillment(sharedSecret: Buffer, streamId: string, sequence: number): Buffer {
    const data = Buffer.from(`${streamId}:${sequence}`);
    return crypto.createHmac('sha256', sharedSecret).update(data).digest();
  }

  verifyCondition(condition: Buffer, fulfillment: Buffer): boolean {
    const expected = crypto.createHash('sha256').update(fulfillment).digest();
    return condition.equals(expected);
  }

  // For receiver to verify incoming condition matches expected
  verifyIncomingCondition(
    sharedSecret: Buffer,
    streamId: string,
    sequence: number,
    condition: Buffer
  ): boolean {
    const expected = this.generateCondition(sharedSecret, streamId, sequence);
    return condition.equals(expected);
  }
}
```

---

## Story 23.9: Stream Manager Lifecycle

### Description

Implement stream state management and lifecycle.

### Acceptance Criteria

1. Track all active streams by stream ID
2. Handle stream open requests
3. Handle stream accept responses
4. Process incoming payments
5. Manage flow control windows
6. Handle stream close
7. Timeout expired streams
8. Emit events on state changes
9. Persist stream state for recovery
10. Thread-safe operations

### Technical Notes

```typescript
interface ActiveStream {
  id: string;
  state: StreamState;
  senderPubkey: string;
  receiverPubkey: string;
  sharedSecret: Buffer;
  ilpAddress: string;
  purpose: StreamPurpose;
  rate: { amount: bigint; unit: string };
  maxTotal?: bigint;

  // Counters
  sequence: number;
  totalSent: bigint;
  totalReceived: bigint;

  // Flow control
  maxReceive: bigint;
  currentOffset: bigint;
  blocked: boolean;

  // Timestamps
  openedAt: number;
  lastActivityAt: number;
  expiresAt?: number;
}

class StreamManager {
  private streams = new Map<string, ActiveStream>();

  async handleStreamOpen(
    event: NostrEvent,
    ilpPacket: ILPPreparePacket
  ): Promise<ILPFulfillPacket | ILPRejectPacket>;
  async handleStreamMoney(
    event: NostrEvent,
    ilpPacket: ILPPreparePacket
  ): Promise<ILPFulfillPacket | ILPRejectPacket>;
  async handleStreamClose(
    event: NostrEvent,
    ilpPacket: ILPPreparePacket
  ): Promise<ILPFulfillPacket | ILPRejectPacket>;

  // Sender-side
  async openStream(params: CreateStreamOpenParams): Promise<ActiveStream>;
  async sendPayment(streamId: string, amount: bigint): Promise<StreamReceipt>;
  async closeStream(streamId: string, reason: CloseReason): Promise<void>;

  // Flow control
  updateFlowControl(streamId: string, flowControl: StreamFlowControl): void;

  // Lifecycle
  getStream(streamId: string): ActiveStream | undefined;
  getActiveStreams(): ActiveStream[];
  private expireTimedOutStreams(): void;
}
```

---

## Story 23.10: open_payment_stream Skill

### Description

Create AI skill to open payment streams.

### Acceptance Criteria

1. Skill registered as `open_payment_stream`
2. Parameters: receiverPubkey, purpose, rate, maxTotal, description
3. Validates receiver is reachable
4. Creates StreamOpen event
5. Sends via ILP packet
6. Waits for StreamAccept response
7. Returns stream ID and status
8. Handles rejection gracefully

### Technical Notes

```typescript
const openPaymentStreamSkill: AgentSkill<typeof schema> = {
  name: 'open_payment_stream',
  description: 'Open a streaming payment channel with another agent',
  parameters: z.object({
    receiverPubkey: z.string().describe('Nostr pubkey of the receiver'),
    purpose: z.enum(['video_access', 'task_payment', 'subscription', 'tip', 'custom']),
    rateAmount: z.number().describe('Payment amount per unit'),
    rateUnit: z.enum(['second', 'minute', 'hour', 'chunk']),
    maxTotal: z.number().optional().describe('Maximum total payment'),
    description: z.string().describe('Description of the stream purpose'),
  }),
  execute: async (params, context) => {
    const stream = await context.streamManager.openStream({
      receiverPubkey: params.receiverPubkey,
      purpose: params.purpose,
      rate: { amount: BigInt(params.rateAmount), unit: params.rateUnit },
      maxTotal: params.maxTotal ? BigInt(params.maxTotal) : undefined,
      description: params.description,
    });

    return {
      streamId: stream.id,
      status: stream.state,
      maxReceive: stream.maxReceive.toString(),
    };
  },
};
```

---

## Story 23.11: send_stream_payment Skill

### Description

Create AI skill to send payments on an open stream.

### Acceptance Criteria

1. Skill registered as `send_stream_payment`
2. Parameters: streamId, amount, chunkRef
3. Validates stream is open
4. Creates StreamMoney event
5. Sends ILP PREPARE with correct condition
6. Returns receipt on success
7. Handles flow control blocking
8. Respects rate limits

---

## Story 23.12: close_payment_stream Skill

### Description

Create AI skill to close payment streams.

### Acceptance Criteria

1. Skill registered as `close_payment_stream`
2. Parameters: streamId, reason
3. Creates StreamClose event
4. Sends via ILP packet
5. Cleans up stream state
6. Returns final settlement totals
7. Handles already-closed streams

---

## Story 23.13: Integration Tests

### Description

Comprehensive integration tests for payment streams.

### Acceptance Criteria

1. Test full stream lifecycle: open → payments → close
2. Test flow control behavior
3. Test condition/fulfillment verification
4. Test rejection handling
5. Test timeout/expiration
6. Test concurrent streams
7. Test error recovery
8. Performance benchmarks (payments per second)

---

## Dependencies

- **Epic 13** (Agent Society Protocol) — Nostr events, TOON encoding
- **Epic 16** (AI Agent Node) — Skills, AI dispatcher
- **NIP-44** — Encrypted direct messages for secret exchange

## Risk Mitigation

| Risk               | Mitigation                                  |
| ------------------ | ------------------------------------------- |
| Secret compromise  | Unique secret per stream, NIP-44 encryption |
| Replay attacks     | Sequence numbers, condition uniqueness      |
| Flow control abuse | Rate limiting, maximum windows              |
| Stream exhaustion  | Max open streams, cleanup timeouts          |

## Success Metrics

- Stream setup latency < 500ms
- Payment throughput > 100/second per stream
- Zero invalid fulfillment acceptance
- 99.9% receipt delivery success
- Stream state recovery after restart

## Comparison: STREAM vs NIP-56XX

| Feature         | STREAM                      | NIP-56XX                |
| --------------- | --------------------------- | ----------------------- |
| Transport       | Dedicated STREAM connection | ILP packets (existing)  |
| Encryption      | AES-256-GCM envelope        | BTP/TLS + signed events |
| Authentication  | Shared secret               | Nostr signatures        |
| Flow control    | Binary frames               | Event kind 5614         |
| Receipts        | Binary frames               | Event kind 5613         |
| Discoverability | None                        | Query Nostr relays      |
| Social context  | None                        | Full Nostr graph        |
