# Phase 006 Specification

**Parent invariants:** INV-1, INV-7, INV-9, INV-10, INV-13, INV-16

## P6-FR-1 — Stable public packages

**Acceptance criteria:**

- documented exports only; internal paths unavailable;
- semantic and schema version policy applied;
- errors/states/closed vocabularies documented;
- current and previous supported schema major compatibility tested;
- release notes state migrations, re-index, identity/calibration impact;
- signed/checksummed packages/container, SBOM, provenance, license inventory.

## P6-FR-2 — Host conformance v1

**Acceptance criteria:**

- local SQLite and GitHub/Postgres execute identical golden analyses;
- normalize only host URLs/display names; canonical finding/coverage semantics equal;
- failure, cancellation, duplicate, supersession, authorization, disclosure, review, deletion cases equal;
- conformance suite/version published in testkit;
- host declares capabilities/unsupported optional ports honestly.

## P6-FR-3 — Yanib source/analysis adapter

**Acceptance criteria:**

- Yanib supplies repository/workspace/consent through public host interfaces or calls Reverb service API;
- exact base/head and consumer generations remain Reverb canonical inputs;
- Yanib stores pointer/version/projection, not reference-host internals;
- Reverb cannot access Yanib billing/plan/notification data unless explicitly passed as a policy value;
- shadow mode creates no new customer-visible effects.

## P6-FR-4 — Yanib review mapping

**Acceptance criteria:**

- dedicated subject maps Reverb fingerprint/occurrence/evidence versions and three-axis labels;
- append-only/supersession preserved;
- existing `CapabilityChange` reviews are not overloaded for dependency edges;
- workflow action and ground-truth labels remain separate;
- reviewer authorization and research-use permission come from Yanib host decisions.

## P6-FR-5 — Declared context import

**Acceptance criteria:**

- `.yanib.yml`/`ConsumerDeclaration` imports carry `declared_context` provenance, revision, author/source;
- declarations may help service registry/routing/explanation;
- declaration alone cannot produce INV-1 finding;
- deletion/update follows Yanib config revision and temporal history;
- no cross-team edge enters the workspace without explicit Reverb membership/consent.

## P6-FR-6 — Delivery ownership

Exactly one host writes a given external check key. Recommended integration: Reverb emits authorized projection; Yanib provider adapter writes it under Yanib consent. Duplicate writers are rejected by configuration/conformance.

## P6-FR-7 — Operations/extension/public artifact

**Acceptance criteria:**

- self-host install, backup, restore, upgrade, re-index, purge, incident, disable runbooks;
- adapter contribution/security/admission docs;
- public benchmark manifests, labels allowed for release, generators, baselines, raw predictions, analysis scripts, frozen environment;
- archival DOI and limitations/private-nonrelease statement;
- API docs/examples for a third host.

## P6-FR-8 — v1 release proof

Walk every shared success metric and link automated/operational/research evidence. No placeholder spec, broken link, unpinned load-bearing claim, or synthetic production-accuracy claim remains.

## Definition of done

Reverb can be adopted without its reference host or Yanib internals and has a defensible public/research release.
