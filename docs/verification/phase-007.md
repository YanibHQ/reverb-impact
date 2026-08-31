# Phase 007 Verification — Exact Same-Repository Impact

Verified on 2026-08-31.

## Automated evidence

- `pnpm vitest run --config vitest.integration.config.ts packages/testkit/test/pr-analysis.integration.test.ts`
  proves exact-head producer selection, live same-repository joins, deleted-reference absence,
  mismatched-head rejection, authorization/coverage abstention, downstream findings, and
  force-push supersession.
- `pnpm vitest run --config vitest.integration.config.ts packages/cli/test/cli.integration.test.ts`
  exercises a real local Git producer that references its own public contract and a separate
  downstream consumer. One exact PR analysis returns both consumer-scoped findings.
- `pnpm typecheck` proves every `AnalyzePullRequest` caller supplies the required exact head
  observation.

## Safety conclusion

The producer is no longer categorically excluded. It participates only through an observation
whose workspace, repository, generation, and commit match the exact analysis head. No base/latest
fallback exists.
