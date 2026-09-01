# ADR 0006 — Fail-closed audit boundaries

**Status:** Accepted  
**Date:** 2026-09-01

## Context

The repository-wide functional audit found several places where individually valid inputs could be
combined outside their intended scope. Artifact cache entries were keyed by blob contents even
though classification also depends on path, Git entry kind, size, and the active byte limit.
Overlay and analysis use cases did not validate every workspace, repository, revision, and exact
Git identity returned through their ports. GitHub reconciliation retained state for repositories
that disappeared from provider scope, and evidence consumption could survive loss of the current
provider read grant.

The same audit found supported adapter syntax that was silently omitted: local TypeScript export
lists/default assignments and OpenAPI path-item references. Adapter fingerprints also depended on
caller artifact order, while malformed JSON OpenAPI documents could be classified as unsupported
instead of failed. On Windows, path separators, line endings, package-manager shims, and absolute
drive paths broke quality and release tooling.

## Decision

- Artifact cache keys include a canonical hash of path, Git entry kind/mode, size, and the active
  byte limit. Existing cache rows remain valid derived data but do not match the new contextual key.
- Exact-source consumers validate repository, commit, tree, diff, and blob scope before persisting
  evidence. Overlay bases and analysis inputs must match their workspace, repository, registry,
  indexer, and config boundaries.
- GitHub evidence use requires a current provider read grant. Reconciliation purges selected
  repositories omitted by the provider, and registry sync prunes services and aliases owned by
  repositories that leave scope.
- Supported TypeScript local exports and OpenAPI local path-item references are materialized.
  Probable malformed OpenAPI JSON fails coverage, and adapter source fingerprints canonicalize
  artifact order. The conformance harness verifies reordered inputs.
- Repository and release tools are path- and launcher-neutral across Windows and POSIX. Text files
  are normalized to LF; provider-writer boundaries use path APIs; pnpm subprocesses reuse the
  lifecycle entry point; tar reads archives relative to its working directory.

No schema-major or adapter identity-version change is made. Canonical key algorithms and wire
shapes are unchanged. The adapter changes correct missing observations within already declared
syntax and evidence strata; they do not reinterpret an existing canonical identity.

## Consequences

The first run after upgrade may miss older derived artifact-cache entries and reclassify files.
That is safe and requires no storage migration. Analyses that previously accepted mixed-scope port
results now fail closed. GitHub installations that have lost repository scope produce purge work
instead of retaining stale selected state. TypeScript and OpenAPI repositories may produce
additional definitions that were previously omitted, with regression, integration, conformance,
and adversarial tests preserving the new behavior.
