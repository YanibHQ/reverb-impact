# Reverb Architecture

**Status:** Target architecture for implementation  
**Last reviewed:** 2026-08-28

## 1. Architectural thesis

Reverb is a headless evidence engine with two hosts:

- a local Git/filesystem/SQLite CLI for development, fixtures, self-evaluation, and air-gapped use;
- a GitHub App/PostgreSQL reference host for organization collections and PR checks.

The two hosts execute the same domain operations and emit the same canonical JSON. Yanib later becomes a third host or consumer through the public SDK.

The system stores a temporal evidence graph over immutable repository generations. It does not keep one mutable “truth graph.” This makes a PR result reproducible, lets two repositories be indexed at different exact SHAs without pretending simultaneity, and makes staleness visible.

The changed repository is also a possible consumer. Its consumer evidence comes from the exact PR
head observation supplied with the analysis—not from its base generation or a mutable “latest”
pointer. Downstream repositories continue to use their explicitly selected immutable generations.

## 2. Architecture drivers

1. The source and consumer repositories are independently versioned.
2. Producer and consumer access lists may differ.
3. Pull requests are force-pushed, rebased, squashed, and merged at SHAs different from their heads.
4. Static analysis is incomplete; removal and negative claims are sensitive to missing input.
5. Contract kinds have different identities, compatibility rules, and activation timing.
6. Review feedback must improve policy without rewriting detector history.
7. A public package must be embeddable without adopting GitHub, Postgres, Yanib, or a hosted LLM.
8. Most impact queries are exact joins and one-to-three-hop traversals; a graph database is not justified initially.

## 3. Layer model

```text
packages/domain
  values, canonical keys, diffs, joins, fingerprints, coverage,
  policy evaluation, disclosure projection
                   |
                   v
packages/application
  use cases and orchestration through ports
                   |
          +--------+---------+
          |                  |
packages/host-local     packages/host-github
Git + filesystem        GitHub App + workers
SQLite                  PostgreSQL
          |                  |
          +--------+---------+
                   |
              canonical schemas
```

The hosted profile composes these boundaries as a durable pipeline:

```text
signed webhook -> leased inbox -> idempotent job -> analysis/review adapter
                                             -> canonical record + pointer
                                             -> delivery outbox -> current-head write
```

Each arrow crosses an explicit lease or immutable record boundary. Analysis completion never
depends on a provider write, and disabling reads or writes leaves queued work recoverable.

### 3.1 Domain package

The domain package performs no I/O and reads no ambient time, process environment, network, filesystem, database, queue, model, or provider client.

It owns:

- contract and repository identity values;
- generation, artifact, definition, reference, change, edge, finding, coverage, policy, and review types;
- adapter protocol types;
- canonical key and fingerprint construction;
- generation and overlay diffing;
- compatibility-result normalization;
- evidence-path validation and stratum selection;
- impact resolution over supplied definitions/references;
- coverage dependency evaluation and abstention;
- suppression matching and invalidation;
- disclosure projections;
- canonical rendering models.

### 3.2 Application package

Application services coordinate ports, transactions, cancellation, retries, and jobs. They may be deterministic with a recorded clock, but they are not called “pure.”

Primary use cases:

- `CreateWorkspaceRevision`
- `IndexRepositoryGeneration`
- `CreatePullRequestOverlay`
- `AnalyzePullRequest`
- `ReviewFinding`
- `SimulatePolicy`
- `RenderCheckProjection`
- `PurgeRepositoryData`

### 3.3 Concrete adapters

Concrete adapters implement provider, Git/filesystem, SQLite/Postgres, queue, authorization, sandbox, and delivery behavior. Contract-kind adapters are a different concept and live behind the adapter SDK.

## 4. Ports

All ports use stable domain values; provider DTOs are translated at the boundary.

### 4.1 Source and diff

```ts
interface RepositoryReader {
  resolveRepository(id: RepositoryStableId): Promise<RepositoryDescriptor>;
  resolveCommit(id: RepositoryStableId, ref: string): Promise<CommitDescriptor>;
  listTree(id: RepositoryStableId, sha: CommitSha): AsyncIterable<TreeEntry>;
  readBlob(id: RepositoryStableId, sha: CommitSha, path: RepoPath): Promise<BlobResult>;
  compare(id: RepositoryStableId, base: CommitSha, head: CommitSha): Promise<DiffManifest>;
}
```

`DiffManifest` carries completeness, rename basis, missing blobs, submodule state, and provider limitations. The GitHub host MUST NOT rely on the compare API's bounded file list as complete. The reference worker fetches exact SHAs with Git and reads blobs on demand; local mode uses the existing checkout.

### 4.2 Generation and graph stores

```ts
interface GenerationStore {
  beginGeneration(input: BeginGeneration): Promise<GenerationLease>;
  putArtifacts(lease: GenerationLease, batch: ArtifactBatch): Promise<void>;
  completeGeneration(lease: GenerationLease, summary: GenerationSummary): Promise<GenerationId>;
  failGeneration(lease: GenerationLease, failure: GenerationFailure): Promise<void>;
  getGeneration(id: GenerationId): Promise<RepositoryGeneration>;
  selectGeneration(query: GenerationSelection): Promise<GenerationSelectionResult>;
}

interface EvidenceStore {
  readDefinitions(query: DefinitionQuery): AsyncIterable<ContractDefinition>;
  readReferences(query: ReferenceQuery): AsyncIterable<ContractReference>;
  readEdges(query: EdgeQuery): AsyncIterable<EvidenceEdge>;
  persistAnalysis(result: AnalysisResult): Promise<void>;
  appendReview(event: ReviewEvent): Promise<void>;
}
```

Generation completion is atomic. A lease that dies stays failed/expired; partial artifacts are never selectable as a complete generation.

### 4.3 Registry and authorization

```ts
interface WorkspaceRegistry {
  getRevision(workspace: WorkspaceId, revision: RegistryRevision): Promise<RegistrySnapshot>;
  getCurrentRevision(workspace: WorkspaceId): Promise<RegistrySnapshot>;
}

interface AuthorizationPort {
  authorizeRepositoryUse(subject: Subject, action: RepositoryAction, repo: RepositoryStableId): Promise<Decision>;
  projectDisclosure(input: DisclosureRequest): Promise<DisclosureProjection>;
}
```

The domain validates a supplied projection against policy invariants; only the host can resolve provider users/teams and current ACLs.

### 4.4 Jobs, cancellation, clock, sandbox, delivery

```ts
interface JobQueue {
  enqueue<T>(job: DurableJob<T>): Promise<JobId>;
  claim(worker: WorkerIdentity, kinds: JobKind[]): Promise<ClaimedJob | null>;
  heartbeat(claim: JobClaim): Promise<void>;
  complete(claim: JobClaim, result: JobResult): Promise<void>;
  fail(claim: JobClaim, failure: JobFailure): Promise<void>;
}

interface CancellationPort {
  isCurrent(key: SupersessionKey): Promise<boolean>;
}

interface Clock {
  now(): Instant;
}

interface SandboxRunner {
  run(request: SandboxedToolRequest): Promise<SandboxedToolResult>;
}

interface DeliveryWriter {
  upsertPullRequestCheck(write: CheckWrite): Promise<ExternalDeliveryRef>;
}
```

### 4.5 Telemetry and blob storage

```ts
interface TelemetryPort {
  emit(event: AllowedTelemetryEvent): void;
}

interface ArtifactBlobStore {
  put(hash: ContentHash, bytes: Uint8Array, policy: RetentionClass): Promise<BlobRef>;
  get(ref: BlobRef): Promise<Uint8Array>;
  delete(ref: BlobRef): Promise<void>;
}
```

Large uploaded SCIP artifacts MAY use object storage in the hosted deployment. Source blobs are fetched on demand and are not retained by default after derived artifacts are committed.

## 5. Core domain model

IDs are opaque UUIDv7 values unless the field is explicitly a stable provider identity or content hash. All timestamps are UTC instants.

### 5.1 Workspace and repository

| Entity | Load-bearing fields |
| --- | --- |
| `WorkspaceRevision` | `workspace_id`, `revision`, `created_at`, `created_by`, `config_hash` |
| `RepositoryMembership` | `revision`, `repository_stable_id`, provider/external ID, default branch, collection IDs, consent revision, disclosure policy, selected flag |
| `ServiceIdentity` | stable service/deploy-unit ID, repository, root path, environment, owner, valid interval |
| `ServiceAlias` | service ID, alias kind, alias value, path prefix, environment, provenance, valid interval |
| `ConsentGrant` | repository, action, grantee/scope, decision, actor, reason, revision |

`ServiceAlias.kind` initially supports `base_token`, `host`, `path_prefix`, `package_coordinate`, `schema_id`, `broker_namespace`, and `database_instance`. A match always records the registry revision and alias used.

### 5.2 Repository generation

| Entity | Load-bearing fields |
| --- | --- |
| `RepositoryGeneration` | repository, commit SHA, tree hash, indexer bundle, config revision, state, started/completed times, coverage summary |
| `PullRequestOverlay` | repository, base generation, base SHA, head SHA, head tree hash, diff hash, state, supersession key |
| `FileArtifact` | generation/overlay, stable path, content hash, size, language, classification, parse state, parser/version |
| `ArtifactDiagnostic` | artifact, adapter/parser, bounded code, severity, location, detail hash |
| `CoverageRecord` | generation/overlay, dimension, eligible/processed/skipped/failed counts, reason vocabulary, limitations |

Generation uniqueness:

```text
(repository_stable_id, commit_sha, indexer_bundle_version, config_revision)
```

An overlay is unique by:

```text
(repository_stable_id, base_sha, head_sha, indexer_bundle_version, config_revision)
```

### 5.3 Contracts and references

| Entity | Load-bearing fields |
| --- | --- |
| `ContractDefinition` | generation, adapter/version, identity version, contract kind, canonical key, service ID, stable artifact ref, shape hash, shape blob, evidence class |
| `ContractReference` | generation, adapter/version, identity version, kind, expected canonical key or constrained pattern, consumer service, stable reference ID, artifact ref, resolution basis |
| `ContractChange` | base/head definition refs, canonical key, change kind, compatibility, activation, differ/version, coverage dependencies, evidence |
| `EvidenceEdge` | producer definition, consumer reference, primary path, stratum key, registry revision, observed generations, first/last observation, invalidation metadata |

The storage graph retains the contract node:

```text
consumer service -> contains -> reference -> consumes -> contract <- provides <- producer service
```

Service-to-service edges are materialized views with back-pointers, not the authoritative record.

### 5.4 Analysis and findings

| Entity | Load-bearing fields |
| --- | --- |
| `AnalysisRun` | workspace/revision, source repo, PR/base/head, producer overlay, selected consumer generations, policy revision, state, coverage, timings |
| `FindingOccurrence` | run, stable fingerprint, change, edge, edge/impact/action claims, evidence stratum, delivery state, abstention, remedy, projection hash |
| `EvidenceItem` | finding, side, artifact, generation, extractor/version, range, content hash, bounded display data |
| `SuppressionRule` | scope, matcher, owner, reason, created/review/expiry, invalidation predicate, state |
| `ReviewEvent` | finding/evidence versions, actor/auth, edge label, impact label, action label, reason, suppression ref, supersedes |
| `PromotionRecord` | stratum key, adapter versions, corpus revision, sample counts, intervals, coverage, policy decision, decided at/by |
| `DeliveryAttempt` | occurrence/projection, provider, external key/ref, state, attempts, last error code |

Stable consumer reference IDs come from the adapter's semantic identity when available. A fallback hashes normalized syntax ancestry and canonical target, never the current line.

## 6. Adapter architecture

### 6.1 Adapter manifest

```ts
interface ContractAdapterManifest {
  id: string;
  version: SemVer;
  contractKinds: ContractKind[];
  identityVersion: number;
  supportedLanguages: CapabilityTier[];
  evidenceStrata: EvidenceStratumDeclaration[];
  differDependencies: ExternalToolDeclaration[];
  limitations: LimitationDeclaration[];
  resourceBudget: ResourceBudget;
}
```

### 6.2 Adapter operations

```ts
interface ContractAdapter {
  manifest: ContractAdapterManifest;
  discover(input: ArtifactSet): DiscoveryResult;
  canonicalize(identity: RawContractIdentity): CanonicalContractKey;
  extractDefinitions(input: AdapterInput): ExtractionResult<ContractDefinitionDraft>;
  extractReferences(input: AdapterInput): ExtractionResult<ContractReferenceDraft>;
  diff(input: ContractDiffInput): ContractChangeResult;
  explainRemedy(change: ContractChange, edge: EvidenceEdge): RemedyTemplate;
}
```

Adapters return data and coverage. They never persist, deliver, authorize, call a model, or inspect another workspace.

### 6.3 Two indexing lanes

**Baseline lane:** parses source/declaration/configuration without executing project code. It uses the TypeScript compiler API for TypeScript package surfaces, safe parsers for OpenAPI/Protobuf, tree-sitter/framework extractors where admitted, manifests, lockfiles, and service registry mappings.

**Precision lane:** accepts a repository-produced SCIP artifact from trusted CI. Reverb validates SHA, package metadata, schema version, indexer identity, and limits. The hosted indexer does not run `npm install`, Gradle, Bazel, compiler plugins, or build hooks to generate precise indexes.

SCIP is one evidence source. Its cross-repository semantic support varies by indexer/language and MUST be represented as capability tiers rather than one “SCIP supported” flag.

## 7. Indexing algorithm

### 7.1 Full generation

```text
input: repository, commit SHA, registry/config revision, adapter bundle

1. Resolve commit and tree hash.
2. Acquire idempotent generation lease.
3. List tree without following paths outside repository root.
4. Classify files and record excluded/unsupported/binary/oversized entries.
5. For each eligible content hash:
   a. reuse a compatible cached artifact, or
   b. parse in a bounded worker.
6. Run eligible adapters over parsed/source artifacts.
7. Validate canonical identity, definition/reference uniqueness, evidence, and coverage.
8. Persist all artifacts under the incomplete lease.
9. Atomically mark generation complete with coverage summary.
10. Select it for the repository only if selection policy permits.
```

Failures in step 5 or 6 are data. They fail the relevant artifact/adapter coverage and may still allow a partial generation. Infrastructure corruption fails the generation. Selection policy decides whether a partial generation can serve positive evidence and prevents it from supporting unsafe negative claims.

### 7.2 Incremental generation

The input commit is still a full logical generation. Incremental is an implementation strategy:

1. compare prior selected tree hash with target tree;
2. reuse unchanged file artifacts by content hash and parser/adapter compatibility;
3. parse changed/added files and apply tombstones;
4. recompute definitions/references owned by touched artifacts;
5. rejoin only touched canonical keys plus keys whose registry aliases changed;
6. validate by a scheduled clean-rebuild equivalence test.

No mutable row is carried forward without its source generation and compatibility stamp.

## 8. Pull-request overlay algorithm

```text
input: workspace, producer repo, PR number, base SHA, head SHA, policy revision

1. Snapshot workspace/registry and authorization revision.
2. Select or build an exact base generation.
3. Read a complete diff manifest; fetch changed blobs at head.
4. Build an immutable overlay:
   - unchanged artifacts delegate to base;
   - changed/added artifacts replace base artifacts;
   - deleted artifacts are tombstoned;
   - renamed artifacts retain semantic identity when the adapter proves it.
5. Diff base definitions against overlay definitions.
6. Select one consumer generation per admitted repository and record SHA/freshness.
7. For each changed canonical key, query matching references and build evidence paths.
8. Evaluate claim-specific coverage dependencies.
9. Create candidate or abstained occurrences with stable fingerprints.
10. Apply suppressions, promotion policy, and disclosure projection.
11. Persist the canonical result.
12. If this head/policy is still current, render/update external delivery.
```

### 8.1 Consumer refresh strategy

The analysis does not synchronously re-index all consumers. It uses:

- a freshness SLO per collection;
- push-webhook indexing for default branches;
- on-demand refresh for consumers whose stale state could change a high-value conclusion, within the PR budget;
- explicit stale/not-analysed coverage after the refresh budget expires.

### 8.2 Coordinated PRs

v1 does not pretend to infer a distributed transaction across repositories. An operator or reviewer may attach a downstream PR as workflow evidence. The structural finding remains and its action label becomes `already_coordinated`. A future change-set protocol is additive.

## 9. Evidence and confidence

### 9.1 Stratum key

Calibration keys include at least:

```text
contract kind
producer language/capability tier
consumer language/capability tier
producer extractor/version
consumer extractor/version
identity version
join strategy
required evidence composition
coverage completeness class relevant to the claim
```

### 9.2 Required versus optional evidence

For an OpenAPI generated-client finding, the required path might be:

```text
producer OpenAPI operation
  -> compatibility diff rule
  -> generated client operation identity
  -> consumer symbol reference
```

Manifest dependency and co-change may support explanation but do not change the class. If route matching requires both a normalized path and a service alias, the primary path's class is limited by the weaker required step until that combination has its own calibration.

### 9.3 No global confidence float

Canonical storage retains the stratum and its evidence. A delivery projection may show the current policy band and latest measured interval. Historical results retain the policy revision used at the time.

## 10. Coverage and abstention

Coverage is a set of dimensioned records, not one percentage. A claim declares which coverage records can invalidate it.

Examples:

- An exact consumer reference found in a parsed TypeScript file is valid even if an unrelated Python directory failed.
- An endpoint removal is invalid if the head OpenAPI document failed to resolve a `$ref` required to prove the operation absent.
- “No consumers found” is not deliverable when an admitted repository is unauthorized, stale past policy, or unsupported for that contract kind.
- A partial source result may still deliver one exact consumer and state that additional consumers may be unobserved.

## 11. Temporal graph semantics

Every observation belongs to a producer and/or consumer generation. The “current graph” is a query:

```text
current(workspace, as_of, selection_policy, registry_revision)
```

An edge becomes absent from the current projection when:

- a complete selected generation no longer contains its definition/reference;
- repository membership is removed;
- consent forbids use;
- registry identity invalidates the join;
- freshness exceeds the allowed window and policy withholds it.

Expiry never deletes history by itself. Data retention may purge historical generations through an audited lifecycle.

## 12. Storage architecture

### 12.1 Local host

- SQLite in WAL mode;
- one database beneath `.reverb/` at the workspace root;
- content cache beneath `.reverb/objects/`;
- advisory filesystem lock plus transactional leases;
- canonical JSON/JSONL export.

### 12.2 Hosted reference

- PostgreSQL 18 as the only mandatory service;
- relational tables for metadata, artifacts, adjacency edges, jobs, policies, and reviews;
- recursive CTEs for bounded traversal;
- Postgres full-text only for operator search;
- row-level security or equivalent tenant isolation with forced enforcement;
- optional S3-compatible storage for large compressed SCIP artifacts;
- pgvector disabled by default and added only for optional retrieval, never finding generation.

### 12.3 Why no graph database

The hot operations are:

- exact canonical-key lookup;
- producer definition to consumer references;
- repository/contract filters;
- one-to-three-hop structural traversal;
- temporal selection by generation.

Postgres indexes and recursive CTEs handle the target profile without another operational and licensing surface. A graph backend requires benchmark evidence and an adapter ADR.

## 13. Job and consistency model

### 13.1 Durable inbox

GitHub webhooks are validated, deduplicated by delivery ID, persisted, and acknowledged before heavy work. The provider does not guarantee automatic replay of every failed delivery, so the host includes a reconciliation job for missed/stale events.

### 13.2 Idempotent keys

| Job | Idempotency key |
| --- | --- |
| default-branch index | repository + SHA + bundle + config revision |
| PR overlay | repository + base + head + bundle + config revision |
| analysis | workspace revision + source repo + base + head + policy revision |
| check write | installation + repo + PR + head + policy revision |
| purge | repository + authorization-loss revision |

### 13.3 Supersession

Workers check supersession before expensive phases and before any external write. Completed stale analyses remain auditable and are marked superseded; they never overwrite current output.

### 13.4 Transaction boundaries

- artifact batches may commit incrementally under an incomplete generation lease;
- generation selection is one atomic state transition;
- analysis result plus occurrences commits before delivery;
- delivery is an outbox effect with retry state;
- review event and optional suppression creation commit together;
- no provider call occurs inside a database transaction.

## 14. GitHub reference host

### 14.1 Minimum app permissions

Initial permission intent:

- repository metadata: read;
- contents: read;
- pull requests: read;
- checks: write on producer repositories with delivery consent;
- members/teams: optional and only for automatic collection sync.

Manual collections remain available when the organization declines team-read permission. Issues, code writes, administration, secrets, and workflows are not requested for v1.

### 14.2 Webhook events

- `installation` and `installation_repositories` for scope;
- `push` for default-branch freshness;
- `pull_request` for opened/synchronize/reopened/closed;
- `check_run.requested_action` only if feedback actions ship.

All webhook signatures use constant-time HMAC-SHA256 verification over the raw body.

### 14.3 Check projection

The check key is `(installation, repository, PR, head SHA, policy revision)`. The body includes:

- advisory/nonblocking statement;
- exact analysed head;
- admitted/current/failed/restricted repository counts;
- promoted findings that pass disclosure projection;
- measured evidence-stratum interval/date when current;
- remedy and authorized detail link;
- limitations and abstentions relevant to interpretation.

Only producer-side PR lines are annotated. Consumer paths appear only when approved for the entire producer audience; personalized details live behind authenticated authorization.

## 15. Security architecture

The full threat model is [security.md](security.md). Architectural enforcement points:

- source is untrusted parser input;
- no project code execution in the baseline lane;
- workers have read-only source, scratch storage, no network, resource quotas, and no provider token;
- adapter manifests declare capabilities; untrusted third-party adapters get no ambient ports;
- repository and tenant keys are mandatory in store APIs;
- authorizing a read and projecting a disclosure are separate calls;
- embeddings, if enabled, receive source-level access controls and deletion—not “non-reversible” treatment;
- telemetry is typed from an allowlist and fuzzed with canary identifiers/secrets;
- deletion traverses generations, edges, cache entries, objects, vectors, and projections.

## 16. Package topology

```text
packages/
  domain/                 @yanib/reverb-domain
  application/            @yanib/reverb-application
  schema/                 @yanib/reverb-schema
  adapter-sdk/            @yanib/reverb-adapter-sdk
  adapter-typescript/     @yanib/reverb-adapter-typescript
  adapter-openapi/        @yanib/reverb-adapter-openapi
  adapter-protobuf/       @yanib/reverb-adapter-protobuf
  storage-sqlite/         @yanib/reverb-storage-sqlite
  storage-postgres/       @yanib/reverb-storage-postgres
  host-local/             @yanib/reverb-host-local
  host-github/            @yanib/reverb-host-github
  cli/                    reverb-impact (binary: reverb)
  testkit/                @yanib/reverb-testkit
```

The implementation language is TypeScript on Node 24 LTS. Reasons:

- direct future embedding in Yanib;
- one type system across core, host SDK, GitHub adapter, and JSON schemas;
- TypeScript compiler API support for the first code-symbol adapter;
- mature PostgreSQL, SQLite, GitHub App, Protobuf, OpenAPI, and worker tooling;
- the CPU-heavy compatibility work is delegated to bounded specialized tools rather than justifying a Rust core before measurement.

Parsers and indexers remain replaceable behind adapters. A future Rust/WASM parser is added only for a measured bottleneck.

## 17. Migration and compatibility

There are three independent versions:

1. package semantic versions;
2. canonical wire/storage schema major/minor;
3. adapter identity and extraction versions.

A package update can preserve schema compatibility. An adapter update can require re-indexing without a storage migration. Identity changes always require an explicit re-key migration or full regeneration and reset affected promotion strata to `UNMEASURED`.

## 18. Failure-mode table

| Failure | Safe behavior |
| --- | --- |
| webhook duplicate | existing inbox key reused; no duplicate job/check |
| webhook missed | reconciliation detects provider/head drift and enqueues |
| source fetch truncated | relevant claims abstain; neutral incomplete result |
| parser crashes on one file | file/adapter coverage failed; unrelated exact positives may survive |
| external differ timeout | compatibility `unknown`; no dependent breaking claim |
| base SHA absent | fetch/build exact base or mark analysis not analysed |
| consumer snapshot stale | refresh within budget or mark stale; never “unaffected” |
| registry alias ambiguous | no exact join; preview candidate or abstain |
| force-push during run | persisted run marked superseded; no current delivery |
| DB worker dies | lease expires; at-least-once retry continues idempotently |
| GitHub write fails | canonical result retained; outbox retries with bounded error |
| authorization revoked | reads stop; projections revoke; purge scheduled/audited |
| disclosure check cannot prove safety | redact/omit; never default to reveal |
| model service fails | structural result unchanged; explanation absent |

## 19. Complexity triggers

Reverb does not pre-install scale architecture. Additions require these kinds of evidence:

| Proposed addition | Evidence required |
| --- | --- |
| object storage | Postgres/local blob size or backup/retrieval budget exceeded |
| pgvector | operator task requires semantic retrieval and judgment set beats lexical/graph baseline |
| OpenSearch | Postgres retrieval misses documented latency/relevance target at real corpus scale |
| graph database | bounded Postgres traversal misses target after indexing/query tuning |
| Kafka/managed queue | Postgres job/outbox throughput or isolation fails measured workload |
| Rust/WASM core | profiler shows CPU bottleneck not addressed by parser/tool isolation |
| microservices split | teams or scaling domains cannot safely deploy the modular service together |

## 20. Architecture conformance tests

- domain package dependency graph contains no adapter/host imports;
- every stored entity key includes workspace/tenant scope where applicable;
- all adapter definitions/references pass identity round-trip tests;
- clean and incremental generations are semantically equal;
- stale or incomplete required inputs cannot yield a removal finding;
- unrelated partial coverage does not suppress an exact positive;
- two consumers produce two fingerprints; line moves preserve identity;
- static disclosure projection never contains seeded restricted canaries;
- local and GitHub/Postgres hosts run the same golden analysis fixtures;
- optional LLM/vector packages can be removed and the full core suite remains green.
