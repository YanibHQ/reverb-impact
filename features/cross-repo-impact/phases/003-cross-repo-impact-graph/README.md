# Phase 003 — Cross-Repository Impact Graph

**Status:** Semantic vertical slice verified locally; index-first hosted execution remains open
**Depends on:** [001](../001-repository-index/), [002](../002-contract-change-detection/)  
**Produces:** workspace joins, temporal edges, exact PR analysis, candidate findings

## Goal

Join changed producer contracts to real consumer references across explicitly admitted repositories and prove the complete local PR-time vertical slice.

## What is new here

- complete service/deploy-unit registry and aliases;
- definition/reference/evidence-edge store;
- primary evidence paths and evidence strata;
- current temporal projection over immutable generations;
- exact base/head overlay analysis with recorded consumer SHAs/freshness;
- claim-specific coverage and abstention;
- consumer-specific finding fingerprints and remedies;
- local CLI/JSON preview;
- honest benchmark/stop decision against Repowise and reduced baselines.

## Exit gate

- at least one real pair for each initial adapter resolves end to end;
- every result names base/head, consumer SHA, registry/policy revision, adapter/identity versions, and coverage;
- two consumers create two findings; location moves do not create new fingerprints;
- stale/unsupported/failed consumers are not called unaffected;
- exact positives survive unrelated partial coverage;
- ambiguous registry aliases do not become exact edges;
- force-pushed older runs cannot become current output;
- benchmark review records why Reverb continues, interoperates, repositions, or stops.

No external PR check is shipped in this phase.

The v0.2 local path proves exact identities, joins, coverage, and output semantics. It does not yet
persist adapter partition state, so a host may recreate whole base/head adapter input. Hosted PR
execution additionally requires [ADR 0006](../../../../docs/adr/0006-index-first-pr-overlays.md):
delta-backed logical heads, persistent semantic snapshots, changed-only producer reads, zero consumer
source reads, and clean/incremental canonical equivalence.

## What happens if we skip this

**The join produces a wrong answer rather than a missing one.** Without the service registry,
`GET /users/§` on two services is one key, and a variable named `DATABASE_URL` — which exists in
almost every repository — joins a producer to a consumer that has nothing to do with it. This is
the one failure class that is worse than a miss, because the finding looks exactly like a correct
one ([`../../research/contract-taxonomy.md`](../../research/contract-taxonomy.md)).

**A gateway rewrite silently defeats every HTTP join.** A consumer calling `/api/payments/users/1`
against a producer route of `/users/:id` matches nothing, and static analysis cannot see the strip.
The registry has to carry the path prefix or the highest-value contract kind returns nothing and
reports success.

**The graph accumulates and stops being checked.** Without expiry, an edge is an assertion rather
than a dated observation. The prior roadmap phase for this idea names the outcome directly: a graph
without expiry "becomes the most confident thing in the product and the least checked."

**The tool answers a question it was never asked.** Without explicit non-membership reporting, an
organization where half the repositories were never added receives "nothing else is affected" — the
run-level form of the coverage failure.

## Documents

- [spec.md](spec.md)
- [plan.md](plan.md)
- [tasks.md](tasks.md)
- [architecture](../../architecture.md)
- [verification evidence](../../../../docs/verification/phase-003.md)
- [comparative stop gate](../../../../docs/verification/phase-003-comparison.md)
