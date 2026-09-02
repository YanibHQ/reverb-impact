# @yanib/reverb-storage-postgres

PostgreSQL storage for hosted Reverb integrations, including immutable canonical records,
workspace pointers, signed-webhook inbox, durable jobs, disclosure projections, delivery outbox,
audit events, backup/restore, and consent-driven purge.

## Installation

```bash
pnpm add --save-exact @yanib/reverb-storage-postgres@0.3.0
```

Import only the documented package root. See the
[public package API](https://github.com/YanibHQ/reverb-impact/blob/main/docs/api/public-packages.md)
and [compatibility policy](https://github.com/YanibHQ/reverb-impact/blob/main/docs/compatibility/versioning.md)
before embedding Reverb in a host.

Reverb 0.x is a pre-1.0 release line. Pin an exact version and review release metadata before
upgrading.

## Runtime use

Run `PostgresHostedStore.migrate()` before workers start. The store structurally implements the
`GitHubHostedRuntimeStore` contract exported by `@yanib/reverb-host-github`; the packages remain
separate so hosts can replace either side.

Webhook, job, and delivery claims use expiring worker leases. Canonical record IDs are immutable:
replaying the same payload is idempotent, while reusing an identity with a different hash is
rejected. Every operation establishes the workspace scope before querying PostgreSQL, and all
hosted tables use forced row-level security.

## License

Apache-2.0
