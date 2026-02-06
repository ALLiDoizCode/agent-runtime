# Protocol Components

This document provides technical details on the underlying protocols used by Agent Runtime.

---

## Interledger Protocol (ILP) & Bilateral Transfer Protocol (BTP)

**ILP** is a protocol suite for routing payments across different payment networks, similar to how IP routes data packets across networks. This implementation uses **ILPv4** with **BTP** for connector-to-connector communication.

### Key Concepts

| Concept                                | Description                                                       |
| -------------------------------------- | ----------------------------------------------------------------- |
| **ILP Packets**                        | Three types: PREPARE (initiate), FULFILL (confirm), REJECT (fail) |
| **Hashed Timelock Agreements (HTLCs)** | Cryptographic escrow ensuring atomic payments                     |
| **Multi-Hop Routing**                  | Payments route through intermediate connectors without trust      |
| **Address Format**                     | Hierarchical addressing (e.g., `g.connector.alice`)               |

### Implementation Standards

- **RFC-0027** ILPv4 packet format and routing logic
- **RFC-0023** BTP WebSocket protocol for connector peering
- **RFC-0030** OER (Octet Encoding Rules) for binary serialization

### Official Documentation

- [Interledger.org](https://interledger.org) — Official protocol website
- [RFC Index](https://interledger.org/rfcs/) — Complete specification library
- [RFC-0027: ILPv4](https://interledger.org/rfcs/0027-interledger-protocol-4/) — Core protocol spec
- [RFC-0023: BTP](https://interledger.org/rfcs/0023-bilateral-transfer-protocol/) — Bilateral transfer protocol
- [Rafiki](https://rafiki.dev) — Production ILP implementation (for comparison)

---

## Payment Channels

**Payment channels** enable instant, low-cost cryptocurrency transfers between two parties by conducting most transactions off-chain and settling net balances on-chain.

### How Payment Channels Work

```
┌─────────────────────────────────────────────────────────────────┐
│                    Payment Channel Lifecycle                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. OPEN         2. TRANSACT        3. SETTLE      4. DISPUTE   │
│  ─────────       ──────────         ─────────      ──────────   │
│  Lock funds      Exchange signed    Submit final   Challenge    │
│  in contract     balance proofs     proof to       invalid      │
│  (on-chain)      (off-chain, free)  blockchain     proofs       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

1. **Open** — Both parties lock funds in a multi-signature smart contract
2. **Transact** — Exchange signed balance proofs off-chain (instant, free)
3. **Settle** — Submit final balance proof to blockchain (cooperative close)
4. **Dispute** — Challenge invalid proofs with timeout mechanism (non-cooperative close)

### Multichain Settlement Options

#### 1. EVM Payment Channels (Base L2)

- XRP-style payment channels as Solidity smart contracts
- Deployed on Base L2 (Ethereum Layer 2)
- Sub-cent transaction fees, instant finality
- [Base L2 Documentation](https://base.org)

#### 2. XRP Payment Channels (PayChan)

- Native XRP Ledger payment channels
- Claim-based settlement with signature verification
- High throughput, low latency
- [XRP Ledger PayChan](https://xrpl.org/payment-channels.html)

#### 3. Aptos Move Payment Channels

- Move smart contract modules on Aptos
- 160,000+ TPS capability, sub-second finality
- [Aptos Documentation](https://aptos.dev)

---

## Protocol References

This implementation follows official Interledger RFCs:

| RFC                                                                        | Title                    | Description               |
| -------------------------------------------------------------------------- | ------------------------ | ------------------------- |
| [RFC-0001](https://interledger.org/rfcs/0001-interledger-architecture/)    | Interledger Architecture | Overall system design     |
| [RFC-0027](https://interledger.org/rfcs/0027-interledger-protocol-4/)      | ILPv4 Core Protocol      | Packet format and routing |
| [RFC-0023](https://interledger.org/rfcs/0023-bilateral-transfer-protocol/) | BTP WebSocket Protocol   | Connector communication   |
| [RFC-0030](https://interledger.org/rfcs/0030-notes-on-oer-encoding/)       | OER Encoding             | Binary serialization      |
| [RFC-0038](https://interledger.org/rfcs/0038-settlement-engines/)          | Settlement Engines       | Settlement integration    |

---

## Related Projects

- [Rafiki](https://rafiki.dev) — Production ILP implementation
- [TigerBeetle](https://tigerbeetle.com) — Financial accounting database
