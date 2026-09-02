# Phase 002 specification

## P2-FR-1 — v2 values and negotiation

Add schema-major 2 input/output values, closed vocabularies, stable validation failures, and explicit
negotiation. Generating v2 must not modify schema-major 1 artifacts.

## P2-FR-2 — resolved scope

Normalize and hash scope, always include the producer, validate immutable registry membership, and
authorize/consent every repository before producing an opaque scoped capability. Omission selects
legacy behavior; an explicit empty list selects only the producer.

## P2-FR-3 — scoped ports

V2 source, generation, evidence, refresh, and retrieval reads require the capability. Repositories
outside it fail before adapter/provider/store calls. Graph edges do not expand it.

## P2-FR-4 — provenance and coverage

Persist exact scope/config/registry/consent/authorization, adapter version, inputs, budgets, and
family/repository gaps. Unauthorized or partial evidence cannot support a clean negative result.

## P2-FR-5 — storage and performance

Add forward-only SQLite/PostgreSQL migrations and bounded bulk/incremental/PR orchestration. Upgrade
fixtures begin at `0.4.0`; provider requests are bounded independently of file count.

## Definition of done

All scope matrix, no-read canary, schema, migration, equivalence, fault, and budget tests pass.
