# ADR 0004 — Adapter manifest SemVer validation

**Status:** Accepted  
**Date:** 2026-09-01

## Context

Adapter manifests are validated through both the canonical JSON Schema and the adapter SDK. The
SDK requires a fully matched semantic version with an optional prerelease suffix. The JSON Schema
used an unanchored prefix expression, so a value such as `1.2.3not-semver` satisfied the schema
even though the SDK rejected it. Hosts therefore received different results for the same manifest
depending on the documented validation entry point they used.

## Decision

The canonical adapter-manifest schema uses the same fully anchored stable-version and optional
prerelease pattern as the SDK validator. It rejects leading-zero core components, incomplete
versions, and trailing content outside the optional prerelease suffix.

This correction remains in schema version `1.0`. The prior acceptance was inconsistent with the
declared SemVer contract and could not pass the SDK's manifest validator; malformed values are not
treated as a compatibility surface.

## Consequences

- JSON Schema and SDK validation agree for stable and prerelease adapter versions.
- Generated standalone schemas carry the corrected pattern.
- Tests cover valid stable/prerelease forms and malformed prefixes, incomplete versions, and
  trailing content.
