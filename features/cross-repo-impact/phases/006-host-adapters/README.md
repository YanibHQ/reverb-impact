# Phase 006 — Public Host Adapters and Yanib Integration

**Status:** Standalone implementation and public pre-1.0 publication complete; Yanib work not executed
**Depends on:** [005](../005-delivery-surfaces/)  
**Produces:** stable packages/protocol, independent-host proof, Yanib guide, public release artifact

## Goal

Prove that Reverb is a reusable engine rather than a GitHub-host implementation with decorative interfaces.

The active project goal requires Reverb to remain entirely separate from Yanib. Therefore this
implementation uses the plan's minimal independent third-host path and leaves all Yanib-specific
integration/review work unstarted. No Yanib repository or internals were accessed.

Port contracts are defined in Phase 001. This phase does not invent them late; it stabilizes them after two real implementations, publishes conformance, and proves a second independent host—preferably Yanib.

## Delivers

- public package entry points and protocol/storage compatibility policy;
- current/previous schema compatibility and migrations;
- local SQLite and GitHub/Postgres conformance parity;
- second-host/Yanib adapter without direct table access;
- dedicated Reverb finding-review mapping in Yanib;
- declared Yanib consumer edges imported only as context;
- one clear owner for external check writing;
- self-hosted operations and extension guides;
- signed public release, SBOM/provenance, benchmark/research artifact.

## Yanib boundary

Yanib owns its teams, auth, billing, repositories, notifications, and human workflow. Reverb owns structural analysis schemas and canonical results. The adapter translates through public APIs/ports. Reverb does not write Yanib tables, and Yanib does not query Reverb reference-host tables.

An inferred dependency edge is not a `CapabilityChange`; the integration creates or maps a dedicated review subject instead of pretending Yanib's existing capability-change ledger has the same semantics.

## Exit gate

- two hosts pass the same conformance version;
- host-specific imports do not enter domain;
- schema/migration/re-index policy is demonstrated;
- Yanib shadow path consumes canonical results and returns review events without table coupling;
- declared edges remain context unless a structural consumer artifact exists;
- release/legal/security/operations/research artifact checklists pass.

## What happens if we skip this

**A port with one implementation is an abstraction nobody has tested.** Until the local
filesystem-and-SQLite implementation and one remote host both pass the same conformance suite, the
port encodes the first host's assumptions and the second integration is a rewrite.

**The two ledgers drift.** Without the contract-to-capability and surface-to-contract mappings
written down before code, a capability confirmed in the host has no corresponding contract, and a
contract has no route to the host's existing review loop. The host keys capability identity on
`(teamId, provider, repositoryExternalId, capabilityType, canonicalIdentifier)` — already
tenant-scoped rather than repository-scoped, so the mapping is available and only has to be stated.

**A truncated diff reads as a clean negative.** The completeness flag on the diff port is
load-bearing rather than informational: GitHub's compare endpoint caps at 300 files without
pagination, and omits `patch` for binary and very large files. A provider that truncates silently
and a port that cannot say so together produce confident silence.

## Documents

- [spec.md](spec.md)
- [plan.md](plan.md)
- [tasks.md](tasks.md)
- [packaging](../../packaging.md)
- [standalone verification](../../../../docs/verification/phase-006.md)
