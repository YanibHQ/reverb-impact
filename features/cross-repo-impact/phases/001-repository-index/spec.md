# Phase 001 Specification

**Parent invariants:** INV-2, INV-4, INV-5, INV-8, INV-9, INV-11, INV-16

## P1-FR-1 — Domain and schema foundation

Define opaque values for workspace, repository, SHA, content hash, generation, overlay, registry/config version, adapter, evidence, and coverage. Publish runtime-validated JSON Schemas.

**Acceptance criteria:**

- every value round-trips canonical JSON;
- malformed IDs, SHAs, paths, hashes, enum states, and unknown schema majors fail with stable error codes;
- repository path normalization rejects absolute, escaping, NUL, and noncanonical traversal segments;
- timestamps are explicit UTC instants supplied through `Clock` where created;
- schema generation is deterministic and checked into `schemas/`.

## P1-FR-2 — Complete ports before host logic

Define `RepositoryReader`, `GenerationStore`, `EvidenceStore`, `WorkspaceRegistry`, `AuthorizationPort`, `JobQueue`, `CancellationPort`, `Clock`, `SandboxRunner`, `DeliveryWriter`, `ArtifactBlobStore`, and `TelemetryPort`.

**Acceptance criteria:**

- application use cases compile against fakes with no concrete adapter;
- a dependency test rejects host imports in domain;
- ports distinguish domain failure, infrastructure failure, authorization denial, incomplete provider data, and cancellation;
- source/diff results carry completeness/limitations rather than returning naked arrays;
- conformance fixtures are reusable by local and future hosted adapters.

## P1-FR-3 — Registry foundation

Store versioned workspace membership, repository identity, service/deploy-unit identity/aliases, collections, and action-specific consent/disclosure grants.

**Acceptance criteria:**

- every mutation creates an immutable revision with actor/source/reason/hash;
- analyses can request a revision; `current` resolves once at start;
- discovery never writes membership without explicit action;
- ambiguous aliases and overlapping validity produce diagnostics;
- unknown repository/service references fail validation;
- local YAML/JSON config round-trips without losing unknown future optional fields within the supported schema major.

## P1-FR-4 — Immutable generation lifecycle

Generation states are `building`, `complete`, `partial`, `failed`, `expired`. Only complete/eligible partial generations may be selected.

**Acceptance criteria:**

- identity is repository + SHA + bundle + config;
- leases make duplicate work idempotent;
- artifact batches are invisible through selected-generation queries until atomic completion;
- failed/expired leases cannot replace the last healthy selection;
- content/tree hashes and versions are recorded;
- infrastructure corruption fails the generation; expected file/adapter limitations contribute partial coverage.

## P1-FR-5 — Safe source traversal and artifacts

Index an exact commit without executing repository code.

**Acceptance criteria:**

- tree/blob reads are bounded and path-root validated;
- binary, large, generated, vendored, submodule, symlink, unsupported, unreadable, and parse-failed files receive classifications/coverage;
- unchanged artifact reuse requires content hash plus compatible parser/adapter/config versions;
- no source identifier/content enters general telemetry;
- raw source retention follows host policy and defaults to ephemeral.

## P1-FR-6 — Incremental equivalence

Incremental generation is an optimization of a full logical generation.

**Acceptance criteria:**

- changed/added/deleted/renamed files update artifacts predictably;
- no persisted row is reused without source generation/version stamps;
- randomized edit sequences compare incremental result with a clean rebuild;
- config/parser bundle changes invalidate incompatible reuse;
- scheduled full-rebuild comparison emits a hard diagnostic on divergence.

## P1-FR-7 — Overlay primitives

Represent head state as immutable replacement/tombstone entries over an exact base generation.

**Acceptance criteria:**

- lookup returns head artifact, base artifact, or deletion deterministically;
- diff manifest records completeness, rename basis, missing blobs, submodules, binary state;
- overlay identity includes base/head/bundle/config;
- force-push produces a different overlay/supersession key;
- overlay completion/failure is atomic and never changes the base generation.

## P1-FR-8 — Coverage

Coverage is dimensioned and claim-ready.

**Acceptance criteria:**

- counts and scoped limitations exist for repository/tree/file/language/parser/adapter dimensions;
- zero items plus failure is distinguishable from zero items after complete analysis;
- coverage records are versioned and part of generation/overlay hashes;
- bounded diagnostics contain codes and safe details, never uncontrolled source exceptions;
- canonical output distinguishes complete, partial, failed, and unauthorized.

## Performance targets

- indexing work for a one-file edit reuses unchanged file artifacts;
- SQLite target fixture supports two concurrent readers and serialized writes without corruption;
- target-profile measurements are recorded but do not gate cross-repo claims in this phase;
- no optimization may weaken equivalence or coverage.

## Definition of done

All requirements map to tests, the local CLI can index/status/doctor fixture repositories, and no contract-specific business claim is yet exposed.
