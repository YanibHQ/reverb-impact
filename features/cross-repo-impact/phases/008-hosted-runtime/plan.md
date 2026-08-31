# Phase 008 Plan

1. Add reclaimable webhook worker leases to the hosted PostgreSQL migration.
2. Route safe event pointers into idempotent, superseding jobs.
3. Compose explicit analysis and review job adapters.
4. Persist records/pointers/outbox intents before job acknowledgement.
5. Add a separately controlled delivery worker and GitHub check adapter.
6. Prove retry, stale lease, tenant, immutable conflict, and kill-switch behavior.
7. Document the embedding boundary and production enablement sequence.

## Host boundary

The embedding host still supplies secrets, installation-token brokers, exact Git backend,
workspace registry/authorization policy, worker scheduling, and HTTP transport. Reverb supplies the
durable workflow and validates canonical analysis/review/delivery semantics.

