# Next-generation implementation plan

## Phase 000 — baseline lock

Pin `v0.4.0`, inventory all public exports/schemas/adapter identities/migrations/package metadata,
run the complete release verifier, and check in compatibility fixtures plus a repeatable guard.

## Phase 001 — design contract

Accept the specification, additive v2 boundary, scope capability, evidence identities, storage
strategy, adapter packages, AI isolation, security, evaluation, packaging, and host boundary. No
runtime implementation begins until design links and ADR checks pass.

## Phase 002 — foundation

1. Add v2 domain values and schemas without editing schema-major 1 output.
2. Implement normalized scope resolution and opaque scoped-read capabilities.
3. Require capabilities in v2 generation/evidence/retrieval ports and add unread-repository canaries.
4. Add matching SQLite/PostgreSQL forward migrations and `0.4.0` upgrade fixtures.
5. Add v2 analysis orchestration that delegates existing deterministic behavior where applicable.
6. Add per-family coverage/provenance and separate bootstrap/incremental/PR budgets.

## Phase 003 — deterministic adapters

Implement one complete vertical slice at a time: events, database, implicit HTTP, configuration,
then infrastructure. Each slice lands only with identity design, extraction, compatibility,
activation, coverage, fixtures, adversarial tests, admission metadata, documentation, and both
cross-repository and same-repository proof. Existing adapters and v1 results run after every slice.

## Phase 004 — optional reasoning

Add the neutral reasoning protocol, bounded in-scope retrieval, strict structured result validation,
citation verification, provenance, consent/deletion behavior, deterministic isolation, and fake
provider test suite. Do not add a vendor dependency to core or enable reasoning by default.

## Phase 005 — release validation

Set fixed `0.5.0` versions, generate schemas/docs/release metadata, pack and install all packages in
clean fixtures, run compatibility/migration/conformance/security/performance/release suites, produce
checksums/SBOM/provenance, and write the host integration checklist. Stop before publish/deploy/Yanib.

## Change sequencing

Changes should remain reviewable: one baseline/design change, one foundation change, one PR per
adapter vertical slice, one reasoning change, and one release-candidate change. Security or shared
foundation changes may be split further, but adapter behavior must not be spread across unrelated
partial PRs.
