# Phase 002 Specification

**Parent invariants:** INV-1, INV-3, INV-4, INV-5, INV-6, INV-7, INV-14, INV-16

## P2-FR-1 — Adapter manifest and lifecycle

Every adapter declares ID/version, contract kinds, identity version, capability tiers, evidence strata, external tools, limitations, resource budget, and maintainer.

**Acceptance criteria:**

- invalid/incomplete manifests fail validation;
- adapter output carries manifest/identity/config versions;
- materially changed extraction/identity/evidence creates a new version/stratum and resets promotion;
- adapter removal/deprecation behavior is documented;
- package/native/grammar/tool licenses are machine checked.

## P2-FR-2 — Identity contract

Definitions and references for a kind share one canonicalization implementation.

**Acceptance criteria:**

- producer/reference raw variants normalize to the same key where semantically equal;
- keys are location-insensitive and namespace/host/package/service qualified;
- ambiguous identity yields a constrained unresolved reference or diagnostic, never an arbitrary owner;
- identity changes are tested separately from compatibility changes;
- suppression/fingerprint consumers can call the exported canonical function/version.

## P2-FR-3 — Extraction result

Adapters produce definitions/references plus coverage/diagnostics.

**Acceptance criteria:**

- empty complete result differs from empty failed/unsupported result;
- artifacts cite stable identity, path/range, content hash, extractor/version;
- source exceptions are sanitized/bounded;
- generated/vendored/test/example behavior is explicit per adapter;
- deterministic ordering makes output hash stable.

## P2-FR-4 — Compatibility and activation

Diff results carry change kind, `breaking|potentially_breaking|compatible|unknown`, and activation timing.

**Acceptance criteria:**

- differ only compares compatible extractor/identity/shape sources;
- unresolved required input or tool failure yields `unknown`;
- package changes distinguish current runtime from on-upgrade risk;
- service/API changes distinguish on-deploy or unknown activation;
- nonbreaking additions do not create breaking changes;
- adapter returns coverage dependencies explaining what would invalidate the result.

## P2-FR-5 — External differ sandbox

**Acceptance criteria:**

- argv only, no shell interpolation;
- pinned version/digest/license;
- no network, read-only inputs, scratch output, time/memory/output limits;
- exit codes map explicitly to compatible/breaking/unknown/tool failure;
- malformed and remote-ref fixtures cannot fetch network or escape root;
- differ metadata is recorded on each change.

## P2-FR-6 — TypeScript/npm adapter

**Canonical key:** registry/ecosystem + package + export subpath + symbol path/signature identity where required.

**Required behavior:**

- public export surface, re-exports, subpaths, type/value distinctions;
- consumer imports and semantic references where compiler data is available;
- manifest/lockfile producer version and activation timing;
- removed/renamed export, required parameter/type compatibility subset;
- `unknown` for variance/dynamic cases outside declared rules.

## P2-FR-7 — OpenAPI adapter

**Canonical key:** service/spec identity + `operationId`; fallback method/path is a different weaker identity stratum.

**Required behavior:**

- detect OpenAPI content, not filename;
- resolve local allowed refs and record unresolved/remote refs;
- use a pinned established differ instead of reimplementing the rule catalog;
- map generated client operation identities/references;
- keep hand-built URL/framework heuristics outside the exact generated-client stratum;
- request/response direction semantics and remedy text are explicit.

## P2-FR-8 — Protobuf/gRPC adapter

**Canonical identities:** fully qualified service/method and message field name/wire number.

**Required behavior:**

- descriptor-based comparison, not raw text;
- distinguish wire, JSON, package/file compatibility categories;
- generated-client dependency/reference extraction;
- field reservation, deletion, rename, type/number reuse cases;
- default category recorded; organization override is policy/config revision.

## P2-FR-9 — Adapter admission report

Admission report includes demand/design partner, identity, compatibility, evidence rendering, limitations, maintainer, fixture results, real labelled corpus status, latency/resource, dependencies/licenses, and promotion state.

No adapter can be called delivery-ready from Phase 002 fixtures.

## Definition of done

Three adapters produce definitions, references, changes, coverage, and remedies under one SDK; no cross-repository finding or external check is enabled.
