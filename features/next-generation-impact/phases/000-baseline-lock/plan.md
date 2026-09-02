# Phase 000 plan

1. Pin the commit/tag and record toolchain versions.
2. Generate a sorted package/export manifest.
3. Generate sorted schema SHA-256 and migration-level manifests.
4. Capture adapter IDs, identity/partition versions, evidence bases, and host capabilities.
5. Generate canonical behavior fixtures using the public application boundary.
6. Add one compatibility command to validate all static and behavioral fixtures.
7. Add the command to `ci` and `release:verify` through the existing CI chain.

Generated fixtures must be deterministic, reviewable text/JSON and contain no absolute path, time,
credential, private repository identifier, or uncontrolled environment field.
