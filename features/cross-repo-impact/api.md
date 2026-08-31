# Reverb Public Interfaces

**Status:** Proposed v1 contracts  
**Canonical protocol:** versioned JSON Schema  
**Transport principle:** domain types do not depend on HTTP, GitHub, databases, or Yanib

## 1. Versioning

Every canonical payload contains:

```json
{
  "schema": "reverb.analysis-result",
  "schema_version": "1.0",
  "producer": {
    "package": "@yanib/reverb-application",
    "version": "0.1.0"
  }
}
```

Rules:

- additive optional fields are allowed within one schema major;
- changing meaning, deleting/renaming a field, or widening a closed enum requires a schema major;
- readers ignore unknown optional fields and reject unsupported majors;
- adapter manifests, identity versions, registry revisions, and policy revisions are explicit fields rather than inferred from the package version;
- JSON Schema files are published from `@yanib/reverb-schema` and mirrored under `schemas/` in releases.

## 2. Domain API

### 2.1 Index a repository

```ts
export interface IndexRepositoryRequest {
  workspaceId: WorkspaceId;
  registryRevision: RegistryRevision;
  repositoryId: RepositoryStableId;
  commitSha: CommitSha;
  configRevision: ConfigRevision;
  indexerBundleVersion: string;
  requestedAdapters?: string[];
  uploadedScip?: UploadedScipDescriptor;
}

export interface IndexRepositoryResult {
  generationId: GenerationId;
  repositoryId: RepositoryStableId;
  commitSha: CommitSha;
  treeHash: ContentHash;
  state: "complete" | "partial" | "failed";
  artifactCounts: ArtifactCounts;
  definitionCount: number;
  referenceCount: number;
  coverage: AnalysisCoverage;
  diagnostics: BoundedDiagnostic[];
}
```

`partial` is selectable for positive evidence only when claim-specific coverage permits it. `failed` is never selectable.

### 2.2 Analyse a pull request

```ts
export interface AnalyzePullRequestRequest {
  workspaceId: WorkspaceId;
  registryRevision: RegistryRevision | "current";
  policyRevision: PolicyRevision | "current";
  producerRepositoryId: RepositoryStableId;
  pullRequest: {
    provider: "github" | "local";
    number?: number;
    baseSha: CommitSha;
    headSha: CommitSha;
  };
  mode: "preview" | "delivery_evaluation";
  refreshBudgetMs?: number;
  analysisBudgetMs?: number;
}

export interface AnalysisResult {
  analysisId: AnalysisId;
  state: "not_analysed" | "complete" | "partial" | "superseded";
  producer: ProducerSnapshot;
  consumers: ConsumerSnapshotSelection[];
  registryRevision: RegistryRevision;
  policyRevision: PolicyRevision;
  findings: FindingOccurrence[];
  abstentions: Abstention[];
  coverage: AnalysisCoverage;
  selectionCoverage: SelectionCoverage;
  timings: AnalysisTimings;
  resourceUse: ResourceUse;
}
```

### 2.3 Pure operations

The domain package exposes pure operations used by both hosts:

```ts
canonicalizeContract(adapter, rawIdentity): CanonicalContractKey
diffContractSets(adapter, baseDefinitions, headDefinitions, coverage): ContractChangeSet
joinChangedContracts(changes, references, registry): JoinResult
fingerprintFinding(candidate, policyMajor): FindingFingerprint
evaluateCoverage(candidate, coverage): ClaimCoverageDecision
applyDeliveryPolicy(candidate, promotion, suppressions, policy): DeliveryDecision
projectDisclosure(finding, disclosureDecision): FindingProjection
```

## 3. Adapter SDK

### 3.1 Manifest example

```json
{
  "schema": "reverb.adapter-manifest",
  "schema_version": "1.0",
  "id": "reverb.openapi",
  "version": "0.1.0",
  "identity_version": 1,
  "contract_kinds": ["openapi_operation"],
  "capability_tiers": [
    { "input": "openapi-3.x", "tier": "contract_grade" }
  ],
  "evidence_strata": [
    {
      "id": "operation-id.generated-client",
      "family": "exact_schema",
      "required_evidence": ["operation_id", "generated_client_binding", "consumer_reference"]
    }
  ],
  "external_tools": [
    { "name": "oasdiff", "version": "pinned-by-lock", "network": false }
  ],
  "limitations": ["hand-maintained specifications may drift from implementation"]
}
```

### 3.2 Extraction result

```ts
export interface ExtractionResult<T> {
  items: T[];
  coverage: AdapterCoverage;
  diagnostics: BoundedDiagnostic[];
  sourceFingerprint: ContentHash;
}
```

An adapter MUST return coverage even when `items` is empty. An exception is translated to failed adapter coverage; it cannot be interpreted as zero definitions/references.

### 3.3 Adapter admission command

```bash
reverb adapter validate ./packages/adapter-openapi
reverb adapter fixtures ./packages/adapter-openapi
reverb adapter benchmark ./packages/adapter-openapi --corpus ./corpora/openapi-v1
```

Validation checks manifest schema, determinism, identity round trips, output bounds, sandbox declarations, licenses, and required fixture classes.

## 4. Canonical finding JSON

```json
{
  "fingerprint": "fnd_01...",
  "occurrence_id": "occ_01...",
  "state": "preview",
  "producer_change": {
    "repository_id": "github:1234",
    "base_sha": "abc...",
    "head_sha": "def...",
    "contract_kind": "openapi_operation",
    "contract_key": "openapi:payments#refund.create",
    "change_kind": "operation_removed",
    "compatibility": "breaking",
    "activation": "on_deploy"
  },
  "consumer": {
    "repository_id": "github:5678",
    "generation_sha": "987...",
    "stable_reference_id": "openapi-client:refund.create@support-api.ts#submitRefund"
  },
  "claims": {
    "edge": "candidate",
    "impact": "breaking",
    "action": "coordinate"
  },
  "evidence": {
    "stratum": "openapi_operation|ts|operation-id.generated-client|v1",
    "primary_path": ["producer_operation", "oasdiff_rule", "client_binding", "consumer_reference"],
    "items": [
      {
        "side": "producer",
        "repository_id": "github:1234",
        "generation_sha": "def...",
        "path": "openapi.yaml",
        "range": { "start_line": 120, "end_line": 134 },
        "extractor": "reverb.openapi",
        "extractor_version": "0.1.0",
        "content_hash": "sha256:..."
      },
      {
        "side": "consumer",
        "repository_id": "github:5678",
        "generation_sha": "987...",
        "path": "src/support-api.ts",
        "range": { "start_line": 42, "end_line": 42 },
        "extractor": "reverb.typescript",
        "extractor_version": "0.1.0",
        "content_hash": "sha256:..."
      }
    ]
  },
  "coverage_dependencies": ["producer.openapi.refs_resolved", "consumer.ts.file_parsed"],
  "remedy": {
    "kind": "coordinate_consumer",
    "text": "Keep the operation until the consumer is updated, or link the coordinated consumer pull request."
  },
  "delivery": {
    "decision": "preview_only",
    "reason": "stratum_unmeasured"
  }
}
```

Canonical output contains stable repository IDs. Human names and URLs are host projections and may be absent/redacted.

## 5. Coverage JSON

```json
{
  "analysis": {
    "repositories": { "eligible": 22, "current": 19, "failed": 1, "unauthorized": 2 },
    "changed_files": { "discovered": 18, "fetched": 18, "parsed": 16, "truncated": 0 },
    "contracts": { "discovered": 7, "diffed": 6, "unsupported": 1 },
    "consumer_edges": { "current": 41, "stale": 3, "unresolved": 5 }
  },
  "limitations": [
    { "code": "unsupported_language", "scope": "github:9999:src/legacy.clj" }
  ]
}
```

The hosted disclosure projection may aggregate or redact scopes. The canonical authorized result keeps them for reproduction.

## 6. Review API

### 6.1 Append a review

```ts
export interface AppendReviewRequest {
  findingOccurrenceId: FindingOccurrenceId;
  evidenceVersion: string;
  labels: {
    edge: "confirmed" | "absent" | "indeterminate";
    impact: "breaking" | "behavior_risk" | "compatible" | "indeterminate";
    action:
      | "coordinate"
      | "already_coordinated"
      | "accepted_risk"
      | "dead_or_test_only"
      | "no_action"
      | "indeterminate";
  };
  reasonCode: ReviewReasonCode;
  note?: string;
  supersedes?: ReviewEventId;
  suppression?: CreateSuppressionRequest;
}
```

Closed reason codes are published in the schema. `other` requires a bounded note and is reviewed before it becomes a new durable category.

### 6.2 Suppression request

```ts
export interface CreateSuppressionRequest {
  scope:
    | "occurrence"
    | "finding"
    | "contract_consumer"
    | "repository_pair_kind"
    | "adapter_rule"
    | "workspace_rule";
  expiresAt?: Instant;
  reviewAt: Instant;
  invalidatesOn: SuppressionInvalidation[];
  owner: SubjectRef;
  justification: string;
}
```

`workspace_rule` is administrator-only. A suppression never removes the occurrence from evaluation output.

## 7. Policy API

### 7.1 Simulate

```ts
export interface SimulatePolicyRequest {
  corpusRevision: CorpusRevision;
  candidatePolicy: DeliveryPolicy;
  baselinePolicyRevision?: PolicyRevision;
}

export interface SimulatePolicyResult {
  eligiblePullRequests: number;
  alertedPullRequests: number;
  deliveredFindings: number;
  abstainedFindings: number;
  suppressedFindings: number;
  metricsByStratum: StratumMetrics[];
  coverage: EvaluationCoverage;
  estimatedResourceUse: ResourceUse;
  warnings: PolicyWarning[];
}
```

Simulation reads frozen structural results and recorded human labels. It never invokes current adapters or models, which would change the historical input.

## 8. CLI

### 8.1 Workspace and indexing

```bash
reverb init [path]
reverb workspace add <repo-path> --alias <alias>
reverb workspace remove <alias>
reverb registry validate
reverb index [--repo <alias>] [--ref <sha-or-ref>]
reverb status [--json]
reverb doctor [--json]
```

### 8.2 Analysis

```bash
reverb analyze --repo payments --base <sha> --head <sha>
reverb analyze --repo payments --base main --head HEAD --format json
reverb finding show <fingerprint> --evidence
reverb export <analysis-id> --format json|jsonl|sarif
```

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | command completed; findings may exist because advisory findings are not command failure |
| 2 | invalid usage/config |
| 3 | analysis completed incomplete/not-analysed |
| 4 | incompatible schema/index |
| 5 | infrastructure/provider failure |

`--fail-on-findings` is intentionally absent from the reference CLI v1. Machine consumers may inspect JSON and define their own policy.

### 8.3 Evaluation

```bash
reverb review add <finding-fingerprint> --edge <label> --impact <label> --action <label> \
  --reason <code> --actor <id> --role <role> --capability <text> --note <text>
reverb review list <finding-fingerprint> [--json]
reverb review import <canonical-review-jsonl>
reverb corpus import <bundle.json>
reverb eval --corpus <revision> [--policy <file>] [--json]
reverb policy simulate <file> --corpus <revision>
reverb promotion decide <evidence.json> [--json]
```

The corpus import is one canonical JSON object with `manifest` and `cases` members. Review JSONL
accepts either a review event per line or `{ "event": ..., "suppression": ... }`; imports validate
the canonical schema and hash before append. Evaluation and simulation read frozen stored cases and
never rerun adapters or models.

## 9. Reference-host HTTP API

The HTTP service is an adapter over the application API. Exact paths may change before first implementation; payload schemas are normative.

| Method and path | Purpose |
| --- | --- |
| `POST /v1/workspaces/:id/generations` | enqueue exact repository generation |
| `GET /v1/generations/:id` | state, coverage, diagnostics |
| `POST /v1/workspaces/:id/analyses` | enqueue PR/base-head analysis |
| `GET /v1/analyses/:id` | authorized canonical/projection result |
| `GET /v1/findings/:id` | authorized evidence detail |
| `POST /v1/findings/:id/reviews` | append review/suppression |
| `GET /v1/workspaces/:id/coverage` | coverage/freshness report |
| `POST /v1/workspaces/:id/policies/simulate` | historical replay |
| `GET /v1/workspaces/:id/registry/:revision` | authorized registry snapshot |
| `POST /v1/installations/:id/reconcile` | admin/provider reconciliation |

All list endpoints use cursor pagination with total/coverage metadata kept outside the page. An empty page is never used to imply an empty complete set.

## 10. GitHub webhook and check contracts

Webhook receipt persists:

```text
provider
delivery_id
event_type
installation_id
repository_external_id
received_at
signature_validated
payload_hash
processing_state
```

Raw payload retention is short and configurable; canonical pointer data is retained according to audit policy.

One check is keyed by:

```text
installation / repository / pull request / head SHA / policy revision
```

Conclusions:

| Analysis | Conclusion |
| --- | --- |
| complete, no delivered finding | `success` |
| one or more advisory findings | `neutral` |
| incomplete or timed out | `neutral` with limitations |
| repository outside scope | `skipped` |

Only producer-side changed lines are annotated. The writer batches at most the provider limit per request and stores total/dropped counts in the canonical projection.

## 11. Host conformance suite

Every host adapter MUST pass fixtures for:

- exact SHA resolution and tree completeness;
- generation atomicity and failed-lease invisibility;
- idempotent duplicate job execution;
- force-push supersession;
- two-consumer fingerprint separation;
- partial-coverage positive and negative behavior;
- authorization loss and disclosure redaction;
- review append/supersession;
- policy replay determinism;
- deletion propagation;
- canonical JSON equality after normalizing host URLs/display names.

## 12. Yanib integration boundary

Yanib consumes `AnalysisResult`, `FindingOccurrence`, `Coverage`, and review APIs through `@yanib/reverb-schema` and a thin SDK. It does not:

- import a reference-host database client;
- depend on Reverb's SQLite/Postgres tables;
- let Reverb write directly to Yanib's review ledger;
- grant Reverb Yanib billing, tenancy, or notification semantics.

An adapter maps Reverb's finding/review subjects into Yanib-owned records. Yanib's existing declared consumer edges may be exported as `declared_context`; they do not become structural findings without a consumer artifact.
