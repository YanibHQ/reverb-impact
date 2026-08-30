# Phase 002 — Contract Change Detection

**Status:** Implemented locally; all evidence strata remain `UNMEASURED`  
**Depends on:** [001](../001-repository-index/)  
**Produces:** adapter SDK, definitions/references, compatibility changes, remedies

## Goal

Convert repository artifacts into versioned producer definitions, consumer references, and base/head contract changes without yet claiming cross-repository impact.

## Initial adapters

1. TypeScript/npm public symbols and consumer imports/references.
2. OpenAPI operations and generated-client references, wrapping a pinned compatibility differ.
3. Protobuf/gRPC name/wire identities and generated-client references, wrapping pinned `buf` behavior.

The first three are a proof of the adapter protocol, not a claim of broad language coverage.

## Core rules

- one canonical identity function per kind;
- adapters return coverage and bounded diagnostics even for zero items;
- unresolved required inputs produce `unknown`;
- compatibility and activation timing are separate;
- external tools run sandboxed with no network or ambient credentials;
- fixtures measure mechanics, not real-world precision;
- every potentially deliverable change has a remedy template;
- every adapter/evidence stratum remains `UNMEASURED` after this phase.

## Exit gate

- all three adapters pass identity, determinism, resource, adversarial, and fixture suites;
- base/head results are stable across formatting and location-only edits;
- real identity/shape changes produce expected classifications;
- missing refs/imports/tool timeouts cannot manufacture a removal or compatible result;
- external tool versions/licenses/digests are recorded;
- no adapter imports storage, provider, delivery, model, or review code.

## What happens if we skip this

**The finding degrades to file level without a contract adapter.** Current Repowise also extracts
contract-level package symbols and consumer links, so this is not a unique Reverb capability. The
Phase 003 comparison confirmed that both systems linked the same removed TypeScript symbol to its
consumer. Reverb's adapter boundary is still required for versioned identity, explicit coverage,
external semantic differs, and host-neutral evidence records
([`../../../../docs/verification/phase-003-comparison.md`](../../../../docs/verification/phase-003-comparison.md)).

**Breaking semantics get re-derived, and get the ambiguous cases wrong.** `oasdiff` encodes 219
breaking rules, `buf` encodes four wire-compatibility categories, and `graphql-js` enumerates 16
breaking types. Re-implementing that judgement means deciding unaided whether adding an enum member
breaks a consumer (it does in TypeScript and Rust, not elsewhere) and whether a new required
interface field breaks a consumer that *constructs* the type versus one that only *receives* it
([`../../research/contract-taxonomy.md`](../../research/contract-taxonomy.md)).

**A moved contract is announced as a new one.** Without a single versioned identity function per
contract kind, addition and rename derive different keys. This is why identity is a shared adapter
operation rather than duplicated parsing logic in definition and diff paths.

## Documents

- [spec.md](spec.md)
- [plan.md](plan.md)
- [tasks.md](tasks.md)
- [contract taxonomy](../../research/contract-taxonomy.md)
- [verification evidence](../../../../docs/verification/phase-002.md)
- [adapter lifecycle and inventory](../../../../docs/adapters/lifecycle.md)
