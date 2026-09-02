# Phase 001 — design contract

**Status:** Implemented and verified locally  
**Depends on:** [Phase 000](../000-baseline-lock/)

## Goal

Remove semantic ambiguity before implementation: preserve v1, introduce an additive v2, enforce a
bounded host-selected scope below UI code, isolate deterministic adapter families, and make optional
AI incapable of weakening exact evidence.

## Exit gate

1. Scope omission, empty allowlist, explicit IDs, producer inclusion, and no expansion are precise.
2. Schema/API/storage/identity compatibility rules are accepted.
3. Every new adapter owns an independent identity and testable vertical slice.
4. Coverage and provenance can truthfully describe partial or unread evidence.
5. Reasoning is provider-neutral, optional, cited, bounded, consented, and failure-isolated.
6. Packaging, evaluation, performance, and Yanib boundaries are documented.
7. ADR and documentation checks pass before runtime implementation.

See [specification](spec.md), [plan](plan.md), and [tasks](tasks.md).
