# Phase 008 — Hosted Runtime Composition

**Status:** Implemented and verified locally
**Depends on:** [006](../006-host-adapters/) and [007](../007-exact-self-impact/)
**Produces:** an embeddable GitHub/PostgreSQL worker runtime for analysis, review, and delivery

## Goal

Connect the previously separate GitHub host and PostgreSQL control-plane primitives into one
durable, replay-safe runtime boundary without coupling Reverb to Yanib or another product host.

The runtime accepts signed webhooks through the existing receiver, leases durable inbox rows,
routes bounded pointers into idempotent jobs, invokes explicit analysis/review handlers, persists
canonical records before acknowledging work, and dispatches separately authorized outbox effects.

## Exit gate

- webhook, job, and delivery work use reclaimable leases;
- duplicate deliveries and superseded PR/index jobs are idempotent;
- analysis and review adapters persist canonical records through the same runtime contract;
- delivery rechecks authorization and current head immediately before GitHub writes;
- workspace scope mismatches fail closed;
- read and write kill switches stop new claims without discarding queued work;
- PostgreSQL integration exercises the signed-webhook-to-delivery path end to end.

## Documents

- [spec.md](spec.md)
- [plan.md](plan.md)
- [tasks.md](tasks.md)
- [verification](../../../../docs/verification/phase-008.md)
