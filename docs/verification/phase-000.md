# Phase 000 local verification

- Date: 2026-08-28
- Scope: local repository constitution and unpublished artifact preparation
- Canonical owner/repository: `YanibHQ/reverb-impact`

## Implemented

- Apache-2.0 legal and DCO/governance/contribution/security documents.
- Node 24, pnpm, strict TypeScript monorepo with all planned package boundaries.
- Formatting, lint, type, unit, integration, conformance, adversarial, migration, schema, link,
  license, vulnerability, SBOM, package, checksum, and provenance workflows.
- Clean-room/naming/publisher decision in [ADR-0001](../adr/0001-project-constitution.md).
- Frozen lockfile, Dependabot, PostgreSQL 18 CI service, CycloneDX SBOM generation, and GitHub
  artifact-attestation workflow.
- Public `YanibHQ/reverb-impact` GitHub repository created on 2026-08-29 after a staged-tree secret
  scan and removal of private-host research from the public publish set.

## Verification commands

```bash
pnpm run ci
pnpm pack:verify
pnpm sbom
pnpm audit:check
```

The package verification creates 13 unpublished package archives plus `SHA256SUMS` under the
ignored `artifacts/packages/` directory. The SBOM is written to ignored
`artifacts/sbom.cdx.json`.

## External publication controls

The following are deliberately not simulated by local files and remain pending until an authorized
owner publishes the project:

- enable default-branch protection and required checks;
- enable GHCR/publisher protections and GitHub artifact attestations in the real repository;
- obtain authorized trademark clearance for the provisional product name;
- perform domain/registrar and package-publisher reservation where desired.

No package, container, domain, or Yanib system has been published or modified. Repository creation
and the initial standalone source push were explicitly authorized on 2026-08-29.
