# Phase 006 Tasks

**Status:** Standalone implementation and npm publication complete; DOI and Yanib-specific work remain external

## A. Package/schema stability

- [x] Audit/document package exports and errors
- [x] Add current schema-major and explicit no-previous-major/unsupported-v0 compatibility fixtures
- [x] Add migration/re-index/identity/calibration release metadata
- [x] Produce packages, checksums, SBOM, build provenance, and license report
- [ ] Produce release signatures/container
  - npm packages and independently attested build artifacts are public; a container and release
    signatures are not required by the current package-only distribution profile.

## B. Conformance

- [x] Run canonical analysis host conformance v1 across SQLite, GitHub/Postgres, and minimal host
- [x] Fix canonical state/coverage/abstention, duplicate, immutable-conflict, current-pointer,
      workspace-isolation, and declared-deletion behavior
- [ ] Normalize every optional review/disclosure/provider/purge port across all hosts
  - Optional ports are capability-declared and tested in their owning suites; SQLite purge is
    intentionally unsupported rather than faked.
- [x] Publish conformance v1 and host capability declaration
- [x] Build minimal third-host example

## C. Yanib shadow integration

Out of scope for the explicit standalone project goal; no Yanib repository or internals were read.

- [ ] Pin/audit current Yanib integration points and commit SHA
- [ ] Map teams/repos/provider consent to registry/source interfaces
- [ ] Submit exact PR analyses and store pointer/schema/projection only
- [ ] Structural test: no direct reference-host DB/table access
- [ ] Verify zero external effect in shadow

## D. Yanib review/context

Yanib mapping remains out of scope. The reusable declared-context safety boundary is implemented in
Reverb itself.

- [ ] Add dedicated Reverb finding-review subject mapping
- [ ] Preserve three labels, append/supersession, workflow separation
- [ ] Export ConsumerDeclaration rows as declared context provenance
- [x] Test a generic declared-context import alone cannot produce a structural finding
- [ ] Map reviewer/research/disclosure authorization

## E. Delivery ownership

- [x] Choose/document the standalone Reverb reference-host check writer
- [x] Prevent duplicate configuration/check keys
- [x] Run current-head/idempotency/rollback verification

## F. Operations/extensions/artifact

- [x] Self-host install/backup/restore/upgrade/re-index/purge/incident/disable guides
- [x] Adapter contribution/admission/security guide
- [x] Public synthetic benchmark/baselines/raw predictions/analysis/frozen environment
- [ ] DOI archive and private-data limitation statement
  - Private-data/non-release limitations are published; no DOI has been minted.

## G. v1 proof

- [x] Walk all invariants, FRs, NFRs, success metrics, release gates
- [x] Run clean install and oldest-supported upgrade
- [x] Run conformance/adversarial/security/load/release drills
- [x] Validate every local link and pin/qualify external claims
- [x] Publish pre-v1 release evidence and research status
- [ ] Publish v1 evidence
  - Public v1 remains gated on representative production calibration.

## Verification

- [x] `pnpm test:all-hosts`
- [x] `pnpm test:compatibility`
- [x] `pnpm test:migrations`
- [x] `pnpm test:security`
- [x] `pnpm benchmark --profile release`
- [x] `pnpm release:verify`

## Exit review

- [x] Two independent hosts pass conformance (three profiles pass)
- [ ] Yanib integration has no table coupling
- [x] One external check writer
- [x] Declared context cannot masquerade as structural evidence
- [ ] Public/research artifact archived and limitations honest
  - Limitations are honest; archival publication/DOI remains open.
