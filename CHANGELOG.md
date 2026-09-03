# Changelog

All notable changes to Reverb will be documented here.

The project follows Semantic Versioning after 1.0. Before 1.0, schema major changes remain
explicit and package breaking changes may occur in minor releases.

## Unreleased

## 0.5.0 - 2026-09-02

- Added negotiated schema-major 2 analysis with immutable producer-plus-allowlist scope provenance,
  exact membership/authorization/consent decisions, per-repository/per-family coverage, and hard
  execution budgets while preserving schema-major 1 and the existing `AnalyzePullRequest` path.
- Added independent events/queues, shared database, implicit HTTP, configuration/feature-flag, and
  infrastructure/deployment adapters with versioned identities, bounded static extraction,
  compatibility, incremental invalidation, exact same-repository/cross-repository evidence, and
  truthful partial coverage.
- Added additive SQLite migration 8 and PostgreSQL migration 4 for v2 scopes, analysis results, and
  redacted reasoning runs. Existing 0.4.0 records remain readable; downgrade requires restoration of
  a pre-upgrade backup.
- Added `@yanib/reverb-reasoning`, an optional provider-neutral lane with scoped one-batch retrieval,
  repository-level model consent, secret minimization, closed request/response schemas, two-sided
  citation verification, independent budgets/timeouts/circuit breaking, and deterministic failure
  isolation. No model provider is bundled or enabled.
- Added reasoning lifecycle storage that retains exact citation/provenance hashes but not excerpts,
  prompts, raw responses, credentials, or secret values. Purge removes reasoning citations and
  hypotheses from both the run and analysis while retaining deterministic findings.
- Preserved every documented 0.4.0 public export, schema-major 1 digest, existing adapter identity,
  deterministic golden, and frozen host compile fixture.
- Expanded release verification to all 19 public packages, both packed v0.4/v2 host fixtures, every
  root import, CLI version smoke, fixed internal dependencies, SHA-256 checksums, a 45-component
  CycloneDX SBOM, and machine-readable release provenance.
- Kept all new evidence strata `UNMEASURED` and preview-only. npm publication, GitHub release,
  deployment, production migrations, provider enablement, and Yanib integration remain separate
  approval-gated actions.

## 0.4.0 - 2026-09-02

- Added repository-scoped TypeScript module definitions and static references for same-repository
  pull-request impact analysis without conflating private modules with npm-public contracts.
- Added deterministic relative and `compilerOptions.paths` module resolution from persisted bounded
  `tsconfig`/`jsconfig` facts, including changed-blob-only incremental equivalence.
- Added hash-only implementation evidence so internal function, class, and variable behavior edits
  become potentially breaking current-runtime review candidates without persisting source bodies.
- Preserved one stable evidence reference per importing module and added static resolution for
  literal dynamic imports with named destructuring.
- Advanced the TypeScript adapter to 0.3.0 and partitioning version 2. TypeScript snapshots require
  re-indexing; canonical npm identities remain on identity version 1.

## 0.3.0 - 2026-09-01

- Published all 13 packages through the trusted GitHub Actions npm publisher with signed provenance.
- Added Protobuf partitioning v1: one normalized method/field fact partition per discovered
  descriptor-set artifact, changed-blob discovery, replacements/tombstones, and clean-versus-
  incremental equivalence for edits, additions, deletions, renames, and non-descriptor changes.
- Advanced the Protobuf adapter manifest to 0.2.0 and included it in the declared adapter re-index.
- Added OpenAPI partitioning v1: one normalized document-fact partition per discovered spec,
  changed-blob content discovery, document replacement/tombstones, and clean-versus-incremental
  equivalence for edits, additions, deletions, renames, and non-spec changes.
- Advanced the OpenAPI adapter manifest to 0.2.0 and included it in the declared adapter re-index.
- Added TypeScript/npm partitioning v1: package-scoped persisted AST-derived facts, changed-blob
  delta updates, fail-closed missing-input handling, and clean-versus-incremental equivalence for
  edits, additions, deletions, renames, barrel changes, imports, and package metadata.
- Advanced the TypeScript adapter manifest to 0.2.0 so older semantic snapshots cannot be reused
  across the incremental state boundary.
- Added the `IncrementalContractAdapter` partition lifecycle, deterministic path-ownership and
  reverse-dependency invalidation planning, and fail-closed handling for unowned changed paths.
- Added `BudgetedRepositoryReader`, which atomically enforces per-run metadata-call, blob-read, and
  byte ceilings without widening the provider source set.
- Added workspace-scoped, content-addressed adapter semantic partitions and immutable generation
  snapshot manifests with base-plus-delta resolution, compatibility validation, and shared
  in-memory/SQLite conformance.
- Added SQLite migration 007 for adapter partitions and generation snapshots.
- Added immutable, non-selected derived-generation provenance over an exact base generation and
  completed pull-request overlay, with logical artifact resolution that requires no provider source
  reads or duplicated base artifact rows.
- Added in-memory and SQLite generation-store conformance for base-plus-overlay derivation, SQLite
  migration 006, and the optional canonical generation `derivation` envelope.

## 0.2.0 - 2026-08-31

- Added exact same-repository producer-as-consumer analysis through a required, scope-validated
  pull-request head contract observation.
- Added regression and CLI integration coverage proving live same-repository references are found,
  deleted head references disappear, and mismatched head evidence fails closed.
- Added durable hosted runtime composition from signed GitHub webhook pointers through reclaimable
  PostgreSQL inbox/job leases, canonical analysis/review records, and delivery outbox effects.
- Added canonical analysis, authorized review, and current-head/reauthorized GitHub check adapters,
  with read/write kill switches that retain queued work.
- Added PostgreSQL migration 3 for webhook worker leases and immutable canonical-record conflict
  detection, with in-memory fault tests and a real signed-webhook-to-delivery database test.
- Added Phase 007/008 specifications, embedding guidance, compatibility metadata, and hosted
  operations documentation. No Yanib source code or data is accessed.

## 0.1.0 - 2026-08-31

- Published the host-neutral libraries under the personal npm scope `@yanib` and the CLI as
  `reverb-impact`.
- Added the primary Reverb logo and brand-asset usage/provenance guidance.
- Established the standalone Apache-2.0 project constitution.
- Added the Node 24 and pnpm monorepo foundation.
- Added opaque domain values, canonical JSON/SHA-256 hashing, closed vocabularies, runtime JSON
  Schema validation, and a revisioned workspace/service/consent registry.
- Added complete host-neutral ports, deterministic fakes, and reusable generation-store
  conformance tests.
- Added the exact-SHA local Git reader, SQLite generation/overlay store, content-addressed cache,
  immutable generation orchestration, incremental reuse, overlay tombstones, and coverage.
- Added the `reverb` local CLI with init, workspace membership, registry validation, indexing,
  status, and doctor commands.
- Added integration, seeded equivalence, migration, adversarial, telemetry-canary, package, SBOM,
  license, vulnerability, and provenance verification.
- Added the versioned adapter SDK with strict manifest/output validation, canonical identities,
  deterministic extraction/diff hashing, coverage, activation, remedies, admission reports, and a
  network-denied external-differ boundary.
- Added preview-only TypeScript/npm, OpenAPI, and Protobuf/gRPC adapters with unit, integration,
  conformance, adversarial, compatibility-direction, and native-tool license/integrity fixtures.
- Added valid-time registry resolution, immutable contract observations, temporal evidence edges,
  exact/registry/heuristic join lanes, service-edge materialization, and SQLite migration 004.
- Added exact base/head PR analysis with complete consumer-state selection, bounded refresh,
  coverage abstention, consumer-specific fingerprints, force-push supersession, and separate
  bounded transitive context.
- Added `reverb analyze`, `reverb finding show`, registry service/alias commands, canonical JSON
  preview pagination, richer status/doctor output, and a real multi-repository Git CLI test.
- Executed current Repowise 0.46.0 and reduced Phase 003 baselines, recorded contract-link parity on
  the shared fixture, and accepted the continue/interoperate decision in ADR-0002.
- Added Phase 004 append-only three-axis reviews, six structurally invalidated suppression scopes,
  corpus sampling/adjudication, per-stratum evaluation, deterministic policy simulation,
  promotion/demotion audit records, SQLite migration 005, canonical schemas, and local review CLI.
- Recorded the honest Phase 004 decision that all initial strata remain `UNMEASURED` and
  preview-only because no authorized independently labeled real-world corpus exists.
- Added Phase 005 PostgreSQL hosted-control migrations, forced workspace RLS, durable webhook/job/
  outbox state, disclosure projections, backup/restore, purge, and real database integration tests.
- Added the minimum-permission GitHub host, exact raw webhook validation, exact-Git/token boundary,
  selected-repository sync, authorization/disclosure matrix, accessible detail/review surface,
  advisory-only check projection/writer, kill switches, reconciliation, and fork-source security
  tests. External delivery remains disabled because no stratum is promoted.
- Stabilized documented root-only public package APIs, schema-major compatibility teaching errors,
  migration/re-index/calibration metadata, and automated API/host-capability/release checks.
- Published host conformance v1 across PostgreSQL, SQLite, and an independent minimal in-memory
  host, including duplicate, immutable-conflict, supersession-pointer, workspace-isolation, state,
  coverage, abstention, and declared deletion behavior.
- Added PostgreSQL migration 2 for workspace-scoped mutable canonical pointers, with a real
  migration-1 upgrade test, backup/restore, RLS, and repository purge coverage.
- Added consent-gated, temporal `declared_context` imports that cannot originate structural edges,
  plus single-owner GitHub check configuration enforcement.
- Added public API/versioning/self-host/adapter-contribution/research-status documentation and a
  checksum-addressed Phase 006 release benchmark. No Yanib code or data is accessed.
