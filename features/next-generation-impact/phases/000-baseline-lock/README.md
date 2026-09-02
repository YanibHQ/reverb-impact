# Phase 000 — 0.4.0 baseline lock

**Status:** Implemented and verified locally  
**Baseline:** `v0.4.0` / `8e80ff02604dcbbd97cee5bf2768005e33d4d73c`

## Goal

Make compatibility testable before adding capabilities. The baseline records package APIs, wire
schemas, storage levels, adapter identities, host capabilities, canonical behavior, and the exact
verification environment.

## Exit gate

1. The baseline commit and tag are immutable recorded inputs.
2. All 13 packages and supported root exports are captured mechanically.
3. Schema-major 1 digests and migration levels are captured mechanically.
4. Representative v1 analyses are frozen as canonical byte fixtures.
5. A guard fails on incompatible public API, schema, identity, migration, or behavior changes.
6. The full `0.4.0` release verification passes before feature code is introduced.

The machine-readable fixture is checked by `node tools/check-v0.4-baseline.mjs`; the canonical
analysis golden runs in the PR-analysis integration suite; and `pnpm pack:verify` compiles the
all-package host fixture from cleanly installed tarballs.

See [specification](spec.md), [plan](plan.md), [tasks](tasks.md), and
[baseline record](../../baseline-v0.4.0.md).
