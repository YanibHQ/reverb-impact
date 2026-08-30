# Delivery Phases

Each phase has four documents:

- `README.md` — outcome, boundary, dependencies and exit gate;
- `spec.md` — phase requirements and acceptance criteria;
- `plan.md` — implementation order and verification strategy;
- `tasks.md` — executable checklist.

| Phase | Purpose | Implementation dependency |
| --- | --- | --- |
| [001 — Repository index](001-repository-index/) | Domain/port foundation, immutable generations, coverage, local Git/SQLite host | Public-project constitution |
| [002 — Contract change detection](002-contract-change-detection/) | Adapter SDK, initial extractors and semantic differs | 001 |
| [003 — Cross-repo impact graph](003-cross-repo-impact-graph/) | Workspace registry, exact joins, temporal graph and PR occurrences | 002 |
| [004 — Precision and review](004-precision-and-review/) | Corpus, three-axis labels, calibration, abstention, suppressions and simulation | 003 |
| [005 — Delivery surfaces](005-delivery-surfaces/) | CLI/API preview, GitHub App and disclosure-safe advisory checks | promoted stratum from 004 |
| [006 — Host adapters](006-host-adapters/) | Stable public packages, conformance, second-host/Yanib proof and public artifact | 005 |

The phases are capability gates, not calendar sprints. Work may prepare a later phase in parallel, but no customer-visible delivery bypasses the earlier evidence, security or promotion gates.

The unnumbered Phase 000 in the [implementation plan](../plan.md#phase-000--public-project-constitution-pre-implementation) establishes naming, Git, license, governance, CI and the clean-room ADR before Phase 001 code begins.

## Global stop/reposition gate

At the end of Phase 003, compare the working slice with current Repowise and simple baselines. Continue only if Reverb demonstrates a material advantage in exact-PR semantics, selective reliability, authorization-safe delivery, host embeddability or another recorded user outcome. The possible outcomes are build, interoperate, contribute/license, or stop/reposition.
