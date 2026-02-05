# Aptos Payment Channel Contracts

Move smart contracts implementing payment channel logic for the Aptos blockchain.

## Overview

This package contains Move modules for off-chain payment channels between two parties. The channel allows:

- **Unidirectional payments**: Owner deposits funds, destination claims with signed proofs
- **Off-chain balance updates**: Signed messages update balances without on-chain transactions
- **Two-phase closure**: Settle delay prevents premature channel termination
- **Replay protection**: Monotonic nonces prevent signature reuse

## Module Structure

```
packages/contracts-aptos/
├── Move.toml                          # Package manifest
├── sources/
│   └── payment_channel.move           # Main payment channel module
├── tests/
│   └── payment_channel_tests.move     # Unit tests
├── scripts/
│   └── (deployment scripts)
└── README.md                          # This file
```

## Channel State

The `Channel` resource is stored under the owner's address:

| Field                | Type              | Description                           |
| -------------------- | ----------------- | ------------------------------------- |
| `destination`        | `address`         | Recipient's Aptos address             |
| `escrow`             | `Coin<AptosCoin>` | Funds held in the channel             |
| `claimed`            | `u64`             | Cumulative amount claimed (octas)     |
| `nonce`              | `u64`             | Replay protection counter             |
| `settle_delay`       | `u64`             | Seconds before close can finalize     |
| `close_requested_at` | `u64`             | Timestamp of close request (0 = open) |
| `destination_pubkey` | `vector<u8>`      | 32-byte ed25519 public key            |

## Entry Functions

### `open_channel`

Creates a new payment channel with initial deposit.

```move
public entry fun open_channel(
    owner: &signer,
    destination: address,
    destination_pubkey: vector<u8>,  // 32 bytes
    amount: u64,                      // in octas
    settle_delay: u64,                // in seconds
)
```

**Requirements:**

- Channel must not already exist for owner
- Amount must be > 0
- Public key must be 32 bytes

### `deposit`

Adds funds to an existing channel.

```move
public entry fun deposit(
    owner: &signer,
    amount: u64,  // in octas
)
```

**Requirements:**

- Channel must exist
- Amount must be > 0

### `claim`

Submits a signed balance proof to claim funds.

```move
public entry fun claim(
    destination: &signer,
    owner: address,
    amount: u64,           // cumulative amount
    nonce: u64,            // must be > current nonce
    signature: vector<u8>, // 64-byte ed25519 signature
)
```

**Requirements:**

- Caller must be the destination
- Nonce must be greater than current nonce
- Amount must not exceed escrow balance
- Signature must be valid

**Signature Message Format:**

```
"CLAIM_APTOS" || BCS(owner) || BCS(amount) || BCS(nonce)
```

### `request_close`

Initiates channel closure (Phase 1 of two-phase close).

```move
public entry fun request_close(
    requester: &signer,
    channel_owner: address,
)
```

**Requirements:**

- Caller must be owner or destination

### `finalize_close`

Completes channel closure after settle delay (Phase 2).

```move
public entry fun finalize_close(
    requester: &signer,
    channel_owner: address,
)
```

**Requirements:**

- Close must have been requested
- Settle delay must have elapsed
- Caller must be owner or destination

## View Functions

### `get_channel`

Returns channel state tuple.

```move
#[view]
public fun get_channel(owner: address): (address, u64, u64, u64, u64, u64)
// Returns: (destination, deposited, claimed, nonce, settle_delay, close_requested_at)
```

### `channel_exists`

Checks if a channel exists.

```move
#[view]
public fun channel_exists(owner: address): bool
```

### `get_destination_pubkey`

Returns the destination's public key.

```move
#[view]
public fun get_destination_pubkey(owner: address): vector<u8>
```

## Error Codes

| Code | Constant                     | Description                              |
| ---- | ---------------------------- | ---------------------------------------- |
| 1    | `E_CHANNEL_EXISTS`           | Channel already exists for this owner    |
| 2    | `E_CHANNEL_NOT_FOUND`        | No channel found for the specified owner |
| 3    | `E_INVALID_SIGNATURE`        | ed25519 signature verification failed    |
| 4    | `E_INSUFFICIENT_BALANCE`     | Claim amount exceeds available balance   |
| 5    | `E_SETTLE_DELAY_NOT_ELAPSED` | Cannot finalize before settle delay      |
| 6    | `E_UNAUTHORIZED`             | Caller not authorized for this operation |
| 7    | `E_CLOSE_NOT_REQUESTED`      | Cannot finalize without close request    |
| 8    | `E_INVALID_NONCE`            | Nonce must be greater than current       |
| 9    | `E_ZERO_AMOUNT`              | Amount must be greater than zero         |

## Testing

### Run All Tests

```bash
cd packages/contracts-aptos
aptos move test --dev
```

### Run Specific Test

```bash
aptos move test --dev --filter test_open_channel
```

### Run with Coverage

```bash
aptos move test --dev --coverage
```

### Run Move Prover (Formal Verification)

```bash
aptos move prove --dev
```

Note: Move Prover requires Boogie and Z3. See [Aptos Prover Setup](https://aptos.dev/tools/aptos-cli/use-cli/move-prover/).

## Deployment

### Prerequisites

1. Install Aptos CLI:

   ```bash
   curl -fsSL "https://aptos.dev/scripts/install_cli.py" | python3
   ```

2. Create/import an account:
   ```bash
   aptos init --network testnet
   ```

### Deploy to Testnet

1. Update `Move.toml` with your account address:

   ```toml
   [addresses]
   payment_channel = "0xYOUR_ACCOUNT_ADDRESS"
   ```

2. Compile:

   ```bash
   aptos move compile
   ```

3. Publish:
   ```bash
   aptos move publish --named-addresses payment_channel=default
   ```

### Deploy to Mainnet

For mainnet deployment:

1. Use a funded mainnet account
2. Set `--network mainnet` in CLI commands
3. Consider higher gas settings for reliability

## Gas Configuration

### Default Settings

The Aptos CLI auto-estimates gas for most operations. Default values:

- Gas unit price: 100 octas
- Max gas: 2000 units

### Production Recommendations

For production deployments, consider explicit gas settings:

```bash
aptos move publish \
  --gas-unit-price 150 \
  --max-gas 5000 \
  --named-addresses payment_channel=default
```

### Operation Gas Estimates

| Operation        | Estimated Gas Units |
| ---------------- | ------------------- |
| `open_channel`   | ~500-800            |
| `deposit`        | ~200-300            |
| `claim`          | ~400-600            |
| `request_close`  | ~150-250            |
| `finalize_close` | ~300-500            |

## Security Considerations

1. **Settle Delay**: Production channels should use minimum 3600 seconds (1 hour) settle delay
2. **Signature Verification**: Uses `ed25519::signature_verify_strict()` for claim authentication
3. **Nonce Tracking**: Monotonic nonces prevent replay attacks
4. **Resource Safety**: Move's linear types prevent double-spending

## Integration with TypeScript SDK

This module is designed to work with the Aptos TypeScript SDK:

```typescript
import { AptosClient } from '@aptos-labs/ts-sdk';

// Call view function
const [dest, deposited, claimed, nonce, settleDelay, closeAt] = await client.view({
  function: `${moduleAddress}::channel::get_channel`,
  type_arguments: [],
  arguments: [ownerAddress],
});

// Submit transaction
await client.submitTransaction({
  function: `${moduleAddress}::channel::open_channel`,
  type_arguments: [],
  arguments: [destination, pubkey, amount, settleDelay],
});
```

See Story 27.4 for the full TypeScript SDK wrapper implementation.

## License

MIT License - See repository LICENSE file.
