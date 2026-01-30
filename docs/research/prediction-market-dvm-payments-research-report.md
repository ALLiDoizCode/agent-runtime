# Research Report: Prediction Markets as DVM Payment Mechanism

**Date:** 2026-01-30
**Status:** Complete
**Research Type:** Mechanism Design + Protocol Architecture + Economic Analysis

---

## Executive Summary

### The Verdict: **Conditional Yes** — PM Framing Adds Value, But as an Optional Layer

Prediction market framing **does** improve DVM payments for specific use cases, but should be implemented as an **optional enhancement layer** on top of the existing ILP PREPARE/FULFILL escrow mechanism, not a replacement.

**Core Insight:** ILP PREPARE/FULFILL is already 80% of a prediction market. The missing 20% — provider staking and oracle verification — provides significant value for high-stakes, untrusted, or programmatically verifiable transactions, but adds complexity that's unnecessary for routine agent services.

**Primary Recommendation:** Implement a **tiered system**:

- **Tier 0 (Default):** Simple escrow via ILP (current model) — fast, low overhead
- **Tier 1 (Staked):** Provider collateral required — adds accountability
- **Tier 2 (Verified):** Oracle-based resolution — trustless verification
- **Tier 3 (Disputed):** Multi-agent consensus — dispute resolution

**Oracle Recommendation:** Implement a **four-tier oracle system** optimized for agent services:

1. Cryptographic proofs (deterministic outputs)
2. Multi-agent attestation (Schelling point consensus)
3. Optimistic verification with challenge period
4. Single-agent attestation (fast, low-value)

**NIP Proposal:** Four new event kinds (5950, 6950, 7950, 8950) extending NIP-90 DVM.

---

## Part 1: Structural Equivalence Assessment

### 1.1 ILP PREPARE/FULFILL Is Already a Prediction Market

The thesis is **correct**: ILP's conditional payment flow is structurally equivalent to a binary prediction market.

| ILP Primitive         | PM Analog          | Analysis                                                |
| --------------------- | ------------------ | ------------------------------------------------------- |
| PREPARE (amount)      | Buyer stakes on NO | ✅ Identical — funds locked as conditional commitment   |
| executionCondition    | Market condition   | ✅ Identical — SHA-256 hash defines resolution criteria |
| expiresAt             | Market expiry      | ✅ Identical — timeout enforces finality                |
| FULFILL (fulfillment) | YES resolution     | ✅ Identical — preimage releases funds to counterparty  |
| REJECT                | NO resolution      | ✅ Identical — funds return to originator               |
| [MISSING]             | Provider stake     | ❌ **Gap** — no counterparty capital at risk            |
| [MISSING]             | Oracle             | ❌ **Gap** — verification is trust-based                |
| [MISSING]             | Dispute mechanism  | ❌ **Gap** — no appeal process                          |

**What ILP Already Provides (The 80%):**

- Conditional fund locking (PREPARE)
- Binary resolution (FULFILL/REJECT)
- Time-bounded commitment (expiry)
- Currency-agnostic operation
- Atomic settlement

**What PM Framing Adds (The 20%):**

1. **Provider Stake:** Counterparty capital at risk
2. **Oracle Mechanism:** Trustless outcome verification
3. **Dispute Resolution:** Protocol-defined appeals
4. **Quality Signal:** Stake size indicates provider confidence
5. **Symmetric Incentives:** Both parties have skin in the game

### 1.2 How Existing Markets Implement This

**Polymarket (via Gnosis CTF + UMA):**

- Uses [Gnosis Conditional Tokens Framework](https://github.com/gnosis/conditional-tokens-contracts) for binary YES/NO positions
- Each position backed by 1 USDC collateral
- [UMA Optimistic Oracle](https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work) resolves outcomes
- 2-hour challenge period for disputes
- DVM (Data Verification Mechanism) as final backstop

**Lightning Network (HTLCs):**

- [Hashed Timelock Contracts](https://docs.lightning.engineering/the-lightning-network/multihop-payments/hash-time-lock-contract-htlc) provide conditional payment
- Hashlock: funds released only with preimage
- Timelock: automatic refund on expiry
- Multi-hop routing via chained HTLCs

**Key Insight:** ILP PREPARE/FULFILL is architecturally closer to Lightning HTLCs than to Polymarket. The difference is that Lightning enforces HTLCs on-chain, while ILP uses them for bilateral accounting between trusted peers.

### 1.3 M2M's Current Implementation Gap

Based on codebase analysis, the current M2M implementation:

**Uses execution conditions structurally but not cryptographically:**

```typescript
// Current: Deterministic fulfillment (not tied to task result)
const AGENT_FULFILLMENT = Buffer.alloc(32, 0);

// Should be: Cryptographic fulfillment from task outcome
const fulfillment = sha256(taskResultHash);
```

**Payment validation is the gate, not cryptographic proof:**

- Agent validates `packet.amount >= pricing[kind]`
- Returns fixed fulfillment on success
- No tie between fulfillment preimage and actual work delivered

**This means:** The current system is effectively "pay-to-invoke" not "pay-for-result". The provider has no capital at risk and the fulfillment doesn't prove anything about the work quality.

---

## Part 2: Oracle Architecture Recommendation

### 2.1 The Oracle Problem for Agent Services

Agent-to-agent services require verification that work was completed correctly. Unlike financial oracles (price feeds), agent service oracles must verify:

- **Computation correctness:** Did the output match the specification?
- **Data authenticity:** Was the retrieved data genuine?
- **Service completion:** Was the work actually performed?

### 2.2 Four-Tier Oracle System

**Tier 1: Cryptographic Proofs (Trustless, High-Value)**

Best for: Deterministic computations, data retrieval, transformations with checkable properties.

| Mechanism       | Use Case                       | Verification                        |
| --------------- | ------------------------------ | ----------------------------------- |
| Output hash     | Deterministic computation      | SHA-256(output) matches commitment  |
| Merkle proof    | Data retrieval                 | Proof of inclusion in known dataset |
| ZK proof        | Privacy-preserving computation | Verify without revealing inputs     |
| TEE attestation | Secure execution               | Signed by trusted hardware enclave  |

**Implementation:**

```typescript
// Job request includes expected output commitment
interface VerifiableJobRequest {
  kind: 5950
  tags: [
    ['output-commitment', sha256(expectedOutput)],  // Known good output hash
    ['verification-tier', '1'],                     // Require cryptographic proof
  ]
}

// Result includes proof
interface VerifiableJobResult {
  kind: 6950
  tags: [
    ['output-hash', sha256(actualOutput)],
    ['proof-type', 'merkle' | 'zk' | 'tee'],
    ['proof', proofData],
  ]
}
```

**Tier 2: Multi-Agent Attestation (Decentralized, Medium-Value)**

Best for: Tasks requiring judgment, analysis, or subjective quality assessment.

Based on [Schelling point](https://medium.com/kleros/kleros-a-decentralized-justice-protocol-for-the-internet-38d596a6300d) coordination:

- N agents independently verify the result
- Agents stake on their attestation
- Majority consensus determines outcome
- Outliers lose stake (penalized for incoherence)

**Implementation:**

```typescript
interface AttestationRequest {
  kind: 7950
  tags: [
    ['e', jobResultEventId],
    ['attestation', 'valid' | 'invalid' | 'partial'],
    ['stake', amountStaked],
    ['confidence', 0.0-1.0],
  ]
}

// Resolution when quorum reached
const resolution = attestations
  .filter(a => a.stake >= minStake)
  .reduce((votes, a) => {
    votes[a.attestation] += a.stake  // Stake-weighted voting
    return votes
  }, {})
```

**Tier 3: Optimistic Verification (Delayed, Disputed)**

Best for: Complex tasks where verification is expensive but disputes are rare.

Based on [UMA's Optimistic Oracle](https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work):

- Provider submits result with stake
- Challenge period (configurable: 2 hours to 7 days)
- No challenge = result accepted
- Challenge escalates to Tier 2 or higher

**Implementation:**

```typescript
interface OptimisticResult {
  kind: 6950;
  tags: [
    ['challenge-period', secondsUntilFinal],
    ['provider-stake', bondAmount],
    ['status', 'pending' | 'challenged' | 'finalized'],
  ];
}

// Challenge event
interface ChallengeEvent {
  kind: 8950;
  tags: [
    ['e', resultEventId],
    ['challenger-stake', bondAmount], // Must match provider stake
    ['reason', challengeReason],
  ];
}
```

**Tier 4: Single-Agent Attestation (Fast, Low-Value)**

Best for: Low-value transactions, trusted contexts, or when speed matters more than security.

- Designated oracle agent verifies
- Fastest resolution (immediate)
- Oracle reputation at stake
- Suitable when transaction value < oracle manipulation cost

### 2.3 Oracle Selection Matrix

| Task Type                 | Verification Cost | Recommended Tier | Challenge Period |
| ------------------------- | ----------------- | ---------------- | ---------------- |
| Deterministic computation | Low               | Tier 1           | None             |
| Data retrieval with proof | Low               | Tier 1           | None             |
| API call execution        | Medium            | Tier 3           | 2 hours          |
| Code analysis/review      | High              | Tier 2           | 24 hours         |
| Content generation        | High              | Tier 2           | 24 hours         |
| Complex analysis          | Very High         | Tier 2 + Tier 3  | 7 days           |
| Simple query              | Minimal           | Tier 4           | None             |

### 2.4 Verification Cost Economics

Key insight from [Chainlink](https://chain.link/education-hub/oracle-computation) and [optimistic rollups](https://ethereum.org/developers/docs/scaling/optimistic-rollups/): **verification should be cheaper than execution**.

| Approach                 | Verification Cost    | Security    | Speed   |
| ------------------------ | -------------------- | ----------- | ------- |
| Re-execute               | 100% of execution    | Highest     | Slow    |
| ZK proof                 | ~10-50% of execution | Highest     | Medium  |
| Optimistic + fraud proof | ~0.1% (dispute only) | High        | 7 days  |
| Multi-agent attestation  | N × attestation cost | Medium-High | Hours   |
| Single attestation       | Minimal              | Low         | Instant |

**Recommendation:** Default to optimistic verification (Tier 3) with automatic escalation to multi-agent attestation (Tier 2) on challenge. This provides:

- Fast path: 98%+ of transactions resolve without challenge
- Secure path: Disputed transactions get robust verification
- Economic efficiency: Verification cost only incurred when needed

---

## Part 3: Provider Staking Specification

### 3.1 Why Provider Staking Matters

**Current Problem:** Providers have asymmetric incentives:

- Accept job → attempt work → succeed = get paid
- Accept job → attempt work → fail = lose nothing
- Accept job → abandon = lose nothing (just time wasted)

**With Staking:**

- Accept job + stake → succeed = get paid + stake returned
- Accept job + stake → fail = lose stake
- Accept job + stake → abandon = lose stake + reputation

### 3.2 Stake Ratio Recommendations

Based on analysis of [DeFi staking economics](https://consensys.io/blog/understanding-slashing-in-ethereum-staking-its-importance-and-consequences) and [escrow patterns](https://research.csiro.au/blockchainpatterns/general-patterns/blockchain-payment-patterns/escrow-2/):

| Transaction Value     | Provider Stake | Rationale                 |
| --------------------- | -------------- | ------------------------- |
| < 1000 sats           | 0% (optional)  | Overhead > benefit        |
| 1000 - 10,000 sats    | 10%            | Skin in game, low barrier |
| 10,000 - 100,000 sats | 25%            | Meaningful accountability |
| 100,000 - 1M sats     | 50%            | Symmetric risk            |
| > 1M sats             | 50-100%        | High-value protection     |

**Formula:**

```typescript
const providerStake = Math.min(jobPayment * stakeRatio, provider.maxStakeCapacity);

// Stake ratio increases with job value
const stakeRatio =
  jobPayment < 1000
    ? 0
    : jobPayment < 10000
      ? 0.1
      : jobPayment < 100000
        ? 0.25
        : jobPayment < 1000000
          ? 0.5
          : 0.5;
```

### 3.3 Stake Mechanics

**Lock Phase:**

```
1. Job posted (Kind 5950) with stake requirement
2. Provider accepts → stakes collateral in escrow
3. Both stakes locked until resolution
```

**Resolution Outcomes:**

| Outcome            | Buyer Stake | Provider Stake    | Notes                |
| ------------------ | ----------- | ----------------- | -------------------- |
| Success (FULFILL)  | → Provider  | → Provider        | Provider wins both   |
| Failure (REJECT)   | → Buyer     | → Buyer           | Buyer compensated    |
| Timeout            | → Buyer     | → Protocol/Buyer  | Provider penalized   |
| Disputed → Success | → Provider  | → Provider - fees | Oracle fees deducted |
| Disputed → Failure | → Buyer     | → Buyer + penalty | Dispute penalty      |

**Slashing Conditions:**

- Timeout without delivery: 100% slash
- Failed verification: 100% slash
- Disputed and lost: 100% slash + dispute fee
- Abandoned job: 100% slash + reputation penalty

### 3.4 Capital Efficiency Considerations

**Problem:** Stake locks capital during execution, reducing provider liquidity.

**Mitigations:**

1. **Time-bounded stakes:** Shorter jobs = less capital lockup
2. **Reputation discount:** High-reputation providers stake less
3. **Stake pooling:** Providers pool capital, share risk
4. **Insurance markets:** Third parties insure against slashing

**Return on Staked Capital:**

```
Required ROI = (Stake Amount × Lock Duration × Opportunity Cost) / Expected Revenue

Example:
- Job payment: 10,000 sats
- Provider stake: 2,500 sats (25%)
- Lock duration: 1 hour
- Opportunity cost: 5% APY

Required Premium = 2,500 × (1/8760) × 0.05 = 0.014 sats
```

This is negligible for short-duration jobs, but becomes significant for long-running tasks.

### 3.5 Impact on Market Dynamics

**Positive Effects:**

- Quality signal: Higher stake = higher confidence
- Accountability: Providers can't abandon without cost
- Trust reduction: Stakes substitute for reputation

**Negative Effects:**

- Barrier to entry: New providers need capital
- Concentration: Well-capitalized providers dominate
- Gaming: Flash loan attacks on stakes (mitigated by time locks)

**Recommendation:** Make staking optional for Tier 0 (simple escrow) and required for Tier 1+. Allow reputation to reduce required stake ratios over time.

---

## Part 4: Draft NIP Specification

### 4.1 Event Kind Allocation

| Kind | Name               | Purpose                             | Extends   |
| ---- | ------------------ | ----------------------------------- | --------- |
| 5950 | Market Job Request | Job request with stake requirements | Kind 5XXX |
| 6950 | Market Job Result  | Result with settlement instructions | Kind 6XXX |
| 7950 | Market Attestation | Oracle/verifier attestation         | Kind 7000 |
| 8950 | Market Dispute     | Challenge/dispute initiation        | New       |

### 4.2 Kind 5950: Market Job Request

```json
{
  "kind": 5950,
  "content": "<job specification>",
  "tags": [
    // Standard DVM tags (from NIP-90)
    ["i", "<input data>", "<input type>"],
    ["output", "<output mime type>"],
    ["param", "<param name>", "<param value>"],

    // Market-specific tags
    ["bid", "<millisats>"], // Buyer's payment
    ["stake-required", "<millisats>"], // Required provider stake
    ["stake-ratio", "0.25"], // Or ratio instead of absolute
    ["verification-tier", "1|2|3|4"], // Oracle tier required
    ["challenge-period", "<seconds>"], // For Tier 3
    ["output-commitment", "<hash>"], // For Tier 1 verification

    // Settlement tags
    ["settlement-currency", "BTC|USDC|..."],
    ["settlement-address", "<ILP address>"],

    // Timeout/expiry
    ["expiry", "<unix timestamp>"],
    ["max-execution-time", "<seconds>"]
  ]
}
```

### 4.3 Kind 6950: Market Job Result

```json
{
  "kind": 6950,
  "content": "<job result>",
  "tags": [
    // Reference to request
    ["e", "<request event id>", "<relay>", "root"],
    ["p", "<requester pubkey>"],

    // Result metadata
    ["status", "success|partial|failed"],
    ["output-hash", "<sha256 of output>"],

    // Verification proof (Tier 1)
    ["proof-type", "hash|merkle|zk|tee"],
    ["proof", "<proof data>"],

    // Settlement
    ["amount-received", "<millisats>"],
    ["provider-stake", "<millisats>"],
    ["settlement-status", "pending|finalized|disputed"],

    // Challenge period (Tier 3)
    ["challenge-deadline", "<unix timestamp>"],
    ["finalization-block", "<block height>"] // Optional: for on-chain anchoring
  ]
}
```

### 4.4 Kind 7950: Market Attestation

```json
{
  "kind": 7950,
  "content": "<attestation rationale>",
  "tags": [
    ["e", "<result event id>", "<relay>", "reply"],

    // Attestation
    ["attestation", "valid|invalid|partial|abstain"],
    ["confidence", "0.0-1.0"],

    // Stake (for weighted voting)
    ["attester-stake", "<millisats>"],

    // Evidence
    ["evidence-type", "execution|verification|audit"],
    ["evidence-hash", "<hash of evidence>"]
  ]
}
```

### 4.5 Kind 8950: Market Dispute

```json
{
  "kind": 8950,
  "content": "<dispute reason>",
  "tags": [
    ["e", "<result event id>", "<relay>", "root"],
    ["p", "<disputing party pubkey>"],

    // Dispute details
    ["dispute-type", "non-delivery|incorrect|timeout|fraud"],
    ["challenger-stake", "<millisats>"], // Must match provider stake

    // Evidence
    ["evidence", "<evidence data or hash>"],

    // Resolution request
    ["resolution-tier", "2|3"], // Escalate to which tier
    ["arbiters", "<pubkey1>", "<pubkey2>", "..."] // Preferred arbiters
  ]
}
```

### 4.6 Event Flow Diagram

```
┌─────────────┐                              ┌─────────────┐
│   BUYER     │                              │  PROVIDER   │
└─────────────┘                              └─────────────┘
       │                                            │
       │  Kind 5950: Market Job Request             │
       │  + ILP PREPARE (buyer stake)               │
       │────────────────────────────────────────────>
       │                                            │
       │  Kind 7000: payment-required               │
       │  (provider accepts, stakes collateral)     │
       │<────────────────────────────────────────────
       │                                            │
       │         [Provider executes work]           │
       │                                            │
       │  Kind 6950: Market Job Result              │
       │  + verification proof                      │
       │<────────────────────────────────────────────
       │                                            │
       ├──── [If Tier 1: Verify proof] ────────────>│
       │     Hash matches? → FULFILL                │
       │                                            │
       ├──── [If Tier 3: Challenge Period] ────────>│
       │     No challenge? → FULFILL after deadline │
       │                                            │
       ├──── [If Tier 2: Multi-Agent] ─────────────>│
       │     Attestations collected                 │
       │     Quorum reached? → FULFILL/REJECT       │
       │                                            │
       │  ILP FULFILL/REJECT                        │
       │  (settlement executed)                     │
       │<──────────────────────────────────────────>│
```

### 4.7 Backwards Compatibility

Market jobs (Kind 5950) are **backwards compatible** with standard DVM:

- Standard Kind 5XXX tags preserved
- Market tags optional — omitting them = simple escrow
- Providers can choose to accept without staking (Tier 0)
- Existing DVM clients ignore unknown tags

**Upgrade Path:**

1. Phase 1: Add market tags as optional
2. Phase 2: Implement stake verification in connectors
3. Phase 3: Deploy oracle network
4. Phase 4: Enable dispute resolution

---

## Part 5: Escrow Comparison Matrix

### 5.1 Feature Comparison

| Dimension                 | Simple Escrow (ILP)        | PM-Enhanced           |
| ------------------------- | -------------------------- | --------------------- |
| **Complexity**            | Low                        | Medium-High           |
| **Implementation Effort** | Already exists             | 4-8 weeks             |
| **Provider Stake**        | No                         | Yes (configurable)    |
| **Verification**          | Trust-based                | Oracle-based          |
| **Dispute Resolution**    | Manual                     | Protocol-defined      |
| **Settlement Speed**      | Immediate                  | Immediate to 7 days   |
| **Capital Efficiency**    | High                       | Medium (stake locked) |
| **Trust Requirements**    | Peer trust                 | Minimal               |
| **Attack Surface**        | Low                        | Medium                |
| **Best For**              | Trusted parties, low value | Untrusted, high value |

### 5.2 Decision Tree: When to Use Each

```
                    ┌─────────────────────┐
                    │  Transaction Value  │
                    │    > 100,000 sats?  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┴────────────────┐
              │ NO                              │ YES
              ▼                                 ▼
     ┌────────────────┐               ┌────────────────┐
     │ Trusted party? │               │ Verification   │
     │                │               │ possible?      │
     └───────┬────────┘               └───────┬────────┘
             │                                 │
    ┌────────┴────────┐              ┌────────┴────────┐
    │ YES         NO  │              │ YES         NO  │
    ▼                 ▼              ▼                 ▼
┌────────┐    ┌────────────┐   ┌──────────┐    ┌──────────────┐
│ Tier 0 │    │  Tier 1    │   │ Tier 1/2 │    │   Tier 3     │
│ Escrow │    │  + Stake   │   │ + Oracle │    │ + Optimistic │
└────────┘    └────────────┘   └──────────┘    └──────────────┘
```

### 5.3 When PM Framing Wins

1. **High-value transactions** (> 100k sats): Provider stake ensures accountability
2. **Untrusted counterparties**: Oracle verification substitutes for trust
3. **Programmatically verifiable tasks**: Cryptographic proofs enable trustless resolution
4. **Repeat interactions with unknowns**: Build reputation through verified completions
5. **Dispute-prone services**: Protocol-defined resolution is faster than manual

### 5.4 When Simple Escrow Wins

1. **Low-value transactions** (< 10k sats): Overhead exceeds benefit
2. **Established trust**: Existing relationship makes verification redundant
3. **Simple binary tasks**: No ambiguity in completion criteria
4. **Speed-critical services**: Challenge periods add latency
5. **High-frequency interactions**: Staking capital cost accumulates

### 5.5 Honest Assessment: Is This Just Escrow With Extra Steps?

**Yes, partially.** The PM framing doesn't change the fundamental mechanism (conditional payment release). What it adds:

| Added Component     | Value-Add            | Complexity Cost             |
| ------------------- | -------------------- | --------------------------- |
| Provider stake      | High: Accountability | Medium: Capital management  |
| Oracle verification | High: Trustless      | High: Oracle infrastructure |
| Dispute resolution  | Medium: Automation   | High: Protocol complexity   |
| PM terminology      | Low: Marketing       | Low: Documentation          |

**Recommendation:** Implement the functional improvements (staking, verification, disputes) without over-committing to PM terminology. Call it "verified escrow" or "staked DVM" rather than "prediction market" to avoid confusion.

---

## Part 6: Implementation Roadmap

### Phase 1: Minimal Viable Mechanism (2-3 weeks)

**Goal:** Provider staking with simple timeout resolution.

**Deliverables:**

- [ ] Kind 5950/6950 event parsing
- [ ] Stake requirement validation in AgentNode
- [ ] Stake escrow in TigerBeetle accounts
- [ ] Timeout-based automatic resolution
- [ ] FULFILL/REJECT based on stake state

**No oracle needed** — uses existing trust model with added provider accountability.

### Phase 2: Cryptographic Verification (2-3 weeks)

**Goal:** Tier 1 oracle for deterministic computations.

**Deliverables:**

- [ ] Output commitment in job requests
- [ ] Hash verification on result submission
- [ ] Cryptographic fulfillment (preimage = task hash)
- [ ] Automatic resolution on hash match

**Enables:** Trustless verification for deterministic tasks.

### Phase 3: Optimistic Verification (3-4 weeks)

**Goal:** Tier 3 oracle with challenge periods.

**Deliverables:**

- [ ] Challenge period tracking
- [ ] Kind 8950 dispute event handling
- [ ] Stake matching for challengers
- [ ] Automatic finalization after deadline
- [ ] Escalation to Tier 2 on challenge

**Enables:** Efficient resolution for complex tasks (98%+ resolve without challenge).

### Phase 4: Multi-Agent Attestation (4-6 weeks)

**Goal:** Tier 2 oracle with Schelling point consensus.

**Deliverables:**

- [ ] Kind 7950 attestation events
- [ ] Stake-weighted voting mechanism
- [ ] Quorum and threshold configuration
- [ ] Outlier slashing
- [ ] Integration with existing coordination framework

**Enables:** Decentralized dispute resolution without trusted arbiters.

### Dependencies

```
Phase 1 ─────> Phase 2 ─────> Phase 3 ─────> Phase 4
   │              │              │              │
   │              │              │              └── Requires: Coordination framework (Epic 20)
   │              │              └── Requires: Time-based event scheduling
   │              └── Requires: Cryptographic fulfillment refactor
   └── Requires: TigerBeetle escrow accounts
```

---

## Part 7: Risk Register

### 7.1 Top Risks

| Risk                           | Likelihood | Impact | Mitigation                                                       |
| ------------------------------ | ---------- | ------ | ---------------------------------------------------------------- |
| **Oracle manipulation**        | Medium     | High   | Multi-party attestation, stake requirements, Schelling penalties |
| **Stake griefing**             | Medium     | Medium | Minimum stake thresholds, timeout limits, reputation costs       |
| **Complexity deters adoption** | High       | Medium | Tier 0 default, opt-in higher tiers, clear documentation         |
| **Capital inefficiency**       | Medium     | Low    | Reputation discounts, stake pooling, short timeouts              |
| **Flash loan attacks**         | Low        | High   | Time-locked stakes, minimum lock periods                         |
| **Oracle unavailability**      | Medium     | Medium | Fallback to Tier 3 (optimistic), multiple oracle sources         |
| **Collusion**                  | Low        | High   | Randomized oracle selection, reputation tracking                 |

### 7.2 Attack Vectors and Defenses

**Attack 1: Stake Griefing**

- Attacker accepts jobs, never delivers, locks buyer funds
- **Defense:** Timeout auto-resolves in buyer's favor, attacker loses stake

**Attack 2: Oracle Bribery**

- Attacker bribes oracle to falsely attest result
- **Defense:** Multi-agent attestation, bribe cost > stake value, reputation slashing

**Attack 3: Sybil Oracle Attack**

- Attacker creates many fake oracle identities
- **Defense:** Stake-weighted voting, minimum stake requirements, identity verification

**Attack 4: Front-running Resolution**

- Attacker observes pending resolution, acts on information
- **Defense:** Commit-reveal scheme, encrypted attestations until quorum

**Attack 5: Challenge Spam**

- Attacker challenges all results to delay settlement
- **Defense:** Challenger must match provider stake, loses stake on invalid challenge

### 7.3 Residual Risk Assessment

After mitigations:

- **High residual risk:** Complexity adoption barrier (accept and monitor)
- **Medium residual risk:** Oracle manipulation for edge cases (insurance fund)
- **Low residual risk:** Technical attacks (standard security practices)

---

## Part 8: Special Topics

### 8.1 Integration with Job Chaining

When DVM jobs depend on previous results:

**Sequential Markets:**

```
Job A (market) → Resolution A → Job B (uses A's result) → Resolution B
```

**Design Decisions:**

1. **Job B market opens after Job A resolves:** Safest, but adds latency
2. **Job B can reference Job A's pending result:** Provider stakes on both A and B succeeding
3. **Chain failure handling:** If Job A fails, Job B automatically resolves NO

**Recommendation:** Allow conditional markets where Job B's condition includes Job A's success:

```json
{
  "kind": 5950,
  "tags": [
    ["depends-on", "<job-a-event-id>"],
    ["dependency-condition", "success"]
  ]
}
```

### 8.2 Multi-Currency Considerations

**Problem:** Buyer and provider may use different currencies.

**Solution Options:**

1. **Provider matches buyer's currency:** Simple, provider bears FX risk
2. **Settle in common numeraire (USDC):** Standard unit of account
3. **ILP handles conversion:** FX at settlement time via connectors
4. **Currency specified in market:** Explicit settlement currency tag

**Recommendation:** Add `settlement-currency` tag, default to buyer's currency, allow provider to quote in different currency with ILP handling conversion.

### 8.3 Reputation Integration

Stakes can be reduced based on reputation:

```typescript
const effectiveStakeRatio = baseStakeRatio * (1 - reputationDiscount);

// Example discounts
const reputationDiscount = {
  'new-provider': 0.0, // No discount
  '10-completions': 0.1, // 10% discount
  '100-completions': 0.25, // 25% discount
  '1000-completions': 0.5, // 50% discount
};
```

This reduces capital requirements for established providers while maintaining accountability.

---

## Conclusion

### Summary of Findings

1. **ILP PREPARE/FULFILL is structurally a prediction market** — the framing is accurate but the added value comes from the missing components (staking, oracles, disputes), not the terminology.

2. **Provider staking adds significant value** — it creates symmetric incentives and accountability without requiring trust.

3. **Oracle tiers enable flexible verification** — from trustless cryptographic proofs to efficient optimistic schemes.

4. **Simple escrow remains the right default** — PM enhancements should be opt-in for appropriate use cases.

5. **Implementation is feasible** — builds on existing M2M architecture with well-defined phases.

### Final Recommendation

**Implement PM mechanics as an optional enhancement layer:**

- **Default (Tier 0):** Simple escrow via ILP — unchanged from current model
- **Tier 1:** Add provider staking for accountability
- **Tier 2:** Add multi-agent attestation for disputes
- **Tier 3:** Add optimistic verification for efficiency

This approach:

- ✅ Preserves simplicity for routine transactions
- ✅ Adds accountability for high-value services
- ✅ Enables trustless verification where possible
- ✅ Provides dispute resolution for edge cases
- ✅ Maintains backwards compatibility with NIP-90

The prediction market framing is useful for understanding the mechanism, but the implementation should focus on **functional improvements** (staking, verification, disputes) rather than PM terminology.

---

## Sources

### Prediction Markets

- [Polymarket Documentation](https://docs.polymarket.com/)
- [How Polymarket Works - RocknBlock](https://rocknblock.io/blog/how-polymarket-works-the-tech-behind-prediction-markets)
- [Gnosis Conditional Tokens Framework](https://github.com/gnosis/conditional-tokens-contracts)
- [Augur Whitepaper](https://ar5iv.labs.arxiv.org/html/1501.01042)

### Oracle Systems

- [UMA Optimistic Oracle Documentation](https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work)
- [UMA DVM 2.0](https://docs.uma.xyz/protocol-overview/dvm-2.0)
- [Chainlink Oracle Computation](https://chain.link/education-hub/oracle-computation)
- [Kleros Whitepaper](https://kleros.io/whitepaper.pdf)

### Payment Protocols

- [Interledger Protocol V4](https://interledger.org/developers/rfcs/interledger-protocol/)
- [ILP Packet Lifecycle](https://interledger.org/developers/blog/ilp-packet-lifecycle/)
- [Lightning Network HTLCs](https://docs.lightning.engineering/the-lightning-network/multihop-payments/hash-time-lock-contract-htlc)
- [NIP-90 Data Vending Machine](https://github.com/nostr-protocol/nips/blob/master/90.md)

### Mechanism Design

- [Robin Hanson - Futarchy](https://www.overcomingbias.com/p/futarchy-details)
- [Escrow Pattern - CSIRO](https://research.csiro.au/blockchainpatterns/general-patterns/blockchain-payment-patterns/escrow-2/)
- [Optimistic Rollups - Ethereum.org](https://ethereum.org/developers/docs/scaling/optimistic-rollups/)

### Staking & Slashing

- [Ethereum Slashing - Consensys](https://consensys.io/blog/understanding-slashing-in-ethereum-staking-its-importance-and-consequences)
- [Slashing Primer - Coinbase](https://www.coinbase.com/institutional/research-insights/resources/education/slashing-primer)
- [Restaking Risks - Cubist](https://cubist.dev/blog/slashing-risks-you-need-to-think-about-when-restaking)
