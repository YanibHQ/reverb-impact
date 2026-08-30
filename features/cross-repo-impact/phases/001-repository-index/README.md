# Phase 001 — Repository Index Foundation

**Status:** Implemented and locally verified  
**Depends on:** project constitution only  
**Produces:** immutable repository generations, overlays, coverage, ports, local host

## Goal

Create the stable substrate every later contract adapter and finding depends on. This phase deliberately proves indexing mechanics before cross-repository intelligence.

## Delivers

- pure domain values and canonical schemas;
- complete application port set and in-memory conformance harness;
- versioned workspace/repository/service/consent registry foundation;
- local Git/filesystem source adapter;
- SQLite generation/evidence/job/blob metadata adapter;
- content-addressed file artifacts;
- complete/partial/failed immutable generations;
- incremental reuse verified against clean rebuild;
- exact base/head overlay primitives and tombstones;
- analysis coverage and bounded diagnostics;
- parser worker boundary, path/resource controls, and telemetry leak tests.

## Does not deliver

- useful contract extraction;
- cross-repository edges or findings;
- GitHub App/webhooks/checks;
- human review/calibration;
- Postgres or hosted multi-tenancy;
- embeddings, LLMs, graph database, or dashboard.

## Exit gate

1. A fixture repository can be indexed at an exact SHA and reproduced from recorded inputs.
2. Incremental and clean rebuilds are semantically identical.
3. File deletion/rename and overlay tombstones behave deterministically.
4. Unsupported/failed/truncated inputs appear in coverage and cannot look like empty success.
5. An interrupted generation is never selectable.
6. Domain package contains no host/database/provider imports.
7. Local source and SQLite adapters pass host conformance v1.
8. Adversarial path, symlink, archive, size, and parser-failure fixtures stay contained.

## What happens if we skip this

**A disputed finding cannot be reproduced.** Without generations keyed by repository, SHA, bundle
version and configuration revision, the inputs that produced a finding are replaced by the next
index run. Repowise's update path re-walks and re-hashes every file, and its parse cache
invalidates globally on any query or dataclass change (`pipeline/incremental.py:50`), so "what did
we see at that commit" has no answer after a routine upgrade.

**A repository nobody could parse reports the same result as one parsed completely.** Coverage has
to be a first-class part of every result, because the format most likely to carry findings outward
cannot express it: SARIF 2.1.0 states failure as the single Boolean
`invocation.executionSuccessful`, so a run covering three of ten languages and a run covering all
ten serialize identically ([`../../research/verified-citations.md`](../../research/verified-citations.md)).

**The second host becomes a rewrite rather than an adapter.** Without the port boundary enforced by
a dependency test, the first host's assumptions harden into the core, and
[Phase 006](../006-host-adapters/) has nothing to adapt against.

## Documents

- [spec.md](spec.md) — phase requirements and data contracts
- [plan.md](plan.md) — component sequence and testing
- [tasks.md](tasks.md) — executable checklist
- [shared architecture](../../architecture.md)
