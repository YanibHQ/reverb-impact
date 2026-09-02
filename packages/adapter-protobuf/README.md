# @yanib/reverb-adapter-protobuf

Protobuf and gRPC contract analysis for Reverb.

## Incremental descriptor partitions

Adapter version 0.2.0 implements `IncrementalContractAdapter` partitioning version 1. Each
content-discovered canonical `FileDescriptorSet` JSON artifact becomes a separate partition of
normalized method and field facts, artifact identity, and failure state—not descriptor source bytes.

At pull-request time, the host supplies every changed head blob within the provider budget. The
adapter discovers descriptor sets at arbitrary paths, replaces edits/renames, writes tombstones for
deletions or files that cease to be descriptors, and rematerializes generated-stub references from
the same versioned context. Untouched descriptor partitions require no provider reads. Missing
changed blobs make coverage partial and never trigger a repository scan.

Raw `.proto` text remains unsupported by this adapter; hosts must generate canonical descriptor-set
JSON during indexing. The pinned Buf compatibility differ remains a separate sandboxed boundary.

## Installation

```bash
pnpm add --save-exact @yanib/reverb-adapter-protobuf@0.3.0
```

Import only the documented package root. See the
[public package API](https://github.com/YanibHQ/reverb-impact/blob/main/docs/api/public-packages.md)
and [compatibility policy](https://github.com/YanibHQ/reverb-impact/blob/main/docs/compatibility/versioning.md)
before embedding Reverb in a host.

Reverb 0.x is a pre-1.0 release line. Pin an exact version and review release metadata before
upgrading.

## License

Apache-2.0
