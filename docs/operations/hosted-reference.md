# Hosted Reference Operations

The Phase 005 reference host is a standalone Reverb deployment. It does not import, query, or
modify Yanib. PostgreSQL 18 is the target database; the GitHub App is selected-repository by
default, and external check writing starts disabled.

## Deployment boundaries

- The webhook receiver validates the exact raw body, stores a bounded pointer, and returns `202`
  before analysis work.
- The source worker receives a just-in-time read token and fetches exact Git SHAs. The exact-Git
  backend contract rejects provider compare-list implementations.
- Parser/adapter work receives bounded blobs and no provider token, database credential, or
  network capability.
- Canonical results commit before a disclosure projection or delivery-outbox row is created.
- Only `packages/host-github/src/check-writer.ts` owns the provider check-write client capability;
  the import-boundary check enforces this.

PostgreSQL migrations are applied with `PostgresHostedStore.migrate()`. Every hosted table uses a
composite workspace key, explicit workspace predicates, row-level security, and `FORCE ROW LEVEL
SECURITY`. Worker claims use `FOR UPDATE SKIP LOCKED`, expiring leases, bounded attempts, and stable
idempotency keys. Provider calls never occur inside a database transaction.

## Kill switches and rollout

Read, parser, model, and write controls are independent. Model and write begin disabled. Enabling
advisory delivery requires a `PROMOTED` record for a workspace/repository/stratum; the check planner
then rechecks the complete version stamp and the writer rechecks current authorization and head SHA.
Demotion or version reset removes the scoped enablement automatically.

Current repository state has no promoted stratum, so the operational setting is:

```text
read: enabled
parser: enabled
model: disabled
write: disabled
delivery: shadow/no-write
```

Rollback is one operation: set the write kill switch. Pending/leased outbox effects are changed to
`disabled`; indexing and evaluation continue. A broader incident can independently disable reads or
parsers.

## Backup, restore, and purge

Database backups must include PostgreSQL WAL/base backup and the same tenant retention policy as
canonical records. `backupWorkspace()` provides a hash-verified, workspace-scoped canonical export
for drills; `restoreWorkspace()` rejects hash mismatch and cross-workspace records.

On repository removal or authorization loss:

1. revoke the authorization revision and projection cache;
2. stop source reads and writes;
3. enqueue the repository/revision purge key;
4. delete repository-scoped canonical records, jobs, outbox effects, projections, and webhook
   pointers;
5. apply the same key to any configured object/cache/search extension;
6. retain only the hashed purge ledger and authorized audit record;
7. verify another workspace's canaries remain present.

The integration suite performs backup, purge, restore, ACL-revision invalidation, and cross-tenant
canary checks against a real PostgreSQL server.

## Reconciliation and incidents

Reconciliation compares current installation selection, exact default-branch heads, and open PR
heads against durable state. Drift enqueues scope sync, indexing, analysis, or purge work. Queue lag,
lease expiry, attempts, supersession, timeout, source failure, projection mode, redaction count,
check failure, and purge completion use closed allowlisted telemetry; identifiers, paths, contracts,
source, tokens, and free-form provider/parser errors are forbidden.

If rendering cannot produce the closed safe projection, do not serialize the canonical result.
Return a generic neutral incomplete summary or perform no write. Reverb never configures branch
protection and never emits a blocking conclusion.
