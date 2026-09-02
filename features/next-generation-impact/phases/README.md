# Next-generation delivery phases

| Phase | Purpose | Depends on |
| --- | --- | --- |
| [000 — Baseline lock](000-baseline-lock/) | Freeze and guard `0.4.0` compatibility | `v0.4.0` |
| [001 — Design contract](001-design-contract/) | Accept v2, scope, adapters, reasoning, security, and release boundaries | 000 |
| [002 — Foundation](002-foundation/) | Scoped reads, provenance, migrations, budgets, v2 orchestration | 001 |
| [003 — Deterministic adapters](003-deterministic-adapters/) | Events, database, HTTP, config, infrastructure vertical slices | 002 |
| [004 — Optional reasoning](004-ai-reasoning/) | Neutral bounded retrieval, citations, provenance, isolation | 002–003 |
| [005 — Release validation](005-release-validation/) | Fixed 0.5.0 packed artifacts and integration checklist | 000–004 |

Phase completion is evidence-based. A checked task requires a linked test, fixture, generated artifact,
or reviewable design decision. Phase 005 stops before any external publication or product change.
