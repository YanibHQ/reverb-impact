# Phase 004 Tasks

**Status:** Implemented locally; promotion honestly remains preview-only

## A. Ontology/reviews

- [x] Publish label handbook and closed reasons
- [x] Add review/supersession schemas and append store
- [x] Add scope authorization and immutable occurrence tests
- [x] Separate workflow/risk/suppression/implicit telemetry

## B. Suppressions

- [x] Implement six scopes and matcher schemas
- [x] Add ownership/justification/review/expiry
- [x] Implement structural invalidation predicates
- [x] Test suppression does not remove corpus candidates
- [x] Add broad-scope poisoning/audit tests

## C. Corpus/labels

- [x] Add case/manifest/sampling/releaseability schemas
- [x] Build historical and no-finding sampler
- [x] Build executable-replay status protocol
- [x] Import mutation fixtures with explicit subset tag
- [x] Add independent labeling/adjudication and agreement report

## D. Evaluation

- [x] Implement per-stratum three-axis metrics/intervals
- [x] Implement known-break recall/false-omission audits
- [x] Implement analysis/selection/label coverage and risk–coverage
- [x] Add clustered/sampling-weighted research outputs
- [x] Fail on required unlabelled cases

## E. Policy

- [x] Implement frozen-result policy simulator/hash
- [x] Implement promotion/demotion/version-reset records
- [x] Apply default gate and generate decision report

## F. Optional model

- [x] Complete threat/data-export review before any experiment
- [x] Defer the adapter; no model/data-export mode is enabled
- [x] Defer comparison until an authorized real-world labeled corpus exists
- [x] Record deferral because no selective-risk gain can currently be established

## Verification

- [x] `pnpm test:review`
- [x] `pnpm test:suppression`
- [x] `pnpm test:evaluation`
- [x] `pnpm test:policy-simulator`
- [x] corpus/label/agreement report linked
- [x] promotion or remain-preview decision linked

## Exit review

- [x] Real precision does not use mutation fixtures
- [x] Recall is not inferred from emitted candidates
- [x] Action rate is not correctness
- [x] Current versions match promoted record (none are promoted; all remain `UNMEASURED`)
- [x] No external delivery yet
