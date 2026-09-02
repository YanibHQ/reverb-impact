# Evaluation plan

## Purpose

Evaluation separates mechanical correctness from real-world precision. Synthetic fixtures can prove
identity, determinism, compatibility, scope, coverage, and failure behavior; they do not promote an
evidence class for automated delivery.

## Per-adapter matrix

Every family includes:

- changed producer definition joined to an exact consumer reference;
- same-repository reference at the exact PR head;
- semantically irrelevant formatting/location changes;
- true breaking, compatible, unknown, and activation-delayed changes;
- ambiguous/dynamic inputs yielding bounded gaps;
- deletion, rename, generated/vendored/test exclusions;
- clean rebuild versus incremental equivalence;
- deterministic canonical snapshots across repeated/shuffled runs;
- adversarial size, depth, path, parser, timeout, and malformed-input cases;
- scope canaries proving unselected repositories are unread;
- mutation fixtures labelled synthetic.

Backend-to-backend means each supported producer representation is paired with each supported
consumer representation within the same family where semantics permit—for example Kafka code to
Kafka manifests, SQL migration to ORM query, framework route to HTTP client, config declaration to
read, and Terraform output to Kubernetes/Helm consumption.

## Compatibility evaluation

The frozen `0.4.0` corpus runs through the v1 path with new capabilities off. Canonical JSON bytes,
finding fingerprints, coverage, adapter identities, package imports, schema validation, and migration
reads must match. Any intentional difference is a release blocker because the design provides a v2
path for new semantics.

## Scope evaluation

Run the same PR with omitted scope, empty scope, one consumer, multiple consumers, duplicates,
unknown IDs, unauthorized IDs, revoked consent, partial generations, and graph edges pointing to an
unselected repository. Instrument every source/store/retrieval call. Assert exact selected IDs,
scope hash stability, no transitive reads, producer inclusion, truthful gaps, and no identity leak.

## AI evaluation

AI evaluation never substitutes for deterministic adapter tests. Frozen request/response adapters
test schema validation, citation integrity, injection resistance, timeouts, refusal, malformed data,
budget exhaustion, consent revocation, deletion, and deterministic-result isolation. Live provider
experiments, if separately approved, record provider/model/version and remain `UNMEASURED` until a
representative human-reviewed corpus establishes precision and coverage by stratum.

## Performance evidence

Record cold bootstrap, incremental one-file edit, and exact PR analysis separately. Report fixture
profile, repositories selected, artifacts eligible/read/reused, bytes, wall/CPU time, peak memory,
queries, and any truncation. Budgets gate boundedness and regressions, not unverifiable production
scale claims.
