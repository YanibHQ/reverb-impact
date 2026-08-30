# Phase 004 Optional Model Experiment Review

**Decision:** Deferred; no model experiment is enabled.

The structural baseline, review, corpus, evaluator, and policy simulator are implemented without a
model. The standalone repository has no authorized human-labeled real-world corpus on which to show
a meaningful selective-risk improvement, so a model call would add export, privacy, latency, cost,
and reproducibility risk without evidence of benefit.

If revisited, approval requires all of the following before implementation:

- a bounded, viewer-authorized structural evidence envelope with repository/path/snippet disclosure
  fields evaluated separately;
- no tools, writes, source retrieval, label creation, severity increase, confidence promotion, or
  disclosure decision;
- output limited to `explain`, `recommend_downgrade`, or `abstain`;
- pinned provider/model/settings, repeated-run variability, latency, cost, shift, and retention
  reporting;
- a frozen comparison against the same structural baseline and a report of selection-coverage and
  recall cost;
- canary/prompt-injection testing and an approved data-export/retention review.

Failure to improve selective risk materially means removal, not quiet retention.
