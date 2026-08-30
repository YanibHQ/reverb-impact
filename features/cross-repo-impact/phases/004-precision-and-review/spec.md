# Phase 004 Specification

**Parent invariants:** INV-4, INV-6, INV-7, INV-12, INV-13, INV-14

## P4-FR-1 — Review ontology and events

**Acceptance criteria:**

- edge labels: `confirmed|absent|indeterminate`;
- impact labels: `breaking|behavior_risk|compatible|indeterminate`;
- action labels: `coordinate|already_coordinated|accepted_risk|dead_or_test_only|no_action|indeterminate`;
- actor, authorization, time, evidence/adapters/identity/policy versions, reason, note hash, and superseded event recorded;
- correctness, workflow resolution, risk acceptance, suppression, and implicit behavior remain distinct;
- structural occurrence is never mutated by review.

## P4-FR-2 — Suppression model

Scopes: occurrence, stable finding, contract×consumer, repository-pair×kind, adapter rule, workspace rule.

**Acceptance criteria:**

- authorization increases with scope; workspace rule is admin-only;
- owner, justification, review time, state, and invalidation predicates required;
- code/reference/contract/identity/adapter/evidence/policy/registry changes invalidate relevant suppressions;
- expiry/review catches stale rules not invalidated structurally;
- suppression runs after candidate creation and cannot remove evaluation data;
- broad suppression anomalies and audit are available without source telemetry.

## P4-FR-3 — Corpus schema

Cases include producer base/head, consumer-as-of SHA, workspace/registry/policy, contract/adapter/identity versions, evidence, coverage, three labels, labeler provenance, and sampling weight.

**Acceptance criteria:**

- detector outputs alone cannot enumerate the corpus population;
- all findings plus probability sample of no-finding eligible PRs included;
- future consumer revisions cannot leak into historical cases;
- mutation cases are marked and excluded from real-world precision;
- private/public releaseability and consent are fields;
- required unlabelled cases fail evaluation.

## P4-FR-4 — Label quality

**Acceptance criteria:**

- two independent domain-capable reviewers, blinded to method/band where feasible;
- conflicts adjudicated by a third process/person;
- `indeterminate` retained with best/worst sensitivity analysis;
- report agreement coefficient/confusion matrix with interval;
- labelers cannot be a model; detector authorship/conflicts recorded;
- research/human behavior follows approved ethics protocol.

## P4-FR-5 — Evaluator

Report by evidence stratum, contract kind, language/capability pair, organization, and time where supported.

Required metrics: edge/impact/actionable precision, consumer-edge recall on audited samples, known-break recall, PR alert precision, false-omission audit, analysis/selection/label coverage, risk–coverage curve, findings/alerted PRs per 1,000, team weekly burden, latency quantiles, superseded/timeouts, cost, time/action usefulness.

Use denominators, 95% intervals, repository-pair/organization clustering, sampling weights, and indeterminate sensitivity. Action rate is never called correctness.

## P4-FR-6 — Calibration/promotion

**Acceptance criteria:**

- stratum key includes all shared-spec dimensions;
- sample count, interval, corpus/window, coverage, versions, and decision retained;
- current extractor/identity changes reset to `UNMEASURED` unless compatibility evaluation recorded;
- default gate applied or versioned ADR explains/replays alternative;
- promotion and demotion are audit events, not config edits;
- optional numeric probabilities require held-out calibration and proper calibration metrics; evidence bands are not relabelled probabilities.

## P4-FR-7 — Policy simulator

**Acceptance criteria:**

- replay frozen candidate results/labels, no live model/adapter calls;
- compare candidate and baseline policy;
- report deliveries/abstentions/suppressions, volume, metrics, coverage, cost, warnings;
- deterministic hash identifies input corpus/policies/result;
- no policy is promoted without simulator output.

## P4-FR-8 — Optional model experiment

A model MAY see bounded authorized structural evidence and return `explain|recommend_downgrade|abstain`.

It has no tools/writes/labels and cannot raise class. Evaluate selective-risk improvement, selection-coverage/recall cost, latency, cost, shift, reproducibility, privacy. No meaningful improvement means removal/deferral.

## Definition of done

The system can defend or reject a delivery promotion using independent, current, reproducible evidence.
