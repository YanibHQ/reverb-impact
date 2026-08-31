# Phase 008 Verification — Hosted Runtime Composition

Verified on 2026-08-31.

## Automated evidence

- `packages/host-github/test/runtime.integration.test.ts` covers webhook routing, idempotent job
  composition, canonical records/pointers, outbox delivery, operator switches, retry classes,
  cross-workspace rejection, and requested-action review routing.
- `packages/storage-postgres/test/postgres.integration.test.ts` upgrades migration 1 through current
  migration 3, verifies forced RLS and reclaimable leases, and executes a signed GitHub pull-request
  webhook through the real PostgreSQL inbox/job/record/outbox path to a terminal delivered effect.
- Existing GitHub integration and fork-source adversarial suites continue to prove minimum
  permissions, exact Git/token boundaries, safe webhook pointers, disclosure, promotion gates,
  current-head checks, and secret/canary non-retention.
- `pnpm pack:verify`, `pnpm sbom`, and `pnpm audit:check` produced and checked all 13 version 0.2.0
  tarballs, SHA-256 checksums, a 35-component CycloneDX SBOM, and zero known high-severity
  production dependency vulnerabilities. A new empty npm project installed all tarballs together,
  imported every public root, and reported CLI version `0.2.0`.

## Operational conclusion

The standalone packages now provide a tested hosted workflow boundary. Deployment-specific HTTP,
secret management, token brokerage, workspace policy, worker scheduling, and production promotion
remain explicit host responsibilities rather than hidden Yanib dependencies.
