# Phase 005 Verification

**Result:** standalone GitHub/PostgreSQL reference-host code is implemented and locally verified in
shadow/no-write mode. External advisory rollout remains intentionally incomplete because Phase 004
has no promoted stratum and this repository has no authorized production GitHub installation.

## Implemented

- PostgreSQL hosted migrations, forced workspace RLS, composite scope, canonical records, webhook
  inbox, leased jobs, delivery outbox, authorization projections, audit/purge ledger, and
  hash-verified workspace backup/restore;
- minimum-permission GitHub App manifest, exact raw-body webhook validation/dedupe, closed event
  pointers, and missed-state reconciliation;
- exact-SHA Git reader boundary with separate just-in-time read tokens and no bounded compare API;
- selected repository/explicit collection registry sync, ten distinct permission actions, org-wide
  separate opt-in, and stable removal/reinstall identity;
- static whole-audience and personalized viewer disclosure projections with cache revision and
  auditable omission reasons;
- authenticated evidence/coverage/remedy DTO, non-leaking unauthorized response, fresh review
  authorization, and escaped semantic HTML that is keyboard-native and not color-dependent;
- stable current-head/policy check key, current version-stamp promotion filter, permanent advisory
  conclusions, hard neutral deadline, exact producer-line annotations, honest totals/truncation, and
  50-annotation provider batches;
- single provider-writer import boundary, fresh authorization/head checks, idempotent outbox retry,
  independent kill switches, and automatic demotion disable;
- pointer/source/token/telemetry canary tests plus fork-source adversarial tests.

## Evidence

- [machine-readable shadow decision](phase-005-shadow.json)
- [hosted target profile](phase-005-hosted-benchmark.json)
- [hosted operations and purge runbook](../operations/hosted-reference.md)
- [host security review](../security/phase-005-host-review.md)

The local target profile ran 2,000 static disclosure projections with zero restricted-canary leaks.
It measures local projection mechanics only; it is not a provider/database network SLO or a
production correctness corpus.

`pnpm release:verify` passed on 2026-08-28 with 70 unit tests, 41 integration tests, 9 conformance
tests, 21 adversarial/security tests, and 2 SQLite migration tests. The four hosted database
integration tests also passed against an isolated PostgreSQL 18.3 cluster. Formatting, linting,
type checking, import boundaries, generated schemas, adapter admission reports, documentation
links, dependency/adapter licenses, 13 package tarballs, and the 35-component CycloneDX SBOM passed.

No check, comment, issue, status, notification, or branch-protection setting was written externally.
