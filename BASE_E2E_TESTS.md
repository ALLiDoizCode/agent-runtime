# Base Payment Channel E2E Tests - Complete Guide

**BLS → Admin API → PaymentChannelSDK → Anvil**

Production-ready end-to-end testing for Base payment channels from a Business Logic Service perspective.

## Quick Start

```bash
# Build connector image
docker build -t connector/connector:latest .

# Run E2E tests
./scripts/run-base-e2e-tests.sh
```

## What's New

This E2E test suite **simulates real production usage** where a BLS (like agent-society) makes HTTP requests to connector admin APIs to negotiate payment channels.

### vs. SDK-Level Tests

| Test Type    | Entry Point      | What It Tests           | Use Case                 |
| ------------ | ---------------- | ----------------------- | ------------------------ |
| **SDK Test** | Direct SDK calls | PaymentChannelSDK logic | Unit/integration testing |
| **E2E Test** | HTTP → Admin API | Full connector stack    | Production validation    |

```typescript
// SDK Test (base-payment-channel.test.ts)
const sdk = new PaymentChannelSDK(...);
await sdk.openChannel(peerAddress, token, timeout, deposit);

// E2E Test (base-payment-channel-e2e.test.ts) ✨ NEW
const response = await fetch('http://localhost:8081/admin/channels', {
  method: 'POST',
  body: JSON.stringify({ peerId, chain, token, ... })
});
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Test Suite (Jest) - Simulates BLS Behavior              │
│  - Makes HTTP POST/GET requests                          │
│  - Tests admin API endpoints                             │
│  - Validates responses                                   │
└────────────────┬─────────────────────┬───────────────────┘
                 │                     │
         ┌───────▼────────┐    ┌──────▼────────┐
         │  Connector A   │    │  Connector B  │
         │  Admin API     │◄──►│  Admin API    │
         │  :8081         │BTP │  :8082        │
         └───────┬────────┘    └──────┬────────┘
                 │                     │
         ┌───────▼────────┐    ┌──────▼────────┐
         │ ChannelManager │    │ ChannelManager│
         │       +        │    │       +       │
         │ PaymentChannel │    │ PaymentChannel│
         │      SDK       │    │      SDK      │
         └───────┬────────┘    └──────┬────────┘
                 │                     │
                 └──────────┬──────────┘
                            │
                   ┌────────▼─────────┐
                   │  Anvil (Base)    │
                   │  Chain ID: 84532 │
                   └────────┬─────────┘
                            │
                 ┌──────────┴──────────┐
                 │  Smart Contracts    │
                 │  - TokenNetwork     │
                 │  - Registry         │
                 │  - MockERC20        │
                 └─────────────────────┘
```

## Files Created

### Infrastructure

- `docker-compose-base-e2e-test.yml` - Complete E2E stack (Anvil + 2 Connectors + TigerBeetle)
- `examples/e2e-connector-a.yaml` - Connector A config
- `examples/e2e-connector-b.yaml` - Connector B config

### Tests

- `packages/connector/test/integration/base-payment-channel-e2e.test.ts` - E2E test suite
- `packages/connector/test/integration/base-payment-channel.test.ts` - SDK-level tests

### Scripts

- `scripts/run-base-e2e-tests.sh` - Automated E2E test runner

### Documentation

- `docs/guides/base-payment-channel-e2e-testing.md` - Comprehensive E2E guide
- `docs/guides/base-payment-channel-testing.md` - SDK test guide
- `docs/guides/quick-start-base-tests.md` - Quick reference
- `BASE_E2E_TESTS.md` - This file (overview)
- `BASE_PAYMENT_CHANNEL_TESTS.md` - Complete reference

## Test Coverage

### ✅ BLS → Admin API Endpoints

| Endpoint                      | Method | Test Coverage                     |
| ----------------------------- | ------ | --------------------------------- |
| `/admin/channels`             | POST   | Open channel with various configs |
| `/admin/channels`             | GET    | List all channels                 |
| `/admin/channels/:id`         | GET    | Get channel details               |
| `/admin/channels/:id/deposit` | POST   | Deposit tokens                    |
| `/admin/channels/:id/close`   | POST   | Close channel (cooperative)       |

### ✅ Channel Lifecycle

1. **Open** - BLS creates channel via HTTP POST
2. **Retrieve** - BLS gets channel state via HTTP GET
3. **List** - BLS enumerates all channels
4. **Deposit** - BLS adds funds via HTTP POST
5. **Verify** - BLS confirms deposit in state
6. **Close** - BLS initiates settlement via HTTP POST

### ✅ Error Handling

- Invalid chain format
- Invalid token address
- Invalid deposit amount
- Non-existent channel
- Duplicate channel detection

### ✅ Multi-Connector

- Independent channel creation
- Cross-connector verification
- Parallel admin API instances

## Services

### Connector A

```
Admin API:  http://localhost:8081
Health:     http://localhost:8080/health
BTP:        ws://localhost:4001
Address:    0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

### Connector B

```
Admin API:  http://localhost:8082
Health:     http://localhost:8090/health
BTP:        ws://localhost:4002
Address:    0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```

### Infrastructure

```
Anvil RPC:      http://localhost:8545
Token Faucet:   http://localhost:8546
TigerBeetle:    Internal (port 3000)
```

### Deployed Contracts

```
MockERC20:              0x5FbDB2315678afecb367f032d93F642f64180aa3
TokenNetworkRegistry:   0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
TokenNetwork:           0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
```

## Usage

### Prerequisites

```bash
# 1. Docker running
docker info

# 2. Build connector image (REQUIRED for E2E tests)
docker build -t connector/connector:latest .

# 3. Environment variables
export E2E_TESTS=true
```

### Run Tests

```bash
# Option 1: Automated script (recommended)
./scripts/run-base-e2e-tests.sh

# Option 2: NPM script
E2E_TESTS=true npm run test:base-e2e --workspace=packages/connector

# Option 3: Manual
docker compose -f docker-compose-base-e2e-test.yml up -d
npm test --workspace=packages/connector -- base-payment-channel-e2e.test.ts
docker compose -f docker-compose-base-e2e-test.yml down -v
```

### Debug Options

```bash
# Keep containers running after tests
./scripts/run-base-e2e-tests.sh --no-cleanup

# Show service logs before running
./scripts/run-base-e2e-tests.sh --logs

# Verbose test output
./scripts/run-base-e2e-tests.sh --verbose

# Combine options
./scripts/run-base-e2e-tests.sh --no-cleanup --logs --verbose
```

## Example Test Flow

```typescript
// 1. BLS opens channel from Connector A
const openResponse = await fetch('http://localhost:8081/admin/channels', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    peerId: 'connector-b',
    chain: 'evm:base:8453',
    token: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    tokenNetwork: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    initialDeposit: '0',
    settlementTimeout: 3600,
    peerAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  }),
});

const { channelId } = await openResponse.json();
// ✅ channelId: "0xabc123..."

// 2. BLS deposits 100 tokens
await fetch(`http://localhost:8081/admin/channels/${channelId}/deposit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount: '100000000000000000000' }),
});
// ✅ Deposit successful

// 3. BLS verifies channel state
const stateResponse = await fetch(`http://localhost:8081/admin/channels/${channelId}`);
const state = await stateResponse.json();
// ✅ { channelId, status: 'open', deposit: '100000000000000000000' }

// 4. BLS closes channel
await fetch(`http://localhost:8081/admin/channels/${channelId}/close`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cooperative: true }),
});
// ✅ Channel closing initiated
```

## Manual Testing

### Test Admin API with curl

```bash
# Open channel
curl -X POST http://localhost:8081/admin/channels \
  -H "Content-Type: application/json" \
  -d '{
    "peerId": "connector-b",
    "chain": "evm:base:8453",
    "token": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "tokenNetwork": "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    "initialDeposit": "100000000000000000000",
    "settlementTimeout": 3600,
    "peerAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
  }'

# List channels
curl http://localhost:8081/admin/channels | jq

# Get channel details
curl http://localhost:8081/admin/channels/0x... | jq

# Deposit
curl -X POST http://localhost:8081/admin/channels/0x.../deposit \
  -H "Content-Type: application/json" \
  -d '{"amount": "50000000000000000000"}'

# Close
curl -X POST http://localhost:8081/admin/channels/0x.../close \
  -H "Content-Type: application/json" \
  -d '{"cooperative": true}'
```

## Troubleshooting

### Build connector image first

```bash
# The E2E test requires a built Docker image
docker build -t connector/connector:latest .

# Verify image exists
docker images | grep connector
```

### Check service health

```bash
# Connector A
curl http://localhost:8080/health

# Connector B
curl http://localhost:8090/health

# Anvil
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### View logs

```bash
# All services
docker compose -f docker-compose-base-e2e-test.yml logs -f

# Specific service
docker compose -f docker-compose-base-e2e-test.yml logs connector_a
docker compose -f docker-compose-base-e2e-test.yml logs connector_b
docker compose -f docker-compose-base-e2e-test.yml logs anvil_base_e2e
```

### Common issues

**"Cannot connect to Docker daemon"**

```bash
# Start Docker Desktop or Docker daemon
```

**"Port already in use"**

```bash
# Check what's using the ports
lsof -i :8081  # Connector A
lsof -i :8082  # Connector B
lsof -i :8545  # Anvil

# Stop conflicting services or modify ports in docker-compose
```

**"Connector fails to start"**

```bash
# Check TigerBeetle initialized
docker compose -f docker-compose-base-e2e-test.yml logs tigerbeetle_e2e

# Rebuild connector
docker build -t connector/connector:latest .
```

## Performance

Expected timings (M1 MacBook Pro, 16GB RAM):

- **Build connector image**: 1-2 minutes
- **Docker startup (first run)**: 2-3 minutes
- **Docker startup (cached)**: 30-60 seconds
- **Full E2E test suite**: 3-5 minutes
- **Individual test**: 5-10 seconds

**Total time**: ~5-8 minutes (first run), ~3-5 minutes (subsequent runs)

## Comparison Matrix

| Feature            | SDK Test                       | E2E Test                           |
| ------------------ | ------------------------------ | ---------------------------------- |
| **Test File**      | `base-payment-channel.test.ts` | `base-payment-channel-e2e.test.ts` |
| **Docker Compose** | `docker-compose-base-test.yml` | `docker-compose-base-e2e-test.yml` |
| **Entry Point**    | PaymentChannelSDK              | HTTP Admin API                     |
| **Services**       | Anvil only                     | Anvil + 2 Connectors + TigerBeetle |
| **Simulates**      | SDK internals                  | Production BLS                     |
| **Runtime**        | 1-2 min                        | 3-5 min                            |
| **Use Case**       | SDK development                | Production validation              |

## When to Use Each Test

### Use SDK Test When:

- Developing/debugging PaymentChannelSDK
- Testing EIP-712 signing logic
- Verifying contract interactions
- Quick iteration cycles

### Use E2E Test When:

- Validating production readiness
- Testing admin API endpoints
- Simulating BLS behavior
- Testing multi-connector scenarios
- Before releases

## NPM Scripts

```bash
# SDK-level tests
npm run test:base-channel --workspace=packages/connector

# E2E tests (requires built image)
npm run test:base-e2e --workspace=packages/connector

# Run both
npm run test:base-channel --workspace=packages/connector && \
npm run test:base-e2e --workspace=packages/connector
```

## Related Documentation

- [E2E Test Guide](docs/guides/base-payment-channel-e2e-testing.md) - Full E2E documentation
- [SDK Test Guide](docs/guides/base-payment-channel-testing.md) - SDK test documentation
- [Quick Start](docs/guides/quick-start-base-tests.md) - Quick reference
- [Admin API Source](packages/connector/src/http/admin-api.ts) - Implementation

## Contributing

When adding new admin API endpoints:

1. Update `admin-api.ts` with new endpoint
2. Add tests to `base-payment-channel-e2e.test.ts`
3. Update this documentation
4. Run E2E tests: `./scripts/run-base-e2e-tests.sh`

## License

MIT
