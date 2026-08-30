# Cross-Repository Impact — Shared Specification

**Status:** Draft for implementation review  
**Scope:** public engine, local CLI, reference GitHub host, extension SDK  
**Normative language:** `MUST`, `MUST NOT`, `SHOULD`, and `MAY` are requirements keywords

## 1. Problem statement

### 1.1 Current state

Organizations split one product across repositories, but pull-request review is normally scoped to the repository receiving the change. Package manifests identify broad dependency relationships; schema differs classify producer changes; code indexes find references; service catalogs identify ownership; contract-testing systems verify declared interactions. Each is useful, but the operator usually has to assemble them, keep their repository snapshots aligned, and interpret incomplete results.

Repowise now assembles many of these capabilities for local multi-repository workspaces. Reverb's target is not the previously claimed empty category. It is the narrower unresolved problem of provider-native, reproducible, permission-safe PR analysis across independently indexed repositories, with measured delivery policy and a reusable core.

### 1.2 Desired state

For a pull request at exact `base_sha` and `head_sha`, Reverb:

1. identifies producer contracts changed by the pull request;
2. classifies compatibility and activation timing using a versioned adapter;
3. joins each changed contract to consumer references in the selected workspace generations;
4. records the exact producer and consumer evidence, snapshot SHAs, freshness, and coverage;
5. distinguishes `no_candidate`, `candidate`, `abstained`, and `not_analysed`;
6. applies versioned promotion, suppression, and disclosure policy;
7. renders a local preview, machine result, or nonblocking PR check.

### 1.3 Units of truth

Reverb separates claims that are commonly collapsed:

- **Edge claim:** consumer artifact C uses producer contract P.
- **Impact claim:** producer change ΔP affects that specific use.
- **Action claim:** a person should coordinate or modify something before merge.

Human labels and metrics MUST preserve these three axes. A real edge can be compatible; a real impact can already be coordinated; neither is a false-positive edge.

### 1.3 The simpler option and why it fails

Two cheaper alternatives exist. Both are real, and neither holds the invariants.

**Alternative one: join on package manifests and declared configuration, and skip the index.**
Read every repository's `package.json`, `go.mod`, `pyproject.toml` and an optional `consumes:`
block, build a repository-to-repository graph, and report every repository declaring a dependency
on the changed one. No parser, no symbol resolution, no language matrix. It buys complete language
coverage, near-zero index cost, and a trivially explainable graph.

It does not answer the question. These defects remain:

- **The signal fires on every pull request.** The dependency holds whether or not this change
  touched anything the consumer uses, so the check is muted after the second one — silently and
  permanently.
- **It cannot see most cross-service coupling.** An HTTP call, a queue topic, a GraphQL field and a
  shared database column create no manifest entry. Two services communicating only over the network
  have no edge to read.
- **A declared edge is unverifiable in both directions.** A declaration naming a contract that does
  not exist is indistinguishable from one that has not fired yet — the prior system records this
  exact ambiguity, having dropped the existence check because a target's stored config is
  legitimately absent before its first refresh
  ([`research/prior-system-yanib.md`](research/prior-system-yanib.md) §D.5).
- **It has nothing to put in a remedy.** "Repository B depends on you" names no call site, so the
  finding cannot say what to do, which disqualifies it from a check under INV-1.
- **It cannot be measured.** With no contract-level claim there is nothing to label, so the
  evaluation invariants have no corpus and no precision figure is ever derivable.

The manifest graph is still required — it is how a symbol reference in one repository resolves to a
definition in another. It is an input to the join, not a substitute for it.

**Alternative two: adopt Repowise's workspace mode instead of building.** It already produces a
cross-repository service graph with typed, confidence-carrying edges and source-extracted
contracts, is AGPL-3.0 and self-hostable, and its analysis layers make no model calls. Its rigour
exceeds this specification in places — fitted detector weights with leakage controls,
leave-one-repository-out validation, and a benchmark that publishes the cell it loses.

Four defects remain, each stated by that project's own code or documentation rather than inferred
([`research/repowise-teardown.md`](research/repowise-teardown.md)):

- **A finding cannot name a call site.** Blast radius is a reverse-import walk over a file list and
  the diff is never given to it — `tool_risk/directives.py:468-471` states that nothing there knows
  whether the symbol an importer uses actually changed, and `will_break` was renamed `may_break`
  for that reason. This violates INV-1.
- **The pull-request surface is not in the open-source distribution.** The webhook router handles
  `push` only; the documented `integrations/github-app/` directory does not exist.
- **Membership does not scale past a shared filesystem.** Members are relative paths in a YAML
  file, so there is no provider-native discovery and no per-repository read consent to record.
- **No precision figure about a customer's estate is derivable.** Suppression is configuration only
  — `.riskignore`, `.repowiseIgnore`, `exclude_patterns` — and no human decision is captured against
  a finding, so nothing can be measured or promoted on evidence.

Adopting it as a **component** rather than as the product is not closed by this argument, and is
recorded in [`plan.md`](plan.md) under Open.

## 2. System boundary

### 2.1 In scope

- explicitly configured repository workspaces, initially within one GitHub organization;
- immutable repository generations and PR overlays;
- producer definitions, consumer references, canonical identities, and compatibility changes;
- direct cross-repository findings and bounded structural propagation;
- local Git/SQLite operation and a GitHub/Postgres reference host;
- human review, suppressions, policy simulation, evaluation, and audit exports;
- versioned library, CLI, JSON Schema, and adapter SDK packages;
- first-host integration with Yanib through the public protocol.

### 2.2 Out of scope

- merge blocking in the reference product;
- executing repository build scripts or arbitrary project code;
- runtime tracing, production traffic, or consumer-group liveness in v1;
- public-ecosystem or cross-organization indexing;
- automatic code changes or autonomous downstream pull requests;
- a general code-chat, documentation, health-scoring, or developer-portal product;
- a dedicated graph database, vector database, or distributed event platform in v1;
- model-created edges, model-created evaluation labels, or model-raised severity;
- claiming that an absence of detected consumers proves ecosystem-wide safety.

## 3. Invariants

### INV-1 — A delivered finding has inspectable evidence on both sides

Every delivered finding MUST contain a producer artifact and a consumer artifact, each with repository generation, stable artifact identity, path, optional range, extractor, extractor version, and content hash. Declared relationships without a consumer artifact MAY appear as context, but MUST NOT independently produce a structural impact finding.

**Violation:** the graph becomes an assertion a reviewer cannot falsify.

### INV-2 — Repository generations and analysis runs are immutable

A generation is keyed by repository stable ID, commit SHA, indexer bundle version, and configuration revision. Completing a newer generation MUST NOT mutate an older generation, edge, finding, or analysis result. Force-push creates a new occurrence.

**Violation:** a disputed finding cannot be reproduced because “current” state replaced its inputs.

### INV-3 — One versioned identity function owns each contract kind

Producer extraction, consumer extraction, rename following, diffing, join construction, suppression matching, and fingerprinting MUST call the same versioned canonicalization function for a contract kind.

**Violation:** the same endpoint or symbol acquires different keys in different phases.

### INV-4 — Confidence, coverage, freshness, and compatibility are separate fields

No field named `score` may implicitly combine them. Confidence describes a calibrated evidence stratum; coverage describes which eligible inputs were processed; freshness describes snapshot age/provider reachability; compatibility describes the producer change.

**Violation:** an unread repository and a compatible change both look “low confidence.”

### INV-5 — Positive evidence survives unrelated partial coverage; negative assurance does not

A structurally valid positive join MAY be emitted when unrelated files, languages, or repositories were not analysed. A removal or “no affected consumer found” conclusion MUST be withheld when the missing input could change that conclusion. Coverage dependency is evaluated per claim, not per whole run.

**Violation:** partial coverage either erases true positives or manufactures false safety.

### INV-6 — Evidence combination is explicit, conservative, and calibrated

Every finding designates one primary evidence path. For a composite path in which every step is required, the delivery class is limited by the weakest required step. Optional supporting evidence MUST NOT raise or lower the class. Multiple signals may form a new evidence stratum only after that exact combination is labelled and promoted. Correlated signals from the same parser, key, or artifact MUST NOT be counted as independent corroboration.

**Violation:** a weak co-change signal downgrades an exact symbol link, or two copies of one heuristic masquerade as independent proof.

### INV-7 — A model cannot originate or strengthen a structural claim

LLMs and embeddings MAY retrieve or summarize already selected evidence. A model MAY recommend downgrade, abstention, or explanation. It MUST NOT create a definition, reference, change, edge, finding, label, confidence promotion, or disclosure decision.

**Violation:** the system evaluates its own guesses and loses the artifact chain required by INV-1.

### INV-8 — Workspace membership is explicit and versioned

Repositories enter an analysed set through an operator action or provider installation selection. Membership, collection/team assignment, service registry revision, and consent revision are snapshotted into every analysis. Discovery MAY suggest repositories and MUST NOT silently add them.

**Violation:** “nothing else is affected” is asserted over a set the operator never chose.

### INV-9 — Read, retain, use, disclose, deliver, and research permissions are distinct

At minimum the authorization model MUST represent grants to:

1. read source;
2. retain derived artifacts;
3. use a repository as consumer evidence;
4. disclose repository identity;
5. disclose contract identity;
6. disclose path/range/snippet;
7. publish a check into the producer repository;
8. notify or write to the consumer repository;
9. include cases in human evaluation or research.

No broader grant implies a narrower one unless the policy explicitly says so.

**Violation:** installation access becomes an accidental data-sharing agreement.

### INV-10 — Static PR output is safe for the entire producer-repository audience

A GitHub Check cannot personalize content by viewer. It MUST contain only facts approved for disclosure to every reader of the producer repository. Restricted details belong behind an authenticated, viewer-authorized projection. Repository existence itself is sensitive.

**Violation:** the check leaks a private repository or architecture edge to an unauthorized reader.

### INV-11 — The graph is temporal evidence, not a timeless fact table

Definitions, references, and edges belong to immutable generations. A current projection selects generations with `as_of`, `selected_at`, freshness, and invalidation reason. A complete new generation tombstones removed observations immediately; a TTL applies only when refresh evidence is absent. Historical observations are retained according to policy rather than rewritten as inactive.

**Violation:** stale edges accumulate or historical analyses silently change.

### INV-12 — Finding identity includes the consumer

A stable finding fingerprint MUST include workspace, producer repository, contract kind, canonical contract key, change kind, consumer repository, stable consumer reference, and policy major version. PR/base/head identify an occurrence; line numbers and display text are evidence, not identity.

**Violation:** two affected repositories collapse into one finding, or a line move creates a new one.

### INV-13 — Human decisions are append-only and multi-axis

Review records MUST append a new event with actor, authorization, timestamp, evidence versions, edge label, impact label, action label, reason, optional suppression, and optional superseded event. Structural findings are never mutated into agreement with a reviewer.

**Violation:** detector history and human judgement become indistinguishable.

### INV-14 — Every adapter/evidence stratum earns external delivery

A new or materially changed adapter, identity function, join strategy, language pair, or evidence composition starts `UNMEASURED` and is preview-only. Promotion requires the current version's recorded evaluation. It does not inherit another version's calibration.

**Violation:** the first working demo becomes an unmeasured customer check.

### INV-15 — Reference delivery never blocks a merge

The GitHub reference host uses completed `success`, `neutral`, or `skipped` conclusions. Findings and incomplete analyses complete as `neutral`; they MUST NOT remain pending beyond the hard budget. Reverb MUST NOT configure branch protection or claim merge authority.

**Violation:** a prediction about code the author may not see stops delivery.

### INV-16 — Domain logic is pure; orchestration depends on ports

Canonicalization, diffing, joining, fingerprinting, policy evaluation, and rendering projections MUST be deterministic functions over explicit values. Application services MAY perform I/O only through documented ports. Concrete provider/storage/queue implementations MUST remain outside domain packages.

**Violation:** a second host must fork core logic or tests need a live network.

## 4. Functional requirements

### FR-1 — Workspace and authorization registry

**Priority:** P0  
**Invariants:** INV-8, INV-9, INV-10

The system MUST maintain versioned workspace membership, repository stable identity, collection/team assignment, service and deploy-unit identity, disclosure policy, and provider permissions.

**Acceptance criteria:**

- AC-1.1: adding, removing, or reclassifying a repository writes a new registry revision;
- AC-1.2: an analysis records the exact registry revision and repository membership snapshot;
- AC-1.3: provider discovery proposes but never automatically admits repositories;
- AC-1.4: service mappings support base hosts/tokens, path prefixes, package coordinates, schema IDs, broker namespaces, database-instance aliases, environment, validity interval, source, and owner;
- AC-1.5: authorization loss prevents new reads immediately and schedules derived-data deletion according to retention policy;
- AC-1.6: org-wide membership is opt-in; explicit collections are the default.

### FR-2 — Immutable repository indexing

**Priority:** P0  
**Invariants:** INV-2, INV-4, INV-5, INV-11, INV-16

The indexer MUST produce a deterministic generation for an exact commit without executing repository code.

**Acceptance criteria:**

- AC-2.1: generation identity includes repository stable ID, commit SHA, config revision, indexer bundle version, and source-provider revision where applicable;
- AC-2.2: file artifacts are content-addressed and unchanged files are reused by hash;
- AC-2.3: incremental indexing and a clean rebuild of the same inputs produce semantically identical artifacts;
- AC-2.4: symlinks, submodules, oversized/binary files, parse errors, unsupported languages, generated/vendored paths, and source truncation are recorded in coverage;
- AC-2.5: a failed generation never replaces the selected healthy generation;
- AC-2.6: deletion is represented by absence in a complete generation and explicit tombstones in overlays;
- AC-2.7: optional uploaded SCIP indexes are accepted only with source SHA, indexer/version, package metadata, and validation; baseline indexing never runs builds to create them.

### FR-3 — Contract adapter SDK and initial adapters

**Priority:** P0  
**Invariants:** INV-1, INV-3, INV-4, INV-7, INV-14

An adapter MUST define discovery, canonical identity, producer definitions, consumer references, compatibility diffing, activation semantics, coverage, evidence classes, limitations, and fixtures.

**Acceptance criteria:**

- AC-3.1: the SDK rejects an adapter without one identity function shared by definitions and references;
- AC-3.2: the first vertical slice implements TypeScript/npm symbols, OpenAPI operations, and Protobuf/gRPC;
- AC-3.3: external differs are version-pinned, network-denied, time-bounded, and recorded in evidence;
- AC-3.4: unresolved imports/refs and incompatible base/head extractor versions yield `unknown`, never “no breaking change”;
- AC-3.5: every change declares `compatibility` and `activation`: `immediate`, `on_deploy`, `on_publish`, `on_upgrade`, `on_regenerate`, or `unknown`;
- AC-3.6: synthetic fixtures validate mechanics; only human-labelled real cases calibrate delivery.

### FR-4 — Cross-repository join and temporal graph

**Priority:** P0  
**Invariants:** INV-1, INV-3, INV-6, INV-8, INV-11

The system MUST join producer definitions to consumer references through canonical keys and an explicit workspace/service registry.

**Acceptance criteria:**

- AC-4.1: exact structural, registry-resolved, heuristic, declared, and behavioural relationships remain distinct kinds;
- AC-4.2: declared or behavioural context cannot silently become structural evidence;
- AC-4.3: every edge stores producer generation, consumer generation, primary evidence path, evidence stratum key, first/last observation, and invalidation metadata;
- AC-4.4: complete consumer re-index removes a missing reference from the current projection immediately;
- AC-4.5: an unavailable consumer generation becomes stale/not-analysed, not unaffected;
- AC-4.6: direct impact is the default; transitive traversal is bounded and labelled separately;
- AC-4.7: the v1 relational adjacency model passes the target workload before another datastore is considered.

### FR-5 — Pull-request overlay analysis

**Priority:** P0  
**Invariants:** INV-2, INV-5, INV-11, INV-12, INV-15

The system MUST analyse the exact base and head SHAs of a pull request without replacing the default-branch generation.

**Acceptance criteria:**

- AC-5.1: changed, added, renamed, and deleted files form an immutable overlay over the base generation;
- AC-5.2: only touched artifact keys and their dependent joins are recomputed;
- AC-5.3: consumer generations and service-registry revision are selected and recorded at analysis start;
- AC-5.4: a force-push creates a new occurrence; an older run may finish internally but cannot publish as current;
- AC-5.5: on merge, the actual merge commit is indexed unless its tree hash exactly matches the analysed head projection;
- AC-5.6: missing base, truncated diff, absent submodule, parser failure, or required unresolved ref blocks any conclusion dependent on it;
- AC-5.7: fork PRs are parsed as untrusted data with no repository code execution and no fork-provided credentials.

### FR-6 — Coverage and analysis state

**Priority:** P0  
**Invariants:** INV-4, INV-5

Every result MUST expose a state machine and coverage vectors.

**Required states:**

`NOT_ANALYSED → NO_CANDIDATE | CANDIDATE → ABSTAINED | PREVIEW | DELIVERED → ADJUDICATED`

**Acceptance criteria:**

- AC-6.1: `NOT_ANALYSED`, `NO_CANDIDATE`, and `ABSTAINED` are distinguishable in every canonical output;
- AC-6.2: analysis coverage reports eligible/current/failed/unauthorized repositories; detected/supported/parsed languages; discovered/fetched/parsed/truncated changed files; discovered/diffed/unsupported contracts; current/stale/unresolved consumer edges; versions and known dynamic gaps;
- AC-6.3: selection coverage reports delivered divided by structurally eligible candidates;
- AC-6.4: label coverage reports usable human labels divided by sampled cases;
- AC-6.5: abstention uses a closed reason vocabulary and is never rendered as “no impact.”

### FR-7 — Findings, remedies, and disclosure projections

**Priority:** P0  
**Invariants:** INV-1, INV-9, INV-10, INV-12

A candidate finding MUST have a stable fingerprint, a claim triple, a primary evidence path, coverage dependencies, and a remedy template.

**Acceptance criteria:**

- AC-7.1: two consumers of one change produce two fingerprints;
- AC-7.2: moving a call site without changing its stable reference preserves the fingerprint;
- AC-7.3: a location-present annotation references only producer lines in the reviewed PR;
- AC-7.4: a static check includes consumer details only when the disclosure projection proves audience safety;
- AC-7.5: restricted details are omitted or represented by an approved redaction policy and are available only through authenticated, per-viewer authorization;
- AC-7.6: every delivered finding offers a concrete remedy: preserve compatibility, coordinate a consumer update, confirm dead/test-only use, or accept a timed risk.

### FR-8 — Human review and suppression

**Priority:** P0 before external checks  
**Invariants:** INV-12, INV-13, INV-14

Review MUST label edge, impact, and action separately and MAY create a future suppression.

**Acceptance criteria:**

- AC-8.1: labels use `confirmed|absent|indeterminate`, `breaking|behavior_risk|compatible|indeterminate`, and `coordinate|already_coordinated|accepted_risk|dead_or_test_only|no_action|indeterminate`;
- AC-8.2: workflow resolution, correctness label, risk acceptance, and suppression are separate records/fields;
- AC-8.3: suppression scopes are exact occurrence, stable finding, contract×consumer, repository-pair×kind, adapter rule, and admin-only workspace rule;
- AC-8.4: suppressions invalidate on relevant code/contract/identity/adapter/policy changes; time expiry is a fallback, not the only mechanism;
- AC-8.5: implicit behaviours such as merge, click, edit, or elapsed time are usefulness telemetry and cannot become ground-truth labels;
- AC-8.6: broad suppressions require authorized ownership, reason, audit event, and review date.

### FR-9 — Evaluation, calibration, and policy simulation

**Priority:** P0 before external checks  
**Invariants:** INV-4, INV-13, INV-14

Evaluation MUST report per evidence stratum and preserve organizations/repository pairs as clusters.

**Acceptance criteria:**

- AC-9.1: an unlabelled required case fails evaluation rather than being silently skipped;
- AC-9.2: synthetic and mutation cases are reported as capability/regression evaluation, not real-world precision;
- AC-9.3: primary metrics include edge precision, impact precision, actionable precision, known-break recall, false-omission audit, risk–coverage curve, analysis/selection/label coverage, findings per 1,000 eligible PRs, p50/p95/p99 latency, and cost;
- AC-9.4: no pooled headline or promotion decision hides per-stratum results; transparent weighted or hierarchical secondary research analysis remains allowed;
- AC-9.5: the policy simulator replays a frozen analysis corpus without rerunning nondeterministic providers;
- AC-9.6: adapter/extractor/identity changes invalidate inherited promotion unless an explicit compatibility evaluation says otherwise.

**Default advisory-promotion policy:**

- at least 100 independently human-labelled delivered-eligible findings in the stratum;
- 95% Wilson lower bound for actionable precision at or above 0.90;
- edge-precision lower bound at or above 0.95;
- at least 100 sampled no-finding PRs audited or an approved alternative false-omission design;
- no unresolved confidentiality defect;
- no required coverage defect capable of manufacturing a removal;
- no more than 50 alerted PRs per 1,000 eligible PRs under replay, unless the workspace explicitly approves another budget;
- p95 completed analysis at or below 10 minutes on the target profile;
- every delivered outcome has a remedy.

These values are initial product gates, not universal scientific constants. A change requires a versioned policy decision and replay.

### FR-10 — Delivery surfaces

**Priority:** P1 after FR-9 promotion  
**Invariants:** INV-10, INV-14, INV-15

The system MUST support local/JSON preview before it supports the GitHub Check.

**Acceptance criteria:**

- AC-10.1: one idempotent check exists per installation/repository/PR/head SHA/policy revision;
- AC-10.2: no delivered finding completes `success`; findings or incomplete coverage complete `neutral`; out-of-scope completes `skipped`;
- AC-10.3: the hard deadline completes a partial neutral result rather than leaving a pending check;
- AC-10.4: each force-push makes prior output visibly superseded and prevents stale actions;
- AC-10.5: output limits and pagination preserve total counts and provide an authenticated detail link;
- AC-10.6: check requested-actions or feedback links perform fresh authorization and append review/workflow events;
- AC-10.7: dashboard/preview remains an evaluation and detail surface, not the only place author-facing findings are delivered.

### FR-11 — Public packages and host conformance

**Priority:** P1  
**Invariants:** INV-16

The project MUST publish a host-neutral core, schemas, adapter SDK, CLI/reference host, and conformance suite under the packaging plan.

**Acceptance criteria:**

- AC-11.1: local Git/filesystem/SQLite and GitHub/Postgres hosts pass identical domain conformance tests;
- AC-11.2: wire schemas are versioned independently from package versions and follow additive compatibility within a major version;
- AC-11.3: the core imports no GitHub, database, queue, web framework, LLM, or vector-search client;
- AC-11.4: Apache-2.0 code contains no copied/adapted AGPL/SSPL/BSL source; dependency license checks run in CI;
- AC-11.5: a Yanib integration consumes versioned output through ports/SDK rather than reading reference-host tables.

## 5. Non-functional requirements

### NFR-1 — Security and isolation

- tenant/workspace identity MUST be present in every persisted key and job;
- the hosted adapter MUST enforce row-level or equivalent storage isolation;
- source parsers and external differs MUST be isolated, network-denied, resource-bounded, and supplied no ambient provider credentials;
- provider installation tokens MUST be minted just in time and never persisted;
- telemetry MUST use a property-name allowlist and contain no source, path, symbol, contract identity, embedding, secret, or repository identity;
- uninstall and authorization loss MUST be auditable and propagate deletion to caches, objects, vectors, and derived projections.

### NFR-2 — Reproducibility

Canonical structural analysis MUST be deterministic for recorded inputs. Optional model explanation is a separately versioned, cached projection and MUST NOT be required to reproduce finding identity or policy outcome.

### NFR-3 — Performance budgets

Initial target profile: 100 repositories, five million indexed source lines, 25 active PR analyses, and a typical PR changing at most 50 files.

- webhook acknowledgement: under 10 seconds;
- warm PR analysis p50: at most 2 minutes;
- warm PR analysis p95: at most 10 minutes;
- hard external completion: 15 minutes with neutral incomplete output;
- incremental work MUST scale primarily with changed artifacts plus touched join keys, not total workspace files;
- target-profile indexes MUST be usable with PostgreSQL alone; another datastore requires an ADR with measured evidence.

These are design targets and release gates, not current performance claims.

### NFR-4 — Availability and idempotency

Webhook deliveries, index jobs, analysis jobs, and check writes MUST be idempotent. GitHub delivery IDs and stable job keys are deduplicated. A job may run at least once; state transitions and external writes behave exactly once from the user's perspective.

### NFR-5 — Compatibility and migration

Stored artifacts carry schema version, producer package version, adapter versions, identity version, and config revision. Readers MUST reject incompatible major versions with a teaching error. Migrations MUST be forward-only, tested from the oldest supported version, and leave immutable source artifacts recoverable.

### NFR-6 — Cost visibility

Every run records CPU time, wall time, bytes fetched, bytes stored, cache hits, adapter durations, queue time, and optional model/vector cost without identifiers. Policy simulation reports estimated external check volume and compute cost.

### NFR-7 — Accessibility and human factors

Any review UI MUST be keyboard accessible, use text in addition to colour for evidence/state, expose coverage and redaction clearly, and avoid requiring a graph visualization to understand a finding.

## 6. Canonical state and vocabularies

### 6.1 Analysis state

```text
NOT_ANALYSED
NO_CANDIDATE
CANDIDATE
ABSTAINED
PREVIEW
DELIVERED
ADJUDICATED
```

### 6.2 Abstention reasons

```text
unsupported_language
incomplete_index
stale_consumer_generation
ambiguous_contract_identity
dynamic_or_reflective_use
insufficient_change_semantics
incompatible_artifact_versions
below_delivery_threshold
privacy_restricted
execution_budget_exceeded
```

### 6.3 Compatibility

```text
breaking
potentially_breaking
compatible
unknown
```

### 6.4 Activation

```text
immediate
on_deploy
on_publish
on_upgrade
on_regenerate
unknown
```

### 6.5 Evidence families

```text
exact_schema
exact_symbol
registry_resolved
heuristic_structural
declared_context
behavioral_context
```

Exact evidence names the observed fact; “high/medium/low” is a current calibration/policy projection, not stored ontology.

## 7. Export formats

Reverb's versioned JSON schema is canonical. SARIF MAY be exported for compatible consumers, but it MUST NOT be the sole internal or wire representation. SARIF 2.1.0 has no interoperable confidence or partial-analysis coverage vocabulary; custom `properties` can carry Reverb metadata, but generic consumers will not understand it. SARIF result `rank` is 0–100 and is not generally comparable across tools.

## 8. Success metrics

Metrics are reported per contract kind, evidence stratum, language pair, adapter version, and organization where sample size permits:

- edge, impact, and actionable precision with intervals;
- recall on known breakages and false-omission audits;
- analysis, selection, and label coverage;
- risk–coverage curve;
- alerted PRs and findings per 1,000 eligible PRs;
- reviewer/team alert burden per week;
- p50/p95/p99 completed latency and superseded/timeout rates;
- time to first coordination action and action rate, clearly labelled usefulness rather than correctness;
- disclosure/redaction defects, with a release target of zero;
- compute, storage, and optional model cost.

## 9. Phase ownership

| Requirement | Owning phase |
| --- | --- |
| FR-1 workspace/authorization registry | 001 foundation, completed in 003 registry and 005 provider sync |
| FR-2 immutable indexing | 001 |
| FR-3 adapter SDK and initial adapters | 002 |
| FR-4 cross-repository join/graph | 003 |
| FR-5 PR overlays | 001 primitives, 003 orchestration |
| FR-6 coverage/state | 001 schema, all phases produce it |
| FR-7 findings/remedies/disclosure projections | 003 schema, 005 rendering |
| FR-8 review/suppression | 004 |
| FR-9 evaluation/calibration/policy | 004 |
| FR-10 delivery | 005 |
| FR-11 packages/conformance/Yanib | 006 |

## 10. Open decisions

No decision required to begin Phase 001. The following are intentionally deferred behind evidence:

- whether the hosted reference deployment needs object storage at the target profile;
- whether Postgres full-text search is insufficient for operator retrieval;
- whether uploaded SCIP indexes justify a default precision lane;
- which contract kind follows the first three adapters;
- whether a model adjudicator produces enough selective-risk improvement to justify data export and nondeterminism;
- whether the product name passes publisher, domain, and trademark clearance.

Each requires an ADR and does not authorize a placeholder abstraction in advance.
