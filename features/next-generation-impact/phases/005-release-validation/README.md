# Phase 005 — 0.5.0 release validation

**Status:** Planned  
**Depends on:** [000](../000-baseline-lock/), [002](../002-foundation/), [003](../003-deterministic-adapters/), and [004](../004-ai-reasoning/)

## Goal

Produce a fully verified, fixed-version `0.5.0` release candidate and precise host upgrade guidance,
then stop before any publication, deployment, production migration, or Yanib modification.

## Exit gate

All old/new tests and goldens pass; every packed public package installs and compiles cleanly;
schemas/migrations/APIs/adapters/re-index/rollback are documented; checksums/SBOM/provenance/licenses
are generated; clean `pnpm run ci` and `pnpm release:verify` pass.

See [specification](spec.md), [plan](plan.md), and [tasks](tasks.md).
