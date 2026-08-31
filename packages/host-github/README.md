# @yanib/reverb-host-github

GitHub App source, webhook, authorization, review, delivery, and durable runtime composition for
Reverb.

## Installation

```bash
pnpm add --save-exact @yanib/reverb-host-github@0.2.0
```

Import only the documented package root. See the
[public package API](https://github.com/YanibHQ/reverb-impact/blob/main/docs/api/public-packages.md)
and [compatibility policy](https://github.com/YanibHQ/reverb-impact/blob/main/docs/compatibility/versioning.md)
before embedding Reverb in a host.

Reverb 0.x is a pre-1.0 release line. Pin an exact version and review release metadata before
upgrading.

## Hosted runtime

`GitHubHostedRuntime` connects a durable store such as `PostgresHostedStore` to explicitly
registered index, analysis, reconciliation, purge, and review handlers. It processes three
independent leased stages:

1. validated webhook pointer to idempotent job;
2. job to canonical records, current pointers, and optional outbox intents;
3. outbox claim to a reauthorized, current-head-checked provider write.

`CanonicalAnalysisJobAdapter`, `AuthorizedReviewJobAdapter`, and
`GitHubCheckDeliveryAdapter` provide the standard analysis, append-only review, and GitHub check
boundaries. Operator read/write switches stop new claims without deleting queued work.

The embedding service owns HTTP transport, secret storage, token brokers, exact Git backend,
workspace authorization, and worker scheduling. See the
[hosted runtime phase](https://github.com/YanibHQ/reverb-impact/blob/main/features/cross-repo-impact/phases/008-hosted-runtime/README.md)
for the complete responsibility boundary.

## License

Apache-2.0
