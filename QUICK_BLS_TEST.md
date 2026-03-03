# Fast BLS Test (No Docker Build!) ⚡

**The right way to test BLS → Admin API integration**

## Why This Is Better

### ❌ Old E2E Approach (Slow)

```bash
# Build Docker images (1-2 minutes)
docker build -t connector/connector:latest .

# Start everything (2-3 minutes)
docker compose -f docker-compose-base-e2e-test.yml up -d

# Total: 3-5 minutes just to start!
```

### ✅ New BLS Test (Fast!)

```bash
# Just start infrastructure (30 seconds)
docker compose -f docker-compose-base-e2e-lite.yml up -d

# Run test - connectors start from npm (1-2 minutes)
npm test --workspace=packages/connector -- base-payment-channel-bls.test.ts

# Total: ~2 minutes including tests!
```

## Quick Start

```bash
# One command
./scripts/run-base-bls-test.sh

# Or manually
docker compose -f docker-compose-base-e2e-lite.yml up -d
E2E_TESTS=true npm run test:base-bls --workspace=packages/connector
```

## What Runs Where

### In Docker (Infrastructure Only)

- ✅ Anvil (Base Sepolia fork)
- ✅ TigerBeetle (accounting)
- ✅ Contract deployer
- ✅ Token faucet

### From npm (Test Process)

- ✅ Connector A (started in test)
- ✅ Connector B (started in test)
- ✅ Admin API servers
- ✅ Test assertions

## Architecture

```
┌─────────────────────────────────────┐
│  Test Process (npm/node)            │
│  ┌──────────────┐  ┌──────────────┐│
│  │ Connector A  │  │ Connector B  ││
│  │ + Admin API  │  │ + Admin API  ││
│  │ :8081        │  │ :8082        ││
│  └──────┬───────┘  └──────┬───────┘│
└─────────┼──────────────────┼────────┘
          │                  │
          └────────┬─────────┘
                   │
        ┌──────────▼──────────┐
        │  Docker Containers  │
        │  - Anvil :8545      │
        │  - TigerBeetle      │
        │  - Faucet :8546     │
        └─────────────────────┘
```

## Files

### New (Fast!)

- `docker-compose-base-e2e-lite.yml` - Infrastructure only
- `test/integration/base-payment-channel-bls.test.ts` - BLS test (npm)
- `scripts/run-base-bls-test.sh` - Fast runner

### Old (Slow - Docker build)

- `docker-compose-base-e2e-test.yml` - Full stack in Docker
- `test/integration/base-payment-channel-e2e.test.ts` - E2E test
- `scripts/run-base-e2e-tests.sh` - Slow runner

## Test Comparison

| Feature      | SDK Test | **BLS Test (NEW)** | E2E Test (Old)     |
| ------------ | -------- | ------------------ | ------------------ |
| **What**     | SDK only | Admin API → SDK    | Docker containers  |
| **Build**    | None     | None ✨            | 1-2 min Docker     |
| **Startup**  | 30 sec   | 30 sec ✨          | 2-3 min Docker     |
| **Runtime**  | 1-2 min  | 2 min ✨           | 3-5 min            |
| **Total**    | 1-2 min  | **2 min** ✨       | 5-8 min            |
| **Debug**    | Easy     | Easy ✨            | Hard (Docker logs) |
| **Use Case** | SDK dev  | **BLS validation** | CI/CD only         |

## Example Test

```typescript
// BLS Test - Connectors started programmatically
beforeAll(async () => {
  // Start Connector A directly from source
  connectorA = await createConnectorInstance(
    'connector-a',
    8081, // admin port
    PRIVATE_KEY_A,
    4001  // BTP port
  );

  // Start Connector B directly from source
  connectorB = await createConnectorInstance(
    'connector-b',
    8082,
    PRIVATE_KEY_B,
    4002
  );
});

it('should open channel via Admin API', async () => {
  // Make HTTP request like agent-society would
  const response = await fetch('http://localhost:8081/admin/channels', {
    method: 'POST',
    body: JSON.stringify({ peerId, chain, token, ... })
  });

  const { channelId } = await response.json();
  expect(channelId).toBeDefined();
});
```

## Advantages

### 🚀 Speed

- **No Docker image building** (saves 1-2 minutes)
- **No Docker container startup** for connectors (saves 1-2 minutes)
- **Fast iteration** during development

### 🐛 Debugging

- **Direct access** to connector code
- **Console logs** visible immediately
- **Breakpoints** work in debugger
- **Stack traces** show real line numbers

### 💻 Development

- **No Dockerfile changes** needed
- **Test changes** reflect immediately
- **TypeScript** type checking works
- **Hot reload** possible

### 🧪 Testing

- **Same as production** (HTTP → Admin API)
- **Fast feedback** loop
- **Easy to modify** test scenarios
- **Better error messages**

## When to Use Each

### Use BLS Test (Fast!) ✅

- **Development** - Daily testing
- **CI/CD** - Fast feedback
- **Debugging** - Need visibility
- **Iteration** - Frequent changes

### Use E2E Test (Docker)

- **Production validation** - Full stack
- **Docker-specific issues** - Container problems
- **Integration testing** - Multi-service
- **Release validation** - Before deploy

### Use SDK Test

- **Unit testing** - SDK logic
- **Quick checks** - During coding
- **Low-level** - SDK internals

## Running

### Automated

```bash
./scripts/run-base-bls-test.sh

# Keep infrastructure running
./scripts/run-base-bls-test.sh --no-cleanup
```

### Manual

```bash
# 1. Start infrastructure
docker compose -f docker-compose-base-e2e-lite.yml up -d

# 2. Run test
E2E_TESTS=true npm run test:base-bls --workspace=packages/connector

# 3. Cleanup
docker compose -f docker-compose-base-e2e-lite.yml down -v
```

### During Development

```bash
# Start infrastructure once
docker compose -f docker-compose-base-e2e-lite.yml up -d

# Run test many times (fast!)
npm run test:base-bls --workspace=packages/connector

# Cleanup when done
docker compose -f docker-compose-base-e2e-lite.yml down -v
```

## Troubleshooting

### Infrastructure not ready

```bash
# Check status
docker compose -f docker-compose-base-e2e-lite.yml ps

# View logs
docker compose -f docker-compose-base-e2e-lite.yml logs -f

# Restart
docker compose -f docker-compose-base-e2e-lite.yml restart
```

### Port conflicts

```bash
# Check ports
lsof -i :8545  # Anvil
lsof -i :3000  # TigerBeetle
lsof -i :8546  # Faucet

# Connectors start on dynamic ports in test
# (8081, 8082) - should not conflict
```

### Test fails

```bash
# Run with verbose logging
TEST_LOG_LEVEL=debug npm run test:base-bls --workspace=packages/connector

# Check infrastructure
curl http://localhost:8545
curl http://localhost:8546
```

## Summary

This is the **best way** to test BLS → Admin API integration:

1. ✅ **Fast** - No Docker builds
2. ✅ **Simple** - Just npm test
3. ✅ **Debuggable** - Direct access
4. ✅ **Realistic** - Same as production
5. ✅ **Maintainable** - Easy to modify

**Use this for daily development and CI/CD!**

## Related

- [SDK Test](BASE_PAYMENT_CHANNEL_TESTS.md) - Low-level SDK testing
- [E2E Test](BASE_E2E_TESTS.md) - Full Docker E2E (slow)
- [Quick Start](docs/guides/quick-start-base-tests.md) - Quick reference
