# Phase 004 — Precision, Abstention, and Review

**Status:** Implemented locally; all strata remain preview-only  
**Depends on:** [003](../003-cross-repo-impact-graph/)  
**Produces:** trustworthy labels, evaluation, suppressions, policy simulation, promotion

## Goal

Make correctness claims sayable and external-delivery decisions reproducible before any PR check is enabled.

## Delivers

- three-axis human labels: edge, impact, actionability;
- append-only review/supersession events;
- scoped suppressions with ownership, invalidation, review, and fallback expiry;
- versioned corpus and label handbook;
- historical, executable-replay, and mutation subsets;
- independent double labeling/adjudication and retained indeterminate cases;
- per-stratum precision/known-break recall/false-omission/coverage/latency/cost metrics;
- selective risk–coverage analysis;
- frozen-result policy simulator;
- recorded promotion and automatic demotion behavior;
- an optional model experiment only after a structural baseline.

## Corrections to the earlier draft

- Ground truth does not only come from history. Synthetic/mutation cases validly test mechanics and controlled sensitivity; they cannot estimate real-world precision.
- “No pooled precision” is a promotion/headline rule, not a ban on transparent weighted/hierarchical secondary research summaries.
- Adapter evidence classes are safe initial policy, not calibrated probabilities. Calibration belongs to a versioned evidence stratum.
- Suppressions should invalidate on relevant evidence/code/version change; a timer is a fallback, not universal truth.
- Edge correctness, impact correctness, and required action cannot share one true/false label.

## Default promotion gate

See [shared spec FR-9](../../spec.md#fr-9--evaluation-calibration-and-policy-simulation). In summary: ≥100 independent labels, actionable-precision 95% Wilson lower bound ≥0.90, edge-precision lower bound ≥0.95, sampled false-omission audit, zero unresolved confidentiality defects, alert budget, latency budget, current versions, and remedies.

### What those numbers actually buy — computed

The gate's shape is right; these are the values behind it, computed in
[`../../research/evaluation-protocol.md`](../../research/evaluation-protocol.md).

| observed precision | n | Wilson one-sided LB | Clopper-Pearson one-sided LB |
| --: | --: | --: | --: |
| 0.95 | 100 | **0.9008** | 0.8977 |
| 0.95 | 120 | — | **0.9037** |
| 0.90 | 100 | 0.8396 | 0.8363 |
| 1.00 | 29 | 0.9023 | **0.9019** |

Three consequences the gate has to survive:

- **At n = 100 the 0.90 bar clears on Wilson and fails on Clopper-Pearson** (0.9008 against 0.8977).
  The estimator is therefore load-bearing, not a detail. Wilson is the better estimator and dips
  below nominal coverage at points; Clopper-Pearson is conservative everywhere. Using Wilson at
  exactly n = 100 is defensible, and it should be recorded as a deliberate choice with the
  Clopper-Pearson value alongside it, not silently.
- **Observed 0.90 can never clear a 0.90 bar** at any n — the lower bound is always below the point
  estimate. A contract kind measuring 0.90 is not "nearly there"; it is measuring against the wrong
  bar.
- **A perfect record is far cheaper than a good one.** 29 consecutive correct findings clear 0.90;
  at 0.95 observed it takes 120.

Wald is excluded outright: at n = 10 and true p = 0.95 its nominal-95% lower bound covers **40.1%**
of the time, it overshoots 1.0, and at `p̂ = 1.0` it returns `[1.0, 1.0]` — certainty from ten
observations.

### The alert budget is not a secondary criterion

A check muted after two wrong findings is governed by **volume × (1 − p)**, not by precision.

| precision | P(2 false positives within 50 findings) |
| --: | --: |
| 0.90 | 0.966 |
| 0.95 | **0.721** |
| 0.98 | 0.264 |
| 0.99 | 0.089 |

**At 95% precision, 72% of authors who see 50 findings hit the mute trigger.** Holding P(mute) below
0.10 across 50 findings needs precision of **0.9893**, which is not reachable — so the reachable
lever is volume, and the budget is a first-class gate condition rather than a tiebreak.

A precision target stated without a findings-per-author budget is not a specification.

## Exit gate

At least one stratum passes the recorded gate—or the phase explicitly concludes all strata remain preview-only. A failed promotion is valid evidence, not permission to soften the metric.

The Phase 004 exit takes the second path. The standalone repository has no authorized,
independently labeled real-world corpus or no-finding audit, so every initial adapter remains
`UNMEASURED`. See the [verification record](../../../../docs/verification/phase-004.md) and
[machine-readable decision](../../../../docs/verification/phase-004-evaluation.json).

## What happens if we skip this

**The precision figure describes the fixtures rather than the system.** The prior system publishes
92.1% precision over a 120-case corpus in which **zero cases carry a human label** and zero carry
real commit provenance; its measurement fixtures are re-tagged as regression cases before
evaluation because the evaluator silently skips unlabelled ones, and its own verification note
reads `NOT VERIFIED for empirical accuracy`
([`../../research/prior-system-yanib.md`](../../research/prior-system-yanib.md) §7). Nothing in that
sequence required a mistake — it is what a harness that accepts an unlabelled corpus eventually
reports.

**No precision claim about a customer's estate is derivable at all.** Repowise's suppression is
configuration only — `.riskignore`, `.repowiseIgnore`, `exclude_patterns` — so no human decision is
ever recorded against a finding, and it cannot report how often its cross-repository edges are
right on anyone's code. The recorded decision is simultaneously the review loop and the corpus.

**A point estimate at early sample sizes is wider than the differences it is used to justify.**
Promotion under INV-11 reads a one-sided lower bound; a bare percentage at n in the tens does not
support the decision it would be quoted for.

**A detector firing on 15% of pull requests is disabled regardless of its recall.** Alerts per pull
request is the binding constraint, which is why the low-confidence tier is suppressed by default
rather than shown with a caveat.

## Documents

- [spec.md](spec.md)
- [plan.md](plan.md)
- [tasks.md](tasks.md)
- [evaluation protocol](../../research/evaluation-protocol.md)
- [paper plan](../../research/research-paper.md)
- [label handbook](../../../../docs/evaluation/label-handbook.md)
- [verification](../../../../docs/verification/phase-004.md)
