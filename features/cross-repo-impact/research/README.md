# Research Index

**Evidence date:** 2026-08-28  
**Purpose:** distinguish observed facts, adopted design decisions, hypotheses, and future empirical claims.

These documents are inputs to the feature specification. They are not marketing copy. A dated statement about another project is not assumed to remain true, and an architecture choice is not reported as an evaluated result.

## Reading order

1. [Repowise teardown](repowise-teardown.md) — the nearest current product and the boundary Reverb must earn.
2. [Prior art](prior-art.md) — industry and academic systems that solve parts of the problem.
3. [Contract taxonomy](contract-taxonomy.md) — producer artifacts, consumer artifacts, join keys, and staged support.
4. [Technology decision](technology-decision.md) — runtime, stores, indexing lanes, tools, and rejected infrastructure.
5. [Platform limits](platform-limits.md) — GitHub API, rate, permission and runner constraints, including the two that decide architecture.
6. [False-positive design](false-positive-design.md) — labels, coverage, abstention, calibration, suppressions, and promotion.
7. [Evaluation protocol](evaluation-protocol.md) — corpus, sampling, baselines, metrics, and statistical analysis.
8. [Research-paper plan](research-paper.md) — contributions, research questions, venues, ethics, and release plan.
9. [Prior-host lessons](prior-system-yanib.md) — public, non-sensitive constraints for any host.
10. [Source register](verified-citations.md) — primary sources and corrections to earlier claims.

## Evidence classes used in this folder

| Label | Meaning |
| --- | --- |
| **Observed** | Verified in a named source, code revision, or reproducible command. |
| **Decision** | Chosen for Reverb; it is not a statement about measured superiority. |
| **Hypothesis** | Testable expectation reserved for evaluation. |
| **Estimate** | Planning value that must not be published as a result. |
| **Unknown** | A question intentionally left open until evidence exists. |

## Reproducibility rules

- Pin source repositories by commit in load-bearing code claims.
- Record retrieval date for web documentation.
- Prefer official documentation, standards, released source, or the paper itself.
- Do not use production counts unless an immutable, permission-safe query artifact exists.
- Do not infer absence from a failed search; qualify negative landscape claims by date and scope.
- Do not treat synthetic fixtures, mutations, merged PRs, or user actions as correctness labels by themselves.
- Preserve `indeterminate` outcomes and coverage gaps in both system and paper datasets.
- Keep product promotion gates separate from research estimators.

## Decision boundary

The research supports one implementation decision: build a clean-room, host-neutral, organization-aware PR contract-impact engine only if it demonstrates a material advantage on the measured task. If Repowise or another system closes that boundary before Phase 003, the stop/reposition gate in the [feature plan](../plan.md) applies.
