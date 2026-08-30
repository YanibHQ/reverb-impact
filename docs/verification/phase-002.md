# Phase 002 contract-change verification

- Date: 2026-08-28
- Runtime: Node 25.2.1 / pnpm 10.27.0; CI target: Node 24
- Scope: standalone adapter SDK and preview adapters; no Yanib code, storage, delivery, provider,
  authorization orchestration, or model integration

## Outcome

Three versioned adapters now emit canonical definitions, consumer references, base/head changes,
activation timing, coverage dependencies, bounded diagnostics, remedies, and deterministic output
hashes under one validated SDK.

- TypeScript/npm covers package export subpaths, barrels/re-exports, type/value spaces, overloads,
  required parameters, static ESM/CommonJS imports, package locks, JavaScript, and conservative
  unknowns for complex or dynamic behavior.
- OpenAPI discovers 3.0/3.1 documents by content, validates local refs, never fetches remote refs,
  keeps `operationId` separate from method/path fallback, maps generated clients, and delegates
  compatibility to pinned `oasdiff` metadata.
- Protobuf/gRPC consumes descriptor-set JSON, extracts qualified method and field-wire identities,
  maps generated stubs, records Buf categories, and delegates deletion/rename/reservation/reuse
  compatibility to pinned Buf metadata.

No adapter is production-calibrated. All strata and [admission reports](adapters/) remain
`UNMEASURED`, preview-only, and non-deliverable.

## Verification matrix

| Gate        | Evidence                                                                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | SDK manifest/output/hash validation; identity; empty-state separation; TypeScript/OpenAPI/Protobuf definition, reference, compatibility, activation, remedy fixtures                                                    |
| Integration | all manifests/admission states together; incompatible adapter/config versions cannot emit a breaking claim                                                                                                              |
| Conformance | repeat-run canonical output hashes; formatting-insensitive OpenAPI shapes; descriptor and barrel/overload determinism                                                                                                   |
| Adversarial | no-shell argv, content-addressed inputs, network/read-only/scratch/resource declarations, traversal/remote refs, alias expansion, malformed descriptors/source, tool timeout/truncation/unmapped exits, dynamic imports |
| Boundaries  | adapter sources reject application, storage, host, delivery-capable, process, network, and model imports                                                                                                                |
| Licenses    | npm production dependency policy plus exact adapter parser/native-tool version, digest, and license declarations                                                                                                        |
| Schemas     | checked-in Draft 2020-12 adapter manifest and extraction schemas                                                                                                                                                        |

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:conformance
pnpm test:adversarial
pnpm schema:check
pnpm adapters:admission:check
pnpm licenses:check
```

The aggregate gate is `pnpm run ci`; `pnpm release:verify` additionally validates clean package
tarballs, the production audit, and the SBOM.

## Safety and failure semantics

- External differs receive structured argv and content-addressed blob references. Their declared
  execution has no network, read-only inputs, scratch-only output, an empty environment, and
  explicit time, memory, and output bounds.
- Missing differ inputs, timeout, truncation, failure, remote ref, dynamic access, ambiguous
  identity, incompatible versions, and incomplete coverage yield unknown/partial/failed results;
  none manufactures compatibility or a removal claim.
- Complete empty extraction remains distinct from unsupported and failed empty extraction.
- Every changed definition has activation, coverage dependencies, differ metadata, and a remedy.
- Generated, vendored, test, and example handling is recorded in the
  [adapter lifecycle](../adapters/lifecycle.md).

## Deliberate phase boundary

Phase 002 does not join producer changes to consumers across repositories, persist a finding,
score/promote evidence, write a check, call a provider, or call a model. Those capabilities remain
gated by Phases 003–006.
