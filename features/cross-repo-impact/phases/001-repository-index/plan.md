# Phase 001 Plan

## Component order

1. **Values and schemas** — types/error codes before persistence.
2. **Ports and fakes** — application boundaries before local implementations.
3. **Registry/config** — repository/service/consent revision included from the first generation.
4. **SQLite schema and leases** — atomic lifecycle before parsing.
5. **Local Git source** — exact SHA tree/blob/diff with completeness.
6. **Artifact classification/cache** — safe paths, content hash, exclusions.
7. **Generation orchestration** — full then incremental.
8. **Overlay primitives** — add/modify/delete/rename without contract semantics.
9. **Conformance/adversarial/fault suite** — harden before adapter work.

## SQLite tables

Minimum local tables: schema migrations, workspace revisions, repository memberships, service identities/aliases, consent grants, generations, generation leases, file artifacts, artifact diagnostics, coverage records, overlays, overlay entries, artifact cache, jobs, audit events.

Definitions/references/edges may have placeholder migrations only if Phase 001 needs conformance contracts; do not invent their implementation early.

## Hashing

Use SHA-256 from the standard runtime initially for content, config, schema, and result hashes. Hash canonical length-prefixed/JSON-canonicalized fields; never concatenate ambiguous raw strings. Do not add BLAKE3/native dependencies without measured need.

## Git source strategy

Local mode resolves commits through noninteractive Git argv calls with timeouts. It uses `ls-tree -z`, blob reads, and name-status/diff data without shell interpolation. Working-tree analysis is represented by an explicit synthetic content manifest and is never mislabeled as a commit SHA.

## Coverage semantics

The index layer does not decide impact. It supplies enough facts for later claim-specific decisions. A partial generation is a valid container of positive artifacts, not an implicit clean negative.

## Test focus

- property-based path/key/hash round trips;
- duplicate lease and crash recovery;
- edit-sequence incremental/clean equivalence;
- renamed paths with same/different content;
- symlink and traversal containment;
- binary/large/generated/vendored/submodule cases;
- parser exception sanitization;
- config/bundle invalidation;
- telemetry canaries;
- schema forward/additive compatibility.

## Deliberate deferrals

- Postgres/RLS and GitHub source adapter: Phase 005;
- contract parsers: Phase 002;
- graph tables/queries: Phase 003;
- object storage: measured hosted need;
- watch mode: after correctness, not needed for PR proof.
