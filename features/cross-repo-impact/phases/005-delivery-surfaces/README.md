# Phase 005 — GitHub Reference Host and Delivery

**Status:** Standalone reference host implemented locally; shadow/no-write pending external gates  
**Depends on:** [004](../004-precision-and-review/) for external delivery; Phase 003 supports shadow  
**Produces:** hosted GitHub/Postgres operation, authorized preview, advisory checks

## Goal

Run the same canonical engine across provider-installed repository collections and place promoted, disclosure-safe findings at PR review time.

## Surfaces

1. **Shadow result:** persisted/operator metrics, no customer-visible effect.
2. **Authenticated detail/preview:** evidence, coverage, reviews, suppressions, policy replay.
3. **Advisory GitHub Check:** one current check per head/policy, only promoted strata, neutral when findings/incomplete.

The dashboard is not dismissed as universally ineffective; expert-owned triage can work. Diff-time delivery is the default author-facing surface because the reviewer already has change context. The current evidence from Infer is one organization and a small batch sample, so the docs use it directionally, not as a universal coefficient.

## Delivery rules

- never blocking;
- current head only;
- exact producer lines only for annotations;
- consumer details only when safe for the entire static audience;
- restricted personalized evidence behind fresh authorization;
- incomplete analysis completes neutral by 15 minutes;
- check body states admitted/current/failed/restricted coverage;
- every finding has evidence class/measurement and remedy;
- output counts remain honest when lists are truncated.

## Exit gate

- webhook/source/token/tenant/purge/security controls pass;
- full public/private/unequal-ACL matrix passes with zero known disclosure defects;
- shadow replay meets promotion alert and latency budgets;
- emergency write disable and rollback drill works;
- one promoted stratum is enabled advisory and observed on the current head;
- no finding or incomplete run blocks merge in the reference host.

## What happens if we skip this

**The first adapter built ships to customers and the measurement is scheduled for afterwards.**
Per-kind promotion gated on a recorded interval is the only mechanism that prevents this, and
Zoncolan is the published precedent: roughly one third of categories were enabled for diff-time
analysis, promotion gated on signal quality, the rest routed to an expert queue or to post-merge
analysis ([`../../research/verified-citations.md`](../../research/verified-citations.md)).

**The check becomes a count.** Without a named remedy per finding it reproduces Tricorder's
`AffectedTargets` analyzer — roughly 440 results a day, shipped in the review UI in 2015, and
deliberately given no "Please fix" option because a count is not an action
([`../../research/prior-art.md`](../../research/prior-art.md)).

**Delivering only to a workspace view reproduces the deployment that measured near-zero.** Meta's
batch deployment and its diff-time deployment ran the same analysis at the same false-positive rate
and produced a near-zero fix rate against over 70%. The workspace preview is a measurement
instrument; treating it as the destination is the mistake that finding documents.

**A half-built writer can post to someone's pull request.** Without an import-graph test naming the
check writer as the only module permitted to import the provider's write client, "cannot leak" is a
convention rather than an enforced property.

## Documents

- [spec.md](spec.md)
- [plan.md](plan.md)
- [tasks.md](tasks.md)
- [security](../../security.md)
