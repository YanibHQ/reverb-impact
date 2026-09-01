# Phase 003 Tasks

**Status:** Semantic vertical slice verified locally; index-first hosted PR path remains open

## A. Registry

- [x] Implement alias kinds, validity, provenance, owner, environment, revision queries
- [x] Add deterministic/ambiguous/gateway/remap fixtures
- [x] Add suggestion workflow that cannot activate silently

## B. Temporal store

- [x] Add definition/reference/change/edge migrations and domain types
- [x] Add current projection and immediate invalidation on complete new generation
- [x] Add freshness/TTL behavior for unavailable refresh only
- [x] Add service-edge materialization/back-pointer rebuild

## C. Join engine

- [x] Exact canonical joins and contradictions
- [x] Registry-resolved joins and ambiguity abstention
- [x] Heuristic/context kinds remain distinct
- [x] Required/optional evidence path and stratum creation
- [x] Touched-key incremental rejoin and clean equivalence

## D. Consumer selection

- [x] Select/record exact SHA per admitted repository
- [x] Model current/stale/unauthorized/unsupported/failed/not-indexed
- [x] Add bounded on-demand refresh strategy
- [x] Test positive evidence versus negative assurance under partial coverage

## E. PR analysis

- [ ] Exact indexed base + changed-file overlay + delta-backed logical head orchestration without full source reconstruction
- [x] Contract diff, join, coverage, persist workflow
- [x] Force-push supersession and actual merge-tree semantics
- [x] Fork/untrusted input behavior

## F. Findings/preview

- [x] Consumer-specific fingerprint and occurrence
- [x] Three claims, evidence, abstention, remedy, canonical projection
- [x] CLI human/JSON output and evidence detail
- [x] Pagination/count/coverage semantics

## G. Comparative gate

- [x] Pin current Repowise version/commit and environment
- [x] Implement manifest, lexical, schema-only baselines
- [x] Run representative cases and preserve raw outputs
- [x] Write continue/interoperate/reposition/stop ADR

## Verification

- [x] `pnpm test --filter graph`
- [x] `pnpm test --filter pr-analysis`
- [x] `pnpm test:integration --filter multi-repo`
- [x] `pnpm test:conformance --host local`
- [x] `pnpm benchmark --scenario pr-overlay`
- [ ] Source-budget benchmark proving changed-only producer reads and zero consumer reads
- [x] comparative report and decision linked

## Exit review

- [x] Every finding has producer/consumer evidence and SHAs
- [x] Two consumers never collide
- [x] Location-only move preserves fingerprint
- [x] Stale/failed/unauthorized never means unaffected
- [x] No external delivery exists
- [ ] Incremental adapter snapshots equal clean rebuilds across TypeScript re-export, OpenAPI local-ref, and Protobuf import invalidation fixtures
