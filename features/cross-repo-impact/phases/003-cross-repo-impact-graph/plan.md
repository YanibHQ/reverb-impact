# Phase 003 Plan

## Build order

1. Service registry aliases/resolution.
2. Temporal definition/reference/edge schemas and queries.
3. Exact and registry-resolved joins with primary evidence.
4. Current generation selection/freshness.
5. PR orchestration and touched-key incremental rejoin.
6. Finding fingerprints, remedies, coverage/abstention.
7. CLI/JSON preview and diagnostics.
8. Repowise/reduced-baseline evaluation and stop review.

## Graph implementation

Use indexed relational adjacency:

- definitions by workspace/kind/canonical key/generation;
- references by workspace/kind/resolved or constrained key/generation;
- evidence edges by producer definition/consumer reference/registry revision;
- analysis selection table records every consumer generation/state;
- service graph is rebuilt projection.

Do not add NetworkX/graph DB to the application path. Offline benchmark scripts may use analysis libraries without making them runtime dependencies.

## Join precedence

1. exact spec/symbol identity;
2. explicit registry-resolved identity;
3. admitted heuristic structural candidate;
4. declared/behavioral context for explanation only.

Lower precedence never replaces a contradictory exact fact. Contradictions are explicit diagnostics/candidates for registry correction.

## Temporal cases

Test definition/reference add/remove/rename, registry remap, repo membership removal/re-add, stale consumer, complete fresh invalidation, force-push, base rebase, and actual merge SHA.

## Stop review questions

- Does the exact PR overlay change results relative to previous/current scan?
- Are authorization and disclosure boundaries a real design-partner need?
- Does the three-axis review/evaluation model catch errors existing tools hide?
- Is canonical consumer evidence materially more precise than manifest/schema-only fanout?
- Can the system remain focused and sustainable with three adapters?

If answers are negative, do not build the GitHub host out of momentum.
