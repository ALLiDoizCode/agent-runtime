# Crosstown Comprehensive E2E Test ✅

**Complete end-to-end validation of the crosstown payment network**

This test validates the entire ILP payment flow between two connector nodes including SPSP handshake, routing table propagation, claim-based payments (both TigerBeetle and in-memory), and balance tracking.

## Test Variants

The test suite runs **twice** with different accounting backends:

1. **TigerBeetle Accounting** - Uses TigerBeetle container for high-performance accounting
2. **In-Memory Accounting** - Uses in-memory ledger with snapshot persistence (fallback mode)

## What It Tests

### ✅ Complete Payment Flow

1. **Peer Registration & BTP Connections**
   - Registers peers via `ConnectorNode.registerPeer()` public API
   - Establishes bidirectional BTP connections (WebSocket)
   - Verifies peers are connected and authenticated

2. **Routing Table Updates**
   - Adds ILP address routes for each peer
   - Verifies routing tables updated on both connectors
   - Validates longest-prefix matching works correctly

3. **ILP Packet Flow**
   - Sends ILP Prepare packets between connectors
   - Verifies packets are routed correctly via BTP
   - Validates packet forwarding through routing logic

4. **Claim-Based Payments**
   - Records debits/credits in accounting backend (TigerBeetle OR in-memory)
   - Tracks balances for each peer-token pair
   - Validates double-entry accounting (debit + credit accounts)
   - Tests both accounting backends independently

5. **Balance Tracking**
   - Queries balances via `ConnectorNode.getBalance()` API
   - Verifies balances change after packet forwarding
   - Confirms net settlement amounts are correct

6. **Payment Channel Integration**
   - Opens EVM payment channels on Anvil (Base Sepolia fork)
   - Verifies channel state and on-chain deployment
   - Tests channel operations via `ConnectorNode.openChannel()` API

## Architecture

### Infrastructure (Docker)

- **Anvil** - Local Base Sepolia fork (EVM contracts)
- **TigerBeetle** - High-performance accounting database (for TigerBeetle test variant)
- **Contract Deployer** - TokenNetworkRegistry + MockERC20
- **Token Faucet** - Funds test accounts with tokens

### Connectors (npm - No Docker!)

- **Connector A** - BTP server :4001, ILP address `g.test.connector-a`
- **Connector B** - BTP client :4002, ILP address `g.test.connector-b`

```
┌─────────────────────────────────────┐
│  Test Process (npm/node)            │
│  ┌──────────────┐  ┌──────────────┐│
│  │ Connector A  │  │ Connector B  ││
│  │ BTP :4001    │  │ BTP :4002    ││
│  │ g.test.a     │←→│ g.test.b     ││
│  └──────┬───────┘  └──────┬───────┘│
└─────────┼──────────────────┼────────┘
          │                  │
          └────────┬─────────┘
                   │
        ┌──────────▼──────────┐
        │  Docker Containers  │
        │  - Anvil :8545      │
        │  - TigerBeetle :3000│
        │  - Faucet :8546     │
        └─────────────────────┘
```

## Running the Test

### Automated (Recommended)

```bash
# One command - handles infrastructure startup and cleanup
./scripts/run-crosstown-e2e-test.sh

# Keep infrastructure running after test
./scripts/run-crosstown-e2e-test.sh --no-cleanup
```

### Manual

```bash
# 1. Start infrastructure
docker compose -f docker-compose-base-e2e-lite.yml up -d

# 2. Run test
E2E_TESTS=true npm run test:crosstown-e2e --workspace=packages/connector

# 3. Cleanup
docker compose -f docker-compose-base-e2e-lite.yml down -v
```

### During Development

```bash
# Start infrastructure once
docker compose -f docker-compose-base-e2e-lite.yml up -d

# Run test many times (fast!)
npm run test:crosstown-e2e --workspace=packages/connector

# Cleanup when done
docker compose -f docker-compose-base-e2e-lite.yml down -v
```

## Test Flow

### Phase 1: Initialization

1. Check infrastructure (Anvil, TigerBeetle, Faucet)
2. Fund test accounts from faucet
3. Create ConnectorNode instances with configs
4. Start both connectors (BTP servers listening)

### Phase 2: Peer Registration

1. Connector A registers Connector B as peer
2. Connector B registers Connector A as peer
3. BTP connections established bidirectionally
4. Routing tables updated with peer ILP addresses

### Phase 3: Packet Exchange

1. Connector A sends ILP Prepare to `g.test.connector-b.wallet.USD`
2. Packet routes via BTP to Connector B
3. Response (Fulfill or Reject) returned
4. Accounting records debit/credit for forwarding

### Phase 4: Balance Verification

1. Query balances from TigerBeetle via public API
2. Verify debit/credit/net balances changed
3. Confirm double-entry accounting is correct

### Phase 5: Payment Channels

1. Open payment channel from Connector A to B
2. Verify channel deployed on Anvil (Base Sepolia fork)
3. Check channel state via public API

## Key Differences from Other Tests

| Feature        | SDK Test | BLS Test       | **Crosstown E2E (NEW)** | Docker E2E         |
| -------------- | -------- | -------------- | ----------------------- | ------------------ |
| **Scope**      | SDK only | Admin API      | **Full payment flow**   | Full stack         |
| **Connectors** | 0        | 2 (components) | **2 (ConnectorNode)**   | 2 (containers)     |
| **BTP**        | ❌       | ❌             | **✅ Real BTP**         | ✅                 |
| **Routing**    | ❌       | ❌             | **✅ Verified**         | ✅                 |
| **Accounting** | ❌       | ❌             | **✅ TigerBeetle**      | ✅                 |
| **SPSP**       | ❌       | ❌             | **✅ (if configured)**  | ✅                 |
| **Build**      | None     | None           | **None ✨**             | 1-2 min Docker     |
| **Runtime**    | 1-2 min  | 2 min          | **3-4 min ✨**          | 5-8 min            |
| **Debug**      | Easy     | Easy           | **Easy ✨**             | Hard (Docker logs) |

## Test Output Example

The test runs twice - once with TigerBeetle accounting and once with in-memory accounting:

```
🚀 Starting Crosstown Comprehensive E2E Test (tigerbeetle)
==========================================

⏳ Checking infrastructure...
✅ Service healthy: http://localhost:8545

💰 Funding test accounts...
💰 Funded 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (tx: 0x1234...)
💰 Funded 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (tx: 0x5678...)

🔧 Creating connector configurations...
🔧 Initializing connectors...
▶️  Starting connectors...
✅ Connector A started (BTP server :4001)
✅ Connector B started (BTP server :4002)

========================================
✅ Infrastructure ready!
========================================
Accounting:  tigerbeetle
Connector A: g.test.connector-a (BTP :4001)
Connector B: g.test.connector-b (BTP :4002)
Token:       0x5FbDB2315678afecb367f032d93F642f64180aa3
Registry:    0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
========================================

📖 Test: Registering Connector B in Connector A...
✅ Connector B registered in Connector A

📖 Test: Registering Connector A in Connector B...
✅ Connector A registered in Connector B

📖 Test: Verifying routing table updates...
✅ Connector A has route: g.test.connector-b → connector-b
✅ Connector B has route: g.test.connector-a → connector-a

📖 Test: Verifying BTP connections...
✅ Connector A connected to Connector B
✅ Connector B connected to Connector A

📖 Test: Sending ILP packet A → B...
✅ Packet sent and response received: REJECT

📖 Test: Verifying balance changes from tigerbeetle accounting...
Connector A balance for peer 'connector-b': debit=1000, credit=0, net=-1000
✅ Connector A balance changed in tigerbeetle

📖 Test: Sending ILP packet B → A...
✅ Packet sent and response received: REJECT

📖 Test: Opening payment channel A → B...
✅ Channel opened: 0x1234567890...
   Status: open

📖 Test: Verifying channel state...
✅ Channel state: open

========================================
📊 E2E Test Summary (tigerbeetle)
========================================

🗺️  Routing Tables:
   Connector A: 1 routes
   Connector B: 1 routes

🔗 Peer Connections:
   Connector A peers: 1 (connected: 1)
   Connector B peers: 1 (connected: 1)

💰 Balances (tigerbeetle):
   Connector A → B: net=-1000
   Connector B → A: net=500

========================================
✅ Comprehensive E2E Test Complete (tigerbeetle)!
========================================

🚀 Starting Crosstown Comprehensive E2E Test (in-memory)
==========================================
... (test repeats with in-memory accounting backend)

========================================
📊 E2E Test Summary (in-memory)
========================================
💰 Balances (in-memory):
   Connector A → B: net=-1000
   Connector B → A: net=500

========================================
✅ Comprehensive E2E Test Complete (in-memory)!
========================================
```

## What Gets Validated

### ✅ Peer Registration

- Peers registered via public API
- BTP connections established
- Authentication successful

### ✅ Routing Table Propagation

- Routes added for both connectors
- Longest-prefix matching works
- Route lookup returns correct next-hop

### ✅ ILP Packet Flow

- Packets sent via `sendPacket()` API
- Routing forwards to correct peer
- BTP transmits packets correctly
- Responses received and validated

### ✅ Claim-Based Payments

- Accounting records debits/credits (both backends)
- TigerBeetle balances updated
- In-memory ledger balances updated
- Double-entry bookkeeping correct

### ✅ Balance Tracking

- Balances queryable via `getBalance()` API
- Net settlement amounts accurate
- Balance changes reflect packet flow

### ✅ Payment Channels

- Channels openable via `openChannel()` API
- On-chain deployment verified
- Channel state queryable

## Advantages

### 🚀 Speed

- **No Docker image building** (saves 1-2 minutes)
- **Fast test execution** (3-4 minutes total)
- **Fast iteration** during development

### 🧪 Comprehensive Coverage

- **Full payment flow** from end to end
- **Real BTP connections** between connectors
- **Dual accounting backends** - TigerBeetle AND in-memory
- **Real settlement** with payment channels

### 🐛 Debugging

- **Direct access** to connector code
- **Console logs** visible immediately
- **Breakpoints** work in debugger
- **Stack traces** show real line numbers

### 💻 Development

- **No Dockerfile changes** needed
- **Test changes** reflect immediately
- **TypeScript** type checking works
- **Easy to modify** test scenarios

## When to Use This Test

### ✅ Use Crosstown E2E

- **Complete validation** - Full payment flow testing
- **Development** - Fast feedback on integration issues
- **CI/CD** - Comprehensive pre-merge validation
- **Regression testing** - Verify nothing broke

### Use SDK Test Instead

- **Unit testing** - SDK logic only
- **Quick checks** - During coding
- **Low-level** - SDK internals

### Use Docker E2E Instead

- **Production validation** - Full stack with containers
- **Docker-specific issues** - Container problems
- **Release validation** - Before deploy

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
lsof -i :4001  # Connector A BTP
lsof -i :4002  # Connector B BTP
```

### Test fails

```bash
# Run with verbose logging
TEST_LOG_LEVEL=debug npm run test:crosstown-e2e --workspace=packages/connector

# Check infrastructure
curl http://localhost:8545
curl http://localhost:8546
```

### BTP connection fails

- Verify both connectors registered each other as peers
- Check authToken matches on both sides
- Ensure BTP server started successfully
- Check firewall/network settings

## Related Documentation

- [SDK Test](BASE_PAYMENT_CHANNEL_TESTS.md) - Low-level SDK testing
- [BLS Test](QUICK_BLS_TEST.md) - Admin API testing (fast)
- [Docker E2E](BASE_E2E_TESTS.md) - Full Docker E2E (slow)
- [Quick Start](docs/guides/quick-start-base-tests.md) - Quick reference

## Summary

This is the **best way** to validate complete ILP payment flows:

1. ✅ **Comprehensive** - Full payment flow validation
2. ✅ **Fast** - No Docker builds (~3-4 min total)
3. ✅ **Realistic** - Real BTP, accounting, settlement
4. ✅ **Debuggable** - Direct access to code
5. ✅ **Maintainable** - Easy to modify and extend

**Use this for complete E2E validation in development and CI/CD!**
