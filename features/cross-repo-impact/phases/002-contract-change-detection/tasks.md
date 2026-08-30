# Phase 002 Tasks

**Status:** Implemented and verified locally; admission remains preview-only

## A. SDK

- [x] Write adapter manifest/schema validation tests
- [x] Implement operations and output validators
- [x] Add identity round-trip/determinism/resource/adversarial fixture harness
- [x] Add admission report generator and preview-only default

## B. Sandbox

- [x] Implement declared external-tool runner through `SandboxRunner`
- [x] Test argv/no-shell, no-network, read-only, path containment, limits, exit mapping
- [x] Record version/digest/license on results

## C. OpenAPI

- [x] Content discovery and local `$ref` resolver with coverage
- [x] `operationId` and method/path identity functions/fixtures
- [x] Generated-client reference mapping
- [x] Pinned differ wrapper and request/response change mapping
- [x] Unresolved/remote ref, drift, fallback-lane, formatting fixtures
- [x] Remedies and admission report

## D. Protobuf/gRPC

- [x] Descriptor/name/wire canonical functions
- [x] Provider method/message and consumer stub references
- [x] Pinned `buf` wrapper/category config
- [x] Reserved/deleted/renamed/reused-number/wire-JSON fixtures
- [x] Remedies and admission report

## E. TypeScript/npm

- [x] Package/export-subpath/symbol canonical function
- [x] Public export/re-export/type/value extraction
- [x] Consumer import/reference extraction
- [x] Manifest/lockfile version and activation classification
- [x] Compatibility subset with conservative unknowns
- [x] Barrel/overload/type-only/JS/dynamic/version fixtures
- [x] Remedies and admission report

## F. Cross-adapter verification

- [x] Semantic move/format metamorphic tests
- [x] Empty-complete versus empty-failed tests
- [x] incompatible version/source comparisons yield unknown
- [x] package/native/tool license scan
- [x] stable output hash across repeated runs

## Verification

- [x] `pnpm test --filter adapter-sdk`
- [x] `pnpm test --filter adapter-openapi`
- [x] `pnpm test --filter adapter-protobuf`
- [x] `pnpm test --filter adapter-typescript`
- [x] `pnpm test:adversarial --filter adapters`
- [x] `pnpm licenses:check`
- [x] admission reports linked from phase verification

## Exit review

- [x] No adapter can persist/deliver/authorize/call a model
- [x] All strata remain unmeasured/preview
- [x] Synthetic results are not described as production precision
- [x] Missing required inputs cannot manufacture absence
