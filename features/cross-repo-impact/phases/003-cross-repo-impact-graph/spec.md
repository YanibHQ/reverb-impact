# Phase 003 Specification

**Parent invariants:** INV-1 through INV-12, INV-16

## P3-FR-1 — Service/deploy-unit registry

Complete the registry with valid-time aliases for base token/host/path prefix/package coordinate/schema ID/broker/database identity, environment, provenance, source, and owner.

**Acceptance criteria:**

- alias resolution is deterministic at a selected revision/as-of time;
- ambiguous candidates return ambiguity evidence, not arbitrary selection;
- gateway/path-prefix transformations are explicit;
- suggested mappings never activate without an operator revision;
- repository removal/consent change alters new current projections without rewriting history.

## P3-FR-2 — Temporal definitions/references/edges

Persist contract nodes and evidence edges tied to immutable producer/consumer generations.

**Acceptance criteria:**

- edge includes both artifacts, primary evidence path, stratum, registry revision, generations, observed times, invalidation;
- complete re-index missing a reference invalidates it from current projection immediately;
- TTL/freshness withholds only when no complete newer observation exists;
- declared and behavioural relationships are typed context and cannot satisfy structural evidence alone;
- materialized service edges retain back-pointers and can be rebuilt.

## P3-FR-3 — Join engine

**Acceptance criteria:**

- exact canonical joins precede registry-resolved then heuristic candidates;
- required path steps determine delivery class; optional context does not alter it;
- correlated duplicate signals do not count as corroboration;
- only touched canonical/registry keys rejoin incrementally;
- direct consumers are distinct; bounded transitive results use a separate claim/fingerprint/display;
- join output carries claim-specific coverage dependencies.

## P3-FR-4 — Consumer generation selection

**Acceptance criteria:**

- every admitted repository has selected generation, stale, unauthorized, unsupported, failed, or not-indexed state;
- analysis records exact consumer SHA and selected-at/freshness;
- on-demand refresh is bounded and cannot hold the result past hard budget;
- a found exact reference remains valid under unrelated missing coverage;
- negative assurance is withheld for any repository/input that could contain a missing relevant reference.

## P3-FR-5 — Exact PR analysis

**Acceptance criteria:**

- base generation matches exact base SHA; head overlay matches exact head SHA/tree/config/bundle;
- changes are diff-scoped to base→head;
- old force-push occurrence can persist but is superseded before publish/current selection;
- merge promotion occurs only on exact tree match; otherwise actual merge SHA is indexed;
- missing/truncated producer inputs block dependent removal claims;
- no source code execution, including fork PRs.

## P3-FR-6 — Finding model

**Acceptance criteria:**

- fingerprint includes producer/contract/change/consumer/stable reference/policy major;
- occurrence includes PR/base/head/run;
- evidence lines/ranges excluded from identity;
- edge/impact/action candidate claims are distinct;
- abstention uses closed reasons;
- every candidate has remedy template or is ineligible for future delivery;
- canonical result is independent from disclosure/render projection.

## P3-FR-7 — Local preview and diagnostics

`reverb analyze`, JSON output, `finding show`, `status`, and `doctor` expose exact inputs, findings, abstentions, coverage, freshness, versions, and limitations.

Human output must not use “safe” or “unaffected” for out-of-scope/incomplete repositories.

## P3-FR-8 — Comparative stop gate

Run pinned current Repowise and reduced baselines where technically/licensibly possible on the same task corpus.

**Acceptance criteria:**

- compare PR base/head fidelity, contract/join result, consumer evidence, coverage, latency/resource, and setup;
- record differences rather than declaring universal superiority;
- decide continue/interoperate/reposition/stop before hosted delivery investment;
- raw commands/configs/results are preserved in the research artifact.

## Definition of done

Local end-to-end analysis is credible and reproducible; it remains preview-only and uncalibrated.
