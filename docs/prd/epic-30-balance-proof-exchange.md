# Epic 30: Balance Proof Exchange via Claim Events

## Brownfield Enhancement

This epic extends the Agent Society Protocol (Epic 13) to include signed balance proofs in every packet exchange, enabling automatic on-chain settlement when thresholds are exceeded. Claims are implemented as Nostr events that wrap message content, maintaining the "every packet is a Nostr event" architectural pattern.

---

## Epic Goal

Enable automatic on-chain settlement by exchanging signed balance proofs (claims) between peers via Nostr claim events. When settlement thresholds are exceeded, agents will have the cryptographic proofs needed to settle payment channels without manual intervention across all three chains (EVM, XRP, Aptos).

---

## Epic Description

### Existing System Context

- **Current relevant functionality:**
  - ILP/BTP packet exchange between agent peers (Epic 13)
  - Payment channel infrastructure for EVM (Epic 8), XRP (Epic 9), Aptos (Epic 27)
  - Existing claim signers: `payment-channel-sdk.ts` (EVM EIP-712), `xrp-claim-signer.ts` (ed25519), `aptos-claim-signer.ts` (ed25519/BCS)
  - Settlement threshold detection in `agent-server.ts` triggers but cannot execute (logs "balance proof exchange not yet implemented")
  - TOON codec for Nostr event encoding in ILP packets

- **Technology stack:**
  - TypeScript, Node.js
  - Nostr event model (NIP-01 compliant)
  - ethers.js (EVM EIP-712 signing)
  - xrpl.js + ripple-keypairs (XRP signing)
  - @aptos-labs/ts-sdk (Aptos BCS + ed25519)
  - SQLite (better-sqlite3) for persistence

- **Integration points:**
  - `agent-server.ts` - BTP packet handling, settlement threshold checks
  - `toon-codec.ts` - Nostr event encoding/decoding
  - Existing claim signers for each chain
  - EventStore for claim persistence

### Enhancement Details

**What's being added/changed:**

1. **Claim Event Types (Kind 30001-30003):** Define new Nostr event kinds where the claim IS the packet. The event wraps message content while tags carry payment proof data:
   - Kind 30001: EVM claim events (EIP-712 signatures)
   - Kind 30002: XRP claim events (ed25519 signatures)
   - Kind 30003: Aptos claim events (ed25519/BCS signatures)

2. **Event Structure:** Claims wrap content rather than being attached to packets:

   ```
   Kind 30001 (EVM Claim Event):
     content: <actual message text or nested event JSON>
     tags: [
       ["claim-chain", "evm"],
       ["channel", channelId],
       ["amount", transferredAmount],
       ["nonce", nonce],
       ["locked", lockedAmount],
       ["locks-root", locksRoot],
       ["chain-sig", evmEIP712Signature],
       ["signer", evmAddress],
       // Unsigned claim requests for peer to sign:
       ["request-chain", "xrp"],
       ["request-channel", xrpChannelId],
       ["request-amount", expectedAmount]
     ]
   ```

3. **Claim Verification & Storage:** Verify incoming claim signatures using existing chain signers, enforce monotonic nonce/amount increase, persist verified claims for settlement.

4. **Bidirectional Exchange Flow:**
   - Sender wraps message in claim event with their signed proof + unsigned requests
   - Receiver verifies sender's claim, stores if valid
   - Receiver signs the unsigned requests
   - Receiver returns signed claims in FULFILL response (also as claim event)

5. **Automatic Settlement Execution:** When threshold exceeded, retrieve stored claims and submit on-chain via existing SDK methods.

**How it integrates:**

- Extends TOON codec to recognize claim event kinds (30001-30003)
- Claim events are valid Nostr events, maintaining protocol compatibility
- Existing claim signers are reused without modification
- Settlement execution uses existing SDK methods (`cooperativeSettle`, `PaymentChannelClaim`, `submitClaim`)
- Graceful degradation: peers without claim support receive regular events (claims stripped)

**Success criteria:**

- Every packet between peers includes signed balance proof as claim event
- Both parties accumulate verified signed claims from counterparty
- Settlement threshold triggers successful on-chain claim submission
- All three chains tested (EVM, XRP, Aptos) in Docker Agent Society test
- Existing peers without claim support continue to work (backward compatible)

---

## ILP Architecture Alignment

Per RFC-0027 (ILPv4) and RFC-0038 (Settlement Engines):

**ILP condition/fulfillment** - Used for end-to-end payment security:

- Sender creates condition (hash), receiver reveals fulfillment (preimage)
- Proves payment path completed, isolates risk between hops
- NOT for on-chain settlement

**Settlement Engines** - Handle actual value transfer:

- Exchange settlement messages through ILP packets (via `data` field)
- Triggered when accumulated balances exceed credit limits
- This epic implements this pattern using Nostr claim events

Our claim event approach aligns with this architecture - using claim events as the settlement message format exchanged between peers.

---

## Stories

### Story 30.1: Claim Event Kind Definitions & Types

**Goal:** Define Nostr event kinds 30001-30003 for claim events and create TypeScript types in shared package.

**Scope:**

- Define event kind constants: `CLAIM_EVENT_EVM = 30001`, `CLAIM_EVENT_XRP = 30002`, `CLAIM_EVENT_APTOS = 30003`
- Create tag schema for each chain type (amount, nonce, signature, signer, channel, request tags)
- Create TypeScript interfaces for claim event parsing/creation
- Add type guards for claim event detection
- Export from `@m2m/shared`

**Acceptance Criteria:**

- [ ] Event kinds 30001-30003 defined with clear documentation
- [ ] Tag schemas documented for each chain type
- [ ] TypeScript interfaces created for type-safe claim handling
- [ ] Type guards correctly identify claim events by kind
- [ ] Interfaces exported from shared package

---

### Story 30.2: Claim Event Builder & Parser

**Goal:** Create utilities to build claim events (wrapping content) and parse claim data from received events.

**Scope:**

- Create `ClaimEventBuilder` class with methods:
  - `wrapWithEVMClaim(content, signedClaim, unsignedRequests): NostrEvent`
  - `wrapWithXRPClaim(content, signedClaim, unsignedRequests): NostrEvent`
  - `wrapWithAptosClaim(content, signedClaim, unsignedRequests): NostrEvent`
- Create `ClaimEventParser` with methods:
  - `isClaimEvent(event): boolean`
  - `extractSignedClaim(event): SignedClaim | null`
  - `extractUnsignedRequests(event): UnsignedClaimRequest[]`
  - `extractContent(event): string` (unwrap original content)
- Handle nested event JSON in content field

**Acceptance Criteria:**

- [ ] Builder creates valid Nostr events with correct tags
- [ ] Parser extracts all claim data from events
- [ ] Content correctly wrapped/unwrapped (including nested events)
- [ ] Round-trip test: build → parse → verify data matches
- [ ] Invalid events handled gracefully (return null, not throw)

---

### Story 30.3: Claim Store with SQLite Persistence

**Goal:** Create SQLite-backed storage for received claims with monotonic nonce tracking.

**Scope:**

- Create `ClaimStore` class with SQLite persistence
- Schema: `received_claims(peer_id, chain, channel_id, nonce, amount, signature, signer_key, extra_data, created_at)`
- Methods: `storeEVMClaim`, `storeXRPClaim`, `storeAptosClaim`
- Methods: `getLatestClaim(peerId, chain, channelId)`, `getClaimsForSettlement(peerId, chain)`
- Enforce monotonic nonce/amount increase (reject stale claims)
- Index by peer_id, chain, channel_id for efficient queries

**Acceptance Criteria:**

- [ ] Claims persisted to SQLite database
- [ ] Monotonic nonce enforcement (reject nonce <= stored)
- [ ] Efficient retrieval by peer/chain/channel
- [ ] `getClaimsForSettlement` returns latest claim per channel
- [ ] Database created automatically if not exists

---

### Story 30.4: Claim Manager Orchestration

**Goal:** Create ClaimManager to orchestrate claim generation, verification, and storage using existing signers.

**Scope:**

- Create `ClaimManager` class coordinating:
  - Existing signers: PaymentChannelSDK (EVM), ClaimSigner (XRP), AptosClaimSigner (Aptos)
  - ClaimStore for persistence
  - ClaimEventBuilder/Parser for event handling
- Methods:
  - `generateClaimEventForPeer(peerId, content): NostrEvent` - wraps content with signed claims
  - `processReceivedClaimEvent(peerId, event): ProcessResult` - verify, store, return signed response
  - `getClaimsForSettlement(peerId, chain): SignedClaim[]`
- Verification includes: signature validity, signer identity, monotonic increase, within deposit bounds

**Acceptance Criteria:**

- [ ] Generates claim events using correct signer per chain
- [ ] Verifies received claims against expected peer addresses
- [ ] Rejects invalid signatures with warning log
- [ ] Rejects stale nonces with warning log
- [ ] Accepts and stores valid claims
- [ ] Returns signed claims for unsigned requests

---

### Story 30.5: BTP Integration - Send & Receive Flow

**Goal:** Integrate claim events into BTP packet send/receive flow in agent-server.ts.

**Scope:**

- Update `sendEventToPeer()`:
  - Use ClaimManager to wrap outgoing content in claim event
  - Include signed claims for channels with peer + unsigned requests
- Update `handleBtpMessage()` (receiving PREPARE):
  - Detect claim events, extract and verify claims
  - Process unsigned requests, generate signed response
  - Store valid claims
- Update `serializeBtpResponse()` (sending FULFILL):
  - Include signed claim responses in FULFILL
- Update `handlePeerResponse()` (receiving FULFILL):
  - Extract and store signed claims from response

**Acceptance Criteria:**

- [ ] Outgoing packets wrapped as claim events with balance proofs
- [ ] Incoming claim events parsed and claims extracted
- [ ] Valid claims stored, invalid claims logged and rejected
- [ ] FULFILL includes signed response to unsigned requests
- [ ] Backward compatible: non-claim events still processed normally

---

### Story 30.6: Automatic Settlement Execution

**Goal:** Update performSettlement to use stored claims for on-chain settlement.

**Scope:**

- Update `performSettlement()` in agent-server.ts:
  - Retrieve latest claim from ClaimStore for the channel/peer
  - EVM: Call `cooperativeSettle()` with both parties' balance proofs
  - XRP: Submit `PaymentChannelClaim` transaction with stored signature
  - Aptos: Call `aptosChannelSDK.submitClaim()` with stored claim
- Add settlement telemetry events for success/failure
- Handle missing claims gracefully (log warning, skip settlement)

**Acceptance Criteria:**

- [ ] EVM settlement uses stored claims for cooperative settle
- [ ] XRP settlement submits PaymentChannelClaim with signature
- [ ] Aptos settlement submits claim via SDK
- [ ] Missing claims logged but don't crash
- [ ] Settlement success/failure emitted as telemetry
- [ ] Docker Agent Society test verifies end-to-end settlement

---

## Compatibility Requirements

- [x] Existing BTP packet flow unchanged for non-claim events
- [x] Existing claim signers reused without API changes
- [x] Nostr event model preserved (claims ARE events, not attachments)
- [x] Settlement threshold logic unchanged (just adds execution capability)
- [x] Peers without claim support receive unwrapped content (graceful degradation)

---

## Risk Mitigation

- **Primary Risk:** Signature verification failures breaking packet flow
- **Mitigation:**
  - Graceful degradation: log warning but don't reject packet if claim invalid
  - Fall back to non-claim packet processing
  - Separate claim verification from packet handling
- **Secondary Risk:** Nonce desync between peers causing repeated claim rejections
- **Mitigation:**
  - Track nonces per-peer, per-channel, per-chain
  - Accept claims with higher nonces even if intermediate claims missed
  - Log warnings for unexpected nonce jumps
- **Rollback Plan:**
  - Feature flag to disable claim wrapping
  - Revert to current non-claim packet behavior
  - Stored claims remain in database for manual settlement if needed

---

## Definition of Done

- [ ] Claim event kinds (30001-30003) defined and documented
- [ ] Claims exchanged as events wrapping message content
- [ ] Received claims verified and stored in SQLite
- [ ] Settlement threshold triggers on-chain settlement using stored claims
- [ ] All three chains tested (EVM, XRP, Aptos)
- [ ] Docker Agent Society test passes with settlement verification
- [ ] Backward compatible with peers not supporting claims
- [ ] No regression in existing packet handling

---

## Technical Notes

### Claim Event Tag Schema

**EVM Claim (Kind 30001):**

```
tags: [
  ["claim-chain", "evm"],
  ["channel", "0x..."],           // bytes32 channel ID
  ["amount", "1000000"],          // transferredAmount in token units
  ["nonce", "5"],                 // monotonic nonce
  ["locked", "0"],                // lockedAmount
  ["locks-root", "0x000..."],     // bytes32 locks root
  ["chain-sig", "0x..."],         // EIP-712 signature
  ["signer", "0x..."],            // Ethereum address
  // Unsigned requests (optional):
  ["request-chain", "xrp"],
  ["request-channel", "ABC123..."],
  ["request-amount", "5000000"],
  ["request-nonce", "3"]
]
```

**XRP Claim (Kind 30002):**

```
tags: [
  ["claim-chain", "xrp"],
  ["channel", "ABC123..."],       // 64-char hex channel ID
  ["amount", "5000000"],          // drops
  ["chain-sig", "..."],           // ed25519 signature (128 hex)
  ["signer", "ED..."],            // ed25519 public key (66 hex)
  // Unsigned requests...
]
```

**Aptos Claim (Kind 30003):**

```
tags: [
  ["claim-chain", "aptos"],
  ["channel", "0x..."],           // channel owner address
  ["amount", "100000000"],        // octas
  ["nonce", "7"],                 // monotonic nonce
  ["chain-sig", "..."],           // ed25519 signature (128 hex)
  ["signer", "..."],              // ed25519 public key (64 hex)
  // Unsigned requests...
]
```

### Settlement Flow Diagram

```
Agent A sends to Agent B:
┌─────────────────────────────────────────────────────────┐
│ Kind 30001 (EVM Claim Event)                           │
│   content: "Hello from Agent A"                        │
│   tags: [                                              │
│     ["claim-chain", "evm"],                           │
│     ["channel", channelId],                           │
│     ["amount", "1000"],        ← A owes B 1000        │
│     ["chain-sig", sigA],       ← A's signature        │
│     ["request-chain", "evm"],  ← Request B to sign    │
│     ["request-amount", "500"], ← B owes A 500         │
│   ]                                                    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              Agent B receives, verifies:
              1. Verify sigA over (channel, 1000, nonce)
              2. Store claim: "A owes me 1000, signed"
              3. Sign requested claim: "I owe A 500"
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ FULFILL Response (Kind 30001)                          │
│   content: ""                                          │
│   tags: [                                              │
│     ["claim-chain", "evm"],                           │
│     ["channel", channelId],                           │
│     ["amount", "500"],         ← B owes A 500         │
│     ["chain-sig", sigB],       ← B's signature        │
│   ]                                                    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              Agent A receives, verifies:
              1. Verify sigB over (channel, 500, nonce)
              2. Store claim: "B owes me 500, signed"

When threshold exceeded:
- Agent A uses stored sigB to claim on-chain
- Agent B uses stored sigA to claim on-chain
```

---

## Future Enhancements (Out of Scope)

- Multi-hop claim aggregation (claims for intermediate connectors)
- Dispute resolution UI in Explorer
- Automatic channel rebalancing based on claim history
- Claim compression for high-frequency exchanges
- Hardware security module (HSM) integration for claim signing
