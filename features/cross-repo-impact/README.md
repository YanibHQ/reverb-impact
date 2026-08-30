# Cross-Repository Pull-Request Impact

<img src="../../docs/assets/reverb-logo.png" alt="Reverb logo" width="112" align="right" />

**Type:** standalone public product owned by `YanibHQ`  
**Status:** Standalone release candidate—Phases 000–006 implemented locally  
**Working product name:** Reverb

## What this feature is

Reverb detects whether a pull request changes a contract used by code in the same repository or another repository in an explicitly configured engineering workspace.

A finding is not “repository B depends on repository A.” It is:

> This pull request removes `GET /v1/invoices/{id}` from `payments-api`. `web-checkout` calls that exact operation at `src/api/invoices.ts:42`. The call is resolved through the workspace service registry. Keep the route, coordinate the consumer change, or mark the call site dead.

The producer change, consumer use, join, analysed commit of each repository, and analysis limitations are all part of the finding.

## Why this is a standalone project

Reverb is a reusable structural-evidence engine owned in the `YanibHQ` organization. It is not
coupled to Yanib's code, database, deployment, or release train; any future product integration must
consume Reverb through its public packages or host protocol.

Reverb is therefore designed as:

- a public, host-neutral core;
- a local CLI and self-hostable reference service;
- a GitHub App reference adapter;
- versioned JSON schemas and an extension SDK;
- the first external engine dependency Yanib can adopt, without coupling Reverb to Yanib's database.

## The current competitive truth

Repowise already provides local multi-repository workspaces, HTTP/gRPC/topic/data contract extraction, provider-consumer matching, package dependency scanning, blast radius, and a breaking-change guard. The current implementation indexes repositories under a common local workspace, persists per-repository SQLite indexes and shared JSON artifacts, compares the previous workspace contract store with the current store, and exposes results through CLI, REST, MCP, and a hosted PR bot.

That invalidates the original “Repowise but cross-repo” framing. Reverb's reason to exist is the remaining product and research boundary:

| Dimension | Repowise current workspace | Reverb target |
| --- | --- | --- |
| Repository set | Local workspace paths | Provider installation and explicit workspace membership |
| Change baseline | Previous persisted workspace scan | Exact pull-request base SHA and head SHA |
| Consumer state | Current local scans, potentially at different commits | Every consumer commit and freshness state recorded in the analysis run |
| Finding authority | Extractor confidence and contract-link matching | Versioned evidence class, adapter calibration, coverage, and delivery policy |
| Review loop | Product output; no documented append-only label protocol | Human-labelled corpus, append-only review, expiring suppressions, policy replay |
| Disclosure | Local operator controls the workspace | Static check content obeys cross-repo visibility and explicit disclosure consent |
| Embedding | AGPL-3.0-or-later or commercial license | Apache-2.0 core and stable host ports |
| Research target | Broad codebase intelligence | Measured, multi-contract, PR-time cross-repo impact and abstention |

This table is a product boundary, not a claim that Repowise is deficient. Reverb should be discontinued or repositioned if it cannot demonstrate a material advantage on the measured PR-time task.

## Users

### Pull-request author

Needs to know before merge whether a change requires coordination outside the repository. The author must see what changed, which consumer is affected when disclosure permits it, why Reverb believes the edge exists, and a concrete next action.

### Consumer owner

Needs protection from an upstream change without maintaining a second hand-written dependency map. The owner controls whether their repository may be indexed, disclosed in another repository, or written to.

### Platform engineer

Needs explicit coverage, stale-index diagnostics, reproducible analyses, bounded latency, and a policy simulator before enabling PR output.

### Adapter author

Needs a small contract: canonical producer identity, consumer references, compatibility semantics, evidence class, coverage accounting, and fixtures. They should not need to know GitHub, SQLite, Postgres, or Yanib.

### Researcher

Needs a labelled, versioned, non-self-referential corpus and a protocol that separates extraction accuracy, join accuracy, compatibility classification, and deployed usefulness.

## Product principles

1. **Evidence before inference.** Every delivered finding has a producer artifact and at least one consumer artifact. A model cannot originate it.
2. **No negative claim without coverage.** “No affected consumer found” is meaningful only alongside what was indexed, skipped, stale, or unsupported.
3. **PR snapshots are immutable.** Results name exact SHAs and adapter versions. A re-index creates a new run; it never mutates history.
4. **Confidence is about evidence; coverage is about looking.** They are recorded and evaluated separately.
5. **Abstention is a successful outcome.** An incomplete producer diff, ambiguous service identity, incompatible extractor versions, or unreadable schema produces `unknown`, not a clean pass.
6. **Advisory forever.** The reference product does not block merges.
7. **Disclosure is separate from indexing.** Reading a private consumer does not automatically permit naming it elsewhere.
8. **The core stays host-neutral.** Git providers, clocks, queues, persistence, and telemetry are ports.
9. **Adapters earn delivery.** A new adapter is preview-only until its evidence class has a human-labelled measurement and an actionable remedy.
10. **Semantic retrieval is not proof.** Embeddings and LLMs may help explore or explain structural evidence; neither may create an impact edge.

## Representative scenarios

### TypeScript package export removal

Repository `ui-kit` removes the exported `DatePicker` symbol. Repository `admin-web` imports it from `@acme/ui-kit/date`. The consumer lockfile points at a released version, so Reverb reports an **upgrade-time** risk, not an immediate production break. The remedy is to retain the export through the deprecation window or coordinate the next consumer upgrade.

### HTTP endpoint removal

Repository `payments-api` removes `POST /v1/refunds`. `support-console` calls a generated client method whose OpenAPI `operationId` resolves to that route. Reverb reports a high-evidence, **deployment-time** risk. If the consumer uses a hand-assembled URL with an unresolved base, the candidate stays preview-only.

### Protobuf wire break

A PR reuses a field number in a request message. The Protobuf adapter delegates compatibility semantics to a pinned `buf` rule set and resolves the generated client dependency in two consumer repositories. The finding records both consumers and the differ version.

### Incomplete analysis

The base snapshot is complete, but the head archive omits a required submodule and an imported OpenAPI component cannot be resolved. Reverb does not infer removal from absence. The result is `unknown` with explicit coverage gaps.

### Restricted consumer

A public producer has a private internal consumer. The app may index both, but the public check cannot reveal the consumer's existence. Authorized APIs retain the edge; the check redacts or omits it according to workspace policy.

### Coordinated change

An upstream PR removes a route while an approved downstream PR updates the consumer. The finding remains structurally true and is reviewed as `coordinated_change`, not `false_positive`.

## Contract kinds

The complete taxonomy is in [research/contract-taxonomy.md](research/contract-taxonomy.md). Admission is staged:

| Release | Contract kinds | Why |
| --- | --- | --- |
| v0 vertical slice | TypeScript/npm public symbols; OpenAPI operations; Protobuf/gRPC | One code-symbol lane and two specification-backed lanes with canonical identities and existing compatibility tools |
| v1 candidates | GraphQL operations; HTTP framework routes; messaging schemas/topics | High value, but HTTP and topic joins need a service registry and calibration |
| Later | shared database schemas; environment/config keys; Terraform modules; more package ecosystems | Useful, but physical-resource identity and activation timing are harder than syntax |
| Integrate, do not duplicate | Bazel/Nx/Pants/Turborepo; SCIP; `buf`; `oasdiff`; GraphQL Inspector | These are inputs or classifiers, not systems to reimplement |
| Indefinite deferral | arbitrary CLI strings; LLM-only dependencies; dynamic runtime coupling | Consumer evidence is too weak for PR delivery without a different signal |

## Architecture at a glance

```text
Git provider webhook / CLI request
             |
             v
RepositoryReader --> immutable base generation ----+
             |                                      |
             +--> PR head overlay (changed files) --+--> contract changes
                                                        |
Current consumer generations --> definitions + references --> evidence joins
                                                        |
                                      coverage + policy + disclosure
                                                        |
                         preview / API / advisory GitHub Check
```

The graph is a projection over immutable generations, not a mutable oracle. “Current edge” means “observed in the selected generation of both repositories.” Staleness is derived from generation age and provider state, never hidden in an `active` boolean.

## Phase map

| Phase | Delivers | Exit gate |
| --- | --- | --- |
| [001 — Repository index](phases/001-repository-index/) | Ports, immutable generations, file cache, coverage, local SQLite store | Reproducible index; incremental result equals clean rebuild |
| [002 — Contract change detection](phases/002-contract-change-detection/) | Adapter SDK, canonical keys, initial adapters, compatibility and activation semantics | Stable base/head changes across three adapters |
| [003 — Cross-repo impact graph](phases/003-cross-repo-impact-graph/) **Implemented locally** | Workspace registry, definitions/references, joins, PR overlays, evidence | Real producer-consumer pairs resolve with exact SHAs |
| [004 — Precision and review](phases/004-precision-and-review/) | Labels, evaluation, calibration, abstention, suppressions, policy simulation | One evidence class clears its human-labelled promotion threshold |
| [005 — Delivery surfaces](phases/005-delivery-surfaces/) | CLI preview, API, GitHub App, disclosure-safe advisory checks | Shadow rollout meets latency, noise, disclosure, and rollback gates |
| [006 — Host adapters](phases/006-host-adapters/) | Stable packages, Postgres adapter, second-host proof, Yanib guide | Two hosts pass one conformance suite |

## What “done” means

The project is ready for a public v1 when:

- a PR is analysed against its exact base and head SHAs;
- every consumer result records its exact SHA and freshness;
- positive findings link to inspectable producer and consumer evidence;
- incomplete inputs cannot become removal findings or clean negatives;
- recorded inputs reproduce structural findings;
- at least one evidence class has a human-labelled precision interval above its published threshold;
- the GitHub App runs in shadow mode before checks are enabled;
- checks never expose repository metadata or source without disclosure permission;
- suppressions expire and review decisions are append-only;
- local SQLite and a second storage/host adapter pass one conformance suite;
- no LLM, embedding model, or hosted service is required;
- public and paper claims distinguish demonstrated results from hypotheses.

## Main risks

| Risk | Consequence | Control |
| --- | --- | --- |
| Repowise closes the remaining gap | Reverb duplicates a stronger tool | Benchmark early; stop/reposition gate in Phase 003 |
| Service identity is wrong | Confident false positive | Explicit registry; ambiguous bases abstain or stay preview-only |
| Head extraction is incomplete | False removal | Removal requires complete base/head coverage for the adapter and identity scope |
| Consumer indexes are stale | Missed call sites | Freshness SLO, exact SHA, on-demand refresh budget, `not_analysed` state |
| Private metadata leaks | Security incident | Separate disclosure consent, audience-safe rendering, redaction tests |
| Adapter breadth outruns measurement | Noisy check | Admission gate, per-class promotion, alerts-per-PR budget, auto-demotion |
| Infrastructure becomes the product | Cost without better findings | SQL adjacency first; no graph/vector database until measurements demand it |
| Action rate is called precision | Misleading claims | Separate behavioural outcomes, correctness labels, and coverage |

## Documentation

| Area | Document |
| --- | --- |
| Rules and requirements | [spec.md](spec.md) |
| Components and algorithms | [architecture.md](architecture.md) |
| Decisions and sequencing | [plan.md](plan.md) |
| Requirement-to-task traceability | [tasks.md](tasks.md) |
| Interfaces | [api.md](api.md) |
| Threat model and consent | [security.md](security.md) |
| Packages, license, compatibility, Yanib | [packaging.md](packaging.md) |
| Terminology | [glossary.md](glossary.md) |
| Research and paper | [research/](research/) |
