# ADR 0008 — Additive v2 for bounded next-generation impact

## Status

Accepted for the `0.5.0` release candidate.

## Context

Reverb `0.4.0` has a stable public package surface, schema-major 1 canonical records, immutable
generation model, and exact producer-as-consumer analysis. Adding event, database, implicit HTTP,
configuration, infrastructure, explicit consumer scope, and model provenance requires new closed
vocabularies and required provenance. Widening schema 1 or changing `AnalyzePullRequest` would make
existing hosts observe an implicit breaking change and would prevent byte-identical disabled-feature
behavior.

Repository scope is also a security boundary. Filtering results after reading a workspace would
still access unselected private repositories and could leak their existence. Optional AI introduces
a separate, weaker epistemic basis that must not be confused with deterministic evidence.

## Decision

1. Preserve every documented `0.4.0` root export and schema-major 1 artifact unchanged.
2. Keep `AnalyzePullRequest` as the v1 path and add a separately named `AnalyzePullRequestV2` with
   explicitly negotiated schema-major 2 input/output.
3. Treat omitted v2 consumer scope as a legacy compatibility mode. Treat a present empty allowlist
   as producer-only. Always include the exact producer head, normalize/deduplicate/sort explicit
   IDs, and never expand them transitively.
4. Resolve registry membership, authorization, and consent before reads, then require an opaque
   scoped capability in v2 source/generation/evidence/retrieval ports.
5. Implement events, database, implicit HTTP, configuration, and infrastructure as independent
   adapter packages with separate identities, coverage, admission, and evaluation.
6. Use additive SQLite/PostgreSQL migrations and new v2 records. Never reinterpret existing keys.
7. Keep optional reasoning in a provider-neutral package and port. It may emit only cited,
   separately labelled hypotheses/needs-investigation records. It cannot mutate deterministic
   findings, and failure/off paths leave deterministic output unchanged.
8. Use one fixed `0.5.0` package release train. Stop after release-candidate verification unless npm
   publication, deployment, production migration, or Yanib integration is separately approved.

## Consequences

Existing hosts can upgrade packages without adopting v2 and retain their canonical behavior. New
hosts can select bounded repositories and new adapter families without an organization-wide scan.
Storage and public API contain parallel v1/v2 paths during the compatibility window, increasing
implementation and test cost. New contract kinds cannot appear in v1 results. AI output remains
less authoritative by construction and requires its own calibration before any delivery promotion.

## References

- [Feature specification](../../features/next-generation-impact/spec.md)
- [Architecture](../../features/next-generation-impact/architecture.md)
- [Compatibility contract](../../features/next-generation-impact/compatibility.md)
- [Security and consent](../../features/next-generation-impact/security.md)
