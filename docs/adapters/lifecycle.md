# Adapter lifecycle and Phase 002 inventory

All Phase 002 adapters are preview-only. Synthetic fixtures prove protocol mechanics; they do not
measure production precision or make an evidence stratum deliverable. The generated admission
reports therefore always carry `promotionState: UNMEASURED` and `deliveryReady: false`.

## Versioning and removal

- A compatible implementation correction increments the adapter version.
- A material extraction or compatibility change increments the adapter version and creates or
  resets the affected evidence stratum to `UNMEASURED`.
- A canonical-key change increments `identityVersion`, requires re-index/re-key instructions, and
  invalidates prior calibration, suppression, and fingerprint assumptions.
- Deprecation is declared in the manifest with an optional replacement and removal date. Before
  1.0, a deprecated adapter remains for at least one minor where practical. Removing an adapter
  never rewrites an old extraction as an empty current extraction.
- Base/head extraction produced by different adapter, identity, or config versions is rejected as
  incompatible. It cannot produce a breaking or compatible claim.

## Artifact behavior

| Adapter        | Processed                                                             | Excluded                                   | Incomplete behavior                                                                                                                                |
| -------------- | --------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript/npm | source, generated declarations, JavaScript, examples                  | vendored and test artifacts                | missing package/export mapping, syntax errors, ambiguity, dynamic or namespace imports produce partial/failed coverage or unresolved references    |
| OpenAPI        | content-discovered OpenAPI 3.0/3.1 source, generated, examples        | vendored and test artifacts                | remote refs are never fetched; unresolved local refs, missing registry service identity, and duplicate operation identity produce partial coverage |
| Protobuf/gRPC  | canonical descriptor-set JSON from source/generated/example artifacts | raw `.proto`, vendored, and test artifacts | malformed descriptors and duplicate name/wire identities cannot manufacture an empty complete result                                               |

## Tool and parser inventory

| Component                     | Version | License    | Integrity/use                                                                                            |
| ----------------------------- | ------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| TypeScript compiler API       | 5.9.2   | Apache-2.0 | locked npm package; in-process bounded structural lane                                                   |
| `yaml`                        | 2.8.3   | ISC        | locked npm package; aliases bounded and remote refs never fetched                                        |
| `oasdiff` Linux amd64 archive | 1.28.0  | Apache-2.0 | `sha256:e0ef076f2cf953d922addc04be9c3851cf3ec18f7678d2b94d44cea23dca51b5`; argv-only sandbox declaration |
| Buf Linux x86-64 archive      | 1.72.0  | Apache-2.0 | `sha256:a9c6186cf6fcf062b247345e1b7b12c26f580c1b2a4bbf4d3fe080abf85ceee8`; argv-only sandbox declaration |

Release metadata is pinned from the official [oasdiff releases](https://github.com/oasdiff/oasdiff/releases)
and [Buf releases](https://github.com/bufbuild/buf/releases). The license gate checks npm production
dependencies, declared parser dependencies, external tool licenses, exact tool versions, and
canonical SHA-256 digests.

## Generated admission reports

- [OpenAPI](../verification/adapters/openapi.json)
- [Protobuf/gRPC](../verification/adapters/protobuf.json)
- [TypeScript/npm](../verification/adapters/typescript.json)

Run `pnpm adapters:admission:check` to prove the checked-in reports match the current manifests and
report generator.
