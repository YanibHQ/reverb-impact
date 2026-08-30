# Phase 004 Verification

**Result:** Implemented; all evidence strata remain `UNMEASURED` and preview-only.

Phase 004 makes promotion decisions executable without pretending that repository fixtures are a
customer-estate precision corpus. The explicit machine-readable decision is
[phase-004-evaluation.json](phase-004-evaluation.json); the labeling rules are in the
[label handbook](../evaluation/label-handbook.md).

## Implemented

- immutable, version-stamped, three-axis review and supersession events;
- separate workflow, risk-acceptance, suppression, and implicit-usefulness records;
- six suppression scopes with increasing authorization, ownership, justification, review, fallback
  expiry, structural invalidation, and broad-rule audit;
- suppression application after candidate creation, preserving evaluation candidates;
- historical/forward-shadow population sampling with all findings plus deterministic probability
  sampling of no-findings and inverse inclusion weights;
- exact contemporaneous consumer-SHA validation, mutation tagging, executable replay status, and
  public/private releaseability/consent;
- two-independent-human labeling, third-person adjudication, retained indeterminate labels, per-axis
  confusion matrices, raw agreement intervals, and nominal Krippendorff alpha intervals;
- per-stratum and subgroup three-axis metrics, known-break and audited-edge recall, false-omission,
  analysis/selection/label coverage, risk–coverage, PR/team alert burden, latency/cost,
  supersession/timeouts, and usefulness kept separate from correctness;
- sampling-weighted estimates and deterministic repository-pair cluster bootstrap output;
- deterministic frozen-result baseline/candidate policy replay and hashed output;
- immutable promotion/demotion records, default gate enforcement, automatic demotion, and version
  reset to `UNMEASURED` without a compatibility evaluation;
- SQLite migration 005 plus matching in-memory/SQLite conformance;
- canonical schemas for reviews, suppressions, cases, manifests, evaluation, simulation, and
  promotion;
- local `reverb review add|list|import`, including atomic optional suppression creation;
- canonical corpus-bundle import, frozen corpus evaluation, policy simulation, and immutable
  promotion-decision CLI paths that do not invoke adapters or models.

## Statistical decision

[ADR 0003](../adr/0003-promotion-interval.md) records the shared-spec Wilson product gate and retains
Clopper–Pearson beside it. The implementation reproduces the documented checks: 95/100 has a Wilson
one-sided lower bound near 0.9008 and Clopper–Pearson near 0.8977; 29/29 has a Clopper–Pearson lower
bound near 0.9019.

## Test evidence

The Phase 004 suite covers review authorization/supersession, all suppression semantics and
cross-workspace poisoning, sampling/leakage/subset rules, human adjudication, exact intervals,
required-unlabelled failure, agreement, frozen simulation, promotion/version reset, storage
conformance, migration, schema validation, analysis-time suppression, and the real Git CLI review
path.

`pnpm release:verify` passed on 2026-08-28 with 69 unit tests, 23 integration tests, 9 conformance
tests, 18 adversarial tests, and 2 migration tests. Formatting, linting, type checking, generated
schemas, adapter admission reports, documentation links, production and adapter license policy,
13 package tarballs, and the 21-component CycloneDX SBOM also passed. No external check, comment,
notification, or other delivery surface is enabled.

## Model experiment

The optional model is intentionally deferred by the
[threat/data-export review](../security/phase-004-model-experiment.md). No model service, prompt,
export, or tool permission was added.
