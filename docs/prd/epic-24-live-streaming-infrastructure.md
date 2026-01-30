# Epic 24: Live Streaming Infrastructure Integration

## Executive Summary

Epic 24 integrates live streaming infrastructure with the Agent Society Protocol, enabling real-time video delivery with per-second micropayments. This combines Livepeer for transcoding, WebRTC/LL-HLS for video delivery, and NIP-56XX (Epic 23) for payment streams.

**Key Insight:** The Agent Society Protocol handles payments and coordination (ILP + Nostr), while dedicated streaming protocols handle media delivery. Livepeer provides 80% cost savings over centralized transcoding.

This epic is **HIGH** priority as it demonstrates a compelling, tangible use case for the Agent Society Protocol with significant market opportunity ($76-113B live streaming market).

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LIVE STREAMING VIA AGENT SOCIETY                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Creator App         Transcoding           CDN/Relay         Viewer App    │
│   ┌─────────┐        ┌─────────────┐       ┌─────────┐       ┌─────────┐   │
│   │  OBS    │───────>│  Livepeer   │──────>│  Edge   │──────>│ Player  │   │
│   │  RTMP   │ Video  │  Network    │ HLS   │  Nodes  │ LL-HLS│         │   │
│   └─────────┘        └─────────────┘       └─────────┘       └─────────┘   │
│        │                   │                    │                  │         │
│        │                   │                    │                  │         │
│   ┌─────────┐        ┌─────────────┐       ┌─────────┐       ┌─────────┐   │
│   │ Streamer│        │ Transcoding │       │  Relay  │       │ Viewer  │   │
│   │  Agent  │<──────>│   Agent     │<─────>│  Agent  │<─────>│  Agent  │   │
│   └─────────┘        └─────────────┘       └─────────┘       └─────────┘   │
│        │                   │                    │                  │         │
│        └───────────────────┴────────────────────┴──────────────────┘         │
│                              ILP + Nostr                                     │
│                        (Payments + Coordination)                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Agent Roles

| Agent Type            | Responsibility                  | Revenue Source              |
| --------------------- | ------------------------------- | --------------------------- |
| **Streamer Agent**    | Stream metadata, access control | Viewer payments (85-95%)    |
| **Transcoding Agent** | Multi-bitrate encoding          | Per-minute fees ($0.02/min) |
| **Relay Agent**       | CDN, edge delivery              | Per-GB bandwidth fees       |
| **Viewer Agent**      | Payment channel, playback       | N/A (pays for content)      |

### Payment Flow

```
Viewer Agent ──(ILP Payment)──> Relay Agent ──(split)──> Transcoding Agent
                                    │                           │
                                    │         ┌─────────────────┘
                                    ▼         ▼
                              Creator Agent (85-95%)

Per-Second Flow:
  1. Viewer opens NIP-56XX stream (Kind 5610)
  2. Creator accepts (Kind 5611)
  3. Viewer sends 1000 units/second (Kind 5612)
  4. Creator returns receipts (Kind 5613)
  5. Video chunks delivered via LL-HLS
```

### Event Kinds

| Kind      | Purpose                           |
| --------- | --------------------------------- |
| 30311     | Live Stream Announcement (NIP-53) |
| 1311      | Live Chat Message (NIP-53)        |
| 5610-5615 | Payment Stream (Epic 23)          |
| 5650      | Stream Access Grant               |
| 5651      | Stream Quality Request            |

## Package Structure

```
packages/connector/src/agent/
├── streaming/
│   ├── index.ts
│   ├── types.ts                    # Streaming types
│   ├── stream-announcement.ts      # Kind 30311 (NIP-53)
│   ├── stream-access.ts            # Access control
│   ├── livepeer-integration.ts     # Livepeer API client
│   ├── playback-session.ts         # Viewer session management
│   ├── __tests__/
│   │   ├── stream-announcement.test.ts
│   │   └── playback-session.test.ts
├── ai/skills/
│   ├── announce-stream-skill.ts
│   ├── request-stream-access-skill.ts
│   └── ...
└── ...

packages/connector/src/streaming/
├── livepeer/
│   ├── client.ts                   # Livepeer REST API client
│   ├── stream-manager.ts           # Stream lifecycle
│   ├── webhook-handler.ts          # Livepeer webhooks
│   └── types.ts
├── playback/
│   ├── hls-manifest.ts             # HLS manifest generation
│   ├── segment-server.ts           # Segment delivery
│   └── access-token.ts             # Access token validation
└── __tests__/
```

## Configuration

```yaml
agent:
  streaming:
    enabled: true
    role: 'viewer' | 'streamer' | 'relay' | 'transcoder'

    # Streamer config
    streamer:
      rtmpIngestUrl: 'rtmp://rtmp.livepeer.com/live'
      defaultPrice:
        amount: 1000
        unit: 'second'
        asset: 'USD'
      maxConcurrentViewers: 10000

    # Viewer config
    viewer:
      maxPaymentRate: 5000          # Max units per second
      bufferSeconds: 5              # Payment buffer ahead
      preferredQuality: '1080p'

    # Transcoding config (Livepeer)
    livepeer:
      apiKey: '${LIVEPEER_API_KEY}'
      webhookSecret: '${LIVEPEER_WEBHOOK_SECRET}'
      profiles:
        - name: '1080p'
          bitrate: 6000000
          fps: 30
          width: 1920
          height: 1080
        - name: '720p'
          bitrate: 3000000
          fps: 30
          width: 1280
          height: 720
        - name: '480p'
          bitrate: 1500000
          fps: 30
          width: 854
          height: 480

    # Relay/CDN config
    relay:
      cacheDirectory: '/var/cache/m2m-streaming'
      maxCacheSize: '10GB'
      pricePerGB: 5000               # In smallest currency unit
```

## Stories

| Story | Description                      | Status      |
| ----- | -------------------------------- | ----------- |
| 24.1  | Streaming Types & Schemas        | Not Started |
| 24.2  | Stream Announcement (Kind 30311) | Not Started |
| 24.3  | Livepeer API Integration         | Not Started |
| 24.4  | Stream Lifecycle Management      | Not Started |
| 24.5  | Viewer Payment Session           | Not Started |
| 24.6  | Access Token & Verification      | Not Started |
| 24.7  | HLS Playback Integration         | Not Started |
| 24.8  | Chat Integration (Kind 1311)     | Not Started |
| 24.9  | announce_stream Skill            | Not Started |
| 24.10 | request_stream_access Skill      | Not Started |
| 24.11 | Relay Agent Implementation       | Not Started |
| 24.12 | Integration Tests                | Not Started |

---

## Story 24.1: Streaming Types & Schemas

### Description

Define TypeScript types and schemas for live streaming.

### Acceptance Criteria

1. `StreamStatus` type: planned, live, ended
2. `StreamAnnouncement` interface (Kind 30311)
3. `StreamAccessGrant` interface (Kind 5650)
4. `StreamQualityProfile` interface
5. `ViewerSession` interface
6. `LivepeerStream` interface (API response)
7. Zod schemas for validation
8. Constants for event kinds

### Technical Notes

```typescript
// Event Kinds
const STREAM_ANNOUNCEMENT_KIND = 30311; // NIP-53
const STREAM_CHAT_KIND = 1311; // NIP-53
const STREAM_ACCESS_GRANT_KIND = 5650;
const STREAM_QUALITY_REQUEST_KIND = 5651;

// Types
type StreamStatus = 'planned' | 'live' | 'ended';
type StreamQuality = '480p' | '720p' | '1080p' | '4k';

interface StreamAnnouncement {
  kind: 30311;
  id: string; // d tag (unique stream ID)
  title: string;
  summary?: string;
  image?: string;
  status: StreamStatus;
  starts?: number; // Unix timestamp
  ends?: number;
  streaming?: string; // Playback URL
  recording?: string; // VOD URL after stream
  currentParticipants?: number;
  totalParticipants?: number;
  participants?: Array<{
    pubkey: string;
    role: 'Host' | 'Speaker' | 'Participant';
  }>;
  relays?: string[];
  tags?: string[]; // t tags for categories

  // Payment configuration
  price?: {
    amount: bigint;
    unit: 'second' | 'minute' | 'hour';
    asset: string;
  };
  freePreview?: number; // Seconds of free preview
  event: NostrEvent;
}

interface StreamAccessGrant {
  kind: 5650;
  streamId: string; // References stream announcement
  viewerPubkey: string;
  grantedAt: number;
  expiresAt: number;
  accessToken: string; // JWT or signed token
  playbackUrl: string; // HLS URL with token
  qualities: StreamQuality[];
  event: NostrEvent;
}

interface ViewerSession {
  viewerPubkey: string;
  streamId: string;
  paymentStreamId: string; // NIP-56XX stream ID
  accessToken: string;
  grantedAt: number;
  expiresAt: number;
  totalPaid: bigint;
  watchTimeSeconds: number;
}

interface LivepeerStream {
  id: string;
  name: string;
  streamKey: string;
  playbackId: string;
  rtmpIngestUrl: string;
  playbackUrl: string;
  profiles: StreamQualityProfile[];
  isActive: boolean;
  createdAt: number;
}

interface StreamQualityProfile {
  name: string;
  bitrate: number;
  fps: number;
  width: number;
  height: number;
}
```

---

## Story 24.2: Stream Announcement (Kind 30311)

### Description

Implement NIP-53 stream announcements for discovery.

### Acceptance Criteria

1. Create Kind 30311 addressable event
2. Include `d` tag for unique stream identifier
3. Include `title` tag
4. Include `status` tag (planned/live/ended)
5. Include `streaming` tag with playback URL
6. Include payment configuration tags
7. Optional `starts`/`ends` tags for scheduling
8. Optional `image` tag for thumbnail
9. Optional `t` tags for categories
10. Update event when stream status changes

### Technical Notes

```typescript
interface CreateStreamAnnouncementParams {
  title: string;
  summary?: string;
  image?: string;
  status: StreamStatus;
  starts?: number;
  streamingUrl?: string;
  price?: { amount: bigint; unit: string; asset: string };
  freePreview?: number;
  tags?: string[];
}

class StreamAnnouncementCreator {
  create(params: CreateStreamAnnouncementParams): NostrEvent {
    const streamId = this.generateStreamId();

    const tags = [
      ['d', streamId],
      ['title', params.title],
      ['status', params.status],
    ];

    if (params.summary) tags.push(['summary', params.summary]);
    if (params.image) tags.push(['image', params.image]);
    if (params.starts) tags.push(['starts', params.starts.toString()]);
    if (params.streamingUrl) tags.push(['streaming', params.streamingUrl]);

    // Payment configuration
    if (params.price) {
      tags.push(['price', params.price.amount.toString(), params.price.unit, params.price.asset]);
    }
    if (params.freePreview) {
      tags.push(['free_preview', params.freePreview.toString()]);
    }

    // Categories
    for (const tag of params.tags ?? []) {
      tags.push(['t', tag]);
    }

    return this.signer.createSignedEvent(30311, tags, params.summary ?? '');
  }

  updateStatus(streamId: string, status: StreamStatus, streamingUrl?: string): NostrEvent {
    // Create updated addressable event
  }
}
```

---

## Story 24.3: Livepeer API Integration

### Description

Integrate with Livepeer REST API for transcoding.

### Acceptance Criteria

1. `LivepeerClient` class for API calls
2. Create stream with transcoding profiles
3. Get stream status and details
4. Delete stream
5. Handle webhook events (stream.started, stream.idle, recording.ready)
6. Error handling with retries
7. Rate limiting
8. API key authentication

### Technical Notes

```typescript
interface LivepeerConfig {
  apiKey: string;
  webhookSecret: string;
  baseUrl: string;
}

class LivepeerClient {
  constructor(private config: LivepeerConfig) {}

  async createStream(params: {
    name: string;
    profiles: StreamQualityProfile[];
  }): Promise<LivepeerStream> {
    const response = await fetch(`${this.config.baseUrl}/api/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: params.name,
        profiles: params.profiles.map((p) => ({
          name: p.name,
          bitrate: p.bitrate,
          fps: p.fps,
          width: p.width,
          height: p.height,
        })),
      }),
    });

    if (!response.ok) {
      throw new LivepeerError('Failed to create stream', response.status);
    }

    return await response.json();
  }

  async getStream(streamId: string): Promise<LivepeerStream> {}
  async deleteStream(streamId: string): Promise<void> {}

  // Webhook verification
  verifyWebhook(signature: string, body: string): boolean {
    const expected = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(body)
      .digest('hex');
    return signature === expected;
  }
}
```

---

## Story 24.4: Stream Lifecycle Management

### Description

Manage stream lifecycle from creation to archival.

### Acceptance Criteria

1. Create stream (Livepeer + announcement)
2. Start stream (status → live)
3. Handle viewer connections
4. Track concurrent viewers
5. End stream (status → ended)
6. Handle VOD recording
7. Archive/delete stream
8. Emit telemetry events

### Technical Notes

```typescript
class StreamLifecycleManager {
  private streams = new Map<string, ManagedStream>();

  async createStream(params: CreateStreamParams): Promise<ManagedStream> {
    // 1. Create Livepeer stream
    const livepeerStream = await this.livepeerClient.createStream({
      name: params.title,
      profiles: this.config.profiles,
    });

    // 2. Create Nostr announcement
    const announcement = await this.announcementCreator.create({
      title: params.title,
      status: 'planned',
      streamingUrl: livepeerStream.playbackUrl,
      price: params.price,
    });

    // 3. Store managed stream
    const stream: ManagedStream = {
      id: announcement.id,
      livepeerStreamId: livepeerStream.id,
      announcement,
      livepeerStream,
      viewers: new Map(),
      status: 'planned',
    };

    this.streams.set(stream.id, stream);
    return stream;
  }

  async handleWebhook(event: LivepeerWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'stream.started':
        await this.transitionToLive(event.streamId);
        break;
      case 'stream.idle':
        await this.handleStreamIdle(event.streamId);
        break;
      case 'recording.ready':
        await this.handleRecordingReady(event.streamId, event.recordingUrl);
        break;
    }
  }

  private async transitionToLive(streamId: string): Promise<void> {
    const stream = this.getStreamByLivepeerId(streamId);
    if (!stream) return;

    // Update Nostr announcement
    await this.announcementCreator.updateStatus(stream.id, 'live');
    stream.status = 'live';

    this.emit('stream:live', stream);
  }
}
```

---

## Story 24.5: Viewer Payment Session

### Description

Manage viewer payment sessions for stream access.

### Acceptance Criteria

1. Handle access request from viewer
2. Open NIP-56XX payment stream (Epic 23)
3. Verify payment rate meets stream price
4. Grant access on payment confirmation
5. Track payment totals
6. Handle payment stream close
7. Revoke access on payment failure
8. Support free preview period

### Technical Notes

```typescript
class ViewerPaymentSession {
  constructor(
    private streamManager: StreamLifecycleManager,
    private paymentStreamManager: StreamManager // Epic 23
  ) {}

  async handleAccessRequest(
    streamId: string,
    viewerPubkey: string,
    paymentStreamOpenEvent: StreamOpen
  ): Promise<StreamAccessGrant> {
    const stream = this.streamManager.getStream(streamId);
    if (!stream) throw new StreamNotFoundError(streamId);

    // Verify payment rate meets price
    if (stream.price) {
      const requiredRate = this.normalizeToPerSecond(stream.price);
      const offeredRate = this.normalizeToPerSecond({
        amount: paymentStreamOpenEvent.rate.amount,
        unit: paymentStreamOpenEvent.rate.unit,
      });

      if (offeredRate < requiredRate) {
        throw new InsufficientPaymentRateError(requiredRate, offeredRate);
      }
    }

    // Accept payment stream
    const { sharedSecret } = await this.paymentStreamManager.handleStreamOpen(
      paymentStreamOpenEvent.event,
      {
        /* ILP packet */
      }
    );

    // Generate access token
    const accessToken = await this.generateAccessToken(streamId, viewerPubkey);

    // Create access grant event
    const grant = this.createAccessGrant({
      streamId,
      viewerPubkey,
      accessToken,
      playbackUrl: this.getPlaybackUrl(stream, accessToken),
      qualities: stream.livepeerStream.profiles.map((p) => p.name as StreamQuality),
    });

    // Track session
    this.sessions.set(viewerPubkey, {
      viewerPubkey,
      streamId,
      paymentStreamId: paymentStreamOpenEvent.streamId,
      accessToken,
      grantedAt: Date.now(),
      expiresAt: Date.now() + 3600000, // 1 hour
      totalPaid: 0n,
      watchTimeSeconds: 0,
    });

    return grant;
  }

  async handlePaymentReceived(viewerPubkey: string, receipt: StreamReceipt): Promise<void> {
    const session = this.sessions.get(viewerPubkey);
    if (!session) return;

    session.totalPaid = receipt.totalReceived;
    session.watchTimeSeconds = this.calculateWatchTime(session);

    // Extend access token expiry
    session.expiresAt = Date.now() + 60000; // 1 more minute

    this.emit('payment:received', { session, receipt });
  }
}
```

---

## Story 24.6: Access Token & Verification

### Description

Implement access tokens for playback authorization.

### Acceptance Criteria

1. Generate JWT access tokens
2. Include stream ID, viewer pubkey, expiry
3. Sign with agent's private key
4. Verify token on playback requests
5. Handle token refresh
6. Revoke tokens on payment failure
7. Token includes allowed qualities

### Technical Notes

```typescript
interface AccessTokenPayload {
  streamId: string;
  viewerPubkey: string;
  qualities: StreamQuality[];
  iat: number;
  exp: number;
}

class AccessTokenManager {
  async generateToken(
    streamId: string,
    viewerPubkey: string,
    qualities: StreamQuality[],
    expiresIn: number = 3600
  ): Promise<string> {
    const payload: AccessTokenPayload = {
      streamId,
      viewerPubkey,
      qualities,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + expiresIn,
    };

    // Sign with Nostr key (secp256k1)
    const message = JSON.stringify(payload);
    const signature = await this.signer.sign(message);

    // Return base64url encoded
    return base64url.encode(JSON.stringify({ payload, signature }));
  }

  async verifyToken(token: string): Promise<AccessTokenPayload> {
    const decoded = JSON.parse(base64url.decode(token));
    const { payload, signature } = decoded;

    // Verify signature
    const message = JSON.stringify(payload);
    const valid = await this.signer.verify(message, signature, this.pubkey);

    if (!valid) throw new InvalidTokenError('Invalid signature');
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new TokenExpiredError();
    }

    return payload;
  }
}
```

---

## Story 24.7: HLS Playback Integration

### Description

Integrate HLS playback with access token verification.

### Acceptance Criteria

1. Proxy HLS manifest requests
2. Verify access token on each request
3. Inject token into segment URLs
4. Support quality selection
5. Handle Livepeer playback URLs
6. Support LL-HLS for low latency
7. Track playback events

### Technical Notes

```typescript
class HLSPlaybackServer {
  constructor(
    private accessTokenManager: AccessTokenManager,
    private livepeerClient: LivepeerClient
  ) {}

  // Express route handler
  async handleManifestRequest(req: Request, res: Response): Promise<void> {
    const { streamId, token } = req.params;

    // Verify access
    const payload = await this.accessTokenManager.verifyToken(token);
    if (payload.streamId !== streamId) {
      throw new AccessDeniedError('Token stream mismatch');
    }

    // Get Livepeer manifest
    const stream = await this.livepeerClient.getStream(streamId);
    const manifest = await fetch(stream.playbackUrl).then((r) => r.text());

    // Inject token into segment URLs
    const modifiedManifest = this.injectTokenIntoManifest(manifest, token);

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(modifiedManifest);
  }

  async handleSegmentRequest(req: Request, res: Response): Promise<void> {
    const { token, segment } = req.params;

    // Verify access (quick check)
    await this.accessTokenManager.verifyToken(token);

    // Proxy segment from Livepeer CDN
    const segmentUrl = this.buildSegmentUrl(segment);
    const segmentResponse = await fetch(segmentUrl);

    res.setHeader('Content-Type', 'video/mp2t');
    segmentResponse.body.pipe(res);
  }

  private injectTokenIntoManifest(manifest: string, token: string): string {
    // Replace segment URLs with tokenized versions
    return manifest.replace(/^([^#].*\.ts)$/gm, (match) => `${match}?token=${token}`);
  }
}
```

---

## Story 24.8: Chat Integration (Kind 1311)

### Description

Integrate live chat with paid messages.

### Acceptance Criteria

1. Create Kind 1311 chat messages (NIP-53)
2. Reference stream via `a` tag
3. Optional payment with chat message
4. Display sender info
5. Rate limiting for spam prevention
6. Moderation support
7. Chat history retrieval

### Technical Notes

```typescript
interface CreateChatMessageParams {
  streamId: string;
  content: string;
  paymentAmount?: bigint;
}

class StreamChatManager {
  async sendChatMessage(params: CreateChatMessageParams): Promise<NostrEvent> {
    const tags = [['a', `30311:${this.streamerPubkey}:${params.streamId}`]];

    // If payment included, reference payment receipt
    if (params.paymentAmount) {
      const receipt = await this.paymentStreamManager.sendPayment(
        params.streamId,
        params.paymentAmount
      );
      tags.push(['payment', receipt.event.id, params.paymentAmount.toString()]);
    }

    return this.signer.createSignedEvent(1311, tags, params.content);
  }

  async getChatHistory(streamId: string, limit: number = 100): Promise<NostrEvent[]> {
    // Query relays for Kind 1311 events with matching `a` tag
  }
}
```

---

## Story 24.9: announce_stream Skill

### Description

Create AI skill to announce live streams.

### Acceptance Criteria

1. Skill registered as `announce_stream`
2. Parameters: title, summary, price, tags, scheduledStart
3. Creates Livepeer stream
4. Creates Nostr announcement
5. Returns stream ID and ingest URL
6. Handles validation errors

---

## Story 24.10: request_stream_access Skill

### Description

Create AI skill for viewers to request stream access.

### Acceptance Criteria

1. Skill registered as `request_stream_access`
2. Parameters: streamId, maxPayment, preferredQuality
3. Opens payment stream (NIP-56XX)
4. Receives access grant
5. Returns playback URL
6. Handles rejection/insufficient funds

---

## Story 24.11: Relay Agent Implementation

### Description

Implement relay agent for CDN-like delivery.

### Acceptance Criteria

1. Cache video segments locally
2. Serve segments to viewers
3. Charge per-GB bandwidth
4. Geographic routing
5. Peer discovery via social graph
6. Load balancing across relays
7. Bandwidth monitoring

---

## Story 24.12: Integration Tests

### Description

Comprehensive integration tests for live streaming.

### Acceptance Criteria

1. Test full stream lifecycle
2. Test viewer payment flow
3. Test access grant/revoke
4. Test HLS playback
5. Test chat integration
6. Test Livepeer webhooks
7. Test concurrent viewers
8. Performance benchmarks

---

## Dependencies

- **Epic 23** (NIP-56XX Payment Streams) — Payment coordination
- **Epic 13** (Agent Society Protocol) — Nostr events
- **Epic 16** (AI Agent Node) — Skills
- **NIP-53** — Live Activities specification

## External Dependencies

- **Livepeer** — Transcoding network ($0.02/min)
- **Cloudflare/CDN** — Fallback delivery (optional)

## Risk Mitigation

| Risk                        | Mitigation                              |
| --------------------------- | --------------------------------------- |
| Livepeer downtime           | Multi-orchestrator redundancy, fallback |
| Latency spikes              | LL-HLS, geographic relay distribution   |
| Payment failures mid-stream | Buffer payments, graceful degradation   |
| Content piracy              | Watermarking, tokenized URLs            |

## Success Metrics

- Stream setup to first viewer < 30 seconds
- Glass-to-glass latency < 5 seconds (LL-HLS)
- Payment processing < 100ms
- 99% segment delivery success
- Creator revenue share > 90%

## Economic Model

### Cost Comparison

| Service     | Centralized    | Agent Society        | Savings |
| ----------- | -------------- | -------------------- | ------- |
| Transcoding | $0.18-0.21/min | $0.02/min (Livepeer) | 80-90%  |
| CDN         | $0.02-0.04/GB  | $0.01/GB (P2P relay) | 50-75%  |

### Revenue Distribution

| Role       | Share  | Example (100 viewers @ $0.10/min) |
| ---------- | ------ | --------------------------------- |
| Creator    | 85-90% | $8.50-9.00/min                    |
| Relay      | 5-8%   | $0.50-0.80/min                    |
| Transcoder | 3-5%   | $0.30-0.50/min                    |
| Protocol   | 2%     | $0.20/min                         |

### Break-Even Analysis

| Viewers | Revenue/Hour | Costs/Hour | Profit/Hour |
| ------- | ------------ | ---------- | ----------- |
| 10      | $60          | $15        | $45         |
| 100     | $600         | $25        | $575        |
| 1,000   | $6,000       | $100       | $5,900      |
