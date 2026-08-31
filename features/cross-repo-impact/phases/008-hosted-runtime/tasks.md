# Phase 008 Tasks

**Status:** Implemented and verified locally

## Inbox/jobs

- [x] Add webhook attempt and reclaimable lease state
- [x] Route allowlisted safe pointers by closed job kind
- [x] Deduplicate deliveries and supersede older PR/index work
- [x] Retain bounded retry and terminal poison-message behavior

## Analysis/review

- [x] Add canonical analysis job adapter
- [x] Add authorized append-only review job adapter
- [x] Persist records and pointers before completing the lease
- [x] Fail closed on cross-workspace/repository output

## Delivery/operations

- [x] Add separately leased delivery dispatcher
- [x] Reuse current-head and reauthorization GitHub check writer
- [x] Resolve delivered/disabled/superseded effects terminally
- [x] Preserve queued work while read/write switches are disabled

## Verification

- [x] In-memory runtime composition and fault tests
- [x] PostgreSQL migration/lease/idempotency tests
- [x] Signed webhook through PostgreSQL to canonical record and delivered outbox effect

