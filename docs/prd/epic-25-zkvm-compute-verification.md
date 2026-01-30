# Epic 25: zkVM Compute Verification

## Executive Summary

Epic 25 implements trustless verification of agent compute using zero-knowledge virtual machines (zkVMs). Agents can prove that their execution was correct without revealing private inputs, enabling buyers to automatically settle payments based on cryptographic proof rather than trust.

**Key Insight:** We don't prove LLM inference (impractical). We prove the **compute execution** that results from LLM planning. The LLM generates a deterministic Execution Plan, which is then executed in a zkVM that generates a proof of correct execution.

```
Job Request → [LLM Planning] → Execution Plan → [zkVM Execution] → Output + ZK Proof
              (not proven)      (auditable)      (proven correct)
```

This epic is **HIGH** priority as it provides the foundation for trustless agent services, automatic payment settlement, and market-based verification (Epic 26).

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AGENT NODE                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │   AI Core   │───→│   Planner   │───→│  Execution  │                  │
│  │   (Claude)  │    │             │    │    Plan     │                  │
│  └─────────────┘    └─────────────┘    └──────┬──────┘                  │
│                                               │                         │
│                                               ↓                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PROVABLE EXECUTION LAYER                      │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                  │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │   │
│  │  │  External   │───→│    zkVM     │───→│    Proof    │          │   │
│  │  │ Data Fetch  │    │   Runtime   │    │  Generator  │          │   │
│  │  └─────────────┘    └─────────────┘    └──────┬──────┘          │   │
│  │        │                   │                   │                 │   │
│  │        ↓                   ↓                   ↓                 │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │   │
│  │  │ TLS Proofs  │    │   Output    │    │  ZK Proof   │          │   │
│  │  │ (optional)  │    │             │    │             │          │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘          │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Verification Tiers

| Tier         | Method            | Trust Assumption       | Use Case              |
| ------------ | ----------------- | ---------------------- | --------------------- |
| **Tier 0**   | None (current)    | Full trust in provider | Low-value, trusted    |
| **Tier 1**   | Hash commitment   | Trust input data       | Deterministic outputs |
| **Tier 1.5** | TEE attestation   | Trust hardware vendor  | Fast, medium-trust    |
| **Tier 2**   | zkVM proof        | Math only              | High-value, untrusted |
| **Tier 3**   | zkVM + TLS oracle | Math only              | Full trustless        |

### Supported zkVM Backends

| Backend       | Language      | Proof Size | Proving Time | Status    |
| ------------- | ------------- | ---------- | ------------ | --------- |
| **RISC Zero** | Rust (RISC-V) | ~200KB     | 10-100x exec | Primary   |
| **SP1**       | Rust (RISC-V) | ~100KB     | 5-50x exec   | Secondary |
| **zkWASM**    | Any → WASM    | ~300KB     | 20-200x exec | Future    |

## Package Structure

```
packages/connector/src/agent/
├── zkvm/
│   ├── index.ts                  # Public API
│   ├── types.ts                  # Type definitions
│   ├── execution-plan.ts         # Plan IR utilities
│   ├── proof-generator.ts        # Proof generation
│   ├── verifier.ts               # Proof verification
│   ├── program-registry.ts       # Program management
│   ├── settlement.ts             # ILP integration
│   ├── provers/
│   │   ├── risc-zero.ts          # RISC Zero backend
│   │   └── sp1.ts                # SP1 backend
│   └── __tests__/
│       ├── execution-plan.test.ts
│       ├── proof-generator.test.ts
│       ├── verifier.test.ts
│       └── settlement.test.ts
│
├── zkvm-guest/                   # zkVM guest code (Rust)
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs               # Entry point
│       ├── executor.rs           # Plan execution
│       └── operations/           # Step implementations
│           ├── transform.rs
│           ├── filter.rs
│           ├── aggregate.rs
│           └── compute.rs
│
└── ai/skills/
    ├── request-zk-job-skill.ts
    └── verify-proof-skill.ts
```

## Configuration

```yaml
agent:
  zkvm:
    enabled: true
    backend: 'risc-zero' # or 'sp1'
    programRegistry:
      source: 'embedded' # or 'remote'
      allowedPrograms:
        - 'sha256:abc123...' # Known good program IDs
    proving:
      gpuAcceleration: true
      maxCycles: 1000000000 # 1B cycles max
      timeout: 300000 # 5 minute proving timeout
    verification:
      cacheProofs: true
      cacheSize: 1000
    externalData:
      tlsAttestation: 'optional' # 'required', 'optional', 'none'
      trustedProviders:
        - 'api.coingecko.com'
        - 'api.binance.com'
```

## Stories

| Story | Description                           | Status      |
| ----- | ------------------------------------- | ----------- |
| 25.1  | Execution Plan IR Types & Schema      | Not Started |
| 25.2  | Plan Parser & Validator               | Not Started |
| 25.3  | zkVM Guest Program (Basic Operations) | Not Started |
| 25.4  | RISC Zero Prover Integration          | Not Started |
| 25.5  | Proof Verifier                        | Not Started |
| 25.6  | Program Registry                      | Not Started |
| 25.7  | DVM Integration (ZK Tags)             | Not Started |
| 25.8  | ILP Settlement Integration            | Not Started |
| 25.9  | Proof Storage (Blossom/IPFS)          | Not Started |
| 25.10 | SP1 Backend (Optional)                | Not Started |
| 25.11 | request_zk_job Skill                  | Not Started |
| 25.12 | verify_proof Skill                    | Not Started |
| 25.13 | Integration Tests                     | Not Started |

---

## Story 25.1: Execution Plan IR Types & Schema

### Description

Define the Intermediate Representation (IR) for execution plans that can be proven in a zkVM.

### Acceptance Criteria

1. `ExecutionPlan` interface with version, steps, output config, limits
2. `ExecutionStep` union type for all step types
3. `DataInputStep` for external data references with commitments
4. `TransformStep` for data transformations
5. `FilterStep` for data filtering
6. `AggregateStep` for combining data
7. `ComputeStep` for calculations
8. `BranchStep` for conditional execution
9. `LoopStep` for bounded iteration
10. `ResourceLimits` for cycles, memory, output size
11. Zod schemas for all types
12. JSON Schema export for external tools

### Technical Notes

```typescript
interface ExecutionPlan {
  version: '1.0';
  id: string;
  jobRequestHash: string;
  steps: ExecutionStep[];
  output: OutputConfig;
  limits: ResourceLimits;
}

interface ResourceLimits {
  maxMemoryBytes: number;
  maxCycles: number;
  maxOutputBytes: number;
}

type ExecutionStep =
  | DataInputStep
  | TransformStep
  | FilterStep
  | AggregateStep
  | ComputeStep
  | BranchStep
  | LoopStep;

interface DataInputStep {
  type: 'data-input';
  id: string;
  dataCommitment: string; // Merkle root of input data
  schema: JSONSchema;
  source: {
    type: 'api' | 'file' | 'parameter' | 'previous-job';
    uri?: string;
    attestation?: 'tls-notary' | 'trusted-provider' | 'none';
  };
}

interface TransformStep {
  type: 'transform';
  id: string;
  input: string; // Step ID reference
  operation: TransformOperation;
}

type TransformOperation =
  | { op: 'map'; expression: Expression }
  | { op: 'select'; fields: string[] }
  | { op: 'rename'; mapping: Record<string, string> }
  | { op: 'parse'; format: 'json' | 'csv' | 'xml' }
  | { op: 'serialize'; format: 'json' | 'csv' }
  | { op: 'custom'; wasmModule: string; functionName: string };
```

---

## Story 25.2: Plan Parser & Validator

### Description

Implement parsing and validation of Execution Plans.

### Acceptance Criteria

1. Parse JSON/YAML execution plans into TypeScript types
2. Validate plan schema with Zod
3. Validate step references (no dangling references)
4. Validate resource limits are within bounds
5. Detect cycles in step dependencies
6. Validate output step exists
7. Compute plan hash for commitment
8. Build execution DAG from steps
9. Topological sort for execution order
10. Error messages with source location

### Technical Notes

```typescript
interface PlanValidationResult {
  valid: boolean;
  errors: PlanValidationError[];
  warnings: PlanValidationWarning[];
  executionOrder: string[]; // Topologically sorted step IDs
  planHash: string;
}

class ExecutionPlanParser {
  parse(input: string | object): ExecutionPlan;
  validate(plan: ExecutionPlan): PlanValidationResult;
  computeHash(plan: ExecutionPlan): string;
  buildExecutionDAG(plan: ExecutionPlan): ExecutionDAG;
}
```

---

## Story 25.3: zkVM Guest Program (Basic Operations)

### Description

Implement the Rust guest program that executes plans inside the zkVM.

### Acceptance Criteria

1. RISC Zero guest program structure (no_std, no_main)
2. Read private inputs (plan, external data)
3. Read public inputs (commitments)
4. Verify plan hash matches commitment
5. Verify data merkle root matches commitment
6. Execute plan steps in order
7. Implement transform operations (map, select, rename)
8. Implement filter operations
9. Implement aggregate operations (concat, merge, reduce)
10. Implement compute operations (math, statistics, hash)
11. Commit public outputs (output hash, metadata)
12. Resource usage tracking (cycles, memory)

### Technical Notes

```rust
// guest/src/main.rs
#![no_main]
#![no_std]

use risc0_zkvm::guest::env;
use m2m_zkvm_core::{ExecutionPlan, ExternalData, ExecutionResult};

risc0_zkvm::guest::entry!(main);

fn main() {
    // Read inputs
    let plan: ExecutionPlan = env::read();
    let external_data: Vec<ExternalData> = env::read();
    let plan_hash: [u8; 32] = env::read();
    let data_merkle_root: [u8; 32] = env::read();

    // Verify commitments
    assert_eq!(sha256(&plan), plan_hash);
    assert_eq!(compute_merkle_root(&external_data), data_merkle_root);

    // Execute
    let result = execute_plan(&plan, &external_data);

    // Commit outputs
    env::commit(&result);
}
```

---

## Story 25.4: RISC Zero Prover Integration

### Description

Integrate RISC Zero for proof generation.

### Acceptance Criteria

1. `RiscZeroProver` class wrapping RISC Zero SDK
2. Load guest program (ELF binary)
3. Serialize inputs for guest
4. Execute prover with inputs
5. Handle proving errors gracefully
6. GPU acceleration support (CUDA/Metal)
7. Proving timeout enforcement
8. Memory limit enforcement
9. Return proof and public outputs
10. Proof serialization for transmission

### Technical Notes

```typescript
interface ProverConfig {
  programPath: string; // Path to guest ELF
  gpuAcceleration: boolean;
  maxCycles: number;
  timeout: number;
}

class RiscZeroProver {
  constructor(config: ProverConfig);

  async prove(
    publicInputs: PublicInputs,
    privateInputs: PrivateInputs
  ): Promise<{
    proof: Buffer;
    publicOutputs: PublicOutputs;
    metadata: ProvingMetadata;
  }>;

  get programId(): string; // Hash of guest ELF
}

interface ProvingMetadata {
  provingTimeMs: number;
  cyclesUsed: number;
  memoryUsed: number;
}
```

---

## Story 25.5: Proof Verifier

### Description

Implement proof verification for buyers and third parties.

### Acceptance Criteria

1. `ZKVerifier` class for proof validation
2. Load verifier from program ID
3. Verify proof against public inputs
4. Verify proof against public outputs
5. Check program ID against registry
6. Check for deprecated programs
7. Verify job request hash matches
8. Cache verification results
9. Batch verification support
10. WASM verifier for browser use

### Technical Notes

```typescript
interface VerificationResult {
  valid: boolean;
  reason?: string;
  outputHash?: string;
  metadata?: ExecutionMetadata;
}

class ZKVerifier {
  constructor(registry: ProgramRegistry);

  async verify(proof: SerializedProof, expectedJobRequestHash: string): Promise<VerificationResult>;

  async verifyBatch(proofs: SerializedProof[]): Promise<BatchVerificationResult>;
}
```

---

## Story 25.6: Program Registry

### Description

Manage known good zkVM guest programs.

### Acceptance Criteria

1. `ProgramRegistry` for tracking programs
2. Register new programs with metadata
3. Query programs by ID
4. Deprecate vulnerable programs
5. Version compatibility checking
6. Feature flag support per program
7. Embedded registry (default programs)
8. Remote registry sync (optional)
9. Program signature verification
10. Audit trail for changes

### Technical Notes

```typescript
interface ProgramMetadata {
  programId: string; // SHA256 of ELF
  version: string;
  releaseDate: string;
  features: string[];
  deprecated: boolean;
  minCompatibleVersion: string;
  signature?: string; // Signed by registry authority
}

class ProgramRegistry {
  getProgram(programId: string): ProgramMetadata | undefined;
  isAllowed(programId: string): boolean;
  isDeprecated(programId: string): boolean;
  register(metadata: ProgramMetadata, signature: string): void;
  deprecate(programId: string, reason: string): void;
}
```

---

## Story 25.7: DVM Integration (ZK Tags)

### Description

Add ZK verification tags to DVM events.

### Acceptance Criteria

1. New tags for Kind 5900 (Job Request):
   - `["verification", "zk"]`
   - `["zkvm", "risc-zero"]` (preferred backend)
   - `["min-program-version", "1.0.0"]`
   - `["max-proving-time", "300"]`
2. New tags for Kind 6900 (Job Result):
   - `["verification", "zk"]`
   - `["zkvm", "risc-zero"]`
   - `["program-id", "sha256:..."]`
   - `["plan-hash", "sha256:..."]`
   - `["data-merkle-root", "sha256:..."]`
   - `["output-hash", "sha256:..."]`
   - `["proof", "base64:..."]` or `["proof-ref", "ipfs:Qm..."]`
   - `["proving-time-ms", "45000"]`
   - `["cycles-used", "500000000"]`
3. Parse ZK tags from incoming events
4. Validate ZK requirements on job acceptance
5. Include ZK tags in result events

### Technical Notes

```typescript
function parseZKRequirements(event: NostrEvent): ZKRequirements | null {
  const verificationTag = event.tags.find((t) => t[0] === 'verification');
  if (!verificationTag || verificationTag[1] !== 'zk') return null;

  return {
    backend: findTag(event, 'zkvm') ?? 'any',
    minProgramVersion: findTag(event, 'min-program-version'),
    maxProvingTime: parseInt(findTag(event, 'max-proving-time') ?? '300'),
  };
}

function createZKResultTags(result: ProofResult): string[][] {
  return [
    ['verification', 'zk'],
    ['zkvm', result.backend],
    ['program-id', result.programId],
    ['plan-hash', result.publicInputs.planHash],
    ['output-hash', result.publicOutputs.outputHash],
    ['proof-ref', result.proofStorageRef], // IPFS/Blossom reference
    ['proving-time-ms', result.metadata.provingTimeMs.toString()],
    ['cycles-used', result.metadata.cyclesUsed.toString()],
  ];
}
```

---

## Story 25.8: ILP Settlement Integration

### Description

Integrate ZK verification with ILP payment settlement.

### Acceptance Criteria

1. Auto-FULFILL on valid proof
2. Auto-REJECT on invalid proof
3. Derive fulfillment from proof verification
4. Initiate slashing on invalid proofs
5. Handle timeout (no proof submitted)
6. Track verification in TigerBeetle
7. Emit settlement events
8. Support verification-before-fulfill mode
9. Support optimistic-with-challenge mode

### Technical Notes

```typescript
async handleZKJobResult(
  result: DVMResult,
  pendingPayment: ILPPrepare
): Promise<ILPFulfill | ILPReject> {
  // Extract and verify proof
  const proof = await this.extractProof(result)
  const verification = await this.zkVerifier.verify(
    proof,
    sha256(result.jobRequestId)
  )

  if (verification.valid) {
    // Auto-settle payment
    return {
      type: 'fulfill',
      fulfillment: deriveFulfillment(proof, verification),
      data: Buffer.from(JSON.stringify({
        outputHash: verification.outputHash,
        verifiedAt: Date.now()
      }))
    }
  } else {
    // Reject and slash
    await this.initiateSlashing(result.provider, verification.reason)
    return {
      type: 'reject',
      code: 'F00',
      message: `ZK verification failed: ${verification.reason}`,
      triggeredBy: 'receiver'
    }
  }
}
```

---

## Story 25.9: Proof Storage (Blossom/IPFS)

### Description

Store proofs in content-addressed storage.

### Acceptance Criteria

1. Proof serialization format (JSON + binary)
2. Upload proof to Blossom server
3. Fallback to IPFS if Blossom unavailable
4. Return content hash (CID)
5. Include reference in DVM result event
6. Fetch proof from storage for verification
7. Cache fetched proofs locally
8. Garbage collection for old proofs
9. Pin important proofs

### Technical Notes

```typescript
interface ProofStorage {
  upload(proof: SerializedProof): Promise<{ ref: string; url: string }>;
  fetch(ref: string): Promise<SerializedProof>;
  pin(ref: string): Promise<void>;
  unpin(ref: string): Promise<void>;
}

class BlossomProofStorage implements ProofStorage {
  constructor(serverUrl: string, authKey: string);
  async upload(proof: SerializedProof): Promise<{ ref: string; url: string }>;
}

class IPFSProofStorage implements ProofStorage {
  constructor(gateway: string);
  async upload(proof: SerializedProof): Promise<{ ref: string; url: string }>;
}
```

---

## Story 25.10: SP1 Backend (Optional)

### Description

Add SP1 as an alternative proving backend.

### Acceptance Criteria

1. `SP1Prover` class wrapping SP1 SDK
2. Same interface as RiscZeroProver
3. Guest program compilation for SP1
4. Proof generation and verification
5. Backend selection based on job requirements
6. Performance comparison metrics
7. Fallback if primary backend unavailable

### Technical Notes

```typescript
class SP1Prover implements Prover {
  constructor(config: ProverConfig);

  async prove(publicInputs: PublicInputs, privateInputs: PrivateInputs): Promise<ProofResult>;

  get programId(): string;
  get backend(): 'sp1';
}

// Factory for selecting backend
function createProver(backend: 'risc-zero' | 'sp1', config: ProverConfig): Prover {
  return backend === 'risc-zero' ? new RiscZeroProver(config) : new SP1Prover(config);
}
```

---

## Story 25.11: request_zk_job Skill

### Description

Create AI skill to request ZK-verified jobs.

### Acceptance Criteria

1. Skill registered as `request_zk_job`
2. Parameters: provider, task, verificationLevel, maxProvingTime
3. Add ZK requirement tags to job request
4. Specify preferred zkVM backend
5. Set minimum program version
6. Return job ID and status
7. Handle provider rejection

### Technical Notes

```typescript
const requestZKJobSkill: AgentSkill = {
  name: 'request_zk_job',
  description: 'Request a ZK-verified job from another agent',
  parameters: z.object({
    providerPubkey: z.string(),
    task: z.string(),
    verificationLevel: z.enum(['hash', 'zk', 'zk-tls']),
    zkvm: z.enum(['risc-zero', 'sp1', 'any']).optional(),
    maxProvingTime: z.number().optional(),
    payment: z.number(),
  }),
  execute: async (params, context) => {
    // Build job request with ZK tags
    const jobRequest = await context.dvmClient.createJobRequest({
      task: params.task,
      payment: params.payment,
      tags: [
        ['verification', params.verificationLevel],
        ['zkvm', params.zkvm ?? 'any'],
        ['max-proving-time', (params.maxProvingTime ?? 300).toString()],
      ],
    });

    return { jobId: jobRequest.id, status: 'pending' };
  },
};
```

---

## Story 25.12: verify_proof Skill

### Description

Create AI skill to verify ZK proofs.

### Acceptance Criteria

1. Skill registered as `verify_proof`
2. Parameters: jobResultEventId, or proofRef
3. Fetch proof from storage if needed
4. Verify against known program registry
5. Return verification result
6. Include output hash on success
7. Include failure reason on failure

---

## Story 25.13: Integration Tests

### Description

Comprehensive integration tests for zkVM verification.

### Acceptance Criteria

1. Test full flow: plan → prove → verify → settle
2. Test with real RISC Zero prover (not mocked)
3. Test invalid proof rejection
4. Test unknown program rejection
5. Test timeout handling
6. Test proof storage and retrieval
7. Test DVM event flow with ZK tags
8. Test ILP settlement on valid proof
9. Test slashing on invalid proof
10. Performance benchmarks

---

## Dependencies

- **Epic 6** (TigerBeetle) — Settlement accounting
- **Epic 13** (Agent Society Protocol) — Nostr events
- **Epic 16** (AI Agent Node) — Skills
- **Epic 17** (NIP-90 DVM) — Job request/result flow

## External Dependencies

- **RISC Zero** — zkVM SDK (Rust + bindings)
- **SP1** — Alternative zkVM (optional)
- **Blossom** — Nostr-native blob storage
- **IPFS** — Fallback content-addressed storage

## Risk Mitigation

| Risk                    | Mitigation                                       |
| ----------------------- | ------------------------------------------------ |
| Proving too slow        | GPU acceleration, timeout limits, tier selection |
| Proof too large         | Compression, external storage (Blossom/IPFS)     |
| Program vulnerabilities | Registry deprecation, version requirements       |
| SDK instability         | Pin versions, fallback backends                  |
| Cost prohibitive        | Tiered verification, prove only high-value jobs  |

## Success Metrics

- Proof generation < 5 minutes for typical jobs
- Verification < 100ms
- 100% invalid proof rejection
- Zero false rejections
- < 1MB proof size (compressed)
- 99.9% proof storage availability

## Economic Model

### Proving Costs

| Task Complexity     | Cycles | Proving Time | Estimated Cost |
| ------------------- | ------ | ------------ | -------------- |
| Simple transform    | 10M    | ~5s          | ~100 sats      |
| JSON parse + filter | 100M   | ~30s         | ~500 sats      |
| Complex aggregation | 500M   | ~2min        | ~2000 sats     |
| Custom WASM         | 1B     | ~5min        | ~5000 sats     |

### Break-Even Analysis

ZK verification becomes economically viable when:

```
Job Value × Fraud Rate > Proving Cost

Example:
- Job value: 100,000 sats
- Fraud rate without ZK: 2%
- Expected loss without ZK: 2,000 sats
- ZK proving cost: 500 sats
→ ZK verification saves 1,500 sats per job on average
```

## Future Extensions

1. **TLS Oracles (Story 25.14+)** — Prove external data authenticity with TLSNotary
2. **Proof Aggregation** — Batch multiple proofs for efficiency
3. **Recursive Proofs** — Prove chains of agent computations
4. **On-Chain Verification** — Verify proofs on Base L2 for disputes
