# @crosstown/connector

[![npm](https://img.shields.io/npm/v/@crosstown/connector)](https://www.npmjs.com/package/@crosstown/connector)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

> ILP connector node for AI agent payment networks. Routes messages, tracks balances, settles on-chain.

This is the core package of the [connector](https://github.com/ALLiDoizCode/connector) monorepo. See the root README for full usage documentation.

## Install

```bash
npm install @crosstown/connector
```

## What's Inside

- **ILP Packet Routing** — RFC-0027 compliant packet forwarding with configurable routing tables
- **BTP Peers** — WebSocket-based peer connections using Bilateral Transfer Protocol (RFC-0023)
- **EVM Settlement** — Payment channels on Base L2 (EVM) with per-packet claims via BTP protocolData
- **Accounting** — In-memory ledger (default, zero dependencies) or TigerBeetle (optional, high-throughput)
- **Per-Hop Notification** — Fire-and-forget BLS notifications at intermediate hops for transit observability
- **Explorer UI** — Built-in real-time dashboard for packet flow, balances, and settlement monitoring
- **Admin API** — HTTP endpoints for peer management, balance queries, and ILP packet sending
- **CLI** — `npx connector setup`, `health`, `validate` commands

## Quick Example

```typescript
import { ConnectorNode, createLogger } from '@crosstown/connector';

const node = new ConnectorNode('config.yaml', createLogger('my-agent', 'info'));

node.setPacketHandler(async (request) => {
  console.log(`Received ${request.amount} tokens`);
  return { accept: true };
});

await node.start();
```

## Embedded Mode (Recommended)

For programmatic usage, pass a `ConnectorConfig` object directly. This is the recommended pattern for agent runtimes and integration tests:

```typescript
import { ConnectorNode } from '@crosstown/connector';
import type { ConnectorConfig } from '@crosstown/connector';
import pino from 'pino';

// --- Node A: sender / intermediate hop ---
const configA: ConnectorConfig = {
  nodeId: 'connector-a',
  btpServerPort: 4000,
  healthCheckPort: 8080,
  deploymentMode: 'embedded',
  adminApi: { enabled: false },
  localDelivery: { enabled: false },
  settlementInfra: {
    enabled: true,
    rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/YOUR_KEY',
    registryAddress: '0xRegistryAddress...',
    tokenAddress: '0xTokenAddress...',
    privateKey: process.env.EVM_PRIVATE_KEY!,
  },
  peers: [],
  routes: [],
  environment: 'production',
};

// --- Node B: receiver ---
const configB: ConnectorConfig = {
  nodeId: 'connector-b',
  btpServerPort: 4001,
  healthCheckPort: 8081,
  deploymentMode: 'embedded',
  adminApi: { enabled: false },
  localDelivery: {
    enabled: true,
    handlerUrl: 'http://my-bls:3100',
    timeout: 5000,
    perHopNotification: true, // fire-and-forget transit notifications
  },
  settlementInfra: {
    enabled: true,
    rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/YOUR_KEY',
    registryAddress: '0xRegistryAddress...',
    tokenAddress: '0xTokenAddress...',
    privateKey: process.env.EVM_PRIVATE_KEY_B!,
  },
  peers: [],
  routes: [],
  environment: 'production',
};

// Create and start nodes
const nodeA = new ConnectorNode(configA, pino({ name: 'connector-a' }));
const nodeB = new ConnectorNode(configB, pino({ name: 'connector-b' }));

nodeB.setPacketHandler(async (request) => {
  if (request.isTransit) {
    console.log(`Transit: ${request.amount} tokens → ${request.destination}`);
    return { accept: true };
  }
  console.log(`Delivery: ${request.amount} tokens from ${request.sourcePeer}`);
  return { accept: true };
});

await nodeB.start();
await nodeA.start();

// Register peers dynamically (A → B)
await nodeA.registerPeer({
  id: 'connector-b',
  url: `ws://localhost:${configB.btpServerPort}`,
  authToken: '',
  routes: [{ prefix: 'g.connector-b' }],
  evmAddress: '0xConnectorBAddress...', // peer's EVM settlement address
});
```

See `test/integration/embedded-evm-settlement.test.ts` for a full working 3-node topology with on-chain verification.

## Configuration

YAML config file or pass a config object directly:

```yaml
nodeId: my-agent
btpServerPort: 3000
healthCheckPort: 8080

peers:
  - id: peer-b
    url: ws://peer-b:3001
    authToken: secret-token # Or "" for no-auth (requires BTP_ALLOW_NOAUTH=true)

routes:
  - prefix: g.peer-b
    nextHop: peer-b
```

### BTP Authentication

**Two deployment models:**

#### 1. Permissionless Networks (ILP-Gated) - DEFAULT

**Default mode.** For permissionless networks where access control happens at the ILP layer (via routing policies, credit limits, and settlement):

```yaml
peers:
  - id: peer-b
    url: ws://peer-b:3001
    authToken: '' # Empty = permissionless (default)
```

No environment configuration needed - permissionless mode is the default.

**Security:** Protection comes from ILP-layer controls (credit limits, settlement requirements, routing policies, payment channels). See [peer-onboarding-guide.md](../../docs/operators/peer-onboarding-guide.md#ilp-layer-gating-production-security) for production security checklist.

#### 2. Private Networks (Authenticated BTP)

For private networks with known peers, disable permissionless mode and configure shared secrets:

```bash
# Switch to private network mode
BTP_ALLOW_NOAUTH=false
```

```yaml
peers:
  - id: peer-b
    url: ws://peer-b:3001
    authToken: secret-token # Shared secret for bilateral trust
```

Configure peer secrets via environment variables:

```bash
BTP_PEER_PEER_B_SECRET=secret-token
```

## Per-Hop Notification

Per-hop notification lets intermediate connectors notify a Business Logic Server (BLS) about packets transiting through them, **without blocking or delaying packet forwarding**.

### How It Works

In a multi-hop chain `A -> B -> C`:

- **Connector B** (intermediate) fires a non-blocking notification to its BLS with `isTransit: true`
- **Connector C** (final hop) delivers the packet to its BLS for accept/reject with `isTransit: false` (or omitted)
- B's notification is fire-and-forget: if the BLS is down or slow, forwarding is unaffected

### When to Use It

- You want visibility into packets transiting through your node (observability, analytics)
- You run a multi-hop topology and want intermediate nodes to log or react to traffic
- You do **not** need the BLS response to affect forwarding (that's what final-hop delivery is for)

### Enabling Per-Hop Notification

#### YAML Config

```yaml
localDelivery:
  enabled: true
  handlerUrl: http://my-bls:3100
  timeout: 5000
  perHopNotification: true # <-- enables transit notifications
```

#### Environment Variable

```bash
LOCAL_DELIVERY_PER_HOP_NOTIFICATION=true
```

### Handling Notifications in Your BLS

Your BLS receives the same `PaymentRequest` shape for both transit and final-hop delivery. The `isTransit` field tells you which one it is:

```typescript
import { ConnectorNode, createLogger } from '@crosstown/connector';

const node = new ConnectorNode(config, createLogger('my-node', 'info'));

node.setPacketHandler(async (request) => {
  if (request.isTransit) {
    // --- TRANSIT NOTIFICATION (fire-and-forget) ---
    // This node is an intermediate hop. The packet is being forwarded.
    // Your response here is ignored. Use this for logging/analytics.
    console.log(`Transit: ${request.amount} tokens heading to ${request.destination}`);
    return { accept: true }; // Response is discarded, but must be valid
  }

  // --- FINAL-HOP DELIVERY (blocking) ---
  // This node is the destination. Your response drives accept/reject.
  console.log(`Delivery: ${request.amount} tokens from ${request.sourcePeer}`);
  return { accept: true }; // This fulfills the ILP packet
});

await node.start();
```

**Key difference:**

|                  | Transit (`isTransit: true`)              | Final-Hop (`isTransit` omitted)       |
| ---------------- | ---------------------------------------- | ------------------------------------- |
| **When**         | Packet is passing through this connector | Packet is addressed to this connector |
| **BLS response** | Ignored (fire-and-forget)                | Drives ILP fulfill/reject             |
| **Blocking**     | No — forwarding continues immediately    | Yes — waits for BLS response          |
| **Use case**     | Logging, analytics, side-effects         | Payment acceptance, business logic    |

### Telemetry

When a transit notification is dispatched, the connector emits a `PER_HOP_NOTIFICATION` telemetry event. This event appears automatically in the Explorer UI telemetry tab if the Explorer is running.

```typescript
// PER_HOP_NOTIFICATION event fields:
{
  type: 'PER_HOP_NOTIFICATION',
  nodeId: 'connector-b',         // Which connector dispatched
  destination: 'g.connector-c.x', // Where the packet is going
  amount: '1000',                 // Packet amount
  nextHop: 'connector-c',        // Next BTP peer
  sourcePeer: 'connector-a',     // Who sent the packet
  correlationId: 'pkt_abc123',   // For cross-log tracing
  timestamp: 1709337600000
}
```

## Accounting Backend

### Default: In-Memory Ledger

Zero dependencies. Persists to JSON snapshots on disk.

| Variable                     | Default                       | Description               |
| ---------------------------- | ----------------------------- | ------------------------- |
| `LEDGER_SNAPSHOT_PATH`       | `./data/ledger-snapshot.json` | Snapshot file path        |
| `LEDGER_PERSIST_INTERVAL_MS` | `30000`                       | Persistence interval (ms) |

### Optional: TigerBeetle

High-performance double-entry accounting. Falls back to in-memory if connection fails.

| Variable                 | Required | Description                       |
| ------------------------ | -------- | --------------------------------- |
| `TIGERBEETLE_CLUSTER_ID` | Yes      | TigerBeetle cluster identifier    |
| `TIGERBEETLE_REPLICAS`   | Yes      | Comma-separated replica addresses |

## Explorer UI

Enabled by default. Provides real-time packet visualization and settlement monitoring.

| Variable                  | Default   | Description              |
| ------------------------- | --------- | ------------------------ |
| `EXPLORER_ENABLED`        | `true`    | Enable/disable explorer  |
| `EXPLORER_PORT`           | `3001`    | HTTP/WebSocket port      |
| `EXPLORER_RETENTION_DAYS` | `7`       | Event retention period   |
| `EXPLORER_MAX_EVENTS`     | `1000000` | Maximum events to retain |

**Endpoints:**

| Endpoint          | Description                                  |
| ----------------- | -------------------------------------------- |
| `GET /api/events` | Query historical events (supports filtering) |
| `GET /api/health` | Explorer health status                       |
| `WS /ws`          | Real-time event streaming                    |

## Admin API Security

The Admin API provides HTTP endpoints for runtime management (add/remove peers, send ILP packets, query balances). Security options include API key authentication and/or IP allowlisting.

### Authentication Options

**Production requirement:** At least one of the following must be configured:

1. **API Key** — Header-based authentication (recommended for most deployments)
2. **IP Allowlist** — Network-level access control (recommended for containerized environments)
3. **Both** — Defense in depth (recommended for high-security deployments)

### API Key Authentication

```yaml
adminApi:
  enabled: true
  port: 8081
  apiKey: ${ADMIN_API_KEY} # Required in production (if no IP allowlist)
```

**Generate secure API key:**

```bash
# Best: OpenSSL (256-bit entropy)
openssl rand -base64 32

# Alternative: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Usage:**

```bash
curl -H "X-Api-Key: your-secret-key" http://localhost:8081/admin/peers
```

**Security notes:**

- API keys must be sent via `X-Api-Key` header (query params are rejected to prevent log leakage)
- Uses timing-safe comparison to prevent timing attacks
- In production, API key is **required** unless IP allowlist is configured

### IP Allowlist

```yaml
adminApi:
  enabled: true
  port: 8081
  allowedIPs:
    - 127.0.0.1 # IPv4 localhost
    - ::1 # IPv6 localhost
    - 10.0.1.5 # Specific server IP
    - 172.18.0.0/16 # Docker network (CIDR)
    - 10.244.0.0/16 # Kubernetes pod network (CIDR)
  trustProxy: false # Set true when behind reverse proxy
```

**Finding network CIDRs:**

```bash
# Docker network
docker network inspect myapp_default --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
# Output: 172.18.0.0/16

# Kubernetes pod network
kubectl cluster-info dump | grep -m 1 cluster-cidr
# Output: --cluster-cidr=10.244.0.0/16

# Server's private IP
hostname -I  # On the business logic server
# Output: 10.0.1.5
```

**Behind reverse proxy (nginx, traefik, ALB):**

```yaml
adminApi:
  enabled: true
  port: 8081
  allowedIPs: [203.0.113.5] # Actual client IP (from X-Forwarded-For)
  trustProxy: true # CRITICAL: Only enable behind trusted proxy
```

**Security notes:**

- IP allowlist is checked **before** API key validation (fast rejection)
- Supports both individual IPs and CIDR notation
- When `trustProxy: true`, client IP extracted from `X-Forwarded-For` header
- **WARNING:** Only enable `trustProxy` if your reverse proxy strips/overwrites `X-Forwarded-For` (untrusted proxies can spoof this header)

### Defense in Depth (Recommended)

```yaml
adminApi:
  enabled: true
  port: 8081
  apiKey: ${ADMIN_API_KEY}
  allowedIPs: [10.0.1.0/24]
  trustProxy: false
```

Both IP allowlist **and** API key provide layered security:

1. IP allowlist rejects unauthorized networks immediately
2. API key authenticates authorized networks

### Environment Variables

| Variable                | Description                | Example                 |
| ----------------------- | -------------------------- | ----------------------- |
| `ADMIN_API_ENABLED`     | Enable admin API           | `true`                  |
| `ADMIN_API_PORT`        | HTTP port                  | `8081`                  |
| `ADMIN_API_HOST`        | Bind host                  | `0.0.0.0`               |
| `ADMIN_API_KEY`         | API key (required in prod) | `your-secret-key`       |
| `ADMIN_API_ALLOWED_IPS` | Comma-separated IPs/CIDRs  | `127.0.0.1,10.0.0.0/16` |
| `ADMIN_API_TRUST_PROXY` | Trust X-Forwarded-For      | `false`                 |

**Endpoints:**

| Endpoint                       | Description           |
| ------------------------------ | --------------------- |
| `GET /admin/peers`             | List all peers        |
| `POST /admin/peers`            | Add a new peer        |
| `DELETE /admin/peers/:peerId`  | Remove a peer         |
| `GET /admin/routes`            | List routing table    |
| `POST /admin/routes`           | Add a route           |
| `DELETE /admin/routes/:prefix` | Remove a route        |
| `POST /admin/ilp/send`         | Send ILP packet       |
| `GET /admin/balances/:peerId`  | Query peer balances   |
| `GET /admin/channels`          | List payment channels |
| `POST /admin/channels`         | Open payment channel  |

## Local Delivery Configuration

Local delivery forwards ILP packets addressed to this connector to a Business Logic Server (BLS) instead of auto-fulfilling them. This is how your application logic receives and responds to payments.

| Field                | Type      | Default | Description                                  |
| -------------------- | --------- | ------- | -------------------------------------------- |
| `enabled`            | `boolean` | `false` | Enable local delivery forwarding             |
| `handlerUrl`         | `string`  | —       | BLS HTTP endpoint URL                        |
| `timeout`            | `number`  | `30000` | Request timeout in ms                        |
| `authToken`          | `string`  | —       | Bearer token for BLS authentication          |
| `perHopNotification` | `boolean` | `false` | Enable fire-and-forget transit notifications |

```yaml
localDelivery:
  enabled: true
  handlerUrl: http://my-bls:3100
  timeout: 5000
  authToken: ${BLS_AUTH_TOKEN} # Optional
  perHopNotification: true # Optional, default false
```

## Exported API

**Classes:** `ConnectorNode`, `ConfigLoader`, `RoutingTable`, `PacketHandler`, `BTPServer`, `BTPClient`, `BTPClientManager`, `AdminServer`, `AccountManager`, `SettlementMonitor`, `UnifiedSettlementExecutor`

**Types:** `ConnectorConfig`, `PeerConfig`, `RouteConfig`, `SettlementConfig`, `LocalDeliveryConfig`, `SendPacketParams`, `PaymentRequest`, `PaymentResponse`, `LocalDeliveryRequest`, `LocalDeliveryResponse`, `ILPPreparePacket`, `ILPFulfillPacket`, `ILPRejectPacket`

**Utilities:** `createLogger`, `createPaymentHandlerAdapter`, `computeFulfillmentFromData`, `computeConditionFromData`, `validateIlpSendRequest`

## Package Structure

```
src/
├── core/       # Packet forwarding, ConnectorNode, payment handler
├── btp/        # BTP server and client (WebSocket peers)
├── routing/    # Routing table and prefix matching
├── settlement/ # EVM settlement, per-packet claims, claim verification
├── http/       # Admin API, health endpoints, ILP send handler
├── explorer/   # Embedded telemetry UI server and event store
├── wallet/     # HD wallet derivation for EVM keys
├── security/   # KMS integration (AWS, Azure, GCP)
├── config/     # Configuration schema and validation
└── utils/      # Logger, OER encoding
```

## What's New in 1.3.0

- **Per-hop notification** — Intermediate connectors can now fire non-blocking BLS notifications for transit packets (`localDelivery.perHopNotification: true`)
- **`isTransit` field** — `PaymentRequest` and `LocalDeliveryRequest` include `isTransit?: boolean` so your BLS can distinguish transit notifications from final-hop deliveries
- **`PER_HOP_NOTIFICATION` telemetry** — New telemetry event emitted when a transit notification is dispatched, visible in Explorer UI

## Testing

```bash
npm test                 # Unit tests
npm run test:acceptance  # Acceptance tests
```

## License

MIT — see [LICENSE](../../LICENSE).
