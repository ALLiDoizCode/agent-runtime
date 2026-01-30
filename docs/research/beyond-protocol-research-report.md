# Beyond the Protocol: What Must Exist for a Functioning Agent Society

**Research Report for M2M Agent Society Protocol**
**Date**: 2026-01-29
**Status**: Complete

---

## Executive Summary

This research examines what must be deliberately constructed beyond the ILP+Nostr protocol layer to enable a functioning agent society. The core findings challenge initial assumptions and provide actionable guidance:

### The Irreducibles (Must Be Built)

1. **Settlement Infrastructure**: Stablecoin-based settlement layer with market-making agents
2. **Identity & Reputation**: Know Your Agent (KYA) framework with non-transferable reputation tokens
3. **Oracle Services**: Agent consensus oracles for prediction market resolution
4. **Bootstrap Capital**: Initial liquidity cannot emerge organically - requires seed funding
5. **Regulatory Compliance Layer**: KYC/AML infrastructure for fiat interfaces

### The Prediction Market Verdict

**Partial engine, NOT primary engine.** Prediction markets are zero-sum wealth redistribution mechanisms that cannot create value. They can serve as:

- Oracle resolution services (agents paid to verify truth)
- Reputation staking (agents stake on their own claims)
- Coordination signals (aggregate beliefs inform decisions)

But the primary economic engine must be **productive services** where agents create genuine value.

### Multi-Currency Dynamics

A tokenless, multi-currency economy can function effectively:

- **Stablecoins** (USDC, USDT) will naturally emerge as dominant unit of account
- **Thiers' Law**: Without forced acceptance, good money drives out bad
- **Agent-issued tokens**: Viable only with genuine utility (capability access, governance)

### Bootstrap Sequence

| Phase   | Duration     | Focus                                 | Success Metric         |
| ------- | ------------ | ------------------------------------- | ---------------------- |
| Genesis | 0-3 months   | Core team agents, protocol basics     | 5+ working agents      |
| Pioneer | 3-9 months   | Developer tools, grants               | 50+ third-party agents |
| Growth  | 9-18 months  | Real use cases, sustainable economics | 1000+ agents           |
| Scale   | 18-36 months | Network effects                       | Growth exceeds churn   |

### M2M's Role

Value in a tokenless protocol accrues at the **service layer, not protocol layer**. M2M should focus on:

1. Reference implementation & developer tooling
2. Enterprise services (hosting, support, compliance)
3. Strategic infrastructure operation
4. Government/institutional partnerships

---

## 1. Prediction Markets as Economic Engine

### Summary Verdict

Prediction markets **cannot serve as the primary economic engine** for an agent society. While they demonstrate genuine value for information aggregation, their fundamental economics make them unsuitable as a sole foundation.

### Why Prediction Markets Fall Short

| Challenge                   | Problem                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- |
| **Zero-Sum**                | Markets redistribute wealth; they don't create it. Losers fund winners.            |
| **Liquidity Bootstrapping** | Market making is not profitable. Polymarket operates at a loss despite $9B volume. |
| **Oracle Problem**          | Circular for agent societies - agents would verify outcomes affecting agent wealth |
| **Concentration**           | AI arbitrage extracted $40M in one year. Winner-take-all dynamics.                 |
| **Adverse Selection**       | As markets get efficient, fewer participants are "wrong enough" to profit from     |

### What Works

Prediction markets excel at:

- **Information aggregation**: 74% of the time, markets beat polls
- **Coordination signals**: Reveal aggregate beliefs to inform decisions
- **Oracle services**: Agents can be paid to verify truth as a service

### Recommended Architecture

```
Layer 1 (Primary):   SERVICE ECONOMY
                     Agents provide valuable services (compute, analysis, coordination)

Layer 2 (Secondary): PREDICTION MARKETS
                     - Oracle resolution services (agents paid to verify)
                     - Reputation staking (agents stake on performance claims)
                     - Information arbitrage (profits from accuracy)

Layer 3 (Tertiary):  FUTARCHY GOVERNANCE
                     Markets inform decisions but don't determine all allocation
```

### Key Data Points

- Polymarket: $9B volume in 2024, but operates at a loss (no trading fees, VC-funded)
- Market making generally unprofitable due to adverse selection
- AI agents already dominate certain prediction market segments
- UMA optimistic oracle handles "tens of thousands of resolutions per month"

---

## 2. Multi-Currency Agent Economy

### How It Functions Without a Native Token

A tokenless multi-currency agent economy functions through:

| Component             | Mechanism                                                   |
| --------------------- | ----------------------------------------------------------- |
| **Settlement**        | Stablecoins (USDC/USDT), fiat, or any mutually agreed asset |
| **Exchange**          | Market-making agents earn spreads; AMM pools for automation |
| **Price Consistency** | Arbitrageurs maintain equilibrium across pairs              |
| **Trust**             | Reputation systems (not token staking)                      |

### Does a Dominant Currency Emerge?

**Yes, with caveats.** Network effects strongly favor consolidation, but coexistence is possible.

**Thiers' Law** (critical insight):

> "In the absence of legal tender laws, **good money drives out bad** - the reverse of Gresham's Law"

Without forced acceptance rules, agents choose currencies with best stability, liquidity, and trust.

**Likely Outcome**:

- 2-3 dominant currencies (stablecoins) for unit of account
- Specialized tokens for specific niches/capabilities
- Long-tail of less-liquid currencies with higher conversion costs

### Agent-Issued Tokens: Conditionally Viable

**What Works**:
| Pattern | Description |
|---------|-------------|
| Capability tokens | Access rights to specific agent services |
| Guild currencies | Collective tokens for agent cooperatives |
| Reputation staking | Tokens representing skin-in-the-game |
| Revenue shares | Fractional ownership of agent earnings |

**What Fails** (Friend.tech lesson - $1.2B volume then collapse):

- Pure speculation tokens
- Tokens without genuine utility
- Inflationary supply without demand growth

**The x402 Alternative**: Agents can simply price services in stablecoins using Coinbase/Cloudflare's x402 protocol (reviving HTTP 402 "Payment Required").

### Stablecoin Dominance

- Market cap: ~$250 billion
- 2024 transaction volume: $27.6 trillion (exceeding Visa + Mastercard)
- Serve as "unit of account on exchanges and DeFi pools"

---

## 3. Infrastructure Requirements

### Core Finding

**Most infrastructure operation is NOT profitable from fees alone.**

| Infrastructure  | Fee-Only Viable? | Reality                                                     |
| --------------- | ---------------- | ----------------------------------------------------------- |
| ILP Connectors  | Likely marginal  | Competitive market, thin margins                            |
| Nostr Relays    | **No**           | $5/month cost, no proven fee model. 95% cannot cover costs. |
| Lightning Nodes | Sometimes        | Block: 9.7% returns; small operators often lose money       |
| AMM LPs         | **Usually no**   | 80%+ lose to impermanent loss                               |
| Chainlink Nodes | With subsidies   | 7% target requires token rewards                            |
| Bridges         | Yes at scale     | 0.1-0.5% fees viable with volume                            |

### Infrastructure Centralization Crisis

- **36-37%** of Ethereum nodes run on AWS
- **~70%** on AWS, Google, or Microsoft combined
- **October 2025 AWS outage**: $2.8B economic losses across crypto

### What Makes Infrastructure Work

| Model                   | Requirements                   | Examples                  |
| ----------------------- | ------------------------------ | ------------------------- |
| Token-Subsidized        | Native token with appreciation | Chainlink, Filecoin       |
| Corporate Cross-Subsidy | Profitable parent business     | Infura (ConsenSys)        |
| Government/Foundation   | Public interest alignment      | Matrix (EU deployment)    |
| Professional Services   | Enterprise clients             | Alchemy Enterprise        |
| Scale-Based Fees        | High volume                    | Block Lightning (184 BTC) |

### Where Value Accrues (Token-Neutral)

| Layer                 | Defensibility                          |
| --------------------- | -------------------------------------- |
| Protocol Core         | **Low** (open source, forkable)        |
| Application/UX        | Medium-High (MetaMask, wallets)        |
| Professional Services | High (Alchemy Enterprise)              |
| Compliance/Licensing  | **Very High** (regulated on/off ramps) |

### Matrix Protocol Warning

| Metric        | Amount                                     |
| ------------- | ------------------------------------------ |
| 2024 Revenue  | $561K                                      |
| 2024 Expenses | $1.2M                                      |
| Deficit       | $356K                                      |
| February 2025 | Needed $100K by March or shut down bridges |

---

## 4. External Interfaces

### How Value Enters the Agent Society

| Source                  | Mechanism                                                     | Viability             |
| ----------------------- | ------------------------------------------------------------- | --------------------- |
| **Productive Services** | Agents sell compute, analysis, coordination to humans/systems | **Primary**           |
| **Oracle Services**     | Agents paid to verify truth for prediction markets            | Secondary             |
| **Arbitrage**           | Cross-currency, cross-market price differences                | Limited, concentrates |
| **Prediction Winnings** | Being correct about external reality                          | Zero-sum              |

### How Humans Participate

1. **As principals**: Deploy and fund agents to act on their behalf
2. **As counterparties**: Trade with agents in prediction markets
3. **As information sources**: Provide oracle attestations
4. **As liquidity providers**: Fund market-making agents

### Required Bridges

| Bridge             | Purpose                         | Providers                    |
| ------------------ | ------------------------------- | ---------------------------- |
| Fiat On/Off Ramps  | Convert between fiat and crypto | MoonPay, Transak, Mastercard |
| API Gateways       | Connect to external data        | Infura, Alchemy, Chainlink   |
| Settlement Engines | Connect ILP to external ledgers | XRP, Bitcoin, bank rails     |

### Real Agent-to-Agent Transactions (2025)

- **Fetch.AI (Dec 2025)**: First live AI-to-AI payment - two agents coordinated dinner plans, reserved, and paid while both users were offline
- **Visa Intelligent Commerce**: Completed controlled agent-initiated transactions
- **BILL AI**: Transactions processed by AI increased 533% at 92% accuracy

---

## 5. Bootstrap and Emergence

### Critical Mass Thresholds

| Context                 | Threshold                                |
| ----------------------- | ---------------------------------------- |
| General market adoption | 15-20% of potential market               |
| Social norm change      | 25% of population                        |
| Committed minorities    | As low as 0.3% under specific conditions |

### Bootstrap Sequence

| Phase          | Duration    | Focus                | Key Activities                                      |
| -------------- | ----------- | -------------------- | --------------------------------------------------- |
| **Genesis**    | 0-3 months  | Core Protocol        | Identity, communication, basic value transfer       |
| **Pioneer**    | 3-6 months  | Seed Agents          | Team-operated agents demonstrating capabilities     |
| **Tooling**    | 4-8 months  | Developer Experience | Easy deployment, clear economics, docs              |
| **Incentives** | 6-12 months | Mechanism Design     | Token/reputation/payment incentives exceeding costs |
| **Demand**     | 9-18 months | Real Use Cases       | Integration with existing systems, clear value prop |

### What Emerges vs. Must Be Designed

| Emerges Naturally                           | Must Be Designed             |
| ------------------------------------------- | ---------------------------- |
| Specialization (from market signals)        | Initial liquidity/capital    |
| Reputation (from history)                   | Identity infrastructure      |
| Currency preferences (from network effects) | Oracle/resolution mechanisms |
| Social structure (from routing topology)    | Regulatory compliance layer  |
| Price discovery                             | Bootstrap incentives         |

### Historical Lessons

**Bitcoin** (what almost killed it):

- Overflow bug (Aug 2010) created 184 billion BTC - Satoshi pushed emergency fix within hours
- Mt. Gox hacks eroded trust
- 99% price crashes declared Bitcoin "dead" 474 times

**Nostr** (growth without token):

- $10M+ in philanthropic donations (Jack Dorsey)
- But 95% of relays cannot cover operational costs
- Sustainability remains unsolved

**Filecoin** (supply ≠ demand):

- Successfully bootstrapped exabytes of storage
- Only ~3.8% was filled with actual data
- Token incentives bootstrap supply, not demand

**Helium** (hardware + token):

- Early adopters earned thousands/month
- Parabolic growth, then saturation
- Real IoT demand never matched supply

---

## 6. Value Capture and Sustainability

### Where Value Accumulates

| Actor                           | Source                    | Defensibility                   |
| ------------------------------- | ------------------------- | ------------------------------- |
| Infrastructure operators        | Routing/relay fees        | Low (commoditizes)              |
| Agents with scarce capabilities | Unique services           | Medium                          |
| Agents with network position    | Connectivity, routing     | Medium                          |
| Prediction accuracy             | Oracle fees, market gains | Low (zero-sum)                  |
| Market makers                   | Spreads                   | High (requires capital + skill) |
| Oracle operators                | Verification fees         | Medium                          |

### What is M2M (as project/entity)?

Given tokenless design, M2M should be:

1. **Protocol Maintainer**: Steward reference implementations
2. **Developer Ecosystem**: Tooling, documentation, grants
3. **Enterprise Services**: Hosting, support, compliance (Matrix model)
4. **Infrastructure Operator**: Strategic connector/relay operation
5. **Institutional Partner**: Government and enterprise deployments

### Sustaining Without a Token

| Model                      | Examples               | M2M Applicability              |
| -------------------------- | ---------------------- | ------------------------------ |
| Corporate sponsors         | Nostr (Dorsey $10M)    | Risky, single point of failure |
| Foundation/grants          | Ethereum Foundation    | Requires initial endowment     |
| Enterprise services        | Matrix/Element         | **High potential**             |
| Government contracts       | Matrix (EU deployment) | **High potential**             |
| Service layer monetization | Alchemy, Infura        | **High potential**             |

### Comparison: Tokenless Protocol Sustainability

| Protocol    | Funding Model                   | Status                     |
| ----------- | ------------------------------- | -------------------------- |
| Nostr       | Philanthropy + zaps             | 95% of relays unprofitable |
| Matrix      | Foundation + Element company    | Near-bankruptcy in 2025    |
| ActivityPub | Instance donations + EU funding | Fragile but functional     |
| Tor         | Grants + donations              | ~$6M annual budget         |

---

## 7. Failure Modes and Risks

### Top 5 Existential Risks

| Rank | Risk                       | Likelihood | Impact   | Mitigation                                                          |
| ---- | -------------------------- | ---------- | -------- | ------------------------------------------------------------------- |
| 1    | **Bootstrap Failure**      | 70-80%     | Fatal    | Build atomic network first; genuine utility before decentralization |
| 2    | **Regulatory Shutdown**    | 40-60%     | Fatal    | Proactive compliance; jurisdiction strategy                         |
| 3    | **Infrastructure Failure** | 60-70%     | Severe   | Multi-cloud; decentralized RPC; own infrastructure                  |
| 4    | **Economic Attack**        | 30-50%     | Severe   | Time delays; quadratic voting; flash loan resistance                |
| 5    | **Agent Collusion**        | 20-40%     | Moderate | Resource caps; isolation protocols; human-in-loop                   |

### Historical Failures to Learn From

| Failure     | Year | Cause                        | Lesson                             |
| ----------- | ---- | ---------------------------- | ---------------------------------- |
| Intrade     | 2013 | CFTC enforcement             | Regulatory engagement essential    |
| Augur       | 2018 | Poor UX, no liquidity        | UX before decentralization         |
| Libra/Diem  | 2022 | Political opposition         | Stealth < regulatory capture       |
| Terra/Luna  | 2022 | Death spiral                 | Algorithmic stability doesn't work |
| Friend.tech | 2024 | No utility, pure speculation | Tokens need genuine use cases      |

### Agent-Specific Risks (Real 2024-2025 Incidents)

- **Healthtech breach**: AI agent pushed 483,000 patient records to unsecured workflows
- **Manufacturing exploit**: Compromised vendor-validation agent approved $3.2M to shell companies
- **Tacit collusion**: Pricing algorithms converge on supra-competitive prices without explicit coordination

### Early Warning Indicators

**Network Health**:

- Daily active users trending down (Augur: 265 → 37 in 6 weeks)
- Governance participation below 10%
- Validator/miner concentration increasing

**Economic Stability**:

- Treasury runway below 12 months
- Liquidity pool imbalances exceeding 70%

**Security**:

- Increasing audit findings
- Oracle price deviation events

**Regulatory**:

- Cease-and-desist letters
- Banking partner withdrawals

---

## 8. Synthesis: The Path Forward

### Layer Model

```
L5: EMERGENT      Specialization, culture, currency zones
                  (Cannot be designed, only enabled)
    ↑
L4: AGENTS        Individual economic actors
                  (Minimum viable: 5+ diverse capabilities)
    ↑
L3: MARKETS       Prediction, capability, currency markets
                  (Secondary economic engine, not primary)
    ↑
L2: SERVICES      Connectors, relays, oracles, exchanges
                  (Requires sustainable funding model)
    ↑
L1: PROTOCOL      ILP + Nostr + TOON
                  (Already defined)
    ↑
L0: PHYSICAL      Compute, network, storage
                  (Centralization risk: 70% on 3 cloud providers)
```

### Build/Incentivize/Emerge Matrix

| Component                 | Build | Incentivize | Emerge | External |
| ------------------------- | ----- | ----------- | ------ | -------- |
| Settlement layer          | ✓     |             |        |          |
| Identity/KYA              | ✓     |             |        |          |
| Initial liquidity         | ✓     |             |        |          |
| Regulatory compliance     | ✓     |             |        |          |
| Connector operation       |       | ✓           |        |          |
| Market making             |       | ✓           |        |          |
| Oracle services           |       | ✓           |        |          |
| Developer tooling         | ✓     |             |        |          |
| Agent specialization      |       |             | ✓      |          |
| Currency preferences      |       |             | ✓      |          |
| Social structure          |       |             | ✓      |          |
| Stablecoin infrastructure |       |             |        | ✓        |
| Cloud compute             |       |             |        | ✓        |

### Critical Dependencies (DAG)

```
Bootstrap Capital
    └── Initial Agents
        └── Demonstrated Utility
            └── Developer Interest
                └── Third-Party Agents
                    └── Network Effects
                        └── Self-Sustaining Economy
```

### M2M's Strategic Focus

Given the research findings, M2M should prioritize:

1. **Reference Implementation Excellence**
   - Clear, audited, well-documented code
   - Easy developer onboarding

2. **Enterprise/Government Services**
   - Managed hosting and support
   - Compliance-as-a-service
   - SLA-backed infrastructure

3. **Strategic Infrastructure Operation**
   - Run connectors/relays that demonstrate viability
   - Prove the economic model before others follow

4. **Ecosystem Development**
   - Grants for early agents
   - Developer tooling
   - Documentation and education

5. **Regulatory Navigation**
   - Proactive engagement with regulators
   - Clear legal structures
   - Geographic strategy

---

## Appendix A: Source Summary

### Research Agents Deployed

1. **Prediction Markets**: Polymarket, Augur, Gnosis, futarchy, resolution mechanisms
2. **Multi-Currency Economics**: Forex, stablecoins, agent-issued tokens, historical precedents
3. **Network Bootstrapping**: Bitcoin, Nostr, Filecoin, Helium, Matrix, ActivityPub
4. **Infrastructure Economics**: Connectors, relays, oracles, value capture models
5. **AI Agent Economies**: Agent marketplaces, coordination, capabilities
6. **Risks & Failures**: Regulatory, technical, economic attacks, governance capture

### Key Data Sources

- Polymarket Documentation
- UMA Protocol
- Interledger RFCs
- Chainlink Economics
- Matrix.org Blog
- Academic research (arXiv, Nature, Frontiers)
- Industry reports (Messari, a16z, McKinsey)
- Regulatory filings (SEC, CFTC)

---

## Appendix B: Glossary

| Term            | Definition                                                    |
| --------------- | ------------------------------------------------------------- |
| **AMM**         | Automated Market Maker - algorithmic liquidity provision      |
| **CLOB**        | Central Limit Order Book - traditional exchange matching      |
| **DID**         | Decentralized Identifier - self-sovereign identity            |
| **Futarchy**    | Governance by prediction markets ("vote values, bet beliefs") |
| **ILP**         | Interledger Protocol - currency-agnostic payment routing      |
| **KYA**         | Know Your Agent - identity verification for AI agents         |
| **MEV**         | Maximal Extractable Value - transaction ordering profits      |
| **SPOF**        | Single Point of Failure                                       |
| **Thiers' Law** | Without forced acceptance, good money drives out bad          |
| **TOON**        | Binary encoding of Nostr events over ILP packets              |

---

_This research report was generated for the M2M Agent Society Protocol to identify what must exist beyond the core protocol layer, with analysis of prediction markets, multi-currency dynamics, infrastructure economics, and failure modes._
