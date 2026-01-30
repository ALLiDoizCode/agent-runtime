# zkVM-Based Agent Verification Specification

**Version:** 0.1.0-draft
**Status:** Draft
**Author:** Winston (Architect)
**Date:** 2026-01-30

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [Architecture](#3-architecture)
4. [Execution Plan IR](#4-execution-plan-ir)
5. [zkVM Guest Program](#5-zkvm-guest-program)
6. [Proof Generation Flow](#6-proof-generation-flow)
7. [Verification Flow](#7-verification-flow)
8. [DVM Integration](#8-dvm-integration)
9. [ILP Settlement Integration](#9-ilp-settlement-integration)
10. [External Data Attestation](#10-external-data-attestation)
11. [Error Handling and Slashing](#11-error-handling-and-slashing)
12. [Security Considerations](#12-security-considerations)
13. [Performance Considerations](#13-performance-considerations)
14. [Migration Path](#14-migration-path)
15. [Open Questions](#15-open-questions)

---

## 1. Overview

### 1.1 Problem Statement

Agent services in the M2M network execute compute tasks for payment. Currently, verification relies on:

- Trust in the provider
- Optimistic execution with dispute resolution
- Attestations from other agents

These approaches have limitations:

- **Trust-based**: Requires reputation bootstrapping, susceptible to fraud
- **Optimistic**: Disputes are expensive and subjective
- **Attestations**: Introduces oracle trust assumptions

### 1.2 Solution: zkVM Verification

Zero-knowledge virtual machines (zkVMs) can prove that arbitrary code executed correctly without revealing private inputs. This enables **trustless verification** of agent compute.

**Key Insight**: We don't prove LLM inference (impractical). We prove the **compute execution** that results from LLM planning:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Job Request ──→ [LLM Planning] ──→ Execution Plan         │
│                   (not proven)       (explicit, auditable)  │
│                                             │               │
│                                             ↓               │
│                                      [zkVM Execution]       │
│                                       (proven correct)      │
│                                             │               │
│                                             ↓               │
│                                    Output + ZK Proof        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Scope

This specification covers:

- Execution Plan intermediate representation (IR)
- zkVM guest program architecture
- Proof generation and verification
- Integration with DVM (NIP-90) events
- Integration with ILP payment settlement
- External data attestation

---

## 2. Goals and Non-Goals

### 2.1 Goals

1. **Trustless Verification**: Any party can verify compute correctness without trusting the provider
2. **Composable Proofs**: Proofs can chain across multi-step agent workflows
3. **Selective Privacy**: Private inputs can remain hidden while proving correctness
4. **Backwards Compatible**: Existing DVM flows work unchanged; ZK is opt-in
5. **Economically Viable**: Proof overhead acceptable for medium-to-high value jobs
6. **zkVM Agnostic**: Support multiple proving backends (RISC Zero, SP1, etc.)

### 2.2 Non-Goals

1. **Proving LLM Inference**: Neural network execution is out of scope
2. **Real-time Proofs**: Sub-second proof generation is not required
3. **On-chain Verification**: Proofs verified off-chain by agents/buyers
4. **Universal Compute**: Focus on structured agent tasks, not arbitrary programs

---

## 3. Architecture

### 3.1 High-Level Architecture

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

### 3.2 Component Overview

| Component               | Responsibility                                     | Implementation         |
| ----------------------- | -------------------------------------------------- | ---------------------- |
| **AI Core**             | Natural language understanding, task decomposition | Claude API             |
| **Planner**             | Convert task to structured ExecutionPlan           | TypeScript             |
| **Execution Plan**      | Deterministic IR for provable compute              | JSON/Protobuf          |
| **External Data Fetch** | Retrieve data with optional TLS proofs             | TypeScript + TLSNotary |
| **zkVM Runtime**        | Execute plan and generate proof                    | RISC Zero / SP1        |
| **Proof Generator**     | Serialize and format proof for transmission        | Rust (guest)           |
| **Verifier**            | Validate proofs against known program hashes       | TypeScript + WASM      |

### 3.3 Supported zkVM Backends

| Backend       | Language      | Proof Size | Proving Time | Status    |
| ------------- | ------------- | ---------- | ------------ | --------- |
| **RISC Zero** | Rust (RISC-V) | ~200KB     | 10-100x exec | Primary   |
| **SP1**       | Rust (RISC-V) | ~100KB     | 5-50x exec   | Secondary |
| **zkWASM**    | Any → WASM    | ~300KB     | 20-200x exec | Future    |

**Recommendation**: Start with RISC Zero for maturity, add SP1 for performance-critical paths.

---

## 4. Execution Plan IR

### 4.1 Design Principles

1. **Deterministic**: Same plan + inputs → same output, always
2. **Auditable**: Human-readable, can be reviewed before execution
3. **Composable**: Plans can reference outputs of other plans
4. **Minimal**: Only primitives needed for common agent tasks
5. **Sandboxed**: No system calls, network, or filesystem in zkVM

### 4.2 Schema Definition

```typescript
/**
 * Execution Plan Intermediate Representation
 * Version 1.0
 */

interface ExecutionPlan {
  /** Schema version for forwards compatibility */
  version: '1.0';

  /** Unique identifier for this plan */
  id: string;

  /** Hash of the job request this plan fulfills */
  jobRequestHash: string;

  /** Ordered list of execution steps */
  steps: ExecutionStep[];

  /** Final output configuration */
  output: OutputConfig;

  /** Resource limits */
  limits: ResourceLimits;
}

interface ResourceLimits {
  /** Maximum memory usage in bytes */
  maxMemoryBytes: number;

  /** Maximum execution cycles (zkVM specific) */
  maxCycles: number;

  /** Maximum output size in bytes */
  maxOutputBytes: number;
}

interface OutputConfig {
  /** Reference to step whose output is the final result */
  resultStep: string;

  /** JSON Schema for output validation */
  schema?: JSONSchema;

  /** Output format */
  format: 'json' | 'binary' | 'text';
}

/**
 * Execution Step Types
 */
type ExecutionStep =
  | DataInputStep
  | TransformStep
  | FilterStep
  | AggregateStep
  | ComputeStep
  | BranchStep
  | LoopStep;

/**
 * Data Input Step
 * References external data by commitment
 */
interface DataInputStep {
  type: 'data-input';
  id: string;

  /** Merkle root of input data (committed before execution) */
  dataCommitment: string;

  /** Expected data schema */
  schema: JSONSchema;

  /** Data source metadata (for auditing) */
  source: {
    type: 'api' | 'file' | 'parameter' | 'previous-job';
    uri?: string;
    attestation?: 'tls-notary' | 'trusted-provider' | 'none';
  };
}

/**
 * Transform Step
 * Apply a pure function to input data
 */
interface TransformStep {
  type: 'transform';
  id: string;

  /** Input reference (step ID or 'input') */
  input: string;

  /** Transform operation */
  operation: TransformOperation;
}

type TransformOperation =
  | { op: 'map'; expression: Expression }
  | { op: 'select'; fields: string[] }
  | { op: 'rename'; mapping: Record<string, string> }
  | { op: 'parse'; format: 'json' | 'csv' | 'xml' }
  | { op: 'serialize'; format: 'json' | 'csv' }
  | { op: 'custom'; wasmModule: string; functionName: string };

/**
 * Filter Step
 * Filter data based on predicate
 */
interface FilterStep {
  type: 'filter';
  id: string;
  input: string;
  predicate: Expression;
}

/**
 * Aggregate Step
 * Combine multiple inputs
 */
interface AggregateStep {
  type: 'aggregate';
  id: string;
  inputs: string[];
  operation: AggregateOperation;
}

type AggregateOperation =
  | { op: 'concat' }
  | { op: 'merge'; strategy: 'shallow' | 'deep' }
  | { op: 'reduce'; reducer: Expression; initial: any }
  | { op: 'group'; keyExpression: Expression }
  | { op: 'join'; on: string; type: 'inner' | 'left' | 'outer' };

/**
 * Compute Step
 * Perform calculations
 */
interface ComputeStep {
  type: 'compute';
  id: string;
  input: string;
  computation: Computation;
}

type Computation =
  | { op: 'math'; expression: MathExpression }
  | { op: 'statistics'; metrics: ('sum' | 'avg' | 'min' | 'max' | 'count' | 'std')[] }
  | { op: 'hash'; algorithm: 'sha256' | 'keccak256' }
  | { op: 'custom'; wasmModule: string; functionName: string };

/**
 * Branch Step
 * Conditional execution
 */
interface BranchStep {
  type: 'branch';
  id: string;
  condition: Expression;
  ifTrue: string; // Step ID to use if true
  ifFalse: string; // Step ID to use if false
}

/**
 * Loop Step
 * Iterate over collection
 */
interface LoopStep {
  type: 'loop';
  id: string;
  input: string;
  iterator: string; // Variable name for current item
  body: ExecutionStep[];
  maxIterations: number;
}

/**
 * Expression Language (Subset of JSONPath + Simple Operators)
 */
type Expression = string; // e.g., "$.data[*].value > 100"

type MathExpression = string; // e.g., "sum($.values) / count($.values)"
```

### 4.3 Example Execution Plan

```json
{
  "version": "1.0",
  "id": "plan-abc123",
  "jobRequestHash": "sha256:deadbeef...",
  "steps": [
    {
      "type": "data-input",
      "id": "api-response",
      "dataCommitment": "sha256:cafebabe...",
      "schema": { "type": "object", "properties": { "prices": { "type": "array" } } },
      "source": {
        "type": "api",
        "uri": "https://api.coingecko.com/v3/coins/bitcoin",
        "attestation": "tls-notary"
      }
    },
    {
      "type": "transform",
      "id": "extract-prices",
      "input": "api-response",
      "operation": {
        "op": "select",
        "fields": ["market_data.current_price.usd", "market_data.price_change_24h"]
      }
    },
    {
      "type": "compute",
      "id": "calculate-metrics",
      "input": "extract-prices",
      "computation": {
        "op": "math",
        "expression": "{ price: $.current_price.usd, change_pct: ($.price_change_24h / $.current_price.usd) * 100 }"
      }
    }
  ],
  "output": {
    "resultStep": "calculate-metrics",
    "format": "json",
    "schema": {
      "type": "object",
      "properties": {
        "price": { "type": "number" },
        "change_pct": { "type": "number" }
      }
    }
  },
  "limits": {
    "maxMemoryBytes": 67108864,
    "maxCycles": 1000000000,
    "maxOutputBytes": 1048576
  }
}
```

### 4.4 Custom WASM Modules

For operations not covered by built-in primitives, custom WASM modules can be embedded:

```typescript
interface WASMModule {
  /** SHA256 hash of the WASM binary */
  hash: string;

  /** Human-readable name */
  name: string;

  /** Base64-encoded WASM binary (or reference to content-addressed storage) */
  code: string | { ref: 'ipfs' | 'arweave'; cid: string };

  /** Expected function signature */
  signature: {
    inputs: WASMType[];
    outputs: WASMType[];
  };
}

type WASMType = 'i32' | 'i64' | 'f32' | 'f64' | 'bytes';
```

**Security**: Custom WASM modules must be:

1. Deterministic (no randomness, no system calls)
2. Terminating (bounded loops, no recursion without limits)
3. Auditable (source code available for review)

---

## 5. zkVM Guest Program

### 5.1 Guest Program Architecture

The zkVM guest program is the code that runs inside the prover:

```rust
// guest/src/main.rs (RISC Zero guest)

#![no_main]
#![no_std]

use risc0_zkvm::guest::env;
use m2m_zkvm_core::{ExecutionPlan, ExternalData, ExecutionResult};

risc0_zkvm::guest::entry!(main);

fn main() {
    // 1. Read private inputs
    let plan: ExecutionPlan = env::read();
    let external_data: Vec<ExternalData> = env::read();

    // 2. Read public inputs (commitments)
    let plan_hash: [u8; 32] = env::read();
    let data_merkle_root: [u8; 32] = env::read();
    let job_request_hash: [u8; 32] = env::read();

    // 3. Verify commitments match private inputs
    assert_eq!(sha256(&plan), plan_hash, "Plan hash mismatch");
    assert_eq!(
        compute_merkle_root(&external_data),
        data_merkle_root,
        "Data merkle root mismatch"
    );
    assert_eq!(plan.job_request_hash, job_request_hash, "Job request mismatch");

    // 4. Execute the plan
    let result = execute_plan(&plan, &external_data);

    // 5. Commit public outputs
    let output_hash = sha256(&result.output);

    env::commit(&ExecutionResult {
        output_hash,
        plan_hash,
        job_request_hash,
        execution_metadata: result.metadata,
    });
}

fn execute_plan(plan: &ExecutionPlan, data: &[ExternalData]) -> PlanResult {
    let mut state = ExecutionState::new(data);

    for step in &plan.steps {
        state.execute_step(step)?;
    }

    state.finalize(&plan.output)
}
```

### 5.2 Public Inputs and Outputs

```rust
/// Committed before proof generation (public)
pub struct PublicInputs {
    /// SHA256 of the ExecutionPlan
    pub plan_hash: [u8; 32],

    /// Merkle root of all external data
    pub data_merkle_root: [u8; 32],

    /// SHA256 of the original job request (Kind 5900 event)
    pub job_request_hash: [u8; 32],

    /// Program ID (hash of the guest binary)
    pub program_id: [u8; 32],
}

/// Output of proof generation (public)
pub struct PublicOutputs {
    /// SHA256 of the execution output
    pub output_hash: [u8; 32],

    /// Echo back plan hash for verification
    pub plan_hash: [u8; 32],

    /// Echo back job request hash
    pub job_request_hash: [u8; 32],

    /// Execution metadata
    pub metadata: ExecutionMetadata,
}

pub struct ExecutionMetadata {
    /// Number of zkVM cycles consumed
    pub cycles_used: u64,

    /// Peak memory usage in bytes
    pub memory_used: u64,

    /// Number of steps executed
    pub steps_executed: u32,

    /// Timestamp (from job request, not wall clock)
    pub timestamp: u64,
}
```

### 5.3 Supported Operations in Guest

| Category         | Operations                           | Notes                        |
| ---------------- | ------------------------------------ | ---------------------------- |
| **Data Access**  | Read committed inputs, merkle proofs | No network/filesystem        |
| **Transforms**   | Map, filter, select, rename, parse   | Pure functions only          |
| **Aggregation**  | Concat, merge, reduce, group, join   | Deterministic ordering       |
| **Compute**      | Arithmetic, statistics, hashing      | No floating point randomness |
| **Control Flow** | Branch, loop (bounded)               | Must terminate               |
| **Custom**       | WASM module execution                | Sandboxed, deterministic     |

### 5.4 Guest Program Versioning

Multiple versions of the guest program may exist. Each has a unique **Program ID**:

```typescript
interface ProgramRegistry {
  programs: {
    [programId: string]: {
      version: string;
      releaseDate: string;
      features: string[];
      deprecated: boolean;
      minCompatibleVersion: string;
    };
  };
}

// Example registry
const registry: ProgramRegistry = {
  programs: {
    'sha256:abc123...': {
      version: '1.0.0',
      releaseDate: '2026-01-30',
      features: ['basic-transforms', 'json-parse'],
      deprecated: false,
      minCompatibleVersion: '1.0.0',
    },
    'sha256:def456...': {
      version: '1.1.0',
      releaseDate: '2026-03-15',
      features: ['basic-transforms', 'json-parse', 'wasm-custom', 'statistics'],
      deprecated: false,
      minCompatibleVersion: '1.0.0',
    },
  },
};
```

---

## 6. Proof Generation Flow

### 6.1 Sequence Diagram

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Buyer  │     │ Provider│     │   LLM   │     │ Data    │     │  zkVM   │
│         │     │  Agent  │     │ (Claude)│     │ Sources │     │ Prover  │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │               │
     │ Job Request   │               │               │               │
     │ (Kind 5900)   │               │               │               │
     │──────────────>│               │               │               │
     │               │               │               │               │
     │               │ Parse task    │               │               │
     │               │──────────────>│               │               │
     │               │               │               │               │
     │               │ ExecutionPlan │               │               │
     │               │<──────────────│               │               │
     │               │               │               │               │
     │               │ Fetch external data           │               │
     │               │──────────────────────────────>│               │
     │               │               │               │               │
     │               │ Data + TLS proofs (optional)  │               │
     │               │<──────────────────────────────│               │
     │               │               │               │               │
     │               │ Commit inputs (plan_hash, data_root)          │
     │               │──────────────────────────────────────────────>│
     │               │               │               │               │
     │               │ Execute plan, generate proof  │               │
     │               │<──────────────────────────────────────────────│
     │               │               │               │               │
     │ Job Result    │               │               │               │
     │ (Kind 6900)   │               │               │               │
     │ + proof       │               │               │               │
     │<──────────────│               │               │               │
     │               │               │               │               │
     │ Verify proof  │               │               │               │
     │ (local)       │               │               │               │
     │               │               │               │               │
     │ FULFILL/REJECT│               │               │               │
     │──────────────>│               │               │               │
     │               │               │               │               │
```

### 6.2 Provider-Side Implementation

```typescript
// packages/connector/src/agent/zkvm/proof-generator.ts

import { ExecutionPlan, ProofResult } from './types';
import { RiscZeroProver } from './provers/risc-zero';
import { SP1Prover } from './provers/sp1';

export interface ProverConfig {
  backend: 'risc-zero' | 'sp1';
  programId: string;
  gpuAcceleration: boolean;
  maxCycles: number;
}

export class ZKProofGenerator {
  private prover: Prover;

  constructor(config: ProverConfig) {
    this.prover =
      config.backend === 'risc-zero' ? new RiscZeroProver(config) : new SP1Prover(config);
  }

  async generateProof(
    plan: ExecutionPlan,
    externalData: ExternalData[],
    jobRequestHash: string
  ): Promise<ProofResult> {
    // 1. Compute commitments
    const planHash = sha256(serialize(plan));
    const dataMerkleRoot = computeMerkleRoot(externalData);

    // 2. Prepare inputs
    const publicInputs = {
      planHash,
      dataMerkleRoot,
      jobRequestHash,
      programId: this.prover.programId,
    };

    const privateInputs = {
      plan,
      externalData,
    };

    // 3. Generate proof (this is the expensive part)
    const startTime = Date.now();
    const { proof, publicOutputs } = await this.prover.prove(publicInputs, privateInputs);
    const provingTime = Date.now() - startTime;

    // 4. Return result
    return {
      proof: proof.toBytes(),
      publicInputs,
      publicOutputs,
      metadata: {
        provingTimeMs: provingTime,
        cyclesUsed: publicOutputs.metadata.cycles_used,
        backend: this.prover.backend,
        programId: this.prover.programId,
      },
    };
  }
}
```

### 6.3 Proof Serialization

```typescript
interface SerializedProof {
  /** Proof format version */
  version: '1.0';

  /** zkVM backend that generated this proof */
  backend: 'risc-zero' | 'sp1';

  /** Program ID (hash of guest binary) */
  programId: string;

  /** Public inputs (for verification) */
  publicInputs: {
    planHash: string; // hex
    dataMerkleRoot: string; // hex
    jobRequestHash: string; // hex
  };

  /** Public outputs (claimed by prover) */
  publicOutputs: {
    outputHash: string; // hex
    metadata: {
      cyclesUsed: number;
      memoryUsed: number;
      stepsExecuted: number;
    };
  };

  /** The actual ZK proof (base64 encoded) */
  proof: string;

  /** Optional: Full output data (for convenience, verifiable via outputHash) */
  output?: string;
}
```

---

## 7. Verification Flow

### 7.1 Verifier Architecture

```typescript
// packages/connector/src/agent/zkvm/verifier.ts

import { SerializedProof, VerificationResult } from './types';
import { RiscZeroVerifier } from './verifiers/risc-zero';
import { SP1Verifier } from './verifiers/sp1';

export class ZKVerifier {
  private verifiers: Map<string, Verifier>;
  private programRegistry: ProgramRegistry;

  constructor(registry: ProgramRegistry) {
    this.programRegistry = registry;
    this.verifiers = new Map([
      ['risc-zero', new RiscZeroVerifier()],
      ['sp1', new SP1Verifier()],
    ]);
  }

  async verify(
    proof: SerializedProof,
    expectedJobRequestHash: string
  ): Promise<VerificationResult> {
    // 1. Check program ID is known and not deprecated
    const program = this.programRegistry.programs[proof.programId];
    if (!program) {
      return { valid: false, reason: 'unknown-program-id' };
    }
    if (program.deprecated) {
      return { valid: false, reason: 'deprecated-program' };
    }

    // 2. Check job request hash matches
    if (proof.publicInputs.jobRequestHash !== expectedJobRequestHash) {
      return { valid: false, reason: 'job-request-mismatch' };
    }

    // 3. Get appropriate verifier
    const verifier = this.verifiers.get(proof.backend);
    if (!verifier) {
      return { valid: false, reason: 'unsupported-backend' };
    }

    // 4. Verify the ZK proof
    const proofValid = await verifier.verify(
      proof.proof,
      proof.publicInputs,
      proof.publicOutputs,
      proof.programId
    );

    if (!proofValid) {
      return { valid: false, reason: 'invalid-proof' };
    }

    // 5. Optionally verify output matches hash
    if (proof.output) {
      const computedHash = sha256(proof.output);
      if (computedHash !== proof.publicOutputs.outputHash) {
        return { valid: false, reason: 'output-hash-mismatch' };
      }
    }

    return {
      valid: true,
      outputHash: proof.publicOutputs.outputHash,
      metadata: proof.publicOutputs.metadata,
    };
  }
}
```

### 7.2 Verification Costs

| Backend   | Verification Time | Memory | WASM Size |
| --------- | ----------------- | ------ | --------- |
| RISC Zero | ~10ms             | ~50MB  | ~2MB      |
| SP1       | ~5ms              | ~30MB  | ~1MB      |

Verification is **cheap and fast**—the asymmetry (expensive to prove, cheap to verify) is the key property.

### 7.3 Batch Verification

For high-throughput scenarios, proofs can be batched:

```typescript
async verifyBatch(proofs: SerializedProof[]): Promise<BatchVerificationResult> {
  // RISC Zero and SP1 support batch verification for efficiency
  // Verifying N proofs together is faster than N individual verifications

  const results = await this.verifier.verifyBatch(proofs)
  return {
    allValid: results.every(r => r.valid),
    results
  }
}
```

---

## 8. DVM Integration

### 8.1 Extended DVM Tags

New tags for ZK-verified jobs:

```typescript
// Job Request (Kind 5900) - Additional Tags
const zkJobRequestTags = [
  // Request ZK verification
  ['verification', 'zk'],

  // Preferred zkVM backend (optional)
  ['zkvm', 'risc-zero'], // or 'sp1', 'any'

  // Minimum acceptable program version
  ['min-program-version', '1.0.0'],

  // Maximum proving time allowed (seconds)
  ['max-proving-time', '300'],
];

// Job Result (Kind 6900) - Additional Tags
const zkJobResultTags = [
  // Indicate ZK proof is included
  ['verification', 'zk'],

  // zkVM backend used
  ['zkvm', 'risc-zero'],

  // Program ID
  ['program-id', 'sha256:abc123...'],

  // Public input commitments
  ['plan-hash', 'sha256:...'],
  ['data-merkle-root', 'sha256:...'],

  // Output hash
  ['output-hash', 'sha256:...'],

  // Proof (base64, may be large)
  ['proof', 'base64:...'],

  // Or reference to proof in content-addressed storage
  ['proof-ref', 'ipfs:Qm...'],

  // Proving metadata
  ['proving-time-ms', '45000'],
  ['cycles-used', '500000000'],
];
```

### 8.2 Event Flow

```
1. BUYER posts Kind 5900 with ["verification", "zk"]

2. PROVIDER accepts job
   - Stakes collateral (if required)
   - Acknowledges ZK requirement

3. PROVIDER executes
   - Generates ExecutionPlan
   - Fetches external data
   - Runs in zkVM
   - Generates proof

4. PROVIDER posts Kind 6900 with proof
   - Includes all ZK tags
   - Proof in event or referenced externally

5. BUYER (or anyone) verifies
   - Fetches proof
   - Runs verification
   - If valid: FULFILL payment
   - If invalid: REJECT + slash provider stake

6. Optional: Third parties can verify
   - Markets can auto-resolve based on proof validity
   - Reputation updated based on verification outcome
```

### 8.3 Proof Storage Options

Proofs are ~100KB-1MB, too large for relay events. Options:

| Option              | Pros                             | Cons                        |
| ------------------- | -------------------------------- | --------------------------- |
| **Inline (base64)** | Simple, atomic                   | Bloats events, relay limits |
| **IPFS**            | Content-addressed, decentralized | Pinning required, latency   |
| **Arweave**         | Permanent, verifiable            | Cost, latency               |
| **Blossom**         | Nostr-native, simple             | Less mature                 |
| **Custom DA**       | Full control                     | Infrastructure burden       |

**Recommendation**: Use Blossom for Nostr-native storage, fall back to IPFS for interoperability.

---

## 9. ILP Settlement Integration

### 9.1 ZK-Conditional Payment Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ZK-CONDITIONAL ILP SETTLEMENT                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. Job Request                                                         │
│     └─ Buyer sends ILP PREPARE                                          │
│        └─ condition: H(zk_verification_success || timeout_nonce)        │
│        └─ expiry: job_deadline + verification_buffer                    │
│                                                                         │
│  2. Provider Execution                                                  │
│     └─ Generates output + ZK proof                                      │
│                                                                         │
│  3. Verification-Based Settlement                                       │
│                                                                         │
│     ┌─────────────────────────────────────────┐                         │
│     │ Proof valid?                            │                         │
│     └────────────────┬────────────────────────┘                         │
│                      │                                                  │
│         ┌────────────┴────────────┐                                     │
│         │ YES                     │ NO                                  │
│         ▼                         ▼                                     │
│     ┌───────────┐          ┌───────────────┐                            │
│     │  FULFILL  │          │    REJECT     │                            │
│     │ payment   │          │  + slash      │                            │
│     └───────────┘          │  provider     │                            │
│                            │  stake        │                            │
│                            └───────────────┘                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Fulfillment Derivation

The ILP fulfillment can be derived from the ZK proof verification result:

```typescript
// Fulfillment is derived from proof verification
function deriveFulfillment(proof: SerializedProof, verificationResult: VerificationResult): Buffer {
  if (!verificationResult.valid) {
    throw new Error('Cannot derive fulfillment from invalid proof');
  }

  // Fulfillment = H(proof_hash || output_hash || "SUCCESS")
  const preimage = Buffer.concat([
    Buffer.from(sha256(proof.proof), 'hex'),
    Buffer.from(proof.publicOutputs.outputHash, 'hex'),
    Buffer.from('SUCCESS'),
  ]);

  return sha256(preimage);
}

// Condition was set at PREPARE time
function deriveCondition(jobRequestHash: string, expectedProgramId: string): Buffer {
  // condition = H(H(proof_hash || output_hash || "SUCCESS"))
  // This is set before knowing the actual proof,
  // so we use a commitment scheme:

  // condition = H(job_request_hash || program_id || "ZK_VERIFY")
  const preimage = Buffer.concat([
    Buffer.from(jobRequestHash, 'hex'),
    Buffer.from(expectedProgramId, 'hex'),
    Buffer.from('ZK_VERIFY'),
  ]);

  return sha256(preimage);
}
```

### 9.3 Automatic Settlement

The AgentNode can automatically settle based on proof verification:

```typescript
// In payment validation handler
async handleJobResult(
  result: DVMResult,
  pendingPayment: ILPPrepare
): Promise<ILPFulfill | ILPReject> {

  // Check if ZK verification was requested
  if (!result.tags.some(t => t[0] === 'verification' && t[1] === 'zk')) {
    // Non-ZK job, use existing flow
    return this.handleNonZKResult(result, pendingPayment)
  }

  // Extract and verify proof
  const proof = await this.extractProof(result)
  const verificationResult = await this.zkVerifier.verify(
    proof,
    sha256(result.jobRequestId)
  )

  if (verificationResult.valid) {
    // Proof valid - FULFILL payment
    const fulfillment = deriveFulfillment(proof, verificationResult)
    return {
      type: 'fulfill',
      fulfillment,
      data: Buffer.from(JSON.stringify({
        outputHash: proof.publicOutputs.outputHash,
        verifiedAt: Date.now()
      }))
    }
  } else {
    // Proof invalid - REJECT and initiate slashing
    await this.initiateSlashing(result.provider, verificationResult.reason)
    return {
      type: 'reject',
      code: 'F00',
      message: `ZK verification failed: ${verificationResult.reason}`,
      triggeredBy: 'receiver'
    }
  }
}
```

---

## 10. External Data Attestation

### 10.1 The External Data Problem

ZK proofs verify execution correctness, but **not data authenticity**. If the agent claims to fetch data from an API, how do we prove it?

### 10.2 Attestation Tiers

| Tier       | Method                       | Trust Assumption       | Use Case           |
| ---------- | ---------------------------- | ---------------------- | ------------------ |
| **Tier 0** | None                         | Full trust in provider | Low-value, trusted |
| **Tier 1** | Provider signature           | Provider accountable   | Medium-value       |
| **Tier 2** | TLS Oracle (TLSNotary)       | Trust TLS + math       | High-value, APIs   |
| **Tier 3** | Multiple independent fetches | Trust majority honest  | Critical data      |

### 10.3 TLS Oracle Integration (TLSNotary)

```typescript
interface TLSAttestation {
  /** The URL that was fetched */
  url: string;

  /** HTTP method */
  method: 'GET' | 'POST';

  /** Timestamp of fetch */
  timestamp: number;

  /** TLS session proof */
  tlsProof: {
    /** Server certificate chain */
    certificateChain: string[];

    /** TLS handshake transcript commitment */
    handshakeCommitment: string;

    /** Selective disclosure proof for response */
    responseProof: {
      /** Revealed portions of response */
      revealed: {
        headers?: Record<string, string>;
        bodyJson?: any; // Selective JSON fields
      };

      /** ZK proof that revealed data matches full response */
      proof: string;
    };
  };

  /** Notary signature (if using notary mode) */
  notarySignature?: string;
}
```

### 10.4 Data Commitment Flow

```
1. BEFORE EXECUTION
   Provider commits to data sources in ExecutionPlan:
   - data_merkle_root = H(data_1 || data_2 || ... || data_n)

2. DURING FETCH
   For each data source:
   - Fetch data (optionally with TLS proof)
   - Compute commitment: H(url || timestamp || response_hash)
   - Build merkle tree

3. IN ZK PROOF
   Guest verifies:
   - Each data item's commitment is in merkle tree
   - Merkle root matches public input

4. VERIFICATION
   Verifier checks:
   - Merkle root in proof matches claimed root
   - (Optional) TLS proofs valid for high-value data
```

### 10.5 Trusted Data Provider Pattern

For frequently-used data sources, a **Trusted Data Provider** can pre-attest data:

```typescript
interface TrustedDataProvider {
  /** Provider's Nostr pubkey */
  pubkey: string;

  /** Domains this provider attests */
  attestedDomains: string[];

  /** Attestation validity period */
  attestationTTL: number;

  /** How to fetch attested data */
  endpoint: string;
}

interface AttestedData {
  /** Original data */
  data: any;

  /** Data hash */
  hash: string;

  /** Provider's signature over hash + timestamp */
  attestation: {
    provider: string;
    timestamp: number;
    signature: string;
  };
}
```

---

## 11. Error Handling and Slashing

### 11.1 Error Categories

| Error                 | Cause                               | Resolution | Slashing             |
| --------------------- | ----------------------------------- | ---------- | -------------------- |
| **Invalid Proof**     | Malformed or mathematically invalid | REJECT     | 100% stake           |
| **Wrong Program**     | Used unauthorized program ID        | REJECT     | 100% stake           |
| **Data Mismatch**     | Input commitments don't match       | REJECT     | 100% stake           |
| **Output Mismatch**   | Output hash doesn't match claimed   | REJECT     | 100% stake           |
| **Timeout**           | Proof not submitted in time         | REJECT     | 50% stake            |
| **Resource Exceeded** | Cycles/memory over limit            | REJECT     | 0% (provider's cost) |

### 11.2 Slashing Implementation

```typescript
interface SlashingEvent {
  kind: 30883  // Reputation negative event

  tags: [
    ['p', providerPubkey],
    ['e', jobResultEventId],
    ['reason', slashingReason],
    ['amount', slashedAmount],
    ['proof-hash', proofHash],  // For auditability
  ]

  content: JSON.stringify({
    verificationResult: {...},
    timestamp: Date.now()
  })
}

async function executeSlashing(
  provider: string,
  amount: number,
  reason: string,
  evidence: VerificationResult
): Promise<void> {
  // 1. Transfer stake to buyer/protocol
  await this.tigerbeetle.transfer({
    from: provider.stakeAccount,
    to: this.config.slashingRecipient,
    amount,
    code: SlashingCodes[reason]
  })

  // 2. Publish slashing event
  await this.nostr.publish(createSlashingEvent(provider, amount, reason, evidence))

  // 3. Update reputation
  await this.reputation.recordSlashing(provider, reason, amount)
}
```

### 11.3 Dispute Process

Even with ZK proofs, disputes can arise:

1. **"The proof is valid but the output is wrong"**
   - If output matches output_hash and proof is valid, this is not a valid dispute
   - The proof mathematically guarantees correctness

2. **"The input data was fake"**
   - Valid concern if no TLS attestation
   - Escalate to Tier 2/3 data attestation
   - Or multi-agent re-fetch and comparison

3. **"The execution plan was malicious"**
   - Plan should be auditable before execution
   - Buyer can review plan before payment commits

---

## 12. Security Considerations

### 12.1 Threat Model

| Threat                                        | Mitigation                                 |
| --------------------------------------------- | ------------------------------------------ |
| **Malicious provider submits fake proof**     | Cryptographic verification rejects         |
| **Provider uses outdated/vulnerable program** | Program registry with deprecation          |
| **Provider manipulates external data**        | TLS attestation, multi-source verification |
| **Verifier bug accepts invalid proof**        | Multiple verifier implementations, audits  |
| **Side-channel attacks on prover**            | zkVM isolation, no timing dependencies     |
| **Program ID collision**                      | SHA256 collision resistance                |

### 12.2 Program Security

Guest programs must be:

1. **Audited**: Open source, security reviewed
2. **Versioned**: Clear upgrade path, deprecation policy
3. **Sandboxed**: No system calls, bounded resources
4. **Deterministic**: Same inputs → same outputs

### 12.3 Cryptographic Assumptions

| Primitive           | Assumption           | Consequence if Broken    |
| ------------------- | -------------------- | ------------------------ |
| SHA-256             | Collision resistance | Program ID forgery       |
| zkSNARK (RISC Zero) | Knowledge soundness  | Fake proofs accepted     |
| TLS 1.3             | Channel security     | Data attestation forgery |
| Secp256k1 (Nostr)   | ECDLP hardness       | Event forgery            |

---

## 13. Performance Considerations

### 13.1 Proving Time Estimates

| Task Complexity     | Cycles | RISC Zero Time | SP1 Time |
| ------------------- | ------ | -------------- | -------- |
| Simple transform    | 10M    | ~5s            | ~2s      |
| JSON parse + filter | 100M   | ~30s           | ~15s     |
| Complex aggregation | 500M   | ~2min          | ~1min    |
| Custom WASM         | 1B     | ~5min          | ~2min    |

### 13.2 Optimization Strategies

1. **Precomputation**: Move static computation outside zkVM
2. **Proof Composition**: Prove sub-tasks separately, aggregate
3. **GPU Acceleration**: Use CUDA/Metal for proving
4. **Parallelization**: Prove independent steps concurrently

### 13.3 Cost Model

```typescript
interface ProvingCost {
  // Base cost for proof generation infrastructure
  baseCostSats: number;

  // Cost per million cycles
  costPerMegaCycle: number;

  // Estimated total
  estimatedCost: (cycles: number) => number;
}

const defaultCostModel: ProvingCost = {
  baseCostSats: 100,
  costPerMegaCycle: 10,
  estimatedCost: (cycles) => 100 + Math.ceil(cycles / 1_000_000) * 10,
};

// Example: 500M cycle job
// Cost = 100 + 500 * 10 = 5100 sats (~$5 at current rates)
```

---

## 14. Migration Path

### 14.1 Phase 1: Foundation (4-6 weeks)

**Goal**: Basic zkVM integration with hash commitment verification

**Deliverables**:

- [ ] ExecutionPlan IR specification finalized
- [ ] RISC Zero guest program (basic operations)
- [ ] Proof generation in AgentNode
- [ ] Verification in AgentNode
- [ ] New DVM tags for ZK jobs

**Success Criteria**:

- Can prove and verify simple data transform jobs
- End-to-end flow works in test environment

### 14.2 Phase 2: DVM Integration (3-4 weeks)

**Goal**: Full integration with DVM event flow

**Deliverables**:

- [ ] Proof storage (Blossom/IPFS)
- [ ] Automatic settlement on verification
- [ ] Slashing on invalid proofs
- [ ] Program registry

**Success Criteria**:

- ZK-verified jobs work through full DVM flow
- Payment settles automatically on valid proof

### 14.3 Phase 3: External Data (4-6 weeks)

**Goal**: Trustless external data attestation

**Deliverables**:

- [ ] TLSNotary integration
- [ ] Trusted Data Provider framework
- [ ] Multi-source verification
- [ ] Data attestation in proofs

**Success Criteria**:

- Can prove data came from claimed HTTPS source
- End-to-end trustless verification for API-based jobs

### 14.4 Phase 4: Production Hardening (4-6 weeks)

**Goal**: Production-ready deployment

**Deliverables**:

- [ ] SP1 backend support
- [ ] GPU-accelerated proving
- [ ] Proof aggregation
- [ ] Comprehensive test suite
- [ ] Security audit
- [ ] Documentation

**Success Criteria**:

- Production deployment with real traffic
- <1% verification failure rate
- Proving costs within economic viability

---

## 15. Open Questions

### 15.1 Technical

1. **Program Governance**: Who decides which programs are in the registry?
2. **Proof Freshness**: How to prevent replay of old proofs?
3. **Recursion**: Should proofs be recursively composable?
4. **Privacy**: When should inputs/outputs be hidden vs revealed?

### 15.2 Economic

1. **Proving Cost Sharing**: Who pays for proof generation?
2. **Verification Incentives**: Should verifiers be compensated?
3. **Slashing Distribution**: Where do slashed stakes go?

### 15.3 Operational

1. **Prover Infrastructure**: Self-hosted vs proving-as-a-service?
2. **Program Updates**: How to handle security patches?
3. **Cross-Chain**: Should proofs be verifiable on-chain?

---

## Appendix A: Reference Implementation Structure

```
packages/connector/
├── src/
│   └── agent/
│       └── zkvm/
│           ├── index.ts              # Public API
│           ├── types.ts              # Type definitions
│           ├── execution-plan.ts     # Plan IR utilities
│           ├── proof-generator.ts    # Proof generation
│           ├── verifier.ts           # Proof verification
│           ├── program-registry.ts   # Program management
│           ├── settlement.ts         # ILP integration
│           └── provers/
│               ├── risc-zero.ts      # RISC Zero backend
│               └── sp1.ts            # SP1 backend
│
├── guest/                            # zkVM guest code
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs                   # Entry point
│       ├── executor.rs               # Plan execution
│       ├── operations/               # Step implementations
│       │   ├── transform.rs
│       │   ├── filter.rs
│       │   ├── aggregate.rs
│       │   └── compute.rs
│       └── wasm/                     # Custom WASM support
│
└── test/
    └── integration/
        └── zkvm/
            ├── proof-generation.test.ts
            ├── verification.test.ts
            └── settlement.test.ts
```

---

## Appendix B: Glossary

| Term               | Definition                                                         |
| ------------------ | ------------------------------------------------------------------ |
| **zkVM**           | Zero-knowledge virtual machine; executes code and generates proofs |
| **Guest Program**  | Code that runs inside the zkVM                                     |
| **Prover**         | The party generating the ZK proof                                  |
| **Verifier**       | The party checking the ZK proof                                    |
| **Program ID**     | Hash of the guest binary, identifies what was proven               |
| **Public Inputs**  | Committed values visible to verifier                               |
| **Private Inputs** | Hidden values only known to prover                                 |
| **Execution Plan** | Deterministic specification of compute operations                  |
| **TLS Oracle**     | System proving HTTPS data authenticity                             |

---

_End of Specification_
