# Phase 005 Tasks

**Status:** Local shadow/reference implementation complete; production advisory gate not met

## A. Postgres/worker

- [x] Add Postgres migrations and hosted-control conformance
- [x] Add forced RLS/equivalent, composite scopes, cross-tenant canaries
- [x] Add durable jobs, leases, supersession, outbox/idempotency
- [x] Add backup/restore/purge integration tests

## B. GitHub ingestion/source

- [x] Register minimum-permission app manifest
- [x] Implement raw HMAC validation, delivery dedupe, inbox, async ack
- [x] Handle installation/repositories/push/PR/check-action events
- [x] Implement reconciliation for missed/stale state
- [x] Implement exact SHA Git reader without bounded compare assumption
- [x] Isolate just-in-time read/write tokens from parsers/jobs/logs

## C. Registry/authorization

- [x] Sync selected repositories and explicit collections into revisions
- [x] Implement all separate permission actions
- [x] Implement static and personalized disclosure projection
- [x] Add ACL-revision cache invalidation
- [x] Pass full public/private/unequal-access/revocation matrix

## D. Detail/review UI/API

- [x] Authorized finding/coverage/evidence/remedy view
- [x] Append review/suppression with fresh authorization
- [x] Accessible keyboard/text/state behavior
- [x] Non-leaking unauthorized/not-found responses

## E. Check

- [x] Stable check key and current-head supersession
- [x] success/neutral/skipped mapping and 15-minute deadline
- [x] promoted-current-version stratum filter, disclosure-safe rendering, producer annotations
- [x] provider batching/output limits and honest truncation totals
- [x] outbox retry and emergency write disable

## F. Shadow/advisory

- [x] Shadow mode structural proof of no external writer
- [x] Record local volume/coverage/latency/cost/disclosure mechanics (not production observations)
- [x] Run rollback and kill-switch drill
- [ ] Enable one promoted stratum in limited workspace
- [ ] Record current-head, neutral, remedy, review, redaction observations

## Verification

- [x] `pnpm test:postgres`
- [x] `pnpm test:github-app`
- [x] `pnpm test:security`
- [x] fork-source adversarial suite
- [x] `pnpm benchmark --profile hosted-target`
- [x] shadow evidence linked; advisory evidence remains unavailable by design

## Exit review

- [x] Zero known disclosure defects in the local matrix; production observation pending
- [x] No token/source in telemetry canaries
- [x] No required run pending past hard deadline
- [x] Reference check cannot block
- [x] Only promoted current stratum can be delivered (none currently promoted)
