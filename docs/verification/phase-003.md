# Phase 003 cross-repository impact verification

- Date: 2026-08-28
- Runtime: Node 25.2.1 / pnpm 10.27.0; CI target: Node 24
- Scope: standalone local graph and preview analysis; no Yanib dependency or external delivery

## Outcome

Reverb now performs a complete local base-to-head cross-repository preview. Repository indexing
feeds all three admitted adapters into immutable contract observations. The analyzer selects every
admitted consumer state, joins only touched contract identities, records exact producer and
consumer SHAs, creates consumer-specific findings and abstentions, and persists a current or
superseded result without writing to a provider.

The service registry resolves valid-time host/token/prefix/package/schema/broker/database aliases,
applies explicit gateway rewrites, reports ambiguity, and requires an operator revision before a
suggestion becomes active. SQLite migration 004 adds workspace-scoped definitions, references,
changes, temporal evidence edges, rebuildable service-edge back-pointers, contract observations,
and analysis-current projections.

Every finding remains `PREVIEW`; every adapter evidence stratum remains `UNMEASURED`.

## Verification matrix

| Gate        | Evidence                                                                                                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | 56 tests: registry valid time/remap/ambiguity, exact and registry joins, heuristic/context separation, temporal invalidation/TTL, fingerprints, transitive claim separation, merge-tree equality, schemas |
| Integration | 21 tests: real pair per initial adapter, two-consumer PR analysis, partial-positive behavior, bounded refresh, authorization abstention, force-push supersession, real Git CLI preview and finding lookup |
| Conformance | 7 tests: memory and SQLite generation/graph stores, immutable observations, definition/reference queries, edge invalidation, service rebuild, analysis supersession                                       |
| Adversarial | 18 tests: untrusted Git/source inputs, traversal/symlink/submodule/binary/truncation, adapter parser failures, no-shell/no-network sandbox declarations                                                   |
| Migrations  | four idempotent forward SQLite migrations, WAL, two-reader operation                                                                                                                                      |
| Schemas     | checked-in Draft 2020-12 evidence-edge and analysis-result schemas plus runtime fixtures                                                                                                                  |
| Comparative | current Repowise 0.46.0 plus manifest, lexical, and schema-only baselines; raw results and ADR preserved                                                                                                  |

## CLI proof

The CLI integration suite creates independent producer and consumer Git repositories, indexes the
consumer at an exact SHA, removes a producer TypeScript export between exact base/head commits,
and executes:

```bash
reverb analyze --repo producer --base <base-sha> --head <head-sha> --pr-number 17 --json
reverb finding show <fingerprint> --json
reverb status --json
reverb doctor --json
```

The result contains the exact base/head, selected consumer SHA and coverage, stable consumer
fingerprint, three independent candidate claims, coverage dependencies, remedy, preview-only
delivery decision, total/returned counts, and pagination cursor. Human output says `abstained` for
missing, stale, failed, unsupported, or unauthorized evidence; it does not call those repositories
unaffected.

## Temporal and failure semantics

- Only a complete newer contract observation invalidates a missing stable reference immediately;
  partial observations cannot erase a known positive.
- Edge freshness expiry withholds an old current projection without rewriting its observation.
- A newer registry membership revision invalidates edges whose producer or consumer is removed;
  registry-resolved edges are invalidated for explicit rejoin after a registry revision change.
- Exact references survive unrelated partial consumer coverage. Removal-sensitive producer claims
  abstain when producer extraction is incomplete.
- A newer run for the same workspace/producer/provider/PR/policy major supersedes the prior current
  analysis. The older occurrence remains inspectable.
- An analyzed head tree is promotable only when it equals the actual merge tree; otherwise the
  merge SHA requires indexing.
- Direct findings and bounded transitive context have separate claim types, fingerprints, and
  display labels.

## Comparative decision

Current Repowise correctly matched the removed package symbol to the same consumer on the shared
fixture, so Reverb records parity rather than superiority. The project continues for its exact
snapshot, coverage/abstention, revision, fingerprint, authorization, and embeddable-protocol
semantics, and will investigate interoperability with external contract artifacts. Details are in
the [comparative report](phase-003-comparison.md) and [ADR-0002](../adr/0002-phase-003-comparative-gate.md).

## Commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:conformance
pnpm test:adversarial
pnpm test:migrations
pnpm schema:check
pnpm docs:check
pnpm licenses:check
pnpm benchmark --scenario pr-overlay
```

## Deliberate boundary

Phase 003 exposes local preview and persisted diagnostics only. It does not publish a repository,
package, container, PR check, comment, status, webhook, API service, or Yanib integration. Precision
calibration, review labels, suppression, disclosure projection, and delivery remain later gates.
