# Phase 002 Plan

**Status:** Implemented and verified locally on 2026-08-28; preview-only

## Build order

1. Adapter manifest/types/test harness.
2. Shared artifact/evidence/coverage validators.
3. External sandbox wrapper and fake differ.
4. OpenAPI adapter—the clearest spec/differ vertical slice.
5. Protobuf/gRPC adapter—tests dual name/wire identity.
6. TypeScript/npm adapter—tests compiler/public-symbol/reference/version semantics.
7. Cross-adapter determinism, capability tiers, admission reports.

## Why this order

OpenAPI and Protobuf establish contract files and existing compatibility classifiers before the code-symbol adapter introduces compiler/package resolution. TypeScript then proves the SDK is not only a schema-wrapper interface.

## TypeScript boundaries

Use TypeScript compiler APIs for the first supported lane. Do not claim full JavaScript runtime resolution. Lockfiles and package manifests qualify version/activation. Dynamic property access, reflection, star/barrel ambiguity, build-generated declarations, and complex variance may return lower evidence or `unknown`.

## OpenAPI boundaries

Exact lane requires stable spec/service identity and `operationId` plus generated-client binding or another canonical consumer artifact. Method/path fallback and hand-built URLs are distinct preview evidence. Remote refs are not fetched in hosted parsing; operators may vendor or explicitly supply artifacts.

## Protobuf boundaries

Use descriptor semantics and delegate compatibility to pinned `buf` categories. Record whether consumers pin generated code or regenerate, which changes activation and strictness. Vendored/generated outputs do not double-count definitions.

## Fixture design

Each adapter includes:

- positive definition/reference/change cases;
- semantically equivalent formatting/move/refactor cases;
- true identity changes;
- compatibility direction cases;
- unresolved/partial/tool-failure cases;
- test/generated/vendored/third-party exclusions;
- adversarial resource/input cases;
- deterministic output snapshots;
- mutation cases for controlled sensitivity, labelled as synthetic.

## Do not build

- a universal AST schema that erases contract-specific meaning;
- a new OpenAPI/Protobuf compatibility rule catalog;
- a numeric confidence model;
- auto-downloading remote schema refs or running repository code generation;
- framework HTTP, database, messaging, env/config, GraphQL, or Terraform adapters in this phase.
