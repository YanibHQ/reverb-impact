# Reverb Architecture and Implementation Plan

**Status:** Phase 001 implemented and locally verified; external Phase 000 publication controls pending  
**Scope:** complete product plan; implementation has not started

**Owning organization:** `YanibHQ`  
**Canonical repository:** `YanibHQ/reverb-impact`  
**Initial host:** Yanib, through the public SDK/protocol rather than shared tables

## 1. Outcome

Build a standalone, clean-room, Apache-2.0 engine that analyses an exact PR base/head against exact downstream repository generations, produces evidence-backed cross-repository impact findings, and earns nonblocking GitHub delivery through human-labelled evaluation.

The first valuable outcome is not a graph or dashboard. It is a reproducible CLI result over a real producer/consumer repository pair with an exact structural join and explicit coverage.

## 2. Decision ledger

### D-1 — Focused PR-impact engine, not generic code intelligence

**Decision:** Reverb owns repository generations, contract adapters, joins, findings, evaluation, and delivery projections only.

**Why:** Repowise already provides broad codebase intelligence and current cross-repo workspaces. Rebuilding its wiki, search, health, documentation, MCP breadth, and visualization would be duplication with no product thesis.

**Revisit when:** never as scope creep; a separate product decision is required.

### D-2 — Clean-room implementation; Repowise is baseline/prior art

**Decision:** do not depend on or copy Repowise code.

**Why:** Repowise's root distribution is AGPL-3.0-or-later/commercial for embedding, while Reverb needs a permissive embeddable public core. Current behaviors are still essential comparison and benchmark targets.

**Rejected:** fork, commercial embedding as this public project, undocumented internal artifact coupling.

### D-3 — TypeScript on Node 24 LTS

**Decision:** TypeScript monorepo and Node LTS runtime.

**Why:** future Yanib embedding, GitHub host and SDK share one language; TypeScript compiler API supports the first symbol lane; compatibility-heavy work delegates to specialized tools. A Rust core is not justified before profiling.

**Rejected now:** Python core (excellent parser ecosystem but adds cross-language host boundary and does not create a unique capability), Rust core (premature native/WASM/FFI cost).

### D-4 — Apache-2.0 code license

**Decision:** permissive core with explicit patent grant.

**Why:** public adoption and commercial embedding, including Yanib. Dataset/paper licensing stays separate.

### D-5 — Immutable generations plus PR overlays

**Decision:** index exact commits; a PR head is an immutable overlay over an exact base generation.

**Why:** previous-scan/current-scan compares operational timing, not necessarily the PR base/head. Immutable generations make race, force-push, merge, and reproduction semantics explicit.

### D-6 — Temporal contract/reference graph in relational storage

**Decision:** authoritative nodes remain definitions, references, and evidence edges tied to generations. Service-to-service graph is a projection.

**Why:** contract-level evidence and temporal versions are lost if only repository/service edges are stored.

### D-7 — SQLite local; PostgreSQL 18 hosted; no graph/vector/search service

**Decision:** two storage adapters; Postgres handles adjacency queries, recursive traversal, jobs, full-text, and tenant isolation.

**Why:** one required database covers the target profile. New infrastructure requires measured failure.

### D-8 — Two indexing lanes; never build untrusted repositories by default

**Decision:** baseline safe parsing plus optional CI-uploaded SCIP precision indexes.

**Why:** compiler-precise indexes may require real builds, private registries, or plugins. Running `npm install`, Gradle, Bazel, or compiler hooks in a hosted service turns code intelligence into remote code execution.

### D-9 — Initial adapters: TypeScript/npm, OpenAPI, Protobuf/gRPC

**Decision:** prove one code-symbol lane and two canonical schema lanes.

**Why:** canonical identities and existing compatibility tools reduce initial join ambiguity. Heuristic HTTP stays preview until measured. GraphQL is next if a design partner exists.

**Rejected first:** shared DB and env/config despite value, because physical/deploy-unit identity is harder; broad language/framework matrix before core proof.

### D-10 — Service registry before heuristic service joins

**Decision:** versioned service/deploy-unit aliases are a foundation owned across Phases 001/003.

**Why:** host tokens, gateways, schema IDs, topics, databases, and package coordinates cannot safely infer their owner from a path string alone.

### D-11 — Evidence strata, not an invented global score

**Decision:** store evidence family/path/stratum and current measured promotion. Do not publish a per-finding probability initially.

**Why:** different contract kinds and evidence paths have different base rates. A numeric score without calibration creates false precision.

### D-12 — Primary evidence path; weakest required step controls initial delivery

**Decision:** optional evidence neither raises nor lowers a finding. Exact evidence combinations can become their own calibrated strata.

**Why:** the previous unconditional floor rule let optional weak evidence damage exact joins; maximum/average rules let correlated heuristics inflate them.

### D-13 — Positive/negative coverage is claim-specific

**Decision:** unrelated partial coverage does not erase exact positives; any missing input that could create a removal or negative assurance causes abstention.

**Why:** this preserves true evidence and prevents false safety.

### D-14 — Human review labels edge, impact, and action separately

**Decision:** append-only multi-axis labels and distinct workflow/suppression records.

**Why:** accepted risk, dead code, or a coordinated consumer update are not detector false positives.

### D-15 — Measurement precedes external checks

**Decision:** all new strata are preview-only. Default promotion uses the numeric gate in [spec.md](spec.md#fr-9--evaluation-calibration-and-policy-simulation).

**Why:** a regression fixture validates intended behavior; it does not estimate real-world precision.

### D-16 — Advisory forever in the reference product

**Decision:** checks never block and incomplete analysis completes neutral by the hard deadline.

**Why:** cross-repository claims can concern code the author cannot inspect; pending required checks also block in practice.

### D-17 — Static check content is whole-audience safe

**Decision:** personalized restricted details live behind fresh authenticated authorization.

**Why:** a GitHub Check cannot vary by viewer, and same organization does not imply same repository access.

### D-18 — No LLM or embeddings in the core decision path

**Decision:** optional explanation/retrieval is a separate package and data-export mode.

**Why:** structural identity and compatibility are testable without model nondeterminism; private source and embeddings need source-grade controls.

### Ledger classification

The decisions above are the **Locked** set: each is confirmed, carries its rationale, and changing
one is a new decision record rather than an edit. The remaining three classes are recorded here so
that what is settled and what is not stay distinguishable.

**Discretionary — the implementer chooses, and no decision record is owed:**

- Internal module boundaries and file layout inside a package, provided the core keeps no I/O.
- Table and index names, and the migration tool's conventions.
- Log formats, CLI output styling, progress reporting, and error message wording.
- Test fixture organization, and whether a fixture repository is generated or committed.
- The concrete cache-key encoding, provided it includes every version stamp the invariants require.

**Deferred — out of scope now, captured so it is not rediscovered as new:**

- Contract kinds beyond the first three adapters — GraphQL, messaging topics and payload schemas,
  shared database columns, Terraform module outputs, CLI surfaces. Each is admitted only under the
  adapter admission rule, and the taxonomy records which differ to wrap for each
  ([`research/contract-taxonomy.md`](research/contract-taxonomy.md)).
- Runtime and dynamic evidence — traces, coverage, production telemetry. Higher recall, different
  consent model, different system.
- Cross-organization and public-ecosystem analysis.
- Automatic fix generation. Naming the required action is in scope; performing it is not.
- Non-GitHub hosts beyond the port definitions.

**Open — genuinely undecided, with what closes each:**

- **Whether Repowise is adopted as a component rather than treated only as prior art.** Its
  workspace layer resolves `external:` import nodes across member repositories, which is the same
  hinge this design needs. Closes on a spike that measures whether its extraction can be driven
  from a provider-fetched tree rather than a local checkout, and on a licence review of AGPL-3.0
  against the intended distribution.
- **Which contract kind follows the first three adapters.** Closes on demand evidence under the
  admission rule, not on which is most interesting to build.
- **Whether a model adjudicator earns its nondeterminism and data egress.** Closes on a measured
  selective-risk improvement over the structural path alone.
- **Whether uploaded precise indexes justify a second precision lane.** Closes on the observed
  resolution gap in the first real organization.
- **Whether the name survives publisher, domain and trademark clearance.** `Reverb` is provisional;
  alternates are recorded in [`packaging.md`](packaging.md).

None of these authorizes a placeholder abstraction in advance. An open question is a reason to keep
a seam narrow, never a reason to build a plugin system for an answer nobody has.

## 3. Negentropy assessment

**Entropy** (the natural tendency of systems toward decay, disorder, and complexity without value) would appear here as mutable “current” edges, opaque confidence scores, permanent suppressions, duplicated identity logic, and infrastructure added for hypothetical scale.

**Negentropy** (the deliberate reversal of decay—growth, compounding value, and increasing order) comes from immutable generations, one identity function, reusable adapter/conformance fixtures, and reviewer labels that improve measured policy rather than silently rewriting history.

**Tacit knowledge** (unwritten knowledge of how systems actually work—aliases, gateways, ownership, deployment timing, and accepted coordination patterns) is captured in a versioned service registry and reasoned review events. It is not promoted through an opaque model guess.

The most dangerous tacit assumptions to validate with design partners are:

- how teams/collections map to repositories;
- which repository facts may be disclosed in another repository;
- whether CI can upload precise SCIP indexes;
- how hosts, gateways, package names, schema IDs, and environments resolve to deploy units;
- how often downstream repositories are fresh enough at PR time;
- whether an advisory finding's remedy fits actual cross-team coordination.

## 4. Build order

### Phase 000 — public-project constitution (pre-implementation)

This is repository setup rather than a numbered feature directory:

- clear/record name and publisher scope;
- initialize Git repository;
- add Apache-2.0, NOTICE, security/contribution/governance/code-of-conduct files;
- create pnpm/TypeScript workspace and CI skeleton;
- add ADR-0001 for the product/Repowise/license decision;
- add dependency license/SBOM/provenance checks;
- import these feature documents.

Exit: a contributor can clone, run empty quality gates, and understand the clean-room boundary.

### Phase 001 — repository index foundation

- domain values and schemas;
- ports and host conformance harness;
- local Git/filesystem/SQLite host;
- immutable generations, file content cache, coverage, overlay primitives;
- no meaningful cross-repo detector yet.

Exit: incremental and clean rebuilds of fixture repositories produce the same canonical generation; partial/failure cases are explicit.

### Phase 002 — adapter SDK and compatibility

- adapter manifest/test harness;
- TypeScript/npm, OpenAPI, Protobuf/gRPC adapters;
- canonical identity, definitions, references, compatibility, activation, remedies;
- sandbox wrapper for external differs.

Exit: base/head fixture pairs produce stable, reviewable contract changes and consumer references.

### Phase 003 — cross-repository join and PR analysis

- registry/workspace revisions and service aliases;
- temporal evidence edges and current projection;
- exact consumer generation selection/freshness;
- PR overlay orchestration and finding fingerprints;
- local end-to-end analysis over real repository pairs;
- stop/reposition benchmark against current Repowise.

Exit: exact producer/consumer evidence at exact SHAs; benchmark shows a meaningful PR-specific delta.

### Phase 004 — precision and review

- corpus schema/label handbook/import;
- review events, suppressions, invalidation;
- evaluation harness, intervals, risk–coverage, false-omission audit;
- policy simulator, promotion/demotion records;
- optional explanation experiment remains off by default.

Exit: at least one current evidence stratum passes promotion; otherwise delivery remains preview and the result is still scientifically useful.

### Phase 005 — GitHub reference host and delivery

- webhook inbox, reconciliation, source fetch, Postgres workers;
- authorization/consent and disclosure projector;
- authenticated finding detail;
- shadow checks, then promoted advisory check;
- force-push, retry, timeout, output limit, public/private matrices;
- operational dashboards/logging without source identifiers.

Exit: shadow and advisory production verification meets security/noise/latency gates.

### Phase 006 — public host SDK and Yanib proof

- stabilize packages and schema compatibility;
- finish local/hosted conformance parity;
- second-host adapter using Yanib or a minimal independent fixture host;
- map Yanib declared edges as context and reviews as dedicated subjects;
- release/migration/operations guides and public artifact.

Exit: two hosts pass conformance; no direct table coupling; v1 release checklist complete.

## 5. Testing strategy

### 5.1 Test layers

| Layer | Purpose |
| --- | --- |
| value/property tests | key normalization, fingerprint stability, enum/state invariants |
| adapter fixtures | producer/reference extraction and compatibility mechanics |
| metamorphic tests | formatting/path/line moves preserve meaning; real identity changes do not |
| clean/incremental equivalence | optimization cannot change logical generation |
| golden organization fixtures | multi-repo end-to-end outputs and coverage |
| conformance suite | same behavior across local and hosted ports |
| adversarial corpus | paths, symlinks, archives, parser bombs, malformed schemas, prompt text |
| migration tests | oldest supported store/schema to current |
| fault injection | fetch/parser/differ/DB/delivery failures and retries |
| load benchmarks | target profile latency, storage, job contention |
| human-labelled evaluation | correctness and promotion—not unit regression |
| disclosure matrix | public/private/selected repos, static/personalized projections |

### 5.2 Required organization fixtures

1. TypeScript package producer and two consumers using different export subpaths/versions.
2. OpenAPI producer with generated-client consumer, hand-written HTTP candidate, and unrelated same path on another service.
3. Protobuf producer with binary/JSON-sensitive changes and generated clients.
4. Coordinated downstream PR metadata without changing structural truth.
5. Stale, unsupported, failed, unauthorized, and removed consumer repositories.
6. Public producer/private consumer and unequal private ACL projections.
7. Service base token, host, gateway prefix, ambiguous alias, and environment variants.
8. Force-pushed PR where older analysis finishes last.

### 5.3 Verification commands target

Exact scripts are created during Phase 000/001. Intended public commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:conformance
pnpm test:adversarial
pnpm test:migrations
pnpm benchmark
pnpm schema:check
pnpm licenses:check
pnpm sbom
```

No task is marked complete with a command that does not exist.

## 6. Evaluation strategy

The evaluation plan is normative in [research/evaluation-protocol.md](research/evaluation-protocol.md). Implementation sequencing:

1. write label ontology and case schema before reviewing cases;
2. build synthetic/mutation fixtures for mechanics;
3. enumerate real eligible PRs, including a sample of no-finding PRs;
4. capture producer base/head and consumer-as-of snapshots to avoid future leakage;
5. use two independent domain-capable labels and adjudicate conflicts;
6. freeze adapter/policy versions for evaluation;
7. split by time and organization/repository family;
8. report strata, clusters, intervals, indeterminate sensitivity, coverage, latency, and cost;
9. promote only on the frozen record;
10. monitor drift and automatically demote when current evidence no longer clears policy.

## 7. Promotion and demotion operation

Default promotion is specified under FR-9. Operational hysteresis:

- immediate demotion for confidentiality defect, identity corruption, or removal manufactured by incomplete input;
- automatic return to `UNMEASURED` on incompatible adapter/identity version;
- statistical demotion after two consecutive current windows whose actionable-precision lower bound falls below 0.85, or one window with a predefined severe-error threshold;
- alert-volume/latency breach moves the stratum to preview even when precision remains high;
- repromotion requires a new recorded decision and policy replay.

These thresholds are versioned product defaults and may be revised through ADR plus replay.

## 8. Operational design

### 8.1 Environments

- local development: fixture repos + SQLite;
- CI: ephemeral SQLite/Postgres and sandboxed tool images;
- shadow: real workspace indexing and canonical findings, no check write;
- preview: authenticated UI/API, no producer PR output;
- advisory: promoted strata in neutral checks;
- emergency modes: disable reads, parsers, model export, or writes independently.

### 8.2 Observability

Track counts/durations/reasons only:

- webhook receipt/lag/reconciliation;
- generation selected/partial/failed and coverage dimensions;
- cache/reuse and adapter time;
- joins/candidates/abstentions/suppressions/deliveries by nonidentifying strata;
- job retries/supersession and check latency;
- authorization/redaction outcomes;
- purge state;
- compute/storage/model cost.

Source identifiers stay in authorized product data, never general telemetry.

### 8.3 Rollback

Because generations/results are immutable, rollback changes selection and policy pointers:

- disable an adapter or stratum;
- revert policy revision;
- select last healthy indexer bundle for new generations;
- stop check writer while preserving canonical results;
- re-render current checks with a safe disabled/partial message when necessary;
- never rewrite historical results to match the rollback.

## 9. Risk register

| Risk | Likelihood | Impact | Trigger | Response |
| --- | --- | --- | --- | --- |
| no meaningful advantage over Repowise | Medium | High | Phase 003 baseline parity/loss | stop, interoperate, or reposition before hosted build |
| insufficient real multi-repo labels | High | High | promotion sample cannot be reached | stay preview; recruit design partners; publish method/benchmark separately |
| service registry adoption is low | Medium | High | unresolved/ambiguous joins dominate | focus canonical package/schema lanes; offer generated suggestions with explicit approval |
| consumer snapshots too stale | Medium | High | freshness SLO missed | push indexing, on-demand refresh, honest abstention; do not hide |
| static check disclosure cannot be made useful | Medium | High | most details redacted | consumer-owner routing/auth detail; reconsider check copy, never weaken privacy |
| TypeScript parser/tool CPU bottleneck | Low initially | Medium | target-profile p95 miss after profiling | worker parallelism, cache, or measured Rust/WASM component |
| Postgres traversal/storage insufficient | Low initially | Medium | benchmark/ops budget miss | tune/index/partition, then ADR for specialized store |
| optional AI adds risk but little benefit | Medium | Medium | no selective-risk improvement | remove/leave optional; structural path unaffected |
| adapter sprawl | High | Medium | unowned preview adapters accumulate | admission gate, maintainer, demand, corpus, budgets, removal policy |
| package/name conflict | High | Medium | registry/trademark check fails | rename before public API 1.0 |

## 10. Stop/reposition gates

The project should stop or change direction if any of these remains true after Phase 003/004 evidence:

- current Repowise or another permissive tool matches the exact PR-overlay, authorization, and evaluation task with acceptable embedding terms;
- exact/registry-resolved joins do not materially outperform manifest fanout or schema-only baselines;
- organizations cannot provide repository/disclosure consent needed for actionable output;
- consumer freshness/coverage makes negative assurance unusable and exact positives too rare;
- alert burden exceeds product budgets at the precision gate;
- no design partner will label or act on findings;
- maintaining three initial adapters already exceeds sustainable ownership.

Stopping here is a successful architectural result, not a reason to ship a graph without value.

## 11. Documentation maintenance

- every invariant maps to requirements, phase tasks, and tests;
- external claims live in research docs with primary links, checked date, and limitations;
- phase files move from Draft → Implementing → Verified with recorded commands/evidence;
- implementation discoveries update the decision ledger rather than silently diverging;
- feature docs never claim precision, recall, latency, adoption, or production status from fixtures;
- Yanib evidence is pinned to a commit before public publication; mutable production counts are contextual, not load-bearing.
