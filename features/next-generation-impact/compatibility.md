# Compatibility contract

## Frozen baseline

The compatibility baseline is tag `v0.4.0`, commit
`8e80ff02604dcbbd97cee5bf2768005e33d4d73c`. The release contains 13 packages, schema major 1,
SQLite migration level 7, PostgreSQL migration level 3, and the adapter identities documented in
[the baseline record](baseline-v0.4.0.md).

## Public API

- Root package exports present in `0.4.0` are append-only for `0.5.0`.
- Exported types retain field requiredness, vocabulary, assignability, and semantics.
- No internal subpath becomes a supported API accidentally.
- New entry points are root exports from new packages or new uniquely named root exports.
- `AnalyzePullRequest` stays v1. `AnalyzePullRequestV2` is additive and explicit.
- Compile-time fixtures consume packed `0.4.0` declarations and compile representative existing
  host code against `0.5.0`.

## Wire schemas

Files in `schemas/` that identify schema major 1 are frozen. New required provenance and new closed
vocabularies use separately named schema-major 2 files. Negotiation is explicit; unknown majors are
rejected, never coerced. V1 serializers do not include v2 fields and preserve canonical bytes.

## Storage

Migrations are monotonic and additive. Existing rows are never re-keyed in place. New identity
versions write new records. Both storage implementations must:

1. open a frozen `0.4.0` database;
2. apply forward migrations once and idempotently;
3. read all pre-existing records without reinterpretation;
4. isolate v2 records from v1 readers through new tables/columns with safe defaults;
5. preserve workspace isolation and current-generation selection.

## Adapter identity

Existing TypeScript/npm, repository-local TypeScript, OpenAPI, and Protobuf identity algorithms and
adapter IDs remain unchanged. New families start with their own adapter and identity version 1.
Shared aliases never collapse two family identities. Any future identity correction increments the
owning family version and declares re-index/calibration impact.

## Behavioral fixture matrix

| Fixture | Required result |
| --- | --- |
| v1, no new options | canonical bytes equal `0.4.0` |
| v2, scope omitted | same repository selection behavior as `0.4.0`, plus truthful v2 provenance |
| v2, empty allowlist | producer only |
| v2, explicit consumers | producer plus exactly authorized listed repositories |
| new adapters disabled | old deterministic findings unchanged |
| reasoning disabled/fails | deterministic result unchanged |
| unsupported schema major | stable fail-closed error |
| partial new family | positive evidence allowed; no clean negative assurance |

## Release train

All workspace package manifests, internal dependency ranges, packed artifacts, release metadata,
SBOM, and changelog must agree on fixed version `0.5.0`. The release candidate is validated from
packed tarballs in a clean consumer fixture. Publication is a later, separately approved action.
