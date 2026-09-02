# @yanib/reverb-adapter-typescript

TypeScript and npm contract analysis for Reverb.

## Incremental package partitions

Adapter version 0.2.0 implements `IncrementalContractAdapter` partitioning version 1. A host invokes
the adapter once per package root and persists the returned package partition during normal branch
indexing. The payload contains normalized parser facts and package metadata; it does not contain
source bytes.

For a pull request, supply the persisted base partition, the exact changed-path manifest, and only
the changed eligible head artifacts. The adapter removes deletions, applies replacements and
renames, reparses those changed blobs, and rematerializes exports and imports from the logical fact
set. A missing base partition, tampered payload, or missing required changed blob yields incomplete
or failed coverage. It never requests a repository scan.

Hosts must retain the same configuration context for clean and incremental materialization,
including `packageRegistry`, `packageRoot`, explicit `entrypoints`, and lock evidence. Snapshot
compatibility also requires the same adapter, identity, partitioning, config, and registry versions.

## Installation

```bash
pnpm add --save-exact @yanib/reverb-adapter-typescript@0.2.0
```

Import only the documented package root. See the
[public package API](https://github.com/YanibHQ/reverb-impact/blob/main/docs/api/public-packages.md)
and [compatibility policy](https://github.com/YanibHQ/reverb-impact/blob/main/docs/compatibility/versioning.md)
before embedding Reverb in a host.

Reverb 0.x is a pre-1.0 release line. Pin an exact version and review release metadata before
upgrading.

## License

Apache-2.0
