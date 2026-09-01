# Changelog

All notable changes to Reverb will be documented here.

The project follows Semantic Versioning after 1.0. Before 1.0, schema major changes remain
explicit and package breaking changes may occur in minor releases.

## Unreleased

- Fixed path-sensitive artifact-cache collisions and added exact workspace/repository/revision and
  Git-response scope checks for indexing, overlays, and pull-request analysis.
- Fixed GitHub authorization and reconciliation after provider access changes, including dependent
  service/alias pruning and purge work for repositories omitted from provider scope.
- Added supported TypeScript local/default export extraction, OpenAPI path-item reference
  resolution, order-independent adapter fingerprints, and fail-closed malformed JSON detection.
- Fixed Windows quality and release verification for path boundaries, line endings, pnpm child
  processes, CLI fixtures, and tar archive paths.

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
