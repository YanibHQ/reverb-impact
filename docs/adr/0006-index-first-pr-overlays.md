# ADR 0006 — Index-first pull-request overlays

**Status:** Accepted  
**Date:** 2026-09-01

## Context

Reverb's specification requires PR work to scale primarily with changed artifacts plus touched join
keys. Its architecture selects or builds an exact base generation, fetches changed head blobs,
creates an immutable overlay, and joins the resulting contract changes against persisted consumer
generations.

The v0.2 public contracts implement immutable generations, changed-file overlays, artifact metadata
reuse, contract observations, and exact consumer selection. They do not persist the adapter-specific
semantic snapshot needed to derive a head contract view from a base plus overlay:

- `ContractGenerationObservation` intentionally omits adapter-specific shapes and dependency state;
- `AdapterExtractionResult` contains semantic shapes but is not owned by a persistence port;
- `ArtifactCachePort` caches file classification, not adapter partitions;
- `CreatePullRequestOverlay` parses changed files but does not derive a logical head generation or
  adapter snapshot;
- the reference CLI and first Yanib host composition can therefore recreate base/head adapter
  extraction by reading whole logical generations.

This is correct on small local fixtures, but it is not the required hosted PR architecture. Lowering
concurrency or replacing individual reads with full archives reduces transport symptoms while
preserving work proportional to total repository size.

## Decision

Reverb v0.3 will make the persisted semantic index sufficient for PR analysis.

1. A PR head is an exact immutable logical `RepositoryGeneration` physically derived from an exact
   base generation plus a completed `PullRequestOverlay`.
2. Generation storage may reuse its parent and overlay records. Logical artifact enumeration must be
   identical to a clean materialized generation.
3. Contract adapters persist content-addressed semantic partitions and a generation snapshot
   manifest. Partitions include the adapter-owned dependency state needed for invalidation.
4. An adapter plans invalidation from changed paths and rebuilds only affected partitions and their
   dependency closure. Unaffected partition hashes are reused.
5. PR orchestration fetches only eligible changed producer blobs. It performs no provider source
   reads for unchanged producer files or selected consumers.
6. The base/head adapter diff, same-repository head references, and cross-repository selected
   references are computed from persisted snapshots.
7. Incremental and clean generation, adapter snapshot, contract observation/change, and analysis
   hashes must be equal after canonical normalization.
8. A missing exact base, incomplete diff, incompatible partition, exceeded budget, or stale consumer
   is explicit incomplete evidence. The PR path does not fall back to a full source scan.

## Public application boundary

The exact exported names are chosen during implementation, but v0.3 must provide these capabilities:

- derived-generation provenance (`baseGenerationId`, `overlayId`, and physical storage mode);
- an atomic store operation to create a non-selected logical head from a completed base and overlay;
- logical artifact resolution over materialized and derived generations;
- content-addressed adapter partition and generation-snapshot types;
- a persistence port for immutable partition payloads and generation/overlay manifests;
- an incremental adapter boundary for invalidation planning, overlay application, and semantic diff;
- per-run source/cost telemetry and a fail-closed source budget;
- clean/incremental conformance reusable by every storage and host implementation.

Initial partition ownership is adapter-specific:

| Adapter | Partition | Invalidation boundary |
| --- | --- | --- |
| TypeScript/npm | package root with per-module parse facts and import/re-export graph | changed module, package metadata/exports, dependency context, reverse re-export closure |
| OpenAPI | root document plus local `$ref` closure | changed document or referenced local schema |
| Protobuf | descriptor/import compilation unit | changed source, imported descriptor, package/service identity, compiler configuration |

## Runtime invariants

For a warm base and at most 50 changed files:

- provider metadata calls are bounded by a small constant;
- provider blob reads are no greater than eligible changed non-deleted files;
- consumer provider source reads are zero;
- full archive or clone reads in the PR path are zero;
- p50 target latency is at most 30 seconds and p95 at most 90 seconds;
- budget exhaustion completes as partial/incomplete rather than widening the source set.

Hosts must record changed-file count, provider calls, bytes read, partition invalidations/reuse,
adapter duration, storage reads/writes, and total duration. Host conformance must fail a PR path that
reads an unchanged or consumer source artifact.

## Index lifecycle

- Initial repository admission may perform a background clean index.
- Default-branch pushes derive selected generations incrementally.
- A PR with no exact base generation queues indexing and returns a pending/incomplete result.
- Consumer refresh is independent of the bounded PR run.
- Scheduled clean rebuilds compare canonical output hashes with derived generations.
- An analyzed head can be promoted after merge only when the actual merge tree hash and compatibility
  stamps match.

## Consequences

- The PR hot path becomes a delta computation over durable same-repository and cross-repository
  evidence.
- Adapter and storage contracts grow, but the complexity directly removes repeated provider work and
  is shared by every host instead of being rebuilt in Yanib.
- v0.2 hosts remain usable for local/small full analysis, but hosted PR analysis must not claim the
  v0.3 cost property.
- Storage migrations must preserve workspace isolation, purge, backup/restore, and immutable hash
  semantics for adapter partitions and derived generations.
- Adapter changes that alter partition or invalidation semantics require versioned snapshots and clean
  equivalence evidence before promotion.

## Rejected alternatives

- **Full base/head archives per PR:** fewer requests, but still total-repository transfer and
  extraction in the hot path.
- **Lower concurrency/retries:** manages throttling without removing unnecessary work.
- **Changed text without indexed context:** cannot correctly resolve exports, imports, local schema
  references, same-repository consumers, or coverage.
- **A host-private semantic index:** duplicates Reverb's core responsibility and makes hosts disagree.
- **Embedding/LLM impact inference:** useful for explanation or retrieval, not proof of exact contract
  change, consumption, compatibility, currentness, or absence.

## Release gate

v0.3 packages may be published only after:

- TypeScript re-export, package metadata, OpenAPI local-ref, Protobuf import, addition, modification,
  deletion, rename, and incompatible-version fixtures prove clean/incremental equivalence;
- SQLite and PostgreSQL implementations pass migration, isolation, purge, backup/restore, and
  conformance suites;
- local and GitHub host tests satisfy the source budgets;
- same-repository already-fixed/deleted references are not actionable;
- stale, unauthorized, unsupported, or incomplete evidence cannot produce a clean result.

This ADR does not authorize provider writes. Delivery remains separately promotion-, disclosure-,
and host-policy-gated.
