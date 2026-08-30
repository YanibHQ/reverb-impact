# ADR-0002: Continue Reverb as a narrow evidence protocol and interoperate

- Status: Accepted
- Date: 2026-08-28
- Owners: YanibHQ/reverb-impact maintainers
- Decision scope: Phase 003 stop gate, Repowise relationship, hosted-investment boundary

## Context

Phase 003 required a stop decision before hosted delivery investment. The current external
comparison used unmodified Repowise 0.46.0 at commit
`0847cbff32c0c113ad46e2699ae87a795238d431` and Reverb plus manifest, lexical, and schema-only
baselines on the same small producer/consumer task.

Both Repowise and Reverb correctly linked a removed TypeScript package symbol to the one consumer
that imported it and excluded a repository importing a different symbol. The fixture therefore
does not establish a precision advantage. It does establish that the earlier assumption that
Repowise stops at file-level PR impact is obsolete.

Reverb's tested distinction is protocol and trust semantics: exact PR input identity, immutable
consumer snapshots, valid-time registry revisions, coverage and abstention, stable finding
identity, force-push supersession, and an Apache-2.0 embeddable core. Demand for that distinction is
not yet demonstrated by a design partner or real labelled corpus.

## Decision

1. Continue Reverb as a standalone local preview and evaluation implementation.
2. Position it as an evidence, snapshot, coverage, authorization, and review protocol—not as the
   first or only cross-repository contract analyzer.
3. Investigate ingesting versioned Repowise contract/link artifacts through a future admitted
   adapter. Keep Repowise execution and AGPL code outside Reverb packages.
4. Proceed with host-reference plumbing only where it proves the protocol boundary. Do not enable
   external finding delivery until a measured evidence stratum passes Phase 005 promotion gates.
5. Keep the initial three native adapters bounded. Admit additional framework breadth only through
   measured demand or interoperable external outputs.

## Consequences

- Product and documentation claims must acknowledge current Repowise contract-level behavior.
- Synthetic ties are reported as ties; latency measurements with different work are not ranked.
- The absence of design-partner labels prevents any claim of production precision or delivery
  readiness.
- Phase 004 may build the GitHub host boundary and dry-run projections, but Phase 006 cannot turn
  on broad delivery merely because the plumbing exists.

## Revisit triggers

Reconsider or stop if representative evaluation shows no material benefit from exact base/head
selection, coverage/abstention, permission-safe disclosure, or stable review identity; if a
maintained interoperable tool supplies those semantics under an acceptable boundary; or if three
native adapters cannot be sustained within published resource and correctness budgets.

## Evidence

- [Comparative report](../verification/phase-003-comparison.md)
- [Raw Repowise observation](../../features/cross-repo-impact/research/artifacts/phase-003/repowise-current.json)
- [Reduced baseline observation](../../features/cross-repo-impact/research/artifacts/phase-003/reduced-baselines.json)
