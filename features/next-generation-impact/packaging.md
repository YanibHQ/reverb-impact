# Packaging plan

## Release train

The `0.5.0` release uses fixed versions across all existing and new packages. Internal dependencies
use exact workspace versions during release preparation. No package is published independently as a
preview with a different core version.

## New packages

| Package | Runtime responsibility | Forbidden dependencies |
| --- | --- | --- |
| `@yanib/reverb-adapter-events` | event/queue extraction and compatibility | host, storage, model SDKs |
| `@yanib/reverb-adapter-database` | schema/migration/query evidence | database clients, host, model SDKs |
| `@yanib/reverb-adapter-http` | implicit route/call evidence | network clients, host, model SDKs |
| `@yanib/reverb-adapter-config` | config/flag/secret-reference evidence | secret clients, host, model SDKs |
| `@yanib/reverb-adapter-infrastructure` | static deployment/wiring evidence | cloud/Kubernetes clients, host, model SDKs |
| `@yanib/reverb-reasoning` | neutral request/result schemas, retrieval and citation validation | vendor model SDKs, provider credentials |

The CLI may compose deterministic adapters explicitly. Reasoning remains an optional dependency and
is absent from default CLI and host dependency graphs unless deliberately enabled.

## Public surface rules

- Documented root exports only.
- Package export maps expose no internal parser implementation.
- Adapters declare IDs, identity/schema versions, supported artifacts, limits, licenses, and
  capability requirements through admission manifests.
- Native/external tools remain optional, pinned, sandboxed, and represented in SBOM/license output.
- Provider-specific reasoning adapters, if later added, live outside the neutral core package.

## Release-candidate verification

1. Set every workspace package and release metadata record to `0.5.0`.
2. Build and pack every public package.
3. Install tarballs in clean v1 and v2 consumer fixtures with network disabled.
4. Compile the frozen `0.4.0` host compatibility fixture.
5. Run old canonical analyses and compare exact output bytes.
6. Run new adapter, scope, migration, security, conformance, and performance suites.
7. Generate checksums, SBOM, provenance, licenses, API inventory, migration/re-index notes, and
   release notes.
8. Run `pnpm run ci` and `pnpm release:verify` from a clean checkout.

The verified candidate stops before npm publication, GitHub release creation, deployment, or Yanib
dependency updates. Those require explicit approval.
