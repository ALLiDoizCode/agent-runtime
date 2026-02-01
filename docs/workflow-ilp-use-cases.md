# Workflow ILP Use Cases

Using ILP addresses with a `workflow` prefix to route computational work through the network.

## Concept

Instead of just routing payments, ILP addresses can route computational pipelines:

```
g.workflow.{step1}.{step2}.{step3}.{destination}
```

A workflow-capable peer recognizes the `g.workflow.*` prefix and executes the pipeline, then forwards results to the destination.

---

## Use Case Examples

### 1. Image Processing Pipeline

```
Address: g.workflow.resize.watermark.optimize.cdn
```

**What happens:**

- Client sends raw image + payment
- Workflow peer executes:
  1. Resize to 1024x768
  2. Add watermark
  3. Optimize for web
- Result delivered to CDN
- Client pays once for entire pipeline

**Why this matters:** Instead of 3 separate API calls and managing intermediate files, one address = complete transformation.

---

### 2. Document Publishing

```
Address: g.workflow.spellcheck.format.pdf.storage
```

**What happens:**

- Author sends draft document
- Pipeline automatically:
  1. Runs spellcheck
  2. Applies formatting rules
  3. Converts to PDF
  4. Stores in cloud storage
- Author pays per complete workflow

**Why this matters:** Publishing workflow as a single routable address, not a custom application.

---

### 3. Data ETL (Extract, Transform, Load)

```
Address: g.workflow.extract.clean.aggregate.database
```

**What happens:**

- Raw data goes in
- Pipeline executes:
  1. Extract from CSV
  2. Clean invalid records
  3. Aggregate by date
  4. Load to database
- Pay per data batch processed

**Why this matters:** Data pipeline becomes addressable on a payment network.

---

### 4. Content Moderation

```
Address: g.workflow.scan-nsfw.scan-text.filter.approve
```

**What happens:**

- User uploads image + caption
- Auto-moderation:
  1. Check image for NSFW content
  2. Scan text for profanity
  3. Apply content filters
  4. Route to approved content queue
- Platform pays per moderation check

**Why this matters:** Moderation as a service, routable and payable.

---

### 5. AI Agent Chain

```
Address: g.workflow.research.summarize.fact-check.publish
```

**What happens:**

- Topic goes in
- Agent pipeline:
  1. AI researches topic
  2. AI summarizes findings
  3. AI fact-checks claims
  4. Publishes verified article
- Pay per research request

**Why this matters:** Chain multiple AI agents together via routing, not custom orchestration.

---

### 6. Code Review Pipeline

```
Address: g.workflow.lint.test.security-scan.approve
```

**What happens:**

- Developer commits code
- Automated review:
  1. Lint code style
  2. Run unit tests
  3. Security vulnerability scan
  4. Route to approved/rejected queue
- Pay per commit reviewed

**Why this matters:** CI/CD as addressable workflows on a payment network.

---

### 7. Video Processing

```
Address: g.workflow.transcode.thumbnail.subtitle.youtube
```

**What happens:**

- Upload raw video
- Processing chain:
  1. Transcode to multiple formats
  2. Generate thumbnail
  3. Auto-generate subtitles
  4. Upload to YouTube
- Pay per video processed

**Why this matters:** Complex media workflows become single-address operations.

---

### 8. Email Campaign

```
Address: g.workflow.personalize.ab-test.schedule.send
```

**What happens:**

- Template + contact list
- Marketing automation:
  1. Personalize for each recipient
  2. A/B test subject lines
  3. Schedule optimal send time
  4. Deliver emails
- Pay per campaign sent

**Why this matters:** Marketing automation as routable workflow.

---

### 9. Financial Compliance

```
Address: g.workflow.kyc.aml-check.risk-score.approve
```

**What happens:**

- Customer application submitted
- Compliance pipeline:
  1. Verify KYC documents
  2. AML screening
  3. Calculate risk score
  4. Approve/reject decision
- Pay per compliance check

**Why this matters:** Regulated workflows with payment-per-check model.

---

### 10. IoT Data Processing

```
Address: g.workflow.normalize.anomaly-detect.alert.dashboard
```

**What happens:**

- Sensor data stream
- Processing flow:
  1. Normalize sensor readings
  2. Detect anomalies
  3. Send alerts if needed
  4. Update dashboard
- Pay per data batch

**Why this matters:** IoT processing pipelines as addressable, payable routes.

---

## Key Benefits

1. **One address = Complete workflow** - No custom orchestration needed
2. **Pay per execution** - Micro-payments for computational work
3. **Composable** - Mix and match steps
4. **Routable** - Different peers can handle different workflows
5. **Discoverable** - Find workflow providers via ILP routing

## The Elevator Pitch

> "Turn computational pipelines into addressable routes on a payment network. Send work to `g.workflow.step1.step2.step3.destination` and pay once for the complete execution."

## Technical Architecture

### Address Format

```
g.workflow[.provider].{step1}.{step2}...{stepN}[.destination]

Examples:
g.workflow.resize.watermark.optimize.cdn
g.workflow.bmad.draft.review.publish.results
g.workflow.hash.encrypt.compress.storage
```

### How It Works

1. **Peer Capabilities**: Workflow-capable peers advertise they handle `g.workflow.*` prefix
2. **Pattern Recognition**: Peer sees workflow address and extracts pipeline steps
3. **Execution**: Peer executes each step sequentially (or in parallel if possible)
4. **Forwarding**: Result forwarded to destination address
5. **Payment**: Single payment covers entire workflow execution

### Backward Compatibility

- Standard ILP peers: Ignore workflow addresses (don't advertise routes)
- Workflow peers: Opt-in by advertising `g.workflow.*` capability
- No protocol changes required to core ILP

## Integration with M2M Project

The M2M project's Agent Society Protocol could use workflow addresses to route computational work between agents:

```
g.workflow.bmad.draft.dev.qa.results
```

Where agents advertise BMAD task capabilities and execute multi-step development workflows, with payment for computational work handled via ILP payment channels.
