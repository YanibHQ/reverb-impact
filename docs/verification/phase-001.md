# Phase 001 repository-index verification

- Date: 2026-08-28
- Local verification runtime: Node 25.2.1 / pnpm 10.27.0; CI target: Node 24
- Scope: standalone local foundation only; no Yanib code, database, API, or deployment dependency

## Outcome

An exact Git commit can be indexed into an immutable, workspace-scoped SQLite generation. The
generation records content/tree/config/registry/bundle identity, dimensioned coverage, bounded
diagnostics, and a canonical artifact-result hash. A pull-request head can be represented as an
immutable overlay of replacements and tombstones over an exact base generation.

Incremental indexing is only a reuse optimization. A seeded eight-edit sequence covering changes,
additions, deletions, and renames produced the same artifact-result hash, state, and coverage as a
fresh rebuild after every commit. Reuse is invalidated by config or indexer-bundle changes.

## Verification matrix

| Gate            | Observed evidence                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit/foundation | opaque values, canonical JSON/hashing, registry validity/ambiguity, schemas, overlay lookup                                                                        |
| Integration     | exact Git tree/blob/diff; seeded incremental equivalence; config/bundle invalidation; registry history/extensions; full CLI workflow                               |
| Conformance     | memory and SQLite stores; atomic visibility; duplicate leases; expiry; retry after failure; rollback; healthy selection; overlay tombstones                        |
| Adversarial     | traversal, symlink, submodule, archive, large/binary/invalid UTF-8, truncated/missing blob, parser crash, corrupt cache, disk full, cancellation, telemetry canary |
| Migrations      | three idempotent forward migrations, WAL, concurrent readers                                                                                                       |
| Boundary        | domain host/database/provider import scan                                                                                                                          |
| Schemas         | deterministic checked-in Draft 2020-12 JSON Schemas plus unsupported-major runtime rejection                                                                       |

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:conformance
pnpm test:adversarial
pnpm test:migrations
pnpm schema:check
```

The aggregate command is `pnpm run ci`. The CLI integration suite executes this real workflow in
temporary Git repositories:

```bash
reverb init .
reverb workspace add <repo> --alias member
reverb registry validate
reverb workspace remove member
reverb index --ref HEAD --json
reverb status --json
reverb doctor --json
```

## Safety and failure semantics

- Git is invoked with argument arrays, no shell interpolation, bounded output, timeouts, and no
  retained stderr that may contain paths.
- Symlinks and submodules are recorded but not followed; archives are classified but never opened;
  repository code is never executed.
- The baseline metadata parser is pure and bounded behind an asynchronous parser boundary. A host
  must place future third-party parsers behind the sandbox port. Parser exceptions are converted to
  fixed `parse_failure` diagnostics.
- Building generations and overlays are invisible. Failed and expired work cannot displace the last
  healthy selection. A retry uses a new immutable generation occurrence for the same logical input.
- Cache keys include workspace, source blob, indexer bundle, parser ID/version, and config revision.
  Incomplete/failed source reads and parser failures are never cached.
- General telemetry is an allowlisted structural event union. Canary tests prove repository IDs,
  paths, source text, and exception text do not enter emitted events.

## Deliberate phase boundary

Phase 001 exposes no contract-specific detector, cross-repository claim, confidence score, GitHub
delivery, hosted Postgres implementation, model, embedding, or Yanib coupling. Those remain in later
phase documents.
