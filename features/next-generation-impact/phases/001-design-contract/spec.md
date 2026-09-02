# Phase 001 specification

## P1-FR-1 — Additive protocol

Keep v1 wire and use-case contracts unchanged. Define separately named v2 types/schemas for required
scope/provenance and expanded closed vocabularies. Hosts negotiate the major explicitly.

## P1-FR-2 — Scope capability

Resolve normalized producer-plus-allowlist membership, authorization, and consent once. Pass an
opaque capability into lower read ports. Omitted scope preserves legacy behavior; an empty explicit
allowlist selects only the producer; no graph or provider discovery expands scope.

## P1-FR-3 — Adapter independence

Events, shared database, implicit HTTP, configuration, and infrastructure each receive a package,
manifest, identity vocabulary, coverage, compatibility behavior, fixtures, admission, and release
evidence. No family becomes a generic heuristic fallback for another.

## P1-FR-4 — Reasoning isolation

Reasoning consumes bounded authorized deterministic evidence through a provider-neutral port. Its
strict cited output is stored separately. Disabled or failed reasoning leaves deterministic output
unchanged.

## P1-FR-5 — Release boundary

The implementation ends with validated fixed-version `0.5.0` tarballs and host documentation. npm,
GitHub release publication, deployments, production migrations, and Yanib changes require a new
explicit authorization.

## Definition of done

All feature documents agree, ADR 0008 is accepted, documentation links pass, and unresolved design
questions that could change public contracts are zero.
