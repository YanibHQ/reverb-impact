# Phase 003 — deterministic adapter families

**Status:** Complete
**Depends on:** [002](../002-foundation/)

## Goal

Deliver events, shared database, implicit HTTP, configuration, and infrastructure as independent,
bounded, incremental adapter vertical slices using the established evidence graph.

## Exit gate

Each family has canonical identity, extraction, compatibility, activation, coverage, invalidation,
adversarial handling, admission metadata, backend-to-backend fixtures, and exact same-repository and
cross-repository proof. Disabled families do not change old results.

See [specification](spec.md), [plan](plan.md), and [tasks](tasks.md).

## Verification

All five adapters pass their unit, incremental, integration, conformance, and adversarial suites.
The infrastructure slice adds 21 focused tests spanning Kubernetes, Helm, Terraform, exact-head
same-repository analysis, cross-repository joins, deletion, sensitive inputs, and partition
integrity. `pnpm release:verify` packs all 18 public packages, compiles the frozen `0.4` host fixture
from the tarballs, and generates a 44-component SBOM. The generated
[infrastructure admission report](../../../../docs/verification/adapters/infrastructure.json)
records the package limits, dependencies, limitations, and preview-only promotion state.
