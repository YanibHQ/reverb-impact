# Phase 003 comparative stop gate

- Date: 2026-08-28 (America/Denver)
- Reverb scope: local preview only
- External target: `repowise-dev/repowise@0847cbff32c0c113ad46e2699ae87a795238d431`,
  version 0.46.0
- Decision: **continue and interoperate; do not claim general superiority**

## Method

The task has one TypeScript package producer, one consumer importing the removed export `x`, and
one unrelated consumer importing retained export `y`. The external run also includes an Express
route and an absolute-host HTTP client to exercise registry/base mapping behavior. Base and head
are separate Git commits for the external run. Reverb's reduced-baseline runner uses the same
source shapes with fixed synthetic SHA identities; the separate CLI integration test exercises the
full exact-Git workflow.

Repowise was cloned and executed unmodified in a temporary directory. Its AGPL-3.0-or-later code is
not copied, imported, translated, linked, or packaged by Reverb. The raw command list, exact
revision, fixture SHAs, extracted result, and resource observation are preserved in
[`repowise-current.json`](../../features/cross-repo-impact/research/artifacts/phase-003/repowise-current.json).
The Reverb and reduced-baseline output is preserved in
[`reduced-baselines.json`](../../features/cross-repo-impact/research/artifacts/phase-003/reduced-baselines.json).

## Results

| System/lane     | Removed `x` consumer | Unrelated `y` consumer    | Exact base/head in result                                                             | Consumer evidence                            | Coverage/abstention                                                            |
| --------------- | -------------------- | ------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| Reverb          | found                | excluded                  | yes                                                                                   | stable reference, location, generation SHA   | claim-specific coverage and closed abstentions                                 |
| Repowise 0.46.0 | found                | excluded                  | current provenance is recorded; breaking artifact does not name the selected base SHA | exact contract link and consumer file/symbol | extraction diagnostics, but no equivalent per-result abstention model observed |
| Manifest        | found                | included (false positive) | no                                                                                    | package declaration                          | none                                                                           |
| Lexical         | found                | excluded in this fixture  | textual diff only                                                                     | name match                                   | none                                                                           |
| Schema-only     | found                | excluded                  | fixed synthetic base/head in runner                                                   | canonical reference                          | none                                                                           |

Repowise correctly detected `code::@fixture/api::x` as removed and attached only `consumer/client.ts`.
It also detected the removed Express route. The absolute-host HTTP client remained an
`external_host` because this fixture deliberately supplied no Repowise `service_bases` mapping.
That is a configuration difference, not a demonstrated engine defect.

The reduced Reverb runner took 7.809 ms in the preserved observation. Repowise reported 9.4 s for
initial indexing and 1.500 s for the update; a subsequent diagnostics command used 0.42 s wall time
and about 92 MB maximum resident set size. These timings cover different work and are not a
performance ranking.

## Interpretation

This result invalidates the older positioning that Repowise's PR-time result is only file-level.
Current Repowise resolves exact package-symbol contract links and reports consumer files for a
breaking update on this fixture. Reverb must not market basic cross-repository contract impact as
unique.

Reverb still exercises different requirements in the tested vertical: an explicit PR base/head
overlay, exact consumer generation SHAs and freshness, revisioned registry and policy identity,
consumer-specific stable fingerprints, negative-assurance abstention, force-push supersession, and
an Apache-2.0 embeddable boundary. None of those differences proves user value without a design
partner and labelled corpus.

## Stop decision

Continue the standalone Reverb implementation through the planned evaluation and host-reference
phases, while keeping every evidence stratum `UNMEASURED` and every result preview-only. Treat
Repowise contract artifacts as a future interoperability input candidate rather than reimplementing
its broad framework extraction. Do not invest in external delivery based on this synthetic result
alone; Phase 005 calibration and promotion gates remain mandatory.

The accepted decision and revisit triggers are recorded in
[`ADR-0002`](../adr/0002-phase-003-comparative-gate.md).
