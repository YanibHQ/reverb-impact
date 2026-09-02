# Phase 000 specification

## P0-FR-1 — Source identity

The guard records the full commit SHA and expected tag and fails when fixture regeneration is run
from a different source without an explicit baseline-update operation.

## P0-FR-2 — Package/API compatibility

Capture every public workspace package name/version/export map and the documented root-export API.
Compile representative `0.4.0` consumer source against the new workspace. Additions are allowed;
removal, rename, requiredness changes, or meaning changes fail review.

## P0-FR-3 — Wire/storage compatibility

Hash all schema-major 1 artifacts and capture both storage migration levels. Freeze representative
canonical records and database fixtures. Future migrations must upgrade them without changing the
meaning of existing data.

## P0-FR-4 — Behavioral compatibility

Run representative TypeScript/npm, repository-local TypeScript, OpenAPI, Protobuf, same-repository,
cross-repository, partial, and abstention analyses. Store canonical serialized results. With new
features disabled, new builds must reproduce them exactly.

## Definition of done

The fixture set and guard run in CI and the complete existing test/release suite remains green.
