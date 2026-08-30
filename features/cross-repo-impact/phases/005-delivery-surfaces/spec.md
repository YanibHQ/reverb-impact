# Phase 005 Specification

**Parent invariants:** INV-2, INV-8, INV-9, INV-10, INV-14, INV-15, INV-16

## P5-FR-1 — GitHub App scope and ingestion

**Acceptance criteria:**

- minimum permissions from security spec; team/member read optional;
- raw-body HMAC-SHA256 constant-time validation;
- delivery-ID dedupe, durable inbox, fast async acknowledgement;
- installation/repository/push/PR events and missed-delivery reconciliation;
- selected repos/explicit collections; org-wide separate opt-in;
- fork content untrusted and never executed.

## P5-FR-2 — Exact provider source

**Acceptance criteria:**

- source reader resolves/fetches exact base/head/default-branch SHAs;
- bounded compare API is never assumed complete;
- Git blob/tree/fetch failures become coverage/not-analysed;
- just-in-time scoped installation tokens stay outside parser/job/log/model data;
- read and check-write paths are independently scoped.

## P5-FR-3 — Hosted Postgres/jobs/tenancy

**Acceptance criteria:**

- Postgres 18 migrations implement domain schemas, jobs, outbox, audit, purge;
- every row/key/job scoped; forced RLS/equivalent passes cross-tenant canaries;
- at-least-once jobs and exactly-once user-visible effects via idempotency keys;
- source/parsers/diff workers isolated;
- deletion propagates to cache/object/vector/projections and is auditable;
- PostgreSQL-only target profile passes before specialized stores considered.

## P5-FR-4 — Authorization and disclosure

**Acceptance criteria:**

- nine permission actions represented/rechecked;
- static check is whole-producer-audience safe;
- personalized detail intersects app and viewer access at render time;
- repository existence/contract/path/snippet have independent disclosure classes;
- revoked ACL invalidates cached projections;
- public producer/private consumer, unequal private access, selected repo removal, and reinstall fixtures pass;
- redaction/omission decisions and reasons are auditable.

## P5-FR-5 — Authenticated detail/review

**Acceptance criteria:**

- shows canonical finding projection, exact SHAs, evidence, coverage, freshness, policy/measurement, remedies;
- unauthorized details omitted with non-leaking error;
- review/suppression action reauthorizes and appends event;
- keyboard accessible; state not conveyed by colour only;
- graph visualization optional, not needed to understand finding.

## P5-FR-6 — GitHub Check

Key: installation/repository/PR/head/policy.

**Acceptance criteria:**

- current head only; old head superseded and cannot write active actions;
- success when complete/no findings, neutral with findings/incomplete, skipped out of scope;
- hard 15-minute completion; pending cannot linger;
- promoted current strata only;
- annotations only on valid producer changed lines and batched under provider limits;
- authorized details/remedies and honest total/truncated counts;
- write retries via outbox; canonical result exists before provider call;
- no branch-protection configuration or blocking conclusion.

## P5-FR-7 — Shadow/advisory rollout

**Acceptance criteria:**

- shadow writes no check/comment/status/issue;
- operator sees coverage/latency/volume/cost and policy replay;
- disclosure projection is exercised before external writes;
- advisory enablement scoped by workspace/repo/stratum and default off;
- automatic emergency disable and demotion;
- rollout/rollback production observations recorded without source in telemetry.

## P5-FR-8 — Operational safety

**Acceptance criteria:**

- structured allowlisted telemetry/canary leak suite;
- independent read/parser/model/write kill switches;
- backup/restore/purge/reconciliation/incident runbooks;
- queue lag/timeout/supersession/token/source/adapter/check/purge metrics;
- check rendering failure falls back to safe neutral summary or no write, never raw canonical dump.

## Definition of done

The hosted reference proves provider-native organization use and secure advisory delivery for one promoted stratum.
