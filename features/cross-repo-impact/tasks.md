# Reverb Implementation Tasks

**Status:** Phases 000–008 implemented; all strata preview-only unless separately promoted
**Rule:** a task is complete only when its verification command/evidence exists  
**Source of requirements:** [spec.md](spec.md)

## 1. Requirement traceability

| Requirement | Phase | Primary task group | Verification class |
| --- | --- | --- | --- |
| FR-1 workspace/authorization registry | 001, 003, 005 | 1C, 3A, 5B | schema, temporal, provider integration |
| FR-2 immutable repository indexing | 001 | 1D–1G | property, equivalence, fault |
| FR-3 adapter SDK/initial adapters | 002 | 2A–2E | fixtures, determinism, sandbox |
| FR-4 temporal join graph | 003 | 3B–3D | golden org, temporal, baseline |
| FR-5 PR overlays | 001, 003 | 1F, 3E | exact SHA, force-push, failure |
| FR-6 coverage/state | all | 1B, phase-specific outputs | schema, failure injection |
| FR-7 findings/remedies/disclosure | 003, 005 | 3F, 5C–5D | fingerprint, projection matrix |
| FR-8 review/suppression | 004 | 4A–4C | append-only, authorization, invalidation |
| FR-9 evaluation/calibration/policy | 004 | 4D–4G | labelled corpus, statistics, replay |
| FR-10 delivery | 005 | 5A–5G | webhook/check integration, shadow |
| FR-11 public packages/hosts/Yanib | 006 | 6A–6F | conformance, compatibility, release |
| FR-12 exact same-repository impact | 007 | 7A–7B | exact-head, deletion, mismatch, CLI integration |
| FR-13 hosted runtime composition | 008 | 8A–8D | inbox/job/outbox leases, tenant, retry, end-to-end |
| NFR-1 security/isolation | all, concentrated 001/005/006 | 1G, 5B–5C, 6E–6F | threat corpus, tenant isolation, parser sandbox, purge |
| NFR-2 reproducibility | 001–004, 006 | 1E–1F, 2A, 3E, 4C–4D, 6D | golden replay, full/incremental equivalence, frozen artifact |
| NFR-3 performance | 001, 003, 005, 006 | 1E, 3D–3E, 5B, 5F, 6F | representative load and latency budgets |
| NFR-4 availability/idempotency | 001, 003, 005 | 1B, 3E, 5A–5B, 5E | duplicate/retry/race/force-push fault tests |
| NFR-5 compatibility/migration | 001, 002, 006 | 1A–1B, 2A, 6A–6B, 6E | schema compatibility, upgrade/re-index drills |
| NFR-6 cost visibility | 001, 004, 005 | 1B, 4D–4E, 5B, 5F | allowlisted run metrics and policy simulation |
| NFR-7 accessibility/human factors | 004, 005 | 4A, 5D–5E, 5F | keyboard/screen-reader/text-state review |

### Invariant verification ownership

| Invariant | Primary verification owner | Required proof |
| --- | --- | --- |
| INV-1 two-sided evidence | 003/3D–3F | no delivered candidate without producer change and consumer artifact |
| INV-2 immutable generations/runs | 001/1E–1F, 003/3E | mutation rejection and exact replay/force-push occurrence tests |
| INV-3 one versioned identity function | 002/2A–2D | golden identity fixtures used by base/head and producer/consumer paths |
| INV-4 separate reasoning axes | 001/1A, 003/3C, 004/4D | schema prohibition and independent metric/coverage assertions |
| INV-5 claim-specific coverage | 001/1G, 003/3D | exact-positive and removal/negative fault-injection cases |
| INV-6 explicit evidence combination | 003/3C–3D, 004/4D | primary-path/contradiction strata and policy replay |
| INV-7 model cannot strengthen | 004/4F | import/capability and output-lattice tests |
| INV-8 explicit/versioned workspace | 001/1C, 003/3A | as-of membership/registry tests |
| INV-9 distinct permissions | 001/1C, 005/5C | action matrix, revocation and research-use tests |
| INV-10 whole-audience static output | 005/5C–5E | seeded unequal-ACL projection corpus |
| INV-11 temporal graph | 003/3B–3E | as-of, expiry, immediate invalidation and stale-edge tests |
| INV-12 consumer-scoped identity | 003/3F | multi-consumer fingerprint/occurrence/evidence movement tests |
| INV-13 append-only multi-axis decisions | 004/4A–4B | update rejection, supersession and independent-axis tests |
| INV-14 per-stratum delivery gate | 004/4D–4G, 005/5G | numeric promotion/demotion and unmeasured-adapter preview tests |
| INV-15 never-blocking reference | 005/5E–5G | conclusion/timeout/required-check matrix |
| INV-16 pure domain/ported orchestration | 001/1A–1B, 006/6B | import boundaries plus two-host conformance |

## 2. Phase 000 — project constitution

### 0A. Naming and repository

- [x] Check `reverb-impact`/publisher availability across GitHub, npm, containers, and domains; record that authorized trademark clearance remains external
- [x] Record product/repo/package naming ADR; rename before code if needed
- [x] Initialize Git repository and default branch protections
- [x] Add root documentation map and copy this feature set into the repository

### 0B. Legal and governance

- [x] Add Apache-2.0 `LICENSE` and `NOTICE`
- [x] Add `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `CHANGELOG.md`
- [x] Record ADR for clean-room Repowise relationship and rejected alternatives
- [x] Decide DCO versus CLA
- [x] Add dependency license policy, SBOM, vulnerability, and release-provenance automation

### 0C. Toolchain

- [x] Create Node 24 LTS/pnpm/strict TypeScript workspace
- [x] Create package skeletons from [packaging.md](packaging.md)
- [x] Add formatting, linting, typecheck, unit, integration, schema, conformance, license, and SBOM scripts
- [x] Add CI with frozen lockfile and ephemeral SQLite/Postgres services
- [x] Add ADR and feature-link validation job

**Phase 000 complete when:** a clean clone runs all quality gates and produces checksummed package
tarballs plus an SBOM and independently attested workflow build.

## 3. Phase 001 — repository index foundation

Detailed tasks: [phases/001-repository-index/tasks.md](phases/001-repository-index/tasks.md).

### 1A. Domain values

- [x] Workspace/repository/commit/content/generation/config/registry value types
- [x] Closed state/coverage/diagnostic vocabularies
- [x] Runtime schema validation and round-trip JSON fixtures

### 1B. Ports and conformance

- [x] Source, generation/evidence store, registry, authorization, jobs/cancellation, clock, sandbox, delivery, blob, telemetry ports
- [x] In-memory fakes and reusable conformance harness
- [x] Structural dependency rule proving domain package has no host imports

### 1C. Registry foundation

- [x] Workspace revision, repository membership, service identity/alias, consent/disclosure schema
- [x] Config reader/writer for local mode with revision hash
- [x] Validation for ambiguity, validity intervals, environment, ownership, and unknown repositories

### 1D. Local source and store

- [x] Local Git/filesystem `RepositoryReader`
- [x] SQLite migrations and generation leases
- [x] Content-addressed artifact cache and safe path handling
- [x] WAL/concurrency/locking and interrupted-write tests

### 1E. Index generation

- [x] Full tree classification, exclusions, limits, parsing worker boundary
- [x] Atomic complete/partial/failed generation transitions
- [x] Coverage/diagnostic aggregation
- [x] Incremental content reuse and clean-rebuild equivalence
- [ ] Persist adapter-owned semantic partitions/snapshots so incremental PR analysis does not recreate unchanged extraction input

### 1F. Overlay primitives

- [x] Complete diff manifest for add/modify/delete/rename/submodule/binary cases
- [x] Overlay lookup semantics and tombstones
- [x] Base/head/tree/config/bundle identity and supersession key
- [ ] Derive a non-selected logical head generation from base + overlay with delta-backed artifact resolution

### 1G. Security/fault verification

- [x] symlink/traversal/archive/resource adversarial corpus
- [x] parser crash, disk full, lock expiry, corrupt cache, and cancellation tests
- [x] canary telemetry leak tests

**Phase 001 complete when:** local exact-SHA generations are reproducible and incremental equals clean rebuild across success, partial, deletion, and failure fixtures.

## 4. Phase 002 — adapter SDK and initial adapters

Detailed tasks: [phases/002-contract-change-detection/tasks.md](phases/002-contract-change-detection/tasks.md).

### 2A. SDK/testkit

- [x] Adapter manifest, operations, coverage, diagnostics, resource/license declarations
- [x] Identity round-trip, determinism, output-bound, sandbox, fixture, and mutation harness
- [x] Admission report command

### 2B. TypeScript/npm

- [x] Package/export-subpath/symbol canonical key
- [x] producer public surface and consumer import/reference extraction
- [x] manifest/lockfile version and activation semantics
- [x] signature compatibility subset and `unknown` boundaries
- [x] barrel/re-export, overload, type-only, JS consumer, version-pinned fixtures

### 2C. OpenAPI

- [x] spec discovery, `$ref` resolution, operation identity and generated-client mapping
- [x] pinned `oasdiff` sandbox wrapper and exit mapping
- [x] spec drift/unknown limitations and hand-built HTTP preview separation
- [x] operation/path rename, unresolved refs, request/response variance fixtures

### 2D. Protobuf/gRPC

- [x] descriptor/name/wire identity
- [x] generated-client dependency/reference extraction
- [x] pinned `buf` category/config wrapper
- [x] reserved fields, number reuse, JSON versus wire semantics fixtures

### 2E. Admission

- [x] generated remedy templates for every deliverable change kind
- [x] synthetic mechanics reports clearly separated from real calibration
- [x] package/native/grammar license inventory

**Phase 002 complete when:** identical inputs produce byte/semantic-stable adapter outputs, and incomplete required inputs never classify absence as compatibility/removal.

## 5. Phase 003 — cross-repository graph and PR analysis

Detailed tasks: [phases/003-cross-repo-impact-graph/tasks.md](phases/003-cross-repo-impact-graph/tasks.md).

### 3A. Complete registry

- [x] service/deploy-unit alias keys for hosts/tokens/prefixes/packages/schema IDs/brokers/databases
- [x] revisioned add/remove/change and ambiguity diagnostics
- [x] explicit collection membership and consent snapshot

### 3B. Definitions, references, edges

- [x] storage/domain schemas and primary evidence paths
- [x] exact, registry-resolved, heuristic, declared-context, behavioural-context separation
- [x] temporal observation/current projection/invalidation semantics
- [x] direct and labelled bounded transitive queries

### 3C. Evidence strata

- [x] stratum-key construction and version validation
- [x] required-versus-optional evidence behavior
- [x] no duplicate/correlated corroboration inflation tests

### 3D. Join engine

- [x] canonical-key index and touched-key incremental rejoin
- [x] service alias resolution and ambiguity abstention
- [x] generation/freshness selection and claim-specific coverage

### 3E. PR orchestration

- [ ] exact indexed base selection, changed-file head overlay, and derived head generation without full base/head source reconstruction
- [x] consumer generation snapshot and on-demand refresh budget
- [x] force-push supersession and actual-merge-SHA handling
- [x] result persistence before external effects

The v0.2 local semantic path proves exact identities and joins, but it does not satisfy the hosted
source-cost gate in [ADR 0006](../../docs/adr/0006-index-first-pr-overlays.md). Phase 003 is not
incrementally complete until adapters persist partition state and host conformance proves changed-only
producer reads plus zero consumer reads.

### 3F. Findings

- [x] consumer-specific fingerprint and occurrence model
- [x] edge/impact/action claim model
- [x] remedies, abstention, coverage dependencies
- [x] local CLI/JSON output

### 3G. Baseline/stop gate

- [x] run same representative tasks with current pinned Repowise
- [x] compare manifest-only, schema-only, lexical, and Reverb structural lanes
- [x] document unique advantage, parity, or failure and decide continue/interoperate/stop

**Phase 003 complete when:** a local PR analysis over real repository pairs records exact producer/consumer SHAs and inspectable joins, and the project passes its stop/reposition review.

## 6. Phase 004 — precision and review

Detailed tasks: [phases/004-precision-and-review/tasks.md](phases/004-precision-and-review/tasks.md).

### 4A. Review schema

- [x] edge/impact/action labels and reason vocabulary
- [x] append/supersede event store and authorization hooks
- [x] separate workflow, risk acceptance, correctness, and suppression

### 4B. Suppressions

- [x] all scopes, ownership, review/expiry, invalidation predicates
- [x] candidate remains in evaluation even when delivery suppressed
- [x] broad-scope authorization and poisoning tests

### 4C. Corpus

- [x] versioned case/manifest/label schemas and handbook
- [x] historical, executable replay, and mutation subsets
- [x] no-finding sampling and consumer-as-of snapshot capture
- [x] double-label/adjudication/indeterminate handling

### 4D. Evaluator

- [x] per-stratum metrics and Wilson/clustered intervals
- [x] known-break recall, false-omission, risk–coverage, coverage vectors
- [x] latency/cost/alert burden and action-rate separation
- [x] fail on required unlabelled cases

### 4E. Policy simulator

- [x] frozen-result replay, baseline comparison, volume/cost estimate
- [x] promotion/demotion records and version reset
- [x] policy diff and reproducible report artifact

### 4F. Optional model experiment

- [x] model/data-export experiment deferred after structural baseline threat review
- [x] no tools/writes/labels or model-enabled confidence strengthening exists
- [x] comparison deferred until an authorized labeled real-world corpus exists
- [x] deferral/removal decision recorded

### 4G. Promotion

- [x] apply default numeric gate or record versioned approved alternative
- [x] zero confidentiality/open critical coverage defects
- [x] record decision and corpus/report hashes (remain-preview record; no fabricated corpus hash)

**Phase 004 complete when:** at least one current stratum is promotable or the project has an honest evidence-backed reason to remain preview-only.

## 7. Phase 005 — GitHub host and delivery

Detailed tasks: [phases/005-delivery-surfaces/tasks.md](phases/005-delivery-surfaces/tasks.md).

### 5A. GitHub ingestion

- [x] app manifest/minimum permissions and selected-repository flow
- [x] raw-body HMAC, delivery dedupe, durable inbox, async ack
- [x] installation/repository/push/PR events and reconciliation
- [x] exact Git fetch/blob reader independent of bounded compare API

### 5B. Hosted store/workers

- [x] Postgres migrations, tenant keys, forced RLS, jobs/outbox
- [x] just-in-time scoped installation tokens and fetch/parser separation
- [x] purge, backup/retention, and cross-tenant canary tests

### 5C. Authorization/disclosure

- [x] all action grants and registry revisions
- [x] static whole-audience and personalized projections
- [x] public/private/unequal ACL matrix and cached-projection revocation

### 5D. Detail/review surface

- [x] authenticated authorized finding/coverage/evidence view
- [x] append review/suppression with fresh authorization
- [x] keyboard/text/colour accessibility requirements

### 5E. Check writer

- [x] stable key, force-push update, success/neutral/skipped conclusions
- [x] 15-minute hard completion, pagination/limits/producer annotations
- [x] no consumer details without static disclosure approval

### 5F. Shadow rollout

- [x] no-write shadow analysis and local coverage/latency/noise report mechanics
- [ ] policy replay against shadow volume
- [x] emergency disable paths and rollback drill

### 5G. Advisory rollout

- [ ] enable one promoted stratum only
- [ ] verify exact current head, redaction, remedy, feedback, neutral conclusion
- [ ] monitor drift/alert burden/action usefulness and automatic demotion

**Phase 005 complete when:** a real organization passes shadow and limited advisory gates with zero disclosure defects and p95 latency/alert budget within policy.

## 8. Phase 006 — packages, second host, Yanib

Detailed tasks: [phases/006-host-adapters/tasks.md](phases/006-host-adapters/tasks.md).

### 6A. Public API stabilization

- [x] package exports, protocol/schema versions, errors, migration/re-index guides
- [x] compatibility tests for current major and explicit no-previous-major disposition
- [ ] signed releases, SBOM, checksums, provenance
  - SBOM, checksums, and provenance automation pass locally; signing/publication remain external.

### 6B. Host conformance

- [x] local SQLite, GitHub/Postgres, and minimal independent host pass canonical conformance v1
- [x] canonical state/failure, idempotency, supersession, isolation, and declared deletion semantics
- [ ] optional purge/review/disclosure/provider parity across every host capability
- [x] conformance version and machine host capabilities published for third parties

### 6C. Yanib integration

Yanib-specific work is intentionally out of scope for the standalone project goal. No Yanib
repository or internals were accessed.

- [ ] shadow SDK/API consumer
- [ ] dedicated Reverb finding/review subject mapping
- [x] generic consent-gated declared context cannot originate a structural edge
- [x] standalone reference host enforces one external check writer per key

### 6D. Research artifact

- [x] public synthetic benchmark manifests/labels/generators/baselines/analysis scripts
- [ ] archival DOI release and exact environment
- [x] exact local environment/lockfile manifest and private-study non-release statement

### 6E. Operations and governance

- [x] self-host install plus backup/restore/purge/incident/upgrade runbooks
- [x] adapter contribution and security process
- [x] host support matrix and compatibility/deprecation policy

### 6F. v1 verification

- [x] walk every spec success metric and link evidence
- [x] fix all broken docs links/placeholders and pin/qualify external claims
- [x] run clean install, upgrade, conformance, adversarial, load, security, and release drills

**Phase 006 complete when:** two hosts—including Yanib or an independent equivalent—consume the
stable protocol without table coupling and the public release evidence is archived. The independent
minimal host satisfies this standalone gate; Yanib adoption remains a separate product change.

## 9. Global definition of done

- [x] Every invariant has at least one automated or documented verification.
- [x] Every FR and NFR maps to phase tasks, verification, and canonical schemas where applicable.
- [x] Current Repowise is accurately represented and benchmarked.
- [x] No claim of production accuracy comes from synthetic fixtures.
- [x] Positive and negative partial-coverage behavior is tested.
- [x] Consumer-specific fingerprints and temporal generations are tested.
- [x] Static disclosure cannot leak seeded restricted facts.
- [x] Review decisions are independent append-only events.
- [x] Local and hosted hosts pass one conformance suite.
- [x] No LLM/vector/graph database is required for core analysis.
- [x] License/SBOM/provenance checks pass.
- [x] Public paper/benchmark claims are reproducible and qualified.
