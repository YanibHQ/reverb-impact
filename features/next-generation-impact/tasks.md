# Next-generation task ledger

## Phase 000 — baseline lock

- [x] Confirm clean `main` equals tag `v0.4.0` at the recorded commit
- [x] Inventory packages, root exports, schemas, migrations, adapter identities, tests, and metadata
- [x] Run the complete `pnpm release:verify` baseline successfully
- [x] Check in machine-readable public API, schema digest, package, migration, and canonical fixtures
- [x] Add a CI guard that compares v1 results and public contracts with the frozen baseline

## Phase 001 — design

- [x] Specify consumer allowlist semantics and legacy omission behavior
- [x] Specify additive schema-major 2 and `AnalyzePullRequestV2`
- [x] Define five independent adapter package boundaries
- [x] Define provenance, coverage, budget, migration, and performance rules
- [x] Define optional provider-neutral reasoning and deterministic isolation
- [x] Define security, consent, deletion, packaging, evaluation, and Yanib boundaries
- [x] Accept ADR 0008 and pass documentation/link validation

## Phase 002 — foundation

- [x] Add v2 values/types/schemas and negotiation tests
- [x] Add normalized scope hash and resolved scoped-read capability
- [x] Enforce scope in source, generation, evidence, and retrieval paths
- [x] Add membership/authorization/consent and unselected-read canary tests
- [x] Add additive SQLite and PostgreSQL migrations plus `0.4.0` upgrade fixtures
- [x] Add v2 coverage/provenance records and performance budgets
- [x] Prove v1 disabled-feature canonical equivalence

## Phase 003 — deterministic adapters

- [x] Events/queues vertical slice and backend-to-backend fixtures
- [x] Shared database/migrations vertical slice and backend-to-backend fixtures
- [x] HTTP-without-OpenAPI vertical slice and backend-to-backend fixtures
- [x] Configuration/flags/secret-reference vertical slice and backend-to-backend fixtures
- [ ] Infrastructure/deployment vertical slice and backend-to-backend fixtures
- [ ] Same-repository, partial, adversarial, incremental, and scope tests for every family
- [ ] Admission, license, documentation, and performance evidence for every package

## Phase 004 — optional reasoning

- [ ] Provider-neutral port and strict versioned request/result schemas
- [ ] Bounded authorized retrieval seeded only by deterministic evidence
- [ ] Citation verifier and distinct `ai_inferred`/`needs_investigation` outcomes
- [ ] Model/template/retrieval provenance and closed telemetry
- [ ] Consent, retention, deletion, injection, timeout, malformed-output, and failure-isolation tests
- [ ] Prove off/failure paths leave deterministic output unchanged

## Phase 005 — release candidate

- [ ] Set all packages and release metadata to fixed `0.5.0`
- [ ] Complete migration/re-index/compatibility/security/release notes
- [ ] Pack all packages and install in clean v1/v2 fixtures
- [ ] Run all old/new goldens, conformance, adversarial, migration, and performance suites
- [ ] Run `pnpm run ci` and `pnpm release:verify` from a clean checkout
- [ ] Generate checksums, SBOM, provenance, licenses, API inventory, and host checklist
- [ ] Stop and request approval before npm publish, GitHub release, deployment, migrations, or Yanib
