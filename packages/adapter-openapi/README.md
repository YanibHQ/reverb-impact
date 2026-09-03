# @yanib/reverb-adapter-openapi

OpenAPI and HTTP contract analysis for Reverb.

## Incremental document partitions

Adapter version 0.2.0 implements `IncrementalContractAdapter` partitioning version 1. Each
content-discovered OpenAPI document is stored as a separate partition containing normalized
operation facts, artifact identity, source ranges, and bounded reference-state flags—not source
bytes.

At pull-request time, the host supplies every changed head blob within the explicit provider budget.
The adapter discovers added specs by content even at arbitrary paths, replaces modified/renamed
documents, writes tombstones for deletions or files that cease to be specs, and leaves every
untouched document in the base snapshot. Missing changed blobs make coverage partial and never
trigger a repository scan.

In-document JSON Pointer references are checked while the changed document is parsed. Network and
external-file references are never fetched and retain partial coverage. The pinned compatibility
differ remains a separate sandboxed boundary.

## Installation

```bash
pnpm add --save-exact @yanib/reverb-adapter-openapi@0.5.0
```

Import only the documented package root. See the
[public package API](https://github.com/YanibHQ/reverb-impact/blob/main/docs/api/public-packages.md)
and [compatibility policy](https://github.com/YanibHQ/reverb-impact/blob/main/docs/compatibility/versioning.md)
before embedding Reverb in a host.

Reverb 0.x is a pre-1.0 release line. Pin an exact version and review release metadata before
upgrading.

## License

Apache-2.0
