# Phase 005 specification

## P5-FR-1 — fixed release train

Every package manifest, internal dependency, changelog, release metadata, packed tarball, SBOM, and
provenance record agrees on exact version `0.5.0`.

## P5-FR-2 — compatibility proof

Compile the frozen host fixture from packed packages; preserve schema-major 1 digests and v1 golden
bytes; test v1/v2 negotiation; upgrade both stores from `0.4.0`; keep adapter identities stable.

## P5-FR-3 — capability proof

Run backend-to-backend, same-repository, cross-repository, partial, adversarial, incremental,
no-scope-read, AI-off/failure, conformance, and performance fixtures for the complete matrix.

## P5-FR-4 — release evidence

Generate API/package inventory, schemas, admission reports, licenses, checksums, SBOM, provenance,
migration/re-index/rollback notes, known limitations, and a host/Yanib upgrade checklist.

## P5-FR-5 — stop boundary

Do not publish npm packages or a GitHub release; do not deploy, apply production migrations, change
GitHub App permissions, or modify Yanib. Report each as an approval-gated next action.

## Definition of done

A clean checkout passes `pnpm run ci` and `pnpm release:verify`, packed consumers pass, and the
release candidate is reviewable and ready for explicit publication approval.
