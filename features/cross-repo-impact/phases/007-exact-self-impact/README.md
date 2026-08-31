# Phase 007 — Exact Same-Repository Impact

**Status:** Implemented and verified locally
**Depends on:** [003](../003-cross-repo-impact-graph/) and [006](../006-host-adapters/)
**Produces:** producer-as-consumer analysis at the exact pull-request head

## Goal

Analyze a changed repository as one of its own consumers without confusing its base, default branch,
or latest indexed generation with the pull-request head.

The producer head contract observation is an explicit analysis input. Its workspace, repository,
commit, generation, definitions, and references are validated before joining. A same-repository
finding can therefore exist only when the changed contract and a matching reference coexist at the
exact analyzed head.

## Exit gate

- the producer is included in the selected consumer set;
- a head reference creates a consumer-scoped finding for the producer repository;
- removing that reference from the head removes the finding;
- evidence from another head is rejected;
- authorization and incomplete coverage remain abstentions, not assurance;
- local CLI analysis exercises the behavior end to end.

## Documents

- [spec.md](spec.md)
- [plan.md](plan.md)
- [tasks.md](tasks.md)
- [verification](../../../../docs/verification/phase-007.md)
