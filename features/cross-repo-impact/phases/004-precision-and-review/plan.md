# Phase 004 Plan

## Build order

1. Label handbook/schema before review UI.
2. Append-only review events and authorization.
3. Suppression/invalidation engine.
4. Corpus manifest/import and sampling records.
5. Independent label workflow/adjudication.
6. Evaluator/statistical reports.
7. Frozen policy simulator.
8. Promotion/demotion records.
9. Optional model experiment, only if resourced.

## Corpus tracks

- **Historical:** eligible real PRs, findings plus sampled no-findings, contemporaneous consumer state.
- **Executable replay:** compiler/compatibility/focused tests where feasible; unrelated build failure is indeterminate.
- **Mutation/fixtures:** controlled known changes for mechanics/sensitivity; excluded from production precision.

## Analysis splits

- chronological and organization/repository-family separation;
- final untouched temporal holdout;
- leave-one-organization-out external generalization where sample permits;
- no same contract/repository pair leakage between tuning/calibration and final evaluation.

## Statistics

- Wilson intervals for product promotion proportions;
- cluster bootstrap or hierarchical model for paper secondary analysis;
- paired bootstrap/McNemar-style comparison on same PRs;
- Holm correction for confirmatory multiple comparisons;
- survival/restricted-mean analysis for time to action with censoring;
- report effect sizes/intervals, not p-values alone.

## Review UI principles

Show evidence before labels; hide policy band/method during blinded corpus labeling where possible; keep indeterminate easy; distinguish “already coordinated” and “accepted risk” from false edge; require reason for broad suppression; render prior/superseded events.

## Do not build

- a candidate-only corpus called recall;
- model labels;
- a pooled promotion headline;
- permanent baseline suppression;
- implicit behavior auto-training;
- numeric confidence from intuition;
- external check before promotion.
