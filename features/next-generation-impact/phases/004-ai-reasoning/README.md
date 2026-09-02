# Phase 004 — optional AI reasoning

**Status:** Planned  
**Depends on:** [002](../002-foundation/) and deterministic seeds from [003](../003-deterministic-adapters/)

## Goal

Add provider-neutral, bounded, cited reasoning for dependencies deterministic adapters cannot prove,
without changing deterministic findings or requiring any model provider.

## Exit gate

- AI is absent/disabled by default and vendor-neutral in core;
- retrieval cannot leave the resolved scope or exceed budgets;
- strict candidate validation and citation verification fail closed;
- AI-only evidence is distinct and weak claims become needs-investigation;
- provider failures leave deterministic canonical output unchanged;
- consent, retention, deletion, telemetry, and prompt-injection tests pass.

See [specification](spec.md), [plan](plan.md), and [tasks](tasks.md).
