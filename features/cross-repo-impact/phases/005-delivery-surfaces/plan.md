# Phase 005 Plan

## Build order

1. Postgres adapter and job/outbox conformance.
2. GitHub App manifest/webhook inbox/reconciliation.
3. exact GitHub repository reader and token isolation.
4. provider scope→registry sync and consent UI/API.
5. authorization/disclosure projector and full matrix tests.
6. authenticated detail/review surface.
7. check projection/writer behind hard disabled flag.
8. shadow rollout and policy replay.
9. limited promoted advisory rollout, rollback drill.

## GitHub event flow

```text
webhook -> raw signature/dedupe -> durable pointer -> 2xx
       -> scope/source/index/analysis jobs
       -> canonical result
       -> disclosure projection
       -> outbox check upsert (only if enabled/current)
```

## Check copy structure

- title: count of likely cross-repository impacts or incomplete-analysis statement;
- summary: advisory/nonblocking, exact head, admitted/current/failed/permission-limited counts;
- per authorized finding: change, contract, allowed consumer, evidence class/current interval, remedy;
- limitations: claim-relevant stale/unsupported/abstention;
- authenticated detail/feedback link.

Avoid a raw confidence percent, giant graph, generic “high risk,” or consumer source snippet.

## Permissions rollout

Start with selected repos, manual collections, read contents/PR and write checks. Add optional team sync only after operators request it. Do not request issue/comment/code write to create future flexibility.

## Shadow criteria

Minimum shadow duration/sample is an operator/policy decision, but promotion record and default gate must remain current. Verify distribution shift, p95 latency, alert volume, superseded runs, incomplete causes, and all static disclosure projections.

## Failure behavior

Canonical analysis survives delivery failure. At hard deadline, complete neutral incomplete check if possible. If authorization/disclosure cannot be proven, omit details/write rather than expose canonical data. Emergency write disable never stops indexing/evaluation unless separately selected.

## Do not build

- PR comments instead of stable checks;
- personalized facts in static checks;
- merge blocking;
- one global adapter enable switch;
- source-bearing telemetry;
- Kubernetes/graph/vector/search infrastructure without evidence;
- consumer issues/PRs/notifications in v1.
