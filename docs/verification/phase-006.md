# Phase 006 Verification

**Status:** standalone implementation complete; public publication, archival DOI, production-scale
evidence, and any Yanib integration remain external gates.

Phase 006 stabilizes Reverb as an independently adoptable engine. Per the project goal, no Yanib
repository, database, API, or product code was read or modified. The plan's permitted independent
third-host path is implemented instead.

## Delivered boundary

- Public packages expose documented root entry points only; API roles, errors, states, versioning,
  migrations, re-index, calibration, self-hosting, and adapter admission are documented.
- Schema compatibility is explicit at `1.0`. There is no previous public major before the first
  release, and v0 receives a teaching `unsupported_schema_major` error rather than coercion.
- Host conformance `1.0.0` runs identical complete, partial, not-analysed, superseded, duplicate,
  immutable-conflict, current-pointer, workspace-isolation, and declared deletion cases against
  PostgreSQL, SQLite, and the independent in-memory example.
- PostgreSQL migration 2 separates mutable current pointers from immutable canonical records. A
  migration-1 fixture upgrades to migration 2 under a real PostgreSQL instance.
- Declared relationships require explicit membership and `evidence.consume` consent at both ends,
  retain source/author/revision/valid-time provenance, and remain `declared_context`; even a
  canonical contract hint cannot turn one into structural evidence.
- The standalone GitHub reference host is the only configured check writer. Duplicate ownership is
  rejected, writes reauthorize and recheck current head, and delivery remains disabled unless an
  exact current promoted stratum exists.
- The release benchmark is a checksum-addressed manifest over synthetic mechanics, frozen
  evaluation state, host capabilities, release metadata, and the exact lockfile. It deliberately
  contains no customer data or production-accuracy claim.

## Host conformance profile

The published v1 profile covers canonical analysis persistence and selection. Optional host ports
are not normalized into fake parity; they are declared in
[host-capabilities.json](../compatibility/host-capabilities.json) and tested in their owning suites.

| Host              | Persistence/source | Canonical profile | Deletion     | Important unsupported ports                            |
| ----------------- | ------------------ | ----------------- | ------------ | ------------------------------------------------------ |
| GitHub/PostgreSQL | durable/exact Git  | passes            | passes       | model, vector search                                   |
| local SQLite      | durable/local Git  | passes            | not declared | provider webhooks, external delivery, purge            |
| minimal example   | ephemeral/injected | passes            | passes       | durable jobs, provider webhooks/writes, artifact blobs |

Disclosure, review, provider authorization, check writing, queue cancellation/retry, and parser
failure behavior remain covered by their domain/reference-host suites rather than being falsely
claimed as supported by every host.

## Shared requirement evidence

| Requirement   | Evidence                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| INV-1–INV-6   | Phase [002](phase-002.md) and [003](phase-003.md) adapter, evidence, graph, coverage, and finding tests                                   |
| INV-7         | deterministic structural pipeline and [model experiment boundary](../security/phase-004-model-experiment.md)                              |
| INV-8–INV-10  | revisioned registry, PostgreSQL RLS, and Phase [005](phase-005.md) authorization/disclosure canaries                                      |
| INV-11–INV-12 | temporal invalidation, exact overlay, consumer fingerprint, and force-push tests in Phase [003](phase-003.md)                             |
| INV-13–INV-15 | Phase [004](phase-004.md) append-only review/promotion evidence and Phase [005](phase-005.md) advisory-only planner                       |
| INV-16        | boundary checker, root-only package exports, three host implementations, and conformance v1                                               |
| FR-1–FR-2     | Phase [001](phase-001.md) plus Phase [003](phase-003.md) registry/index evidence                                                          |
| FR-3          | Phase [002](phase-002.md) SDK/adapters/admission evidence                                                                                 |
| FR-4–FR-7     | Phase [003](phase-003.md) graph/analysis/findings plus Phase [005](phase-005.md) disclosure projections                                   |
| FR-8–FR-9     | Phase [004](phase-004.md) review, suppression, corpus, evaluation, and policy replay                                                      |
| FR-10         | Phase [005](phase-005.md) local/JSON preview and disabled advisory reference delivery                                                     |
| FR-11         | [public API](../api/public-packages.md), [versioning](../compatibility/versioning.md), conformance v1, minimal host, package verification |
| NFR-1         | adversarial suites, network-denied sandbox, telemetry allowlist, GitHub security review, RLS and purge tests                              |
| NFR-2         | canonical hashing, clean/incremental equivalence, frozen adapters and lockfile-addressed release benchmark                                |
| NFR-3         | incremental design and local projection benchmark only; full 100-repository target-profile SLO remains unproven                           |
| NFR-4         | webhook/job/outbox/check deduplication, lease recovery, current-pointer supersession, and stale-head rejection                            |
| NFR-5         | schema compatibility policy, SQLite migrations, and real PostgreSQL migration-1-to-2 test                                                 |
| NFR-6         | analysis resource fields and benchmark resource/environment records; production cost remains unmeasured                                   |
| NFR-7         | keyboard-native, text-and-colour-independent, escaped detail rendering with explicit coverage/redaction                                   |

Success metrics remain stratified and honest: all adapters are `UNMEASURED`, no real-world
precision/recall is estimable, no external check has been written, and no production latency or
cost claim is made. The only numeric disclosure result is zero seeded leakage defects in the local
2,000-projection mechanics benchmark.

## Verification commands

Focused evidence at implementation close:

- `pnpm test:all-hosts`: 3 host cases passed;
- `pnpm test:postgres`: 5 real PostgreSQL integration/upgrade cases passed;
- `pnpm test:github-app`: 15 GitHub boundary/delivery cases passed;
- schema/compatibility: 6 cases passed;
- declared-context/graph: 13 cases passed;
- adversarial/security: 21 cases passed;
- `pnpm benchmark --profile release --write`: generated
  [phase-006-release-benchmark.json](phase-006-release-benchmark.json);
- `pnpm release:verify`: 72 unit, 46 integration, 9 conformance, 21 adversarial, and 2
  SQLite-migration cases passed; the integration total includes 5 real PostgreSQL cases and the
  migration-1-to-2 upgrade. All 13 public packages were packed/checksummed and the SBOM contains 35
  components.
- `pnpm audit:check`: no known production dependency vulnerabilities.

## Open external gates

- No npm package or container has been published or signed. Local tarballs, checksums, SBOM, license
  checks, and the provenance workflow exist.
- No archival DOI exists, and no customer/private corpus is authorized for release. See
  [public artifact status](../research/public-artifact-status.md).
- No production target-profile load window, real-organization shadow window, promoted stratum, or
  advisory rollout has occurred.
- Yanib integration and Yanib-specific review mapping are intentionally absent. A future integration
  must use the public boundary and requires an explicit request outside this standalone goal.
