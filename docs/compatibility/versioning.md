# Compatibility, Migration, and Re-index Policy

Reverb versions three independent surfaces:

1. package SemVer;
2. canonical JSON/storage schema major/minor;
3. adapter extraction and identity versions.

The current release is pre-v1 package version `0.2.0`, schema `1.0`, SQLite migration 7, and
PostgreSQL migration 3. There is no previous public schema major: schema v0 is explicitly
unsupported rather than silently treated as a historical format. The schema-major envelope accepts
supported major 1; each concrete schema validator still requires its declared minor contract.

## Change rules

- Additive package behavior that preserves documented types is minor-compatible after v1.
- Removing/renaming a root export, closed vocabulary member, required field, or semantic guarantee
  is a package/schema breaking change.
- Storage migrations are forward, transactional where the database permits, and tested from every
  supported stored fixture. Downgrade is restore-from-backup unless a reverse migration is explicit.
- Extraction changes require re-index when old and new artifacts are not semantically comparable.
- Identity changes always require regeneration/re-keying and reset every affected evidence stratum
  to `UNMEASURED` unless a recorded compatibility evaluation proves equivalence.
- Policy-only changes replay frozen structural results; they do not rerun current adapters/models.

Every release updates [machine-readable release metadata](release-metadata.json) with migration,
re-index, adapter identity, and calibration impact. CI compares that record to package/schema/
adapter code and fails when it is stale.

Version `0.2.0` intentionally requires `AnalyzePullRequestInput.producerHeadObservation` so the
producer can be analyzed as a consumer at the exact PR head. Hosted PostgreSQL deployments apply
migration 3 to add reclaimable webhook-worker leases. TypeScript adapter 0.2.0 also changes its
source fingerprint and adds package-partition semantic state, so `reverb.typescript` observations
and snapshots require re-indexing. Its identity version remains 1, and every affected stratum was
already `UNMEASURED`, so no promoted calibration state is carried forward or reset.

## Upgrade procedure

1. stop external writes and drain or disable the delivery outbox;
2. take and verify a database/object backup;
3. inspect release metadata for migrations, re-index, or calibration reset;
4. install exact package/container digests and apply storage migrations once;
5. run schema compatibility and host conformance before enabling workers;
6. re-index only the declared affected adapter/identity strata;
7. leave reset strata preview-only until new promotion evidence exists;
8. restore write enablement only after current-head, disclosure, and rollback checks.

Unsupported schema majors fail with a teaching error that names the supported majors. They are
never coerced, skipped, or treated as empty data.
