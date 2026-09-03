# Next-generation Phase 005 release verification

**Status:** complete release-candidate validation; external release actions remain approval-gated.

This record covers the fixed-version Reverb `0.5.0` candidate. It does not claim npm publication,
a GitHub release or tag, deployment, production migration, live-provider operation, GitHub App
permission changes, or Yanib integration.

## Compatibility and contracts

- Every one of the 19 public package manifests and the private minimal-host fixture uses exact
  version `0.5.0`; every internal workspace dependency is fixed to `workspace:0.5.0` and becomes
  exact `0.5.0` in packed manifests.
- The frozen `0.4.0` public-package, schema-major 1, migration, adapter-identity, vocabulary, and
  canonical-result baseline passes unchanged. The packed v0.4 host fixture compiles against the
  0.5 tarballs.
- Schema-major 2 and `AnalyzePullRequestV2` remain explicitly negotiated. Unsupported majors are
  rejected, while the legacy `AnalyzePullRequest` path retains schema-major 1 behavior.
- SQLite upgrades add migration 8 and PostgreSQL upgrades add migration 4. Both test a populated
  0.4 store and retain readable legacy canonical records after the forward-only upgrade.
- The API, generated schemas, three host declarations, eight adapter admission records, migration,
  re-index, calibration, documentation-link, dependency-boundary, and license checks pass.

## Functional and security evidence

- All five new deterministic families pass clean/incremental equivalence, same-repository,
  cross-repository backend-to-backend, partial-coverage, deletion/invalidation, and adversarial
  fixtures. Existing TypeScript, OpenAPI, and Protobuf suites remain green.
- Scoped-read canaries cover source, generation, evidence, and reasoning retrieval. The producer is
  always included, an empty allowlist is producer-only, and no unselected repository is read or
  added through transitive expansion.
- Optional reasoning passes consent, bounded one-batch retrieval, source minimization, strict
  structured output, two-sided citation, timeout/refusal/malformed output, circuit-breaker,
  retention/purge, and deterministic-isolation tests. No provider is bundled or enabled.
- The bounded comparative benchmark and checksum-addressed
  [release benchmark](phase-005-next-generation-release-benchmark.json) pass. All eight adapter
  admissions remain `UNMEASURED` and not delivery-ready; stored local latency is not a production
  SLO or accuracy claim.

## Executed gates

`pnpm run ci` and `pnpm release:verify` passed with:

- 226 unit tests across 39 files;
- 84 integration tests across 17 files, including the PostgreSQL 0.4 upgrade;
- 18 conformance tests across 10 files;
- 46 adversarial tests across 11 files;
- 3 SQLite forward-migration tests;
- formatting, lint/boundaries, type/public API contracts, v1/v2 compatibility, schema generation,
  host capabilities, adapter admission, documentation, and license policy;
- bounded comparative/release benchmark execution;
- 19 package tarballs installed into a fresh isolated consumer, with packed v0.4/v2 host compile,
  every public root import, root-only export validation, SHA-256 checksums, and CLI `0.5.0` smoke;
- a CycloneDX SBOM with 45 components and release provenance covering 19 packages and 31 schemas.

`pnpm audit:check` separately reported no known production vulnerabilities at the configured high
severity threshold. Hosted pull-request CI repeats the repository gates from a clean Node 24/Linux
checkout before merge.

## Operator boundary

The [release notes](../releases/0.5.0.md) and
[host upgrade checklist](../operations/upgrade-0.5.0.md) describe additive migrations, per-adapter
initial indexing, preview-only calibration, known limitations, rollback, and staged integration.
Publication, release/tag creation, runtime deployment, production migrations, permission changes,
live-model enablement, and any Yanib modification require separate explicit approval.
