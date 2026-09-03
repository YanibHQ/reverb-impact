# @yanib/reverb-adapter-typescript

TypeScript and npm contract analysis for Reverb.

## Incremental package partitions

Adapter version 0.3.0 implements `IncrementalContractAdapter` partitioning version 2. A host invokes
the adapter once per package root and persists the returned package partition during normal branch
indexing. The payload contains normalized parser facts, bounded `tsconfig`/`jsconfig` path mappings,
and package metadata; it does not contain source bytes.

## Repository-local impact

Set `repositoryScope` in the adapter context to a stable, workspace-unique repository identity.
The adapter then emits repository-scoped definitions for every statically exported TypeScript or
JavaScript module symbol and matching references for relative imports and `compilerOptions.paths`
aliases. These identities cannot join across repositories; npm-public identities remain the
cross-repository contract surface.

Internal function, class, and variable implementations are represented only by a content hash.
An implementation-only edit is a potentially breaking, current-runtime change so a host can point
reviewers to exact importing modules without persisting source bodies. Literal dynamic imports with
named destructuring are resolved statically. Computed imports, namespace member selection, missing
local modules, and unresolved local re-export cycles remain explicit preview or partial evidence.

For a pull request, supply the persisted base partition, the exact changed-path manifest, and only
the changed eligible head artifacts. The adapter removes deletions, applies replacements and
renames, reparses those changed blobs, and rematerializes exports and imports from the logical fact
set. A missing base partition, tampered payload, or missing required changed blob yields incomplete
or failed coverage. It never requests a repository scan.

Hosts must retain the same configuration context for clean and incremental materialization,
including `packageRegistry`, `packageRoot`, explicit `entrypoints`, and lock evidence. Snapshot
compatibility also requires the same `repositoryScope`, adapter, identity, partitioning, config, and
registry versions.

## Installation

```bash
pnpm add --save-exact @yanib/reverb-adapter-typescript@0.5.0
```

Import only the documented package root. See the
[public package API](https://github.com/YanibHQ/reverb-impact/blob/main/docs/api/public-packages.md)
and [compatibility policy](https://github.com/YanibHQ/reverb-impact/blob/main/docs/compatibility/versioning.md)
before embedding Reverb in a host.

Reverb 0.x is a pre-1.0 release line. Pin an exact version and review release metadata before
upgrading.

## License

Apache-2.0
