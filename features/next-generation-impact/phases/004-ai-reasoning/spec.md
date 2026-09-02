# Phase 004 specification

## P4-FR-1 — neutral port

Define versioned request/response types and a `ReasoningPort` with no vendor SDK, credential, model
selection, transport, retry, or billing knowledge in domain/application/reasoning core.

## P4-FR-2 — bounded retrieval

Retrieval begins from changed artifacts and deterministic graph neighbors, requires the resolved
scope capability, returns exact authorized evidence handles, and enforces item/byte/token/time limits.

## P4-FR-3 — candidate verification

Validate closed structured output, separate severity from evidence confidence, require producer and
consumer citations, reject citations outside supplied evidence, and emit only `ai_inferred` or
`needs_investigation` records. Uncited candidates are withheld.

## P4-FR-4 — isolation and provenance

Record provider/model/template/policy/retrieval versions, redacted input/output hashes, budgets, and
limitations. Disabled, denied, timed-out, refused, malformed, or failed operation leaves
deterministic findings unchanged.

## P4-FR-5 — lifecycle

Host consent and retention govern retrieval/provider use. Revocation/deletion propagates to cached
retrieval, prompts/responses, embeddings if separately enabled, and hypotheses.

## Definition of done

Fake-provider conformance, citation, scope, injection, failure-isolation, telemetry, retention, and
deletion tests pass. No live provider or credential is required.
