# Public Package API

All publishable packages expose one documented root entry point (`.`) and include only `dist/` in
their tarball. Internal file paths are deliberately unavailable through package `exports`; hosts
must not import storage internals or another host's implementation.

| Package                            | Public role                                                           |
| ---------------------------------- | --------------------------------------------------------------------- |
| `@yanib/reverb-domain`             | immutable values, canonical records, graph/evaluation/delivery policy |
| `@yanib/reverb-schema`             | canonical JSON Schemas, compatibility policy, runtime validation      |
| `@yanib/reverb-application`        | orchestration use cases and host-neutral ports                        |
| `@yanib/reverb-adapter-sdk`        | adapter contract, validation, sandbox and admission helpers           |
| `@yanib/reverb-adapter-events`     | Kafka, SQS/SNS, and Pub/Sub destination/payload evidence              |
| `@yanib/reverb-adapter-database`   | PostgreSQL migration, table/column/enum, SQL, and Prisma evidence     |
| `@yanib/reverb-adapter-http`       | implicit framework route and HTTP client-call evidence                |
| `@yanib/reverb-adapter-config`     | configuration, feature-flag, and hashed secret-reference evidence     |
| `@yanib/reverb-adapter-typescript` | TypeScript/npm extraction and compatibility adapter                   |
| `@yanib/reverb-adapter-openapi`    | OpenAPI operation extraction and compatibility adapter                |
| `@yanib/reverb-adapter-protobuf`   | Protobuf/gRPC extraction and compatibility adapter                    |
| `@yanib/reverb-storage-sqlite`     | local durable storage adapter                                         |
| `@yanib/reverb-storage-postgres`   | hosted scoped records, webhook/jobs/outbox/projection/purge adapter   |
| `@yanib/reverb-host-local`         | exact local Git/filesystem host primitives                            |
| `@yanib/reverb-host-github`        | GitHub source, durable runtime, review, and check-delivery adapters   |
| `@yanib/reverb-testkit`            | conformance v1, fakes, fixtures, and host capability declarations     |
| `reverb-impact`                    | `reverb` CLI and embeddable CLI construction                          |

## Errors and states

Domain validation throws `ReverbError` with a closed machine `code`, safe message, and optional
bounded details. Port calls return `PortResult<T>` and distinguish domain, infrastructure,
authorization, incomplete provider data, cancellation, not-found, and conflict failures. Schema
validation throws `SchemaValidationError` with `invalid_schema` or `unsupported_schema_major`.

Consumers must switch on closed fields, not parse safe messages. Important closed state sets include
generation/overlay state, coverage state, analysis state, consumer selection, abstention reason,
review labels/reasons/roles, suppression scope/state, promotion state, and advisory check
conclusion. New members require a compatibility review and release note.

## Minimal third host

The [minimal host example](../../examples/minimal-host/README.md) consumes only root exports. Its
capability declaration is intentionally honest: injected source, ephemeral persistence,
projection-only delivery, and no reviews/provider jobs. Local SQLite, GitHub/PostgreSQL, and this
example run canonical host conformance v1 without normalizing finding or coverage semantics.

Hosts supply ports or call public application use cases. They own their authentication, tenancy,
billing, notification, provider client, and UI. Reverb domain code never imports those systems.

## Exact producer-as-consumer input

`AnalyzePullRequest` requires `producerHeadObservation`, the contract observation extracted from
the exact analyzed head. The producer participates in consumer selection through this observation;
Reverb never substitutes the base or latest default-branch generation for same-repository
references.

## Negotiated v2 scope, coverage, and budgets

`AnalyzePullRequestV2` is additive and requires `schemaMajor: 2`, an explicit execution budget, the
enabled set of new adapter families, and an `AnalysisResultStoreV2`. The five v2 family identifiers
are `events`, `database`, `implicit_http`, `configuration`, and `infrastructure`; an empty set keeps
the new adapters disabled and does not query their coverage source.

The use case resolves authorization and consent before it invokes `RepositoryCoverageSourceV2`.
Every returned record must match the scoped repository, immutable registry revision, exact
generation and commit, selection freshness, and enabled families. Missing, failed, thrown,
mismatched, or non-canonical records become explicit `not_analysed` family limitations and force
the v2 result partial. They never weaken or replace the nested v1 deterministic result.

`AnalysisCoverageV2` records per-repository selection provenance and per-family artifact counts,
limitations, configuration, hashes, and adapter/extraction/identity/partitioning/compatibility
versions. `SqliteStore`, `PostgresHostedStore`, and `InMemoryAnalysisResultStoreV2` implement the
immutable v2 result-store contract. The testkit exports the shared storage conformance suite.

`IndexRepositoryGenerationV2` and `CreatePullRequestOverlayV2` add hard execution budgets around
the unchanged v1 generation and overlay use cases. Bootstrap and incremental indexing are selected
independently from whether a previous generation is supplied; overlay construction always uses the
pull-request lane. Each result contains the exact legacy result plus closed, source-free telemetry
for provider requests, source bytes, storage queries, artifacts, model tokens, latency, and exhausted
dimensions. Budget failures remain explicit incomplete-provider failures, and cleanup operations
still close failed leases.

The additive v2 adapter protocol uses `ContractKindV2`, `AdapterManifestV2`, and
`IncrementalContractAdapterV2`; it does not widen the frozen v1 contract-kind enum or validators.
Its canonical wire envelopes are published independently as the v2 adapter manifest, extraction,
and diff JSON Schemas, so a host can reject unknown fields and invalid protocol/version stamps
before persisting adapter output.
`@yanib/reverb-adapter-events` emits `event.destination` and `event.payload_schema` evidence for
bounded manifests and supported literal Kafka, SQS/SNS, and Pub/Sub calls. Dynamic destinations are
hashed and reported as partial unresolved evidence. V2 materialization and joining bind every edge
to the resolved scope plus exact producer/consumer generations, commits, locations, content hashes,
and adapter protocol versions. New strata remain preview-only and `UNMEASURED`.

`@yanib/reverb-adapter-database` emits `database.table`, `database.column`, and `database.enum`
evidence from bounded PostgreSQL DDL, migrations, literal SQL references, Prisma schema metadata,
and configured Prisma client calls. The host supplies a stable database namespace and any client
model/field mappings. Migration documents are applied in lexicographic repository-path order, so
operators must use migration paths whose ordering matches deployment order. Dynamic SQL, missing
migration bases, unsupported dialects, generated migrations, stored procedures, unresolved query
columns, and absent client mappings produce partial coverage. The adapter does not connect to a
database, execute repository code, or read provider state.

`@yanib/reverb-adapter-http` emits `http.route` evidence from bounded Express, Fastify, and Hono
route registrations plus `fetch`, Axios, and configured client calls. The host supplies immutable
producer service IDs and exact hostname/client aliases. Route parameters and bounded template
segments normalize to a shared identity; dynamic hosts or methods, arbitrary URL construction,
mounted router prefixes, runtime registration, proxy rewrites, generated sources, and missing
aliases produce partial coverage. The adapter performs no network access, and OpenAPI remains a
separate higher-specificity evidence lane.

`@yanib/reverb-adapter-config` emits `configuration.key` and
`configuration.feature_flag` evidence from value-free environment templates, explicit
declarations, and bounded literal reads. The host supplies a stable configuration namespace and a
secret-identity salt. Recognized secret identifiers are converted to provider-qualified HMACs
before persistence or output; secret values and value-bearing environment files are excluded.
Computed keys, missing salt/namespace, generated sources, and unsupported provider resolution
produce partial coverage. Feature-flag activation is runtime-specific while ordinary configuration
and secret-reference activation occurs on deployment.

## Derived pull-request generations

`GenerationStore.deriveGeneration` atomically creates a non-selected logical head from a completed,
compatible base generation and pull-request overlay. Its provenance is exposed as
`RepositoryGeneration.derivation` with `baseGenerationId`, `overlayId`, and `base_overlay` storage
mode. `listArtifacts` resolves the exact logical view from persisted metadata; it does not authorize
provider source reads. Hosts remain responsible for supplying canonical coverage and artifact hashes
produced by their bounded orchestration.

## Adapter semantic snapshots

`AdapterSnapshotStore` persists canonical `AdapterSemanticPartition` records by content hash and one
immutable `AdapterGenerationSnapshot` per generation and adapter. A snapshot may derive from a
compatible base snapshot using replacement and tombstone entries. Resolution reuses untouched
partitions and rejects missing, cross-workspace, cross-repository, or version-incompatible content.
Partition payloads remain adapter-owned canonical records; the storage boundary does not interpret
or weaken their evidence semantics.

`IncrementalContractAdapter` defines clean partition builds, changed-path invalidation planning,
delta updates, and logical extraction materialization. `planPathPartitionInvalidation` provides the
conservative default: it invalidates direct path owners plus their reverse dependency closure, and
marks any unowned changed path incomplete. It never requests a repository-wide fallback.

The TypeScript/npm adapter implements partitioning version 2 at one npm package root per adapter
invocation. Its persisted payload contains normalized AST-derived symbols, re-exports, imports,
bounded compiler path mappings, artifact identities, failure facts, and package metadata—not source
bytes. A host-provided stable `repositoryScope` adds repository-local module identities for relative
and `compilerOptions.paths` imports without weakening npm-public cross-repository identities.
Implementation evidence is hash-only. Its delta updater accepts only changed eligible head
artifacts and rematerializes the package's logical extraction from base facts plus those changes.
Missing state or required blobs makes coverage incomplete; it cannot authorize a full-source
fallback.

The OpenAPI adapter implements partitioning version 1 with one partition per content-discovered
specification document. It stores normalized operation and reference-state facts, discovers changed
documents from the bounded PR blob set, and represents deletion or loss of OpenAPI identity with a
partition tombstone. Untouched specifications require no provider read; unavailable changed blobs
make the update partial.

The Protobuf adapter implements partitioning version 1 with one partition per content-discovered
canonical descriptor-set JSON artifact. It stores normalized method/field facts and rematerializes
generated-stub references from versioned context. Changed artifacts create replacements or
tombstones; untouched descriptor sets and consumers require no provider read.

## Provider source budgets

`BudgetedRepositoryReader` wraps any source adapter with hard per-run ceilings for metadata calls,
blob reads, and blob bytes. It reserves call counts before asynchronous provider access, bounds each
blob request by the remaining byte allowance, records usage, and returns
`provider_source_budget_exceeded` as incomplete provider data on exhaustion.

## GitHub hosted runtime

`GitHubHostedRuntime` consumes the structural `GitHubHostedRuntimeStore` contract. A
`PostgresHostedStore` instance satisfies that contract without either package importing the other.
Hosts register closed-kind handlers and may use `CanonicalAnalysisJobAdapter`,
`AuthorizedReviewJobAdapter`, and `GitHubCheckDeliveryAdapter` for the standard persistence and
provider boundaries.
