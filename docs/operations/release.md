# Publishing a release

Reverb packages use a fixed version across the workspace. The first public release is `0.1.0`.
Before publishing, confirm that every public manifest, the CLI version, schema compatibility record,
changelog, and [release metadata](../compatibility/release-metadata.json) name the same version.

## Verify the release candidate

From a clean checkout of the release commit:

```bash
pnpm install --frozen-lockfile
pnpm release:verify
```

The command builds and tests the workspace, recreates all 13 package tarballs, verifies their
contents and exact internal dependency versions, writes SHA-256 checksums, and creates a CycloneDX
SBOM. Publish the verified tarballs under `artifacts/packages/`, not a mutable working directory.

## Publish order

Publish packages in dependency order so every registry dependency exists before a dependent package:

1. `@yanib/reverb-domain`, `@yanib/reverb-schema`;
2. `@yanib/reverb-application`, `@yanib/reverb-adapter-sdk`;
3. the three contract adapters, two storage adapters, two hosts, and `@yanib/reverb-testkit`;
4. `reverb-impact`.

All scoped packages must be public. Local publication uses the authenticated `yanib` npm account and
disables provenance for that command because npm provenance is issued only by a supported trusted
CI publisher. The manifests retain `publishConfig.provenance: true` for the trusted-publisher path.

Never continue after a partial failure without querying the registry. Published versions are
immutable: resume only with packages whose exact version is still absent, and never rebuild tarballs
mid-release.

## Verify the registry

After publication:

1. query every package for the exact version and integrity digest;
2. install the hosted Yanib package set into a new temporary project from the public registry;
3. import each root entry point under Node 24;
4. run `pnpm dlx reverb-impact@0.1.0 --version`;
5. mark npm publication in release metadata, merge that status update, and create the `v0.1.0`
   GitHub release from the exact release commit.

The GitHub artifact workflow independently reruns release verification and creates build-provenance
attestations for the package tarballs and SBOM. Container publication remains a separate release
gate.
