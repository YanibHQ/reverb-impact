# Phase 001 Tasks

**Status:** Implemented and locally verified on 2026-08-28

## A. Domain/schema

- [x] Write failing round-trip/invalid-input tests for all foundation values
- [x] Implement values, closed enums, stable errors, canonical JSON
- [x] Generate/check JSON Schemas
- [x] Add path normalization and adversarial tests

## B. Ports/conformance

- [x] Define all ports in shared architecture
- [x] Implement deterministic in-memory fakes
- [x] Add domain dependency-boundary test
- [x] Create conformance cases for completeness, leases, cancellation, idempotency, deletion

## C. Registry

- [x] Add revisioned workspace/repository/service/alias/consent models
- [x] Add local config parser, validator, canonical hash, revision writer
- [x] Test explicit membership, ambiguity, validity, unknown refs, additive fields

## D. SQLite/local Git

- [x] Add migrations and transaction helpers
- [x] Implement generation lease lifecycle and selection
- [x] Implement exact commit/tree/blob/diff local reader using argv arrays
- [x] Add WAL/concurrency/interruption tests

## E. Artifacts/full generation

- [x] Classify and bound tree entries
- [x] Add SHA-256 content/config/result hashing
- [x] Implement artifact cache compatibility keys
- [x] Implement safe parser worker boundary and sanitized diagnostics
- [x] Persist complete/partial/failed coverage atomically

## F. Incremental/overlay

- [x] Implement incremental edit set and reuse
- [x] Add randomized clean-rebuild equivalence tests
- [x] Implement overlay replacement/tombstone lookup
- [x] Test add/modify/delete/rename/binary/submodule/missing-blob cases

## G. Security/CLI

- [x] Add traversal/symlink/archive/resource adversarial suite
- [x] Add telemetry canary suite
- [x] Implement `reverb init`, `workspace`, `index`, `status`, `doctor`
- [x] Run local host conformance and document commands/results

## Verification

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test` (foundation unit suites)
- [x] `pnpm test:conformance` (memory and local SQLite hosts)
- [x] `pnpm test:adversarial`
- [x] `pnpm schema:check`
- [x] [clean/incremental equivalence report](../../../../docs/verification/phase-001.md)

## Exit review

- [x] No host imports in domain
- [x] No incomplete generation selectable as complete
- [x] No failure serialized as empty success
- [x] No source identifier in telemetry canary output
- [x] Phase README/spec/plan/tasks updated with observed evidence
