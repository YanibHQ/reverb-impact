# Reverb 0.4.0 compatibility baseline

## Source

- Repository: `YanibHQ/reverb-impact`
- Tag: `v0.4.0`
- Commit: `8e80ff02604dcbbd97cee5bf2768005e33d4d73c`
- Audited: 2026-09-02
- Node: 25.2.1 (release policy supports Node 24 or 25)
- pnpm: repository-pinned 10.27.x toolchain

The worktree was clean and `main`, `origin/main`, `origin/HEAD`, and `v0.4.0` resolved to the same
commit before the feature branch was created.

## Release inventory

All 13 public packages were version `0.4.0` and exposed documented root entry points only:

`reverb-impact`, `@yanib/reverb-domain`, `@yanib/reverb-schema`,
`@yanib/reverb-application`, `@yanib/reverb-adapter-sdk`,
`@yanib/reverb-adapter-typescript`, `@yanib/reverb-adapter-openapi`,
`@yanib/reverb-adapter-protobuf`, `@yanib/reverb-storage-sqlite`,
`@yanib/reverb-storage-postgres`, `@yanib/reverb-host-local`,
`@yanib/reverb-host-github`, and `@yanib/reverb-testkit`.

Schema major is 1. SQLite migration level is 7. PostgreSQL migration level is 3.

## Existing evidence surface

Contract families are TypeScript/npm public symbols, repository-scoped TypeScript modules, OpenAPI
operations, and Protobuf/gRPC methods/fields. Evidence bases are `exact`, `registry_resolved`,
`heuristic`, `declared_context`, and `behavioural_context`. Existing adapter IDs and identity,
partition, and evidence meanings are frozen for `0.5.0` compatibility.

The producer is already eligible as a consumer through the required exact
`producerHeadObservation`. Downstream consumers come from selected immutable generations. This
behavior remains the v1 baseline; v2 adds explicit bounded selection without retroactively changing
it.

## Schema-major 1 SHA-256

The Phase 000 generated fixture is authoritative. The audit observed 21 schema files, including:

- `reverb-analysis-result.schema.json` —
  `bd59e0789f303e60fde861e6d6d46291660aa5ab230526d2107776b4ec87bca3`
- `reverb-adapter-extraction.schema.json` —
  `6e4fed09782893e0772a6390102dcfc9d10bceaadf08edf28e8d989f7f942600`
- `reverb-workspace-registry.schema.json` —
  `6b1d2818f76c001444cdbc1ab25aabee57a2ad69e234c9b93a656d953c25144f`
- `reverb-value-types.schema.json` —
  `900a5fdb3b50c6ea594689d487818085c8338da98489938bf7551f9edcff90a8`

No existing schema-major 1 digest may change as a side effect of adding v2.

## Verification

`pnpm release:verify` passed on the clean baseline. It included format, lint/boundaries, build and
type checks, public API and host capability checks, compatibility tests, 112 unit tests, 54
integration tests including PostgreSQL, 11 conformance tests, 25 adversarial tests, two migration
tests, schema/admission/doc/license checks, packing/checksums for all 13 packages, and an SBOM with
36 components.

## Existing incomplete project gates

Historical feature ledgers still identify uncompleted evidence-promotion, public v1 calibration/DOI,
container/signature, optional-port parity, and Yanib-specific integration work. They are not silently
claimed complete by the `0.5.0` feature and do not authorize Yanib changes or publication.
