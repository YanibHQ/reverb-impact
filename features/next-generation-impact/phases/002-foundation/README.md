# Phase 002 — scoped analysis foundation

**Status:** Planned  
**Depends on:** [001](../001-design-contract/)

## Goal

Add the v2 scope, provenance, storage, and budget substrate without changing the v1 path or adding
new dependency-family claims.

## Exit gate

- v1 canonical golden remains exact;
- v2 omitted/empty/explicit scope semantics are proven;
- unselected repository read canaries remain untouched at every lower port;
- additive SQLite/PostgreSQL upgrades retain `0.4.0` data;
- provenance and partial coverage are complete and canonical;
- bootstrap, incremental, and PR budgets are independently enforceable.

See [specification](spec.md), [plan](plan.md), and [tasks](tasks.md).
