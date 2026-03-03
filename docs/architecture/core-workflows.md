# Core Workflows

## Packet Forwarding Workflow (Multi-Hop)

The following sequence diagram illustrates the core ILP packet forwarding flow through multiple connector hops with telemetry emission:

```mermaid
sequenceDiagram
    participant Sender as Test Packet Sender
    participant ConnA as Connector A
    participant ConnB as Connector B
    participant ConnC as Connector C

    Note over Sender,ConnC: Scenario: Send packet from A to C via B

    Sender->>ConnA: Send ILP Prepare (destination: g.connectorC.dest)
    activate ConnA
    ConnA->>ConnA: BTPServer receives packet
    ConnA->>ConnA: PacketHandler.validatePacket()
    ConnA->>ConnA: RoutingTable.lookup("g.connectorC.dest")
    ConnA->>ConnA: Result: nextHop = "connectorB"
    ConnA->>ConnA: Log: PACKET_RECEIVED
    ConnA->>ConnA: Log: ROUTE_LOOKUP (peer=connectorB)
    ConnA->>ConnB: BTPClient.sendPacket() via WebSocket
    ConnA->>ConnA: Log: PACKET_SENT (nextHop=connectorB)
    deactivate ConnA

    activate ConnB
    ConnB->>ConnB: BTPServer receives packet
    ConnB->>ConnB: PacketHandler.validatePacket()
    ConnB->>ConnB: RoutingTable.lookup("g.connectorC.dest")
    ConnB->>ConnB: Result: nextHop = "connectorC"
    ConnB->>ConnB: Log: PACKET_RECEIVED
    ConnB->>ConnB: Log: ROUTE_LOOKUP (peer=connectorC)
    ConnB->>ConnC: BTPClient.sendPacket() via WebSocket
    ConnB->>ConnB: Log: PACKET_SENT (nextHop=connectorC)
    deactivate ConnB

    activate ConnC
    ConnC->>ConnC: BTPServer receives packet
    ConnC->>ConnC: PacketHandler.validatePacket()
    ConnC->>ConnC: Packet delivered (destination reached)
    ConnC->>ConnC: Log: PACKET_RECEIVED
    ConnC->>ConnB: ILP Fulfill (propagate back)
    deactivate ConnC

    activate ConnB
    ConnB->>ConnA: ILP Fulfill (propagate back)
    deactivate ConnB

    activate ConnA
    ConnA->>Sender: ILP Fulfill (final response)
    deactivate ConnA

    Note over ConnA,ConnC: Telemetry events logged to stdout
```

## Per-Hop BLS Notification Pipeline

Every connector in the path can notify its local Business Logic Server (BLS) when a packet transits through. Intermediate hops fire-and-forget the notification (non-blocking), while the final hop awaits a fulfill/reject decision from its BLS.

```mermaid
sequenceDiagram
    participant Sender as Sender
    participant ConnA as Connector A
    participant BLS_A as BLS A
    participant ConnB as Connector B
    participant BLS_B as BLS B
    participant ConnC as Connector C (Final Hop)
    participant BLS_C as BLS C

    Note over Sender,BLS_C: Packet destination: g.connectorC.dest

    Sender->>ConnA: ILP Prepare
    activate ConnA
    ConnA->>ConnA: RoutingTable.lookup() → nextHop = connectorB

    ConnA-)BLS_A: POST /handle-packet (fire-and-forget)
    Note right of BLS_A: Non-blocking. BLS does<br/>computation, logging,<br/>analytics — no response needed.

    ConnA->>ConnB: Forward via BTP (critical path)
    deactivate ConnA

    activate ConnB
    ConnB->>ConnB: RoutingTable.lookup() → nextHop = connectorC

    ConnB-)BLS_B: POST /handle-packet (fire-and-forget)
    Note right of BLS_B: Non-blocking. Same payload<br/>format as final-hop delivery.

    ConnB->>ConnC: Forward via BTP (critical path)
    deactivate ConnB

    activate ConnC
    ConnC->>ConnC: RoutingTable.lookup() → nextHop = local

    ConnC->>BLS_C: POST /handle-packet (await response)
    activate BLS_C
    BLS_C-->>ConnC: { accept: true }
    deactivate BLS_C
    Note right of BLS_C: Blocking. BLS decides<br/>accept/reject. Connector<br/>computes fulfillment.

    ConnC-->>ConnB: ILP Fulfill
    deactivate ConnC

    activate ConnB
    ConnB-->>ConnA: ILP Fulfill
    deactivate ConnB

    activate ConnA
    ConnA-->>Sender: ILP Fulfill
    deactivate ConnA
```

### Key Behaviors

- **Intermediate hops**: `localDeliveryClient.deliver()` is called with `.catch(noop)` — no `await`, no impact on the critical forwarding path
- **Final hop**: `localDeliveryClient.deliver()` is awaited — the BLS response determines whether to return ILP FULFILL or ILP REJECT
- **Same payload**: Every BLS receives the same `PaymentRequest` format (`paymentId`, `destination`, `amount`, `expiresAt`, `data`) regardless of hop position
- **No packet modification**: The ILP packet is forwarded unchanged to the next hop — the BLS notification is a pure side-effect
- **Failure isolation**: If a fire-and-forget POST fails at an intermediate hop, the packet forwarding is unaffected

## Telemetry and Observability Workflow

**Note:** Dashboard visualization deferred - see DASHBOARD-DEFERRED.md in root

```mermaid
sequenceDiagram
    participant Conn as Connector Nodes (A, B, C)
    participant Logger as Structured Logger
    participant Stdout as Standard Output

    Note over Conn,Stdout: Runtime Telemetry Emission

    Conn->>Logger: Emit: NODE_STATUS (routes, peers)
    Logger->>Stdout: JSON structured log entry

    Conn->>Logger: Emit: PACKET_RECEIVED (packetId, details)
    Logger->>Stdout: JSON structured log entry

    Conn->>Logger: Emit: PACKET_SENT (packetId, nextHop)
    Logger->>Stdout: JSON structured log entry

    Conn->>Logger: Emit: ROUTE_LOOKUP (destination, selectedPeer)
    Logger->>Stdout: JSON structured log entry

    Note over Stdout: Logs consumable by external monitoring tools
```

## Connector Startup and BTP Connection Establishment

```mermaid
sequenceDiagram
    participant Docker as Docker Compose
    participant ConnA as Connector A
    participant ConnB as Connector B

    Note over Docker,ConnB: Startup Sequence

    Docker->>ConnA: Start connector-a container
    activate ConnA
    ConnA->>ConnA: Load config.yaml (routes, peers)
    ConnA->>ConnA: Initialize RoutingTable from config
    ConnA->>ConnA: Start BTPServer (port 3000)
    ConnA->>ConnA: Health check: STARTING
    deactivate ConnA

    Docker->>ConnB: Start connector-b container
    activate ConnB
    ConnB->>ConnB: Load config.yaml
    ConnB->>ConnB: Initialize RoutingTable
    ConnB->>ConnB: Start BTPServer (port 3000)
    deactivate ConnB

    Note over ConnA,ConnB: BTP Peer Connection Phase

    activate ConnA
    ConnA->>ConnB: BTPClient connects (ws://connector-b:3000)
    ConnB->>ConnA: BTP AUTH response (handshake)
    ConnA->>ConnA: Mark peer "connectorB" as CONNECTED
    ConnA->>ConnA: Health check: READY
    deactivate ConnA

    activate ConnB
    ConnB->>ConnA: BTPClient connects (ws://connector-a:3000)
    ConnA->>ConnB: BTP AUTH response
    ConnB->>ConnB: Mark peer "connectorA" as CONNECTED
    ConnB->>ConnB: Health check: READY
    deactivate ConnB

    Note over ConnA,ConnB: Telemetry Emission

    ConnA->>ConnA: Emit: NODE_STATUS (routes, peers)
    ConnB->>ConnB: Emit: NODE_STATUS (routes, peers)

    Note over Docker: All containers healthy - system operational
```

## XRP Settlement Workflow (Dual-Settlement)

The following sequence diagram illustrates the XRP settlement flow with dual-settlement support:

```mermaid
sequenceDiagram
    participant SM as SettlementMonitor
    participant USE as UnifiedSettlementExecutor
    participant LCM as XRPChannelLifecycleManager
    participant SDK as XRPChannelSDK
    participant XRPL as XRP Ledger
    participant Peer as Peer Connector

    Note over SM,Peer: Settlement Required Event

    SM->>USE: SETTLEMENT_REQUIRED (peerId, balance, tokenId='XRP')
    activate USE
    USE->>USE: Get peer config (settlementPreference, xrpAddress)
    USE->>USE: Check: tokenId === 'XRP' && canUseXRP
    USE->>LCM: getOrCreateChannel(peerId, xrpAddress)
    activate LCM

    alt Channel exists
        LCM->>LCM: Return existing channelId
    else Channel doesn't exist
        LCM->>SDK: openChannel(destination, amount, settleDelay)
        activate SDK
        SDK->>XRPL: PaymentChannelCreate transaction
        XRPL-->>SDK: Channel created (channelId)
        SDK->>SDK: Cache channel state locally
        SDK-->>LCM: channelId
        deactivate SDK
        LCM->>LCM: Track channel (Map<peerId, state>)
    end

    LCM-->>USE: channelId
    deactivate LCM

    Note over USE,Peer: Off-Chain Claim Signing

    USE->>SDK: signClaim(channelId, amount)
    activate SDK
    SDK->>SDK: ClaimSigner.signClaim() (ed25519 signature)
    SDK->>SDK: Store claim in database
    SDK-->>USE: { channelId, amount, signature, publicKey }
    deactivate SDK

    USE->>Peer: Send claim off-chain (via BTP)
    Note over Peer: Peer receives claim and verifies signature

    Peer->>XRPL: PaymentChannelClaim transaction
    XRPL->>XRPL: Verify signature, redeem XRP
    XRPL-->>Peer: XRP transferred

    USE->>LCM: updateChannelActivity(peerId, amount)
    activate LCM
    LCM->>LCM: Update lastActivityAt timestamp
    LCM->>LCM: Check needsFunding()?
    alt Needs funding
        LCM->>SDK: fundChannel(channelId, additionalAmount)
        SDK->>XRPL: PaymentChannelFund transaction
        XRPL-->>SDK: Channel funded
    end
    deactivate LCM

    USE->>USE: Update TigerBeetle accounts
    USE-->>SM: Settlement completed
    deactivate USE
```

## XRP Channel Lifecycle State Machine

```
┌────────────────────────────────────────────────────────────┐
│              XRP Channel Lifecycle                         │
└────────────────────────────────────────────────────────────┘

  getOrCreateChannel()
         │
         ▼
    ┌────────┐
    │  OPEN  │ ◄──────────────────┐
    └───┬────┘                     │
        │                          │
        ├─► updateChannelActivity()│
        │                          │
        ├─► needsFunding() ?       │
        │   └─► fundChannel() ─────┘
        │
        ├─► Idle > threshold ?
        │   └─► closeChannel('idle')
        │
        ├─► Approaching CancelAfter ?
        │   └─► closeChannel('expiration')
        │
        ▼
   ┌─────────┐
   │ CLOSING │ ──► Settlement delay period (e.g., 24 hours)
   └─────────┘
        │
        ▼
   ┌────────┐
   │ CLOSED │ ──► Channel removed from ledger
   └────────┘

Lifecycle Events (Periodic Checks - Every 1 Hour):
- Idle Detection: Close channels idle > idleChannelThreshold
- Expiration Handling: Close channels within 1h of CancelAfter
- Funding Checks: Fund when balance < minBalanceThreshold
```

## Dual-Settlement Routing Workflow

```mermaid
flowchart TD
    Start[Settlement Required Event] --> GetPeer[Get Peer Config]
    GetPeer --> CheckToken{Token Type?}

    CheckToken -->|XRP| CheckXRPSupport{Peer supports XRP?}
    CheckToken -->|ERC20| CheckEVMSupport{Peer supports EVM?}

    CheckXRPSupport -->|Yes| XRPAddress{xrpAddress exists?}
    CheckXRPSupport -->|No| Error1[Error: No compatible method]

    CheckEVMSupport -->|Yes| EVMAddress{evmAddress exists?}
    CheckEVMSupport -->|No| Error2[Error: No compatible method]

    XRPAddress -->|Yes| XRPSettle[Settle via XRP]
    XRPAddress -->|No| Error3[Error: Missing xrpAddress]

    EVMAddress -->|Yes| EVMSettle[Settle via EVM]
    EVMAddress -->|No| Error4[Error: Missing evmAddress]

    XRPSettle --> CreateChannel[Find or Create XRP Channel]
    CreateChannel --> SignClaim[Sign Claim Off-Chain]
    SignClaim --> SendClaim[Send Claim to Peer]
    SendClaim --> UpdateAccounts[Update TigerBeetle Accounts]

    EVMSettle --> OpenEVMChannel[Open EVM Payment Channel]
    OpenEVMChannel --> DepositTokens[Deposit ERC20 Tokens]
    DepositTokens --> UpdateAccounts

    UpdateAccounts --> Done[Settlement Complete]

    style Start fill:#2563eb,color:#fff
    style XRPSettle fill:#ea580c,color:#fff
    style EVMSettle fill:#059669,color:#fff
    style Error1 fill:#dc2626,color:#fff
    style Error2 fill:#dc2626,color:#fff
    style Error3 fill:#dc2626,color:#fff
    style Error4 fill:#dc2626,color:#fff
    style Done fill:#16a34a,color:#fff
```
