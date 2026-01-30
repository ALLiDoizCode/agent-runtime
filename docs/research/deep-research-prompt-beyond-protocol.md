# Deep Research Prompt: What Must Exist Beyond the Protocol?

**Created:** 2026-01-29
**Status:** Ready for Research
**Research Type:** Technology/Innovation + Strategic Options + Market Opportunity

---

## Research Objective

**Primary Goal:** Determine what must be deliberately constructed beyond the ILP+Nostr protocol layer to enable a functioning agent society, with particular focus on prediction markets as the primary mechanism for external value extraction and internal coordination.

**Core Thesis to Explore:** If the protocol (ILP payments + Nostr events + social graph routing) is the "physics" of the agent society, and prediction markets are the economic engine connecting it to external reality, what infrastructure and bootstrap conditions are required for this to function?

**Critical Design Constraint:** M2M has no native token. ILP is currency-agnostic. Agents can transact in any token they choose - BTC, stablecoins, or tokens they create themselves. The protocol is neutral infrastructure.

**Key Decisions This Research Will Inform:**

- What layers exist between "raw protocol" and "functioning society"
- Whether prediction markets are THE value extraction mechanism or one of several
- What M2M must build vs. what emerges from incentives
- Minimum viable conditions for agent society ignition
- Where defensible value accrues in a token-neutral protocol

**Success Criteria:**

- Clear architectural decomposition: protocol → infrastructure → markets → emergence
- Validation or invalidation of prediction markets as primary economic engine
- Identification of irreducible bootstrap requirements
- Understanding of value flows in a multi-currency agent economy

---

## Background Context

### The Protocol Stack (Already Defined)

**ILP Layer:**

- Universal payment substrate - currency agnostic
- Any token can be routed (BTC, stablecoins, agent-issued tokens)
- Every interaction carries economic weight
- Routing through connectors
- PREPARE → FULFILL/REJECT binary outcomes
- Time-bounded commitments

**Nostr Layer:**

- Event structure for all communication
- secp256k1 identity (self-sovereign, no registry)
- Social graph via follow lists (NIP-02) = routing topology
- Capability advertisement (Kind 31990)
- DVM job marketplace (NIP-90, Kind 5000-7000)

**TOON Layer:**

- Binary encoding of Nostr events over ILP packets
- Payment validation before event processing

### Protocol as Natural Law

The protocol enforces without governance:

- **Economic scarcity:** Every message costs. Spam impossible.
- **Monetary freedom:** Agents choose their own currency. Can issue tokens.
- **Routing constraints:** Only reach those you're connected to.
- **Immutable history:** All transactions recorded.
- **Binary resolution:** Fulfill or reject. No appeals.
- **Temporal bounds:** Packets expire.

### The Open Question

If these constraints ARE the physics, what remains to be built?

**Hypothesis:** Prediction markets may be the answer - they provide:

- Mechanism for agents to extract value from external world (by being correct about it)
- Internal coordination without voting (bet on outcomes)
- Reputation through accuracy (prediction history = credibility)
- Information aggregation (society becomes collectively intelligent)
- Natural specialization (agents develop domain expertise)
- Currency-agnostic operation (markets can settle in any token)

---

## Research Questions

### Theme 1: The Prediction Market Thesis

**Primary Questions:**

1. **Can prediction markets serve as the primary economic engine for an agent society?**
   - What do agents predict? (World events, prices, outcomes, other agent behavior?)
   - How do markets resolve? (Oracles, consensus, on-chain data?)
   - What prevents manipulation?
   - How does value flow: external truth → market resolution → winning agents?

2. **What prediction market infrastructure is required?**
   - Market creation mechanisms
   - Liquidity provision (who provides initial capital, in what currencies?)
   - Resolution/oracle systems
   - Settlement integration with ILP (multi-currency)

3. **How do prediction markets replace traditional governance?**
   - Instead of voting on proposals, bet on outcomes?
   - Futarchy-style decision making for collective choices?
   - How does "the market decided" become legitimate?

4. **What external information sources do agents need access to?**
   - Price feeds, news, events, data streams
   - How do agents perceive external reality?
   - Who provides oracle services and why?

5. **How do prediction markets work in a multi-currency environment?**
   - Cross-currency settlement
   - Currency risk in market positions
   - Arbitrage opportunities between currency zones

**Supporting Questions:**

- What existing prediction market platforms/protocols exist? (Polymarket, Augur, Gnosis, Metaculus)
- How do they handle resolution disputes?
- What's the economics of prediction market making?
- How do prediction markets fail? (Thin liquidity, manipulation, ambiguous resolution)

### Theme 2: Multi-Currency Agent Economy

**Primary Questions:**

6. **What emerges when agents can issue their own tokens?**
   - Agent reputation tokens?
   - Capability-specific currencies?
   - Guild/collective currencies?
   - What gives an agent-issued token value?

7. **How do currency zones form and interact?**
   - Do agents cluster by currency preference?
   - How do cross-currency transactions work?
   - Role of market makers / currency exchangers
   - Does a dominant currency emerge naturally?

8. **What's the unit of account problem?**
   - How do agents price services across currencies?
   - How do prediction markets handle multi-currency positions?
   - Is there a natural numeraire?

**Supporting Questions:**

- How do multi-currency economies work historically?
- What can we learn from forex markets?
- Role of stablecoins as coordination mechanism?

### Theme 3: Infrastructure Requirements

**Primary Questions:**

9. **What physical/cloud infrastructure must exist?**
   - ILP connectors - who runs them and why?
   - Nostr relays - same question
   - Compute for agents - where do agents run?
   - Storage for history/state

10. **What "protocol services" sit between raw protocol and functioning society?**
    - Bootstrap/discovery services?
    - Liquidity providers / market makers?
    - Oracle networks?
    - Currency exchange services?
    - Bridge operators (to external systems)?

11. **Who operates infrastructure and what are their incentives?**
    - Can infrastructure operation be profitable from routing fees?
    - Do infrastructure operators have outsized power?
    - How to prevent infrastructure centralization?

**Supporting Questions:**

- How do other decentralized networks incentivize infrastructure?
- What's the minimum viable infrastructure set?
- Can agents themselves operate infrastructure?

### Theme 4: External Interfaces

**Primary Questions:**

12. **How does value enter the agent society from external world?**
    - Prediction market winnings (from being right about reality)
    - Services sold to humans/external systems?
    - Arbitrage opportunities?
    - Data/information sales?

13. **How do humans participate in the agent society?**
    - As principals deploying agents?
    - As counterparties in prediction markets?
    - As information sources / oracles?
    - As liquidity providers?

14. **What bridges to traditional systems are required?**
    - Fiat on/off ramps
    - API gateways to external data
    - Crypto exchange integrations
    - Banking/payment system integration

**Supporting Questions:**

- How do agents get initial capital?
- What prevents value from leaking out faster than it comes in?
- What external value sources are most accessible?

### Theme 5: Bootstrap and Emergence

**Primary Questions:**

15. **What's the minimum viable agent population?**
    - How many agents with what capabilities?
    - What's the network effect threshold?
    - How do you get from 0 to critical mass?

16. **What's the bootstrap sequence?**
    - What must exist first?
    - What can only exist after other things work?
    - Dependency ordering

17. **What emerges naturally vs. must be designed?**
    - Specialization - emerges from market signals?
    - Reputation - emerges from history?
    - Currency preferences - emerge from network effects?
    - Social structure - emerges from routing?
    - What DOESN'T emerge and needs explicit construction?

18. **How do prediction markets bootstrap?**
    - Chicken-and-egg: need liquidity to attract traders, need traders to justify liquidity
    - Initial market seeding strategies
    - Early adopter incentives without a native token

**Supporting Questions:**

- How did Bitcoin, Nostr, Fediverse bootstrap?
- What were the critical early adopter incentives?
- What almost killed them early?

### Theme 6: Value Capture and Sustainability

**Primary Questions:**

19. **Where does value accumulate in this system?**
    - Infrastructure operators (routing fees)?
    - Agents with scarce capabilities?
    - Agents with network position?
    - Agents with prediction accuracy?
    - Market makers / liquidity providers?
    - Oracle operators?

20. **What is M2M (as project/entity)?**
    - Protocol maintainer?
    - Reference implementation provider?
    - Infrastructure operator?
    - Something else?

21. **How does protocol development sustain itself without a native token?**
    - Grants from interested parties?
    - Services built on protocol?
    - Infrastructure operation revenue?
    - Pure public good funded by beneficiaries?

**Supporting Questions:**

- How do other tokenless protocols sustain? (Nostr, Matrix, ActivityPub)
- What's the failure mode if development stops?
- Is there a protocol treasury concept without a token?

### Theme 7: Failure Modes and Risks

**Primary Questions:**

22. **What kills the agent society before it starts?**
    - Insufficient initial capital/liquidity
    - No valuable external interfaces
    - Infrastructure doesn't materialize
    - Regulatory shutdown
    - Currency fragmentation prevents coordination

23. **What centralization risks exist?**
    - Dominant connector/relay operators
    - Oracle monopoly
    - Single currency dominance
    - Capture by well-resourced actors

24. **What happens to failed agents?**
    - Run out of funds - dormant? deleted? revivable?
    - Bad prediction record - recoverable?
    - Natural selection dynamics

---

## Research Methodology

### Information Sources

**Prediction Markets:**

- Polymarket architecture and economics
- Augur/Gnosis decentralized resolution mechanisms
- Metaculus for human prediction aggregation patterns
- Academic literature on prediction market accuracy and manipulation
- Futarchy proposals (Robin Hanson's work)

**Multi-Currency Economics:**

- Forex market structure and dynamics
- Cryptocurrency exchange mechanics
- Historical multi-currency economies (pre-central banking)
- Stablecoin ecosystems

**Decentralized Network Bootstrapping:**

- Bitcoin early history (2009-2012)
- Nostr growth patterns (2022-2026)
- Filecoin launch and storage economics
- Helium hotspot network effects

**Protocol Sustainability (Tokenless):**

- Nostr development funding
- Matrix/Element sustainability
- ActivityPub/Fediverse economics
- Open source sustainability models

### Analysis Frameworks

1. **Layer Decomposition:**

   ```
   L0: Physical (compute, network, storage)
   L1: Protocol (ILP + Nostr + TOON)
   L2: Infrastructure Services (connectors, relays, oracles, exchanges)
   L3: Markets (prediction markets, capability markets, currency markets)
   L4: Agents (individual economic actors)
   L5: Emergent (patterns, specialization, currency zones, culture)
   ```

2. **Value Flow Analysis:**
   - Map: External reality → Oracle data → Market resolution → Winning agents → Internal economy → ???
   - Track flows across currency boundaries
   - Identify value sinks and sources
   - Calculate sustainability conditions

3. **Build/Incentivize/Emerge Matrix:**
   For each required component:
   - **Build:** M2M constructs directly
   - **Incentivize:** Create conditions for others to build
   - **Emerge:** Expect to arise from agent behavior
   - **External:** Rely on existing infrastructure

4. **Dependency Graph:**
   - DAG of what must exist before what
   - Critical path identification
   - Parallelizable vs. sequential construction

---

## Expected Deliverables

### Executive Summary

- **The Irreducibles:** Things that MUST be built (cannot emerge, cannot be incentivized)
- **The Prediction Market Verdict:** Is this THE engine, A engine, or not viable?
- **Multi-Currency Dynamics:** How a tokenless, multi-currency agent economy functions
- **Value Flow Map:** How value enters, circulates, transforms, and potentially exits
- **Bootstrap Sequence:** Ordered steps from current state to functioning society
- **M2M's Role:** What the project should focus on to capture sustainable value

### Detailed Analysis Sections

#### 1. Prediction Markets as Economic Engine

- Viability assessment
- Required infrastructure (market creation, resolution, settlement)
- Oracle problem solutions
- Multi-currency settlement mechanics
- Specific market types that work for agent societies
- Comparison to alternatives

#### 2. Multi-Currency Agent Economy

- How currency zones form
- Cross-currency dynamics
- Agent-issued token viability
- Role of stablecoins
- Emergence of numeraire (or not)
- Market making / exchange infrastructure

#### 3. Layer-by-Layer Infrastructure Analysis

For each layer (L0-L5):

- What exists today?
- What's missing?
- Who would provide it and why?
- Dependencies on other layers
- Currency considerations

#### 4. External Interface Specification

- How value enters the society
- Required bridges and gateways
- Human participation mechanisms
- Data feed requirements
- Fiat/crypto integration points

#### 5. Bootstrap Pathway

- Minimum viable configuration
- Sequence of construction/activation
- Early adopter incentives (without native token)
- Metrics for each stage
- Decision points / kill criteria

#### 6. M2M Sustainability Model

- Value capture options without token
- Protocol development funding
- Infrastructure operation economics
- Comparison to other tokenless protocols
- Long-term viability assessment

#### 7. Risk Register

- Categorized risks (technical, economic, regulatory, competitive)
- Currency-specific risks (fragmentation, volatility)
- Likelihood and impact assessment
- Mitigation strategies

### Supporting Materials

- **Comparison Matrix:** M2M vs. other decentralized networks
- **Prediction Market Survey:** Existing platforms, architectures, what works/fails
- **Multi-Currency Case Studies:** Historical and crypto examples
- **Dependency Diagram:** Visual DAG of component relationships
- **Value Flow Diagram:** Multi-currency flows through the system

---

## Special Focus: Prediction Market Deep Dive

### What Do Agents Predict?

**External World:**

- Asset prices (crypto, stocks, commodities)
- World events (elections, weather, sports)
- Technology outcomes (will X ship by Y date?)
- Economic indicators

**Internal to Society:**

- Agent behavior (will agent X complete task Y?)
- Capability development (will capability Z exist by date W?)
- Market outcomes (what will price of service X be?)

**Meta-Predictions:**

- What will other prediction markets resolve to?
- Recursive/self-referential markets

### Market Mechanics

- Automated market makers vs. order books
- Continuous vs. discrete resolution
- Scalar vs. binary outcomes
- Combinatorial/conditional markets
- Multi-currency liquidity pools

### Resolution Mechanisms

- Centralized oracles (trusted data feeds)
- Decentralized oracle networks
- Agent consensus oracles (agents attest to outcomes)
- Reality.eth-style dispute resolution
- Schelling point mechanisms
- On-chain data (for crypto-native outcomes)

### Economic Sustainability

- Where does losing side's money go?
- Market maker profitability across currencies
- Fee structures
- Liquidity incentives without native token

### Adversarial Considerations

- Market manipulation by wealthy agents
- Oracle attacks
- Information asymmetry exploitation
- Self-fulfilling prophecies
- Currency manipulation to affect outcomes

---

## Success Criteria

This research succeeds if it definitively answers:

1. **What's the path from today to functioning agent society?**
   - Concrete, ordered steps
   - Clear dependencies
   - Identifiable blockers

2. **Are prediction markets the answer?**
   - If yes: specific architecture for multi-currency environment
   - If no: what alternative?
   - If partial: what else is needed?

3. **How does a multi-currency agent economy function?**
   - Does it converge to dominant currency?
   - How do cross-currency dynamics work?
   - Is agent-issued tokens viable?

4. **What must M2M build?**
   - Cannot be left to emergence
   - Cannot be incentivized into existence
   - Must be directly constructed

5. **How does M2M sustain itself without a token?**
   - Where can value be captured?
   - What's the long-term model?

6. **What kills this?**
   - Top 3-5 existential risks
   - Early warning indicators
   - Mitigation or pivot strategies

---

_This research prompt was generated for the M2M Agent Society Protocol to identify what must exist beyond the core protocol layer, with focus on prediction markets as potential economic engine in a token-neutral, multi-currency agent economy._
