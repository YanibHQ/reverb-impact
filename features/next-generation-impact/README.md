# Next-generation impact analysis

**Target release:** `0.5.0-rc.1`  
**Compatibility baseline:** `v0.4.0` at `8e80ff02604dcbbd97cee5bf2768005e33d4d73c`  
**Status:** Phases 000 and 001 implemented and verified locally

This feature expands Reverb from source/API contract analysis into a provider-neutral dependency
impact engine for events, shared databases, implicit HTTP calls, configuration, and infrastructure.
An optional reasoning lane may add cited hypotheses without weakening deterministic results.

The feature is built entirely in `YanibHQ/reverb-impact`. It does not require or permit changes to
Yanib, production deployment, npm publication, or production migrations as part of this plan.

## Non-negotiable properties

- Every documented `0.4.0` package export and schema-1.0 payload remains valid.
- With all new capabilities disabled, existing analyses remain canonically identical.
- A host chooses an explicit, bounded consumer allowlist. Reverb never expands that list.
- The producer repository is always analyzed as a consumer at the exact pull-request head.
- Authorization and consent are checked before repository selection, reading, retrieval, or model
  invocation, not merely before rendering.
- Missing, partial, unauthorized, or stale evidence is reported as a coverage gap and cannot become
  a clean result.
- Deterministic adapters remain independent vertical slices with their own identities, fixtures,
  coverage, and admission evidence.
- AI is optional, provider-neutral, bounded, cited, schema-validated, separately labelled, and
  unable to alter or suppress deterministic findings.

## Documents

- [Specification](spec.md)
- [Architecture](architecture.md)
- [Compatibility contract](compatibility.md)
- [Security and consent](security.md)
- [Packaging](packaging.md)
- [Evaluation](evaluation.md)
- [Host/Yanib integration boundary](yanib-integration.md)
- [Implementation plan](plan.md)
- [Task ledger](tasks.md)
- [0.4.0 baseline record](baseline-v0.4.0.md)
- [Phase documents](phases/)

## Delivery phases

| Phase | Outcome |
| --- | --- |
| 000 | Freeze and continuously verify the `0.4.0` compatibility baseline |
| 001 | Accept contracts, boundaries, schemas, security, packaging, and evaluation design |
| 002 | Add scoped-analysis, provenance, coverage, migration, and performance foundations |
| 003 | Deliver each deterministic adapter as an independently testable vertical slice |
| 004 | Add the optional provider-neutral reasoning and retrieval lane |
| 005 | Validate packed `0.5.0` artifacts and prepare release/integration documentation |

Publication and integration begin only after Phase 005 and require separate approval.
