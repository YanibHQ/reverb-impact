# ADR 0003 — Promotion interval and frozen replay

**Status:** Accepted  
**Date:** 2026-08-28

## Context

The shared product specification and Phase 004 README define the default advisory gate with a
one-sided 95% Wilson lower bound. The research protocol also computes a conservative
Clopper–Pearson bound and, in one later section, recommends it as the gate. At 95 correct labels out
of 100, that difference changes the decision: Wilson is about 0.9008; Clopper–Pearson is about
0.8977.

## Decision

The executable default follows the normative shared specification:

- one-sided 95% Wilson lower bound for the actionable and edge product gates;
- the one-sided 95% Clopper–Pearson lower bound is always retained beside Wilson in the report;
- Wald intervals are not implemented;
- a gate change requires a versioned decision reference and frozen-policy replay;
- promotion remains per complete evidence stratum, never a pooled headline.

This is not a claim that Wilson has exact coverage. It makes the documented product policy
executable while keeping the conservative value visible. A later policy may select
Clopper–Pearson, but must carry a new revision and replay the same frozen corpus.

## Consequences

At the exact 100-label boundary, reviewers can see whether the decision depends on interval choice.
No current stratum is promoted by this ADR: the standalone repository has no independently labeled
real-world corpus or audited no-finding population.
