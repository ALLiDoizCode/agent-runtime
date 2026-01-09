# Smart Contract Development Guide

## Introduction

This guide covers the Foundry development environment for building and testing payment channel smart contracts for the M2M connector. The contracts are deployed to Base L2 (an EVM-compatible blockchain) and enable real cryptocurrency settlement via XRP-style payment channels.

**Prerequisites:**

- Epic 7 completed (Anvil running via `docker-compose-dev.yml`)
- Foundry installed locally
- Node.js 20.11.0 LTS
- Docker and Docker Compose

## Foundry Toolchain

Foundry is a blazing-fast, portable toolkit for Ethereum application development written in Rust.

### Components

- **Forge:** Smart contract compilation, testing, and deployment
- **Cast:** CLI tool for interacting with smart contracts (RPC calls, transaction sending)
- **Anvil:** Local Ethereum node (Note: We use the Anvil instance from Epic 7, not Foundry's standalone Anvil)

### Installation

If Foundry is not already installed:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

Verify installation:

```bash
forge --version
```

## Project Structure

```
packages/contracts/
├── src/                    # Smart contract source files
│   ├── TokenNetworkRegistry.sol  # Factory contract (Story 8.2)
│   └── TokenNetwork.sol          # Per-token payment channel contract
├── test/                   # Foundry unit tests (.t.sol files)
│   ├── TokenNetworkRegistry.t.sol
│   ├── mocks/               # Test helper contracts
│   │   └── MockERC20.sol
│   └── integration/        # Integration tests (.test.ts files)
│       └── deployment.test.ts
├── script/                 # Deployment scripts (.s.sol files)
│   └── Deploy.s.sol
├── lib/                    # Dependencies (installed via forge install)
│   ├── forge-std/
│   └── openzeppelin-contracts/
├── out/                    # Compiled contract artifacts (gitignored)
├── cache/                  # Foundry cache (gitignored)
├── foundry.toml            # Foundry configuration
├── .env                    # Environment variables (gitignored)
├── .env.example            # Environment variable template
├── deploy-local.sh         # Local deployment helper script
└── deploy-testnet.sh       # Testnet deployment helper script
```

### Configuration (`foundry.toml`)

The `foundry.toml` file configures:

- **Solidity version:** 0.8.20 (for OpenZeppelin compatibility)
- **RPC endpoints:** Local Anvil, Base Sepolia testnet, Base mainnet
- **Etherscan verification:** API keys for contract verification
- **Remappings:** Import paths for OpenZeppelin contracts

## TokenNetworkRegistry Architecture

The M2M connector implements the **TokenNetworkRegistry** factory contract following the Raiden Network architecture pattern. This pattern enables multi-token payment channel support with security isolation.

### Factory Pattern Overview

TokenNetworkRegistry acts as a factory that deploys isolated TokenNetwork contracts for each ERC20 token:

```solidity
// TokenNetworkRegistry.sol - Factory contract
contract TokenNetworkRegistry is Ownable {
    // Maps ERC20 token addresses to their TokenNetwork contracts
    mapping(address => address) public token_to_token_networks;

    // Deploy new TokenNetwork for a token
    function createTokenNetwork(address token) external returns (address);

    // Query TokenNetwork address for a token
    function getTokenNetwork(address token) external view returns (address);
}

// TokenNetwork.sol - Per-token payment channel contract
contract TokenNetwork {
    address public token; // ERC20 token this contract manages

    // Channel lifecycle functions (Story 8.3+)
    function openChannel(address participant1, address participant2) external;
    function setTotalDeposit(uint256 channelId, uint256 amount) external;
    function closeChannel(uint256 channelId) external;
}
```

### Creating a TokenNetwork

To create a payment channel network for a new ERC20 token:

```bash
# Deploy TokenNetworkRegistry (one-time operation)
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast

# Create TokenNetwork for USDC (example)
cast send <registryAddress> "createTokenNetwork(address)" <usdcTokenAddress> \
  --rpc-url http://localhost:8545 \
  --private-key $PRIVATE_KEY

# Query TokenNetwork address
cast call <registryAddress> "getTokenNetwork(address)" <usdcTokenAddress> \
  --rpc-url http://localhost:8545
```

### Benefits of Factory Pattern

1. **Security Isolation:** Vulnerabilities in one token's channels don't affect others
2. **Flexible Token Support:** Add new ERC20 tokens without redeploying entire system
3. **Gas Efficiency:** Users only interact with relevant TokenNetwork, not global registry
4. **Proven Design:** Battle-tested in Raiden Network with millions in TVL

## Development Workflow

### Step 1: Write Contracts

Create smart contracts in `src/`:

```solidity
// src/MyContract.sol
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MyContract is Ownable {
    // Contract implementation
}
```

### Step 2: Write Tests

Create tests in `test/`:

```solidity
// test/MyContract.t.sol
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/MyContract.sol";

contract MyContractTest is Test {
    MyContract public myContract;

    function setUp() public {
        myContract = new MyContract();
    }

    function testDeployment() public {
        // Test implementation
    }
}
```

### Step 3: Run Tests

```bash
forge test
```

Run with verbosity for detailed output:

```bash
forge test -vv
```

### Step 4: Deploy Locally

Deploy to local Anvil:

```bash
./deploy-local.sh
```

Or manually:

```bash
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

### Step 5: Test on Base Sepolia

Deploy to Base Sepolia testnet:

```bash
./deploy-testnet.sh
```

### Step 6: Deploy to Base Mainnet

After security audit (Epic 8.6), deploy to mainnet:

```bash
forge script script/Deploy.s.sol --rpc-url $BASE_MAINNET_RPC_URL --broadcast --verify
```

## Local Development with Anvil

### Connecting to Local Anvil

Epic 7 Story 7.1 provides an Anvil instance running in Docker Compose:

- **Endpoint:** `http://localhost:8545`
- **Chain ID:** 84532 (Base Sepolia fork)
- **Pre-funded Accounts:** 10 accounts with 10000 ETH each

### Anvil Pre-funded Accounts

Anvil provides 10 pre-funded accounts for testing:

| Account | Address                                      | Private Key                                                          |
| ------- | -------------------------------------------- | -------------------------------------------------------------------- |
| #0      | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| #1-9    | (See Anvil output)                           | (See Anvil output)                                                   |

**⚠️ WARNING:** Never use these private keys in production! They are publicly known and only for local development.

### Testing Deployment

Deploy contract to local Anvil:

```bash
./deploy-local.sh
```

Verify deployment with cast:

```bash
cast code <CONTRACT_ADDRESS> --rpc-url http://localhost:8545
```

If the output is non-empty bytecode, the contract is successfully deployed.

### Instant Block Mining

Anvil mines blocks instantly (no block time delay), enabling fast iteration during development.

## Environment Variables

The `.env` file contains required environment variables:

| Variable               | Description           | Example                     |
| ---------------------- | --------------------- | --------------------------- |
| `BASE_RPC_URL`         | Local Anvil endpoint  | `http://localhost:8545`     |
| `BASE_SEPOLIA_RPC_URL` | Base Sepolia testnet  | `https://sepolia.base.org`  |
| `BASE_MAINNET_RPC_URL` | Base mainnet          | `https://mainnet.base.org`  |
| `PRIVATE_KEY`          | Deployer private key  | Anvil Account #0 (dev only) |
| `ETHERSCAN_API_KEY`    | Contract verification | Optional                    |

**Environment Variable Precedence:**

1. `.env` file (default values)
2. Shell environment overrides

## Deployment Targets

### Local Anvil

- **Purpose:** Fast iteration, instant finality, free transactions
- **Use case:** Development and testing
- **Prerequisites:** Anvil running via `docker ps | grep anvil`

### Base Sepolia Testnet

- **Purpose:** Public testing environment
- **Use case:** Integration testing, pre-production validation
- **Faucet:** Available for testnet ETH

### Base Mainnet

- **Purpose:** Production deployment
- **Use case:** Real cryptocurrency settlement
- **Prerequisites:** Security audit completed (Epic 8.6)

## Troubleshooting

### Issue: "forge: command not found"

**Solution:** Install Foundry:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Issue: "Error: Invalid RPC URL"

**Solution:** Verify Anvil is running:

```bash
docker ps | grep anvil
```

If Anvil is not running, start it:

```bash
docker-compose -f docker-compose-dev.yml up -d
```

### Issue: "Deployment failed: insufficient funds"

**Solution:** Verify you're using Anvil pre-funded account (Account #0 has 10000 ETH):

```bash
cast balance 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url http://localhost:8545
```

### Issue: "Compilation failed"

**Solution:** Check Solidity version in contracts matches `foundry.toml` (0.8.20).

## Best Practices

1. **Test First:** Write tests before implementing complex logic
2. **Gas Optimization:** Use `forge test --gas-report` to analyze gas usage
3. **Security:** Never commit private keys to git
4. **Dependencies:** Use OpenZeppelin contracts for standard functionality
5. **Audits:** Professional security audit required before mainnet deployment

## Next Steps

- **Epic 8.2:** Implement TokenNetworkRegistry contract
- **Epic 8.3:** Implement TokenNetwork core contract
- **Epic 8.4:** Add channel closure and settlement logic
- **Epic 8.5:** Security hardening
- **Epic 8.6:** Comprehensive testing and security audit
- **Epic 8.7:** Off-chain payment channel SDK
- **Epic 8.8:** Settlement engine integration

## Resources

- [Foundry Book](https://book.getfoundry.sh/)
- [Solidity Documentation](https://docs.soliditylang.org/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Base L2 Documentation](https://docs.base.org/)
