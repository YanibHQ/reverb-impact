# Phase 004 — optional AI reasoning

**Status:** Complete
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

## Verification

The neutral package has no vendor, network, credential, host, or storage dependency. Its fake-port
suite covers exact scoped seeding, one-batch retrieval, secret and injection handling, closed output,
two-sided citations, consent denial and timeout, provider refusal/failure/timeout, token exhaustion,
circuit opening, deterministic replay, telemetry isolation, and low-confidence treatment. Shared
SQLite, PostgreSQL, and in-memory conformance proves immutable paired persistence and deletion
propagation into the analysis result.

The complete repository CI passed with 226 unit, 84 integration, 18 conformance, 46 adversarial, and
3 migration tests. Packing installed and compiled all 19 public packages, including the reasoning
package and frozen `0.4` host fixture; the generated SBOM contains 45 components. See the
[verification record](../../../../docs/verification/phase-004-reasoning.md).
