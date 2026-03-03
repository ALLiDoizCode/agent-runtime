# Base Payment Channel Integration Tests

Complete setup for testing EVM payment channels on Base Sepolia using Anvil and a token faucet.

## Quick Start

```bash
# Option 1: Automated script (recommended)
./scripts/run-base-channel-tests.sh

# Option 2: Using npm script
E2E_TESTS=true npm run test:base-channel --workspace=packages/connector

# Option 3: Manual setup
docker-compose -f docker-compose-base-test.yml up -d
npm test --workspace=packages/connector -- base-payment-channel.test.ts
docker-compose -f docker-compose-base-test.yml down -v
```

## What's Included

### 1. Docker Infrastructure (`docker-compose-base-test.yml`)

- **Anvil**: Local EVM node forked from Base Sepolia (chain ID 84532)
- **Token Faucet**: HTTP service providing test tokens at `http://localhost:8546`
- **Contract Deployer**: Automatically deploys TokenNetworkRegistry and MockERC20

### 2. Integration Test Suite (`packages/connector/test/integration/base-payment-channel.test.ts`)

Complete payment channel lifecycle tests:

- ✅ Channel opening
- ✅ Token deposits
- ✅ EIP-712 balance proof creation and verification
- ✅ Cooperative settlement
- ✅ Dispute resolution (close + settle after challenge period)
- ✅ SDK functionality testing

### 3. Helper Scripts

- `scripts/token-faucet.sh`: Token faucet service implementation
- `scripts/run-base-channel-tests.sh`: Automated test runner

### 4. Documentation

- `docs/guides/base-payment-channel-testing.md`: Comprehensive testing guide
- `docs/guides/quick-start-base-tests.md`: Quick start guide
- This file: Overview and reference

## Service Endpoints

| Service      | Port | URL                   |
| ------------ | ---- | --------------------- |
| Anvil RPC    | 8545 | http://localhost:8545 |
| Token Faucet | 8546 | http://localhost:8546 |

## Deployed Contracts (Deterministic Addresses)

| Contract                | Address                                      |
| ----------------------- | -------------------------------------------- |
| MockERC20 (AGENT Token) | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| TokenNetworkRegistry    | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |

## Test Accounts

Pre-funded Anvil accounts (⚠️ **NEVER use on mainnet**):

| Account    | Address                                      | Private Key                                                          |
| ---------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Account #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| Account #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |

## Usage Examples

### Using the Token Faucet

```bash
# Fund an account with 1,000 test tokens
curl -X POST http://localhost:8546/fund/0x70997970C51812dc3A010C7d01b50e0d17dc79C8

# Response
{
  "success": true,
  "txHash": "0x...",
  "amount": "1000000000000000000000",
  "recipient": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
}
```

### Running Specific Tests

```bash
# Run only channel lifecycle tests
npm test --workspace=packages/connector -- base-payment-channel.test.ts -t "Channel Lifecycle"

# Run only dispute resolution tests
npm test --workspace=packages/connector -- base-payment-channel.test.ts -t "Channel Dispute"

# Run with verbose logging
TEST_LOG_LEVEL=debug npm test --workspace=packages/connector -- base-payment-channel.test.ts
```

### Manual Testing with cast

```bash
# Check token balance
docker exec anvil_base_local cast call \
  0x5FbDB2315678afecb367f032d93F642f64180aa3 \
  "balanceOf(address)(uint256)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --rpc-url http://localhost:8545

# Get current block number
docker exec anvil_base_local cast block-number \
  --rpc-url http://localhost:8545

# Get chain ID
docker exec anvil_base_local cast chain-id \
  --rpc-url http://localhost:8545
```

## Environment Variables

Required in `.env.dev`:

```bash
# Base Sepolia RPC for forking (use faster endpoint if rate-limited)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Block number to fork from (update periodically for recent state)
FORK_BLOCK_NUMBER=20702367

# Enable E2E tests
E2E_TESTS=true
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Test Suite (Jest)                      │
│                                                            │
│  • Opens channels                                         │
│  • Deposits tokens                                        │
│  • Creates balance proofs (EIP-712)                       │
│  • Verifies signatures                                    │
│  • Settles channels                                       │
└────────────────┬────────────────┬────────────────────────┘
                 │                │
        ┌────────▼────────┐  ┌───▼──────────┐
        │  PaymentChannel │  │   ethers.js   │
        │      SDK        │  │   Provider    │
        └────────┬────────┘  └───┬──────────┘
                 │               │
                 └───────┬───────┘
                         │
                    ┌────▼─────────────────┐
                    │  Anvil (Base Fork)   │
                    │  Port: 8545          │
                    │  Chain ID: 84532     │
                    └──────┬───────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
    ┌───────▼──────┐  ┌───▼──────┐  ┌───▼──────────┐
    │ TokenNetwork │  │ Registry │  │  MockERC20   │
    │   Contract   │  │ Contract │  │ (AGENT Token)│
    └──────────────┘  └──────────┘  └──────────────┘
                           │
                    ┌──────▼──────┐
                    │Token Faucet │
                    │ Port: 8546  │
                    └─────────────┘
```

## Test Flow Example

```typescript
// 1. Open channel between Account 0 and Account 1
const { channelId } = await sdk0.openChannel(
  account1Address,
  tokenAddress,
  3600, // settlement timeout (1 hour)
  0n   // no initial deposit
);

// 2. Account 0 deposits 100 tokens
await sdk0.deposit(channelId, tokenAddress, parseEther("100"));

// 3. Account 0 creates balance proof for 10 token transfer
const signature = await sdk0.signBalanceProof(
  channelId,
  1, // nonce
  parseEther("10"), // transferred amount
  0n, // locked amount
  ZeroHash // locks root
);

// 4. Account 1 verifies the balance proof
const isValid = await sdk1.verifyBalanceProof(
  { channelId, nonce: 1, transferredAmount: parseEther("10"), ... },
  signature,
  account0Address
);

// 5. Cooperatively settle the channel
await sdk0.cooperativeSettle(
  channelId,
  tokenAddress,
  proof0, sig0,
  proof1, sig1
);
```

## Troubleshooting

### Common Issues

**Fork download slow or failing**

```bash
# Use a faster RPC endpoint (requires API key)
# In .env.dev:
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
```

**Port already in use**

```bash
# Find process using port
lsof -i :8545
lsof -i :8546

# Modify ports in docker-compose-base-test.yml if needed
```

**Docker daemon not running**

```bash
# Start Docker Desktop, or on Linux:
sudo systemctl start docker
```

**Contract deployment failed**

```bash
# Check deployer logs
docker-compose -f docker-compose-base-test.yml logs contract_deployer

# Restart deployment
docker-compose -f docker-compose-base-test.yml restart contract_deployer
```

### Debug Commands

```bash
# View all logs
docker-compose -f docker-compose-base-test.yml logs -f

# View specific service logs
docker-compose -f docker-compose-base-test.yml logs -f anvil_base_local
docker-compose -f docker-compose-base-test.yml logs -f token_faucet

# Check service health
docker-compose -f docker-compose-base-test.yml ps

# Execute commands in Anvil container
docker exec anvil_base_local cast block-number --rpc-url http://localhost:8545
```

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Base Payment Channel Tests

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  base-channel-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run Base payment channel tests
        run: ./scripts/run-base-channel-tests.sh
        env:
          E2E_TESTS: true
          BASE_SEPOLIA_RPC_URL: ${{ secrets.BASE_SEPOLIA_RPC_URL }}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: packages/connector/coverage/
```

## Performance Benchmarks

Typical execution times (MacBook Pro M1, 16GB RAM):

- Docker startup: 30-60 seconds (first run with fork download)
- Docker startup: 10-15 seconds (subsequent runs with cached fork)
- Contract deployment: 5-10 seconds
- Full test suite: 60-120 seconds
- Individual test: 1-5 seconds

**Total end-to-end time**: ~2-3 minutes (first run), ~1-2 minutes (subsequent runs)

## Related Documentation

- [Base Payment Channel Testing Guide](docs/guides/base-payment-channel-testing.md) - Comprehensive guide
- [Quick Start Guide](docs/guides/quick-start-base-tests.md) - Quick reference
- [PaymentChannelSDK Source](packages/connector/src/settlement/payment-channel-sdk.ts) - SDK implementation
- [TokenNetwork Contract](packages/contracts/src/TokenNetwork.sol) - Smart contract source
- [Base Testnet Documentation](https://docs.base.org/network-information) - Official Base docs

## Contributing

When adding new payment channel features:

1. Add tests to `base-payment-channel.test.ts`
2. Update SDK in `payment-channel-sdk.ts`
3. Update smart contracts if needed
4. Update this documentation
5. Run full test suite: `./scripts/run-base-channel-tests.sh`

## License

MIT
