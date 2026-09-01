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

## GitHub hosted runtime

`GitHubHostedRuntime` consumes the structural `GitHubHostedRuntimeStore` contract. A
`PostgresHostedStore` instance satisfies that contract without either package importing the other.
Hosts register closed-kind handlers and may use `CanonicalAnalysisJobAdapter`,
`AuthorizedReviewJobAdapter`, and `GitHubCheckDeliveryAdapter` for the standard persistence and
provider boundaries.
