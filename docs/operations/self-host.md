# Self-hosting Reverb

Reverb can run without Yanib or the GitHub reference host. A host combines the public domain and
application packages with a source reader, durable store, registry/authorization decisions,
sandbox, queue/cancellation, delivery projection, blobs/cache, clock, and allowlisted telemetry.

## Local profile

Requirements: Node 24 or 25, pnpm 10.27, Git, and a filesystem location owned by the operator.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm release:verify
pnpm --filter reverb-impact exec reverb init /path/to/workspace
```

Local SQLite is single-workspace by default. Back up `.reverb/reverb.sqlite`, the registry/config,
and any explicitly enabled object cache as one consistent set. Stop writers or use the host's
consistent backup mechanism first.

## Hosted profile

Use PostgreSQL 18, selected GitHub repositories, separate ephemeral read/write token brokers, and
isolated source/parser workers. Apply migrations through `PostgresHostedStore.migrate()`. Start with
read/parser enabled and model/write disabled. The detailed topology, reconciliation, backup,
restore, purge, incident, and kill-switch procedures are in the
[hosted operations runbook](hosted-reference.md).

## Upgrade and incidents

Follow the [compatibility policy](../compatibility/versioning.md). On an incident, disable the
smallest affected capability independently. The write kill switch never needs to stop indexing or
evaluation. Authorization uncertainty means omit/no-write; source or parser incompleteness means
partial/not-analysed; neither becomes a clean negative.

No reference deployment is production-authorized by this repository state: all strata remain
`UNMEASURED`, so advisory writes remain disabled.
