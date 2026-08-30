# Release verification

No package is public yet. A release candidate must run:

```bash
pnpm install --frozen-lockfile
pnpm release:verify
```

The local command builds packages, creates unpublished tarballs, writes SHA-256 checksums, creates a
CycloneDX SBOM, and verifies dependency licenses. The GitHub artifact workflow additionally creates
a build-provenance attestation. Public npm or container publication is intentionally absent until
naming, publisher, signing, and security review are complete.
