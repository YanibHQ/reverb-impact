# Phase 008 Specification

**Parent invariants:** INV-2, INV-8, INV-9, INV-10, INV-13, INV-15, INV-16

## P8-FR-1 — Durable webhook scheduling

Only signature-validated, allowlisted GitHub events enter the inbox. A worker lease converts the
stored safe pointer—not the raw provider body—into an idempotent job. Expired leases are
reclaimable, bounded failures are retryable, and poison messages become terminal.

## P8-FR-2 — Job composition

Handlers are registered explicitly by closed job kind. Canonical records, current pointers, and
delivery intents are persisted before the job lease is completed. Workspace mismatches fail
closed. Replays must be idempotent and immutable-record conflicts must be rejected.

## P8-FR-3 — Analysis adapter

The canonical analysis adapter validates job workspace/repository scope, stores the complete
`AnalysisResult`, advances the current supersession pointer only for current results, and may add
outbox intents derived from that same canonical result.

## P8-FR-4 — Review adapter

Requested check actions route to a dedicated review job. The authorized review adapter resolves a
host-owned identity/action mapping, delegates validation to `AuthorizedReviewService`, and stores
the resulting append-only canonical review event. Workflow actions cannot bypass evidence-version
or reviewer-authorization checks.

## P8-FR-5 — Delivery adapter

Outbox delivery is claimed independently from analysis. GitHub checks are reauthorized and checked
against the provider's current head at write time. Delivered, disabled, and superseded outcomes are
terminal; transient provider failures retain bounded retry semantics.

## P8-FR-6 — Operational controls

The read switch stops inbox/job claims and the write switch stops outbox claims without deleting
work. Advisory writes still require an eligible current promotion and per-repository enablement.

## Definition of done

In-memory fault tests and PostgreSQL integration prove the complete composition, immutable
conflicts, lease reclaim, retries, supersession, tenant isolation, and terminal delivery states.

