# Prediction Market DVM Payments - Conversation Handoff

**Date:** 2026-01-30
**Purpose:** Continue conversation about prediction market mechanics for agent services
**Related Files:**

- `docs/research/deep-research-prompt-prediction-market-payments.md` (original prompt)
- `docs/research/prediction-market-dvm-payments-research-report.md` (initial research)

---

## Conversation Summary

### Phase 1: Initial Research

Started with deep research prompt exploring whether prediction market mechanics could serve as DVM payment mechanism. Initial research proposed 4 new NIPs:

- Kind 5950: Market Job Request
- Kind 6950: Market Job Result
- Kind 7950: Market Attestation
- Kind 8950: Market Dispute

### Phase 2: Simplification Through Discussion

Key insights emerged that dramatically simplified the design:

1. **ILP PREPARE/FULFILL is already 80% of a prediction market**
   - Conditional fund locking (PREPARE)
   - Binary resolution (FULFILL/REJECT)
   - Time-bounded commitment (expiry)

2. **Provider stake can be just another ILP PREPARE packet**
   - No new event kinds needed
   - Provider sends PREPARE in opposite direction
   - Uses inverse condition (SUCCESS vs FAILURE)

3. **Proof = Nostr event in FULFILL/REJECT data field**
   - TOON-encoded events already supported
   - Signature on event IS the attestation
   - Programmatic verification for agent-to-agent

4. **Two-condition pattern:**

   ```
   Buyer PREPARE(payment) → Provider, condition: H(success_proof)
   Provider PREPARE(stake) → Buyer, condition: H(failure_proof)

   SUCCESS: Provider FULFILLs with success_proof, stake expires back
   FAILURE: Payment expires back, buyer FULFILLs stake with failure_proof
   ```

### Phase 3: Redundancy Analysis (PO Review)

Analyzed against existing epics. Found that simplified model requires NO NEW NIPs:

| Proposed  | Existing Coverage            |
| --------- | ---------------------------- |
| Kind 5950 | Epic 17 Kind 5900 + DVM tags |
| Kind 6950 | Epic 17 Kind 6900            |
| Kind 7950 | Epic 21 Kind 30880           |
| Kind 8950 | Epic 21 Kind 30882           |

**Conclusion:** Bilateral staking (buyer + provider only) can be implemented with existing infrastructure + minor Epic 17 enhancements.

### Phase 4: The Open Question (Where We Left Off)

**User asked:** What if others could stake YES or NO on service delivery?

This transforms bilateral escrow into a **true prediction market**:

```
YES Stakers          MARKET              NO Stakers
───────────          ──────              ──────────
• Provider           "Will X             • Buyer
• Vouchers            deliver?"          • Skeptics
• Reputation                             • Competitors
  backers                                • Hedgers
```

**What this enables:**

1. **Price discovery** - Market odds signal provider reliability
2. **Social graph vouching** - Followers stake YES on agents they trust
3. **Market-based reputation** - Win rate replaces attestation system
4. **Economic dispute resolution** - Stakes replace voting

**This DOES require new infrastructure:**

- Market creation events
- Stake aggregation
- AMM/market maker for liquidity
- Multi-party proportional settlement

---

## Key Design Questions to Continue

1. **Who can stake?**
   - Anyone? (full market)
   - Social graph only? (trust-bounded)
   - Minimum stake requirements?

2. **Market maker needed?**
   - AMM (like Uniswap) for continuous liquidity
   - Order book (like Polymarket)
   - Simple pool (no market making)

3. **Resolution mechanism?**
   - Programmatic (hash proof)
   - Oracle network
   - Stake-weighted vote
   - Designated resolver

4. **Integration with existing epics?**
   - Epic 17 (DVM) → Market creation trigger
   - Epic 20 (Coordination) → Resolution voting
   - Epic 21 (Reputation) → Historical win rate
   - Epic 13 (Social Graph) → Voucher eligibility

---

## Epic 26: Agent Service Markets (CREATED)

The full market model has been formalized as **Epic 26** (renumbered from proposed Epic 24 since Epic 24 is Live Streaming):

**See:** `docs/prd/epic-26-agent-service-markets.md`

```
Epic 26: Agent Service Markets

Stories (15 total):
26.1   Market Types & Schemas
26.2   Market Creation (Kind 5960)
26.3   Stake Submission (Kind 5961)
26.4   Pool Manager
26.5   Social Graph Stake Eligibility
26.6   Resolution Engine
26.7   ZK Proof Auto-Resolution
26.8   Challenge Mechanism (Kind 5962)
26.9   Arbitration Voting (Kind 5963)
26.10  Payout Calculator & Distribution
26.11  Market Resolution (Kind 6960)
26.12  create_market Skill
26.13  stake_on_market Skill
26.14  Market-Based Reputation Scoring
26.15  Integration Tests
```

**Dependencies:**

- Epic 6 (TigerBeetle) - Pool accounting
- Epic 13 (Social Graph) - Stake eligibility
- Epic 17 (DVM) - Job request trigger
- Epic 21 (Reputation) - Historical accuracy
- **Epic 25 (zkVM Verification)** - Auto-resolution via ZK proofs

---

## Recommendation Options

**Option A: Minimal (Bilateral Staking Only)**

- Add `stake-required` tag to Kind 5900
- Document two-PREPARE pattern
- Use existing Epic 17/21 infrastructure
- NO new epics needed

**Option B: Full Market** ✅ **SELECTED - Now Epic 25 + Epic 26**

- **Epic 25**: zkVM Compute Verification (trustless proof of execution)
- **Epic 26**: Agent Service Markets (multi-party staking)
- ZK proofs enable automatic market resolution
- Market-based reputation complements attestations

**Option C: Phased Approach**

1. First: Option A (bilateral staking)
2. Later: Option B if bilateral proves insufficient

---

## Files to Read for Context

```
docs/prd/epic-17-nip-90-dvm-compatibility.md
docs/prd/epic-20-multi-agent-coordination.md
docs/prd/epic-21-agent-reputation-trust.md
docs/architecture/agent-society-protocol.md
docs/architecture/ai-agent-skills.md
docs/research/prediction-market-dvm-payments-research-report.md
```

---

## Next Steps

1. ~~Decide: Bilateral only (Option A) or full market (Option B)?~~ **DECIDED: Option B**
2. ~~If Option B: Draft Epic 24 with full story breakdown~~ **DONE: Epic 25 + Epic 26 created**
3. ~~If Option A: Add stories to Epic 17 for stake tags~~ (deferred)
4. Document the ILP two-PREPARE pattern (can still be used for bilateral staking)

**Created Artifacts:**

- `docs/architecture/zkvm-verification-spec.md` - Full technical specification
- `docs/prd/epic-25-zkvm-compute-verification.md` - 13 stories
- `docs/prd/epic-26-agent-service-markets.md` - 15 stories
- Updated `docs/prd/epic-list.md` with new epics

---

## Key Insight to Preserve

The most elegant realization from this conversation:

> **Provider stake is just an ILP PREPARE packet in the opposite direction with an inverse condition. The Nostr event in the data field IS the proof. No new NIPs needed for bilateral staking.**

For full markets with third-party staking, new infrastructure IS required, but it builds on the same primitives.

---

## Continuing the Conversation: Full Market Design

### The Multi-Party Staking Model

When we allow third parties to stake on service delivery outcomes, we transform from **bilateral escrow** to a **true prediction market**. This section explores the design space.

#### What Changes With Third-Party Staking

| Aspect          | Bilateral Model        | Multi-Party Market      |
| --------------- | ---------------------- | ----------------------- |
| Participants    | Buyer + Provider only  | Anyone can stake        |
| Price discovery | Fixed negotiation      | Dynamic odds            |
| Liquidity       | Limited to transaction | Market depth            |
| Resolution      | Binary (success/fail)  | Proportional payout     |
| Information     | Private signals        | Aggregated beliefs      |
| Reputation      | Attestation-based      | Market-based (win rate) |

#### Core Insight: Markets as Information Aggregators

The fundamental value of allowing third-party stakes isn't just risk distribution—it's **information aggregation**. Market prices encode collective beliefs about outcomes:

```
If Provider X has 10% odds of delivering on job Y:
→ Market is signaling "don't trust this provider for this job"
→ Buyer should either cancel or require higher provider stake

If Provider X has 95% odds:
→ Market is signaling confidence
→ Buyer can proceed with lower friction
```

This replaces static reputation scores with **dynamic, job-specific confidence signals**.

---

### Detailed Design Answers

#### 1. Who Can Stake?

**Option A: Open Market (Anyone)**

Pros:

- Maximum liquidity
- Best price discovery
- No artificial constraints

Cons:

- Wash trading risk
- Sybil manipulation
- Could enable market manipulation

**Option B: Social Graph Bounded**

Only agents within N hops of buyer/provider can stake.

```
Stake eligibility =
  follows(buyer) ∪
  follows(provider) ∪
  follows(follows(buyer)) ∪
  follows(follows(provider))
```

Pros:

- Leverages existing trust relationships
- Sybils harder (need social graph presence)
- Skin-in-game from reputation

Cons:

- Limited liquidity for new agents
- Could create echo chambers
- Complex eligibility checking

**Option C: Stake-Weighted Access**

Anyone can stake, but minimum stake required scales with:

- Distance from buyer/provider in social graph
- Historical accuracy (prediction track record)
- Account age / Nostr activity

```typescript
const minStake =
  baseMinStake * (1 + graphDistance * 0.5 + (1 - historicalAccuracy) * 2 + (isNewAccount ? 1 : 0));
```

**Recommendation: Option C (Stake-Weighted Access)**

This provides open participation while naturally filtering noise. High-conviction bettors can overcome access barriers via stake size.

#### 2. Market Maker Architecture

Three viable approaches for liquidity:

**Approach 1: Automated Market Maker (AMM)**

Like Uniswap's constant product formula applied to binary outcomes:

```
YES * NO = k

// If market has 100 YES tokens and 100 NO tokens (k=10000)
// Price of YES = NO / (YES + NO) = 100/200 = 50%

// If someone buys 10 YES tokens:
// New YES = 90, New NO = 10000/90 = 111.1
// New price = 111.1/201.1 = 55.2%
```

Pros:

- Always liquid (no empty order book)
- Simple implementation
- Permissionless

Cons:

- Impermanent loss for LPs
- Price manipulation via large trades
- Slippage on big orders

**Approach 2: Order Book**

Traditional limit order matching (like Polymarket):

```
Order Book for "Will Provider X deliver Job Y?"

BID (YES)          ASK (YES)
────────────       ──────────
500 sats @ 60%     300 sats @ 65%
200 sats @ 55%     1000 sats @ 70%
100 sats @ 50%     500 sats @ 75%
```

Pros:

- No slippage at limit prices
- Price discovery via spread
- More capital efficient

Cons:

- Needs makers for liquidity
- Can have empty books
- More complex implementation

**Approach 3: Simple Pool (No Market Making)**

All stakes go into YES/NO pools. No price discovery—payout proportional to pool.

```
YES pool: 1000 sats (60%)
NO pool: 666 sats (40%)

Resolution: YES wins
Payout: Each YES staker gets 1.666x (1666/1000)
```

Pros:

- Simplest implementation
- No LP risk
- Clear payout math

Cons:

- No real-time price signal
- Fixed odds after stake
- Less informative

**Recommendation: Start with Simple Pool, Add AMM Later**

For agent services, the simple pool provides enough functionality:

- Aggregate stakes for resolution
- Proportional payout
- Clear outcome signal

AMM adds value when:

- Markets stay open longer
- Need real-time price updates
- Want to allow position exits before resolution

#### 3. Resolution Mechanism for Multi-Party Markets

Resolution must answer: "Did the provider deliver satisfactorily?"

**Resolution Hierarchy:**

```
┌─────────────────────────────────────────────────────────┐
│                    RESOLUTION FLOW                       │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │  1. Programmatic Check  │
              │  (hash proof matches?)  │
              └───────────┬─────────────┘
                          │
          ┌───────────────┴───────────────┐
          │ YES                           │ NO/INCONCLUSIVE
          ▼                               ▼
    ┌───────────┐              ┌─────────────────────────┐
    │  RESOLVE  │              │  2. Challenge Period    │
    │   YES     │              │  (2-24 hours)           │
    └───────────┘              └───────────┬─────────────┘
                                           │
                          ┌────────────────┴────────────────┐
                          │ NO CHALLENGE                    │ CHALLENGE
                          ▼                                 ▼
                    ┌───────────┐              ┌─────────────────────────┐
                    │  RESOLVE  │              │  3. Stake-Weighted Vote │
                    │ per buyer │              │  (arbiters stake YES/NO)│
                    └───────────┘              └───────────┬─────────────┘
                                                           │
                                              ┌────────────┴────────────┐
                                              │ QUORUM REACHED          │ NO QUORUM
                                              ▼                         ▼
                                        ┌───────────┐          ┌──────────────────┐
                                        │  RESOLVE  │          │  4. Designated   │
                                        │ per vote  │          │  Resolver (WoT)  │
                                        └───────────┘          └──────────────────┘
```

**Key Design Decisions:**

1. **Buyer has veto on success?**
   - Yes, but only during challenge period
   - After challenge period, market resolves based on stakes

2. **Provider can defend?**
   - Yes, provider can stake YES on their own delivery
   - This burns capital if they fail

3. **Arbiter selection:**
   - Pull from social graph (trusted by both parties)
   - Weight by historical accuracy
   - Random selection from eligible pool

#### 4. Integration with Existing Epics

**Epic 13 (Social Graph) → Stake Eligibility**

```typescript
// Check if staker can participate in market
const canStake = async (staker: string, buyer: string, provider: string) => {
  const graphDistance = await socialGraph.shortestPath(staker, [buyer, provider]);
  const stakingHistory = await reputation.getStakingAccuracy(staker);

  if (graphDistance > MAX_GRAPH_DISTANCE && stakingHistory.totalBets < MIN_HISTORY) {
    return { eligible: false, reason: 'too-distant' };
  }

  return {
    eligible: true,
    minStake: calculateMinStake(graphDistance, stakingHistory),
  };
};
```

**Epic 17 (DVM) → Market Creation Trigger**

Markets created when:

- Job request includes `market-enabled: true` tag
- Job value exceeds market threshold
- Provider accepts job

```typescript
// In DVM job acceptance flow
if (jobRequest.tags.includes(['market-enabled', 'true'])) {
  await createMarket({
    jobId: jobRequest.id,
    buyer: jobRequest.pubkey,
    provider: acceptingProvider.pubkey,
    totalValue: jobRequest.bid,
    resolutionTime: jobRequest.expiry,
  });
}
```

**Epic 20 (Coordination) → Dispute Resolution**

When market resolution is contested, escalate to coordination framework:

```typescript
// Create coordination proposal for disputed market
const disputeProposal = {
  kind: 'coordination-proposal',
  type: 'market-resolution',
  marketId: market.id,
  options: ['resolve-yes', 'resolve-no', 'partial-refund'],
  votingPeriod: 24 * 60 * 60, // 24 hours
  eligibleVoters: market.stakeholders,
  votingWeight: 'stake-proportional',
};
```

**Epic 21 (Reputation) → Market-Based Scoring**

Replace or augment attestation-based reputation with market performance:

```typescript
const marketReputation = {
  // As provider
  deliverySuccessRate: successfulMarkets / totalMarkets,
  averageMarketOdds: avgOddsAtAcceptance, // Higher = more trusted
  totalValueDelivered: sumOf(completedJobValues),

  // As predictor
  predictionAccuracy: correctPredictions / totalPredictions,
  profitLoss: totalWinnings - totalLosses,
  calibration: brierScore, // How well-calibrated predictions are
};
```

---

### Economic Analysis: Multi-Party Incentives

#### Stakeholder Incentive Matrix

| Party                    | Stake YES (Provider Delivers)           | Stake NO (Provider Fails)            |
| ------------------------ | --------------------------------------- | ------------------------------------ |
| **Provider**             | Strong incentive (revenue + reputation) | Never (self-sabotage)                |
| **Buyer**                | If confident in provider                | Hedge against non-delivery           |
| **Provider's Followers** | Vouch for trusted agent                 | Rare (burns social capital)          |
| **Buyer's Followers**    | If they know the provider               | Protect buyer from bad provider      |
| **Neutral Predictors**   | If they have info suggesting success    | If they have info suggesting failure |
| **Competitors**          | Rarely                                  | If they can sabotage reputation      |

#### The Vouching Economy

When Provider X's followers stake YES on X's jobs, they're effectively **vouching** with capital:

```
Alice follows Provider X (trusts them)
Provider X takes job from Bob for 10,000 sats
Alice stakes 1,000 sats on YES

If X delivers:
  - X gets 10,000 sats (payment)
  - Alice gets ~1,100 sats back (stake + share of NO pool)
  - Alice's prediction accuracy increases

If X fails:
  - X loses reputation
  - Alice loses 1,000 sats
  - Alice's prediction accuracy decreases
```

This creates **economic accountability for social graph connections**. Following/recommending bad providers has a real cost.

#### Market-Based Reputation vs. Attestation-Based

| Dimension            | Attestation (Epic 21) | Market-Based              |
| -------------------- | --------------------- | ------------------------- |
| Signal type          | Binary (good/bad)     | Continuous (probability)  |
| Update frequency     | Per-job completion    | Real-time                 |
| Manipulation cost    | Sybil attestations    | Capital at risk           |
| Information richness | Limited metadata      | Price = aggregated belief |
| Bootstrap problem    | Easy (free to attest) | Hard (needs liquidity)    |
| Trust assumptions    | Trust attesters       | Trust market efficiency   |

**Recommendation: Hybrid Approach**

Use attestations for **cold start** (new agents, low-value jobs) and markets for **established agents and high-value jobs**.

---

### Refined Epic 24 Breakdown

Based on the design decisions above:

```
Epic 24: Agent Service Markets

Phase 1: Simple Pool Markets (Foundation)
─────────────────────────────────────────
24.1  Market Event Types (Kind 5960, 5961, 6960)
      - Market creation event
      - Stake submission event
      - Resolution event

24.2  Stake Pool Management
      - YES/NO pool accounting
      - Stake recording and validation
      - Pool state queries

24.3  Social Graph Stake Eligibility
      - Graph distance checking
      - Minimum stake calculation
      - Eligibility caching

24.4  Basic Resolution Mechanism
      - Buyer confirmation flow
      - Timeout-based resolution
      - Proportional payout distribution

Phase 2: Enhanced Price Discovery
─────────────────────────────────
24.5  AMM for Continuous Pricing
      - Constant product formula
      - Real-time price queries
      - Position entry/exit

24.6  Order Book (Optional)
      - Limit order submission
      - Order matching engine
      - Partial fills

Phase 3: Dispute Resolution
───────────────────────────
24.7  Challenge Mechanism
      - Challenge period tracking
      - Challenge bond requirements
      - Escalation triggers

24.8  Stake-Weighted Arbitration
      - Arbiter selection from graph
      - Weighted voting on disputes
      - Outlier slashing

24.9  Integration with Epic 20 Coordination
      - Coordination proposal creation
      - Multi-agent consensus fallback

Phase 4: Reputation Integration
───────────────────────────────
24.10 Market-Based Reputation Scoring
      - Win rate tracking
      - Calibration metrics
      - Reputation-stake discounts

24.11 Hybrid Reputation System
      - Attestation + market signals
      - Bootstrap path for new agents
      - Reputation decay/refresh
```

**Dependency Graph:**

```
Epic 6 (TigerBeetle) ─────┐
                          │
Epic 13 (Social Graph) ───┼──> 24.1-24.4 (Phase 1)
                          │         │
Epic 17 (DVM) ────────────┘         │
                                    ▼
                              24.5-24.6 (Phase 2)
                                    │
Epic 20 (Coordination) ─────────────┼──> 24.7-24.9 (Phase 3)
                                    │
Epic 21 (Reputation) ───────────────┴──> 24.10-24.11 (Phase 4)
```

---

### Implementation Considerations

#### 1. Event Schemas (Nostr Events for Markets)

**Kind 5960: Market Creation**

```json
{
  "kind": 5960,
  "content": "Market for job delivery",
  "tags": [
    ["e", "<job-request-id>", "<relay>", "root"],
    ["p", "<buyer-pubkey>"],
    ["p", "<provider-pubkey>"],

    ["market-type", "delivery"],
    ["total-value", "<millisats>"],
    ["resolution-time", "<unix-timestamp>"],
    ["challenge-period", "<seconds>"],

    ["stake-eligibility", "social-graph"],
    ["max-graph-distance", "3"],
    ["min-stake", "<millisats>"],

    ["pool-type", "simple"] // or "amm"
  ]
}
```

**Kind 5961: Stake Submission**

```json
{
  "kind": 5961,
  "content": "Staking YES on delivery",
  "tags": [
    ["e", "<market-event-id>", "<relay>", "reply"],

    ["position", "yes"], // or "no"
    ["stake-amount", "<millisats>"],
    ["expected-payout", "<millisats>"], // at current odds

    // Proof of stake (ILP PREPARE reference or on-chain tx)
    ["stake-proof", "<prepare-id or tx-hash>"]
  ]
}
```

**Kind 6960: Market Resolution**

```json
{
  "kind": 6960,
  "content": "Market resolved: YES",
  "tags": [
    ["e", "<market-event-id>", "<relay>", "root"],

    ["outcome", "yes"], // or "no" or "void"
    ["resolution-method", "buyer-confirm"], // or "timeout", "arbitration", "programmatic"

    ["yes-pool-total", "<millisats>"],
    ["no-pool-total", "<millisats>"],
    ["payout-multiplier", "1.666"], // for winning side

    // Payout distribution
    ["payout", "<winner1-pubkey>", "<amount>"],
    ["payout", "<winner2-pubkey>", "<amount>"]
    // ...
  ]
}
```

#### 2. Settlement Flow

```
MARKET LIFECYCLE
────────────────

1. JOB POSTED (Kind 5900)
   └─> If market-enabled tag present

2. MARKET CREATED (Kind 5960)
   └─> Pool initialized with buyer payment as implicit YES stake?
       Or keep payment separate from market stakes?

3. STAKING PERIOD (Kind 5961 events)
   └─> Open until job deadline or early close
   └─> Real-time odds calculated from pool ratios

4. JOB EXECUTED
   └─> Provider delivers (or fails)

5. RESOLUTION PERIOD
   ├─> Buyer confirms delivery → RESOLVE YES
   ├─> Buyer disputes → CHALLENGE PERIOD
   └─> Timeout with no confirmation → RESOLVE per rules

6. PAYOUT (Kind 6960 + ILP FULFILLs)
   └─> Proportional distribution to winning stakers
```

#### 3. Edge Cases

**What if no one stakes NO?**

If only YES stakers, the market provides no price signal but still:

- Records vouching/confidence
- Creates accountability if delivery fails
- Everyone gets their stake back (minus fees) if market resolves YES

**What if provider stakes YES on themselves?**

Allowed and expected. This is the provider "betting on themselves":

- Increases their payout on success
- Increases their loss on failure
- Signals confidence to the market

**What if market is voided?**

Return all stakes proportionally. Happens when:

- Job cancelled before execution
- Buyer and provider agree to void
- Force majeure / technical failure

---

### Open Questions for Next Conversation

1. **Fee structure:**
   - Should the platform take a cut of market proceeds?
   - Should resolvers (arbiters) be compensated?
   - How to handle gas/relay costs?

2. **Cross-market positions:**
   - Can someone stake on multiple related jobs?
   - How to handle correlated risk?

3. **Market manipulation detection:**
   - How to detect wash trading?
   - How to identify coordinated manipulation?

4. **Privacy considerations:**
   - Should stake amounts be public?
   - Can markets use encrypted stakes?

5. **Bootstrapping liquidity:**
   - How to get initial market makers?
   - Should there be protocol-owned liquidity?

---

### Decision Point

**Returning to the original options:**

**Option A: Minimal (Bilateral Staking Only)**

- Status: ✅ Ready to implement with existing infrastructure
- Effort: 2-3 stories added to Epic 17
- Value: Provider accountability

**Option B: Full Market (Multi-Party)**

- Status: 📝 Designed above, requires new epic
- Effort: Epic 24 (11 stories across 4 phases)
- Value: Price discovery, social graph vouching, market-based reputation

**Option C: Phased Approach**

1. Implement Option A now (quick win)
2. Validate that staking improves outcomes
3. If validated, proceed with Epic 24

**Recommended Path: Option C (Phased)**

Reasoning:

- Option A is low-cost and validates the core hypothesis
- Full markets are complex infrastructure
- Market liquidity requires user adoption (chicken-and-egg)
- Better to prove value incrementally

---

### Summary of This Section

1. **Answered the design questions:**
   - Who can stake: Stake-weighted access (open with min stake)
   - Market maker: Start with simple pools, add AMM later
   - Resolution: Hierarchical (programmatic → challenge → vote → designated)
   - Integration: Maps cleanly to existing epics

2. **Detailed Epic 24:**
   - 11 stories across 4 phases
   - Clear dependency graph
   - Event schemas defined

3. **Identified trade-offs:**
   - Markets add value but complexity
   - Liquidity bootstrap is the hard problem
   - Phased approach reduces risk

4. **Recommendation: Start bilateral, evolve to markets**
