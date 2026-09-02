# ADR 0007 — Repository-scoped TypeScript module contracts

## Status

Accepted for TypeScript adapter 0.3.0.

## Context

Reverb's npm identities correctly join public package exports to consumers in other repositories,
but they do not describe dependencies between modules inside one private application repository.
Treating every internal path as an npm subpath would falsely expose private code as a public
cross-repository contract. A host-specific heuristic would make the evidence impossible to reuse or
calibrate independently.

## Decision

The existing TypeScript adapter gains a second identity namespace:

- npm-public identities continue to use registry, package, public subpath, symbol space, and symbol;
- internal identities use a host-provided stable repository scope, normalized module path, symbol
  space, and symbol;
- relative imports and bounded `compilerOptions.paths` mappings resolve to internal identities;
- internal implementation evidence is persisted as a hash, never as source text;
- one importer module produces one stable reference identity, preserving actionable locations;
- internal additions, removals, signature edits, and implementation-only edits use current-runtime
  activation and their own unmeasured evidence strata;
- computed imports, unresolved local paths, namespace-member selection, and cycles fail closed.

The adapter and partitioning versions change. The canonical npm identity algorithm does not change,
so the identity version remains 1. Every new internal evidence stratum begins `UNMEASURED` and must
pass the normal review and promotion process before provider delivery.

## Consequences

Hosts can analyze same-repository and cross-repository effects through one evidence graph without
conflating their visibility or activation semantics. Existing package consumers remain compatible.
Hosts that opt into `repositoryScope` must re-index TypeScript snapshots before analyzing pull
requests. Exact PR overlays continue to read only changed blobs because compiler mappings and module
facts live in the persisted base partition.
