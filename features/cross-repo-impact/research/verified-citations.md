# Source Register and Corrections

**Verified/retrieved:** 2026-08-28 unless noted  
**Rule:** primary sources first; product/code claims are versioned; negative claims remain scoped.

## Repowise

| Claim | Verification | Source |
| --- | --- | --- |
| Current Repowise supports multi-repository workspaces and documents API contract extraction, provider-consumer matching and breaking-change workflows. | Executed at `0847cbff32c0c113ad46e2699ae87a795238d431` (v0.46.0); the shared fixture produced an exact package-symbol consumer and breaking-change record. | [Workspace documentation](https://github.com/repowise-dev/repowise/blob/main/docs/scale/WORKSPACES.md), [repository](https://github.com/repowise-dev/repowise) |
| Root distribution is AGPL-3.0-or-later and commercial terms are offered for embedding. | Observed at the pinned revision; verify the exact package/file boundary before reuse. | [Commercial/licensing documentation](https://github.com/repowise-dev/repowise/blob/main/docs/business/COMMERCIAL.md) |

Engineering conclusion: Repowise is mandatory prior art and benchmark. Reverb is a clean-room Apache-2.0 plan; this is not legal advice. See [repowise-teardown.md](repowise-teardown.md).

## SARIF 2.1.0 corrections

Checked against the [OASIS SARIF 2.1.0 specification](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html).

- `result.rank` is in the range **0.0–100.0**, not 0.0–1.0. `-1.0` represents an unknown/uninitialized value under the specification’s rule.
- SARIF does not define a standardized `confidence` field with Reverb’s semantics.
- SARIF supports producer-defined property bags, so it is too absolute to say partial coverage cannot be represented at all.
- Generic SARIF consumers do not share interoperable semantics for Reverb’s analysis/selection/label coverage, evidence proof path, authorization or abstention.
- Therefore SARIF is an export, not Reverb’s canonical internal/wire schema. Coverage may be included in custom properties for Reverb-aware consumers while the native Reverb report remains authoritative.

## CodeQL precision metadata

CodeQL query metadata defines `precision` categories and its default suites select high/very-high precision categories according to checked-in selectors. Sources: [CodeQL metadata documentation](https://codeql.github.com/docs/writing-codeql-queries/metadata-for-codeql-queries/) and [default code-scanning selectors](https://github.com/github/codeql/blob/main/misc/suite-helpers/code-scanning-selectors.yml).

Correction: these bands are policy/category metadata, not calibrated probabilities transferable to Reverb. They support the architectural idea that delivery selection belongs in versioned configuration.

## Static-analysis false-positive filtering

Kharkar et al., “Learning to Reduce False Positives in Analytic Bug Detectors,” ICSE 2022, reports improved precision from learned filtering with an associated recall tradeoff in the full paper. Source: [arXiv:2203.09907](https://arxiv.org/abs/2203.09907).

Correction to the earlier draft: recall is not “unavailable.” The full paper reports it; the abstract alone was insufficient. General lesson: report precision and recall/selection together rather than quoting the precision gain alone.

## Infer and Zoncolan deployment evidence

Distefano, Fähndrich, Logozzo and O’Hearn, “Scaling Static Analyses at Facebook,” CACM 2019, reports markedly higher action/fix rates when the same Infer analysis moved from batch assignment into diff-time review, and describes category-specific routing for Zoncolan. DOI: [10.1145/3338112](https://doi.org/10.1145/3338112).

The figures, verbatim from the author-accepted manuscript (UCL Discovery eprint 10084236), because
they are quoted loosely elsewhere:

> The response was stunning: we were greeted by near silence. We assigned 20-30 issues to
> developers, and almost none of them were acted on. We had worked hard to get the false positive
> rate down to what we thought was less than 20%, and yet the fix rate — the proportion of reported
> issues that developers resolved — was near zero.

> Next, we switched Infer on at diff time. The response of engineers was just as stunning: the fix
> rate rocketed to over 70%. The same program analysis, with same false positive rate, had much
> greater impact when deployed at diff time.

Read precisely: the batch figure is **"near zero"** in the primary account (§4) and **0%** in the
summary (§2); the sample is **20–30 issues**; the diff-time figure is **"over 70%"**. The paper
holds the false-positive rate constant across both deployments, so **the variable is placement, not
precision.**

On why they report action rate at all:

> the false positive rate is challenging to measure for a large, rapidly changing codebase: it
> would be extremely time consuming for humans to judge all reports as false or true as the code is
> changing.

Zoncolan's routing, which is the model for per-kind promotion:

> If Zoncolan determines a new issue is not high-signal enough for auto-commenting on the diff, but
> needs to be looked at by an expert, it pushes it to the on-call queue. If the alarm makes neither
> of these cuts, the issue will end up in the Zoncolan master analysis after the diff is committed.

> At the moment of writing circa 1/3 of the Zoncolan categories are enabled for diff analysis.

Three mechanisms that cut noise without touching the analysis — diff-scoping to regressions only, a
bug-equivalence hash "sensitive to file moves and line number changes cause by refactoring", and a
latency budget of "15-20min on a diff on average" against whole-program mode that "can take more
than an hour... too slow for diff-time".

Not in the paper, despite circulating as if it were: any argument against triage queues, and any
discussion of what to report when a build fails. Zoncolan operates a dashboard **and** an on-call
queue by design.

Supported conclusions:

- review-time placement can reduce context/ownership friction;
- high-signal categories can be delivered directly while others go to expert review or later analysis;
- action rate is useful deployed-workflow telemetry;
- differential/regression-only analysis and bounded latency matter.

Corrections:

- the batch comparison was small and organization-specific;
- it does not prove all dashboards or queues fail;
- expert-owned queues in the same account are a counterexample to that absolute claim;
- action rate is not false-positive rate or precision.

## Cross-repository research

DepRadar is accepted at ICSE 2026 and evaluates downstream-client impact for deep-learning library changes. Sources: [official ICSE page](https://conf.researchr.org/details/icse-2026/icse-2026-research-track/235/Depradar-Agentic-Coordination-for-Context-Aware-Defect-Impact-Analysis-in-Deep-Learn) and [paper](https://arxiv.org/abs/2601.09440).

Correction: Reverb cannot claim to be the first PR-time cross-repository impact analyzer. Any novelty statement must distinguish domain, contract model, snapshots, coverage/abstention, authorization, labels and evaluation.

## GitHub App permissions and checks

Official GitHub documentation establishes that GitHub App access is installation/repository and permission scoped, while user-to-server authorization is limited by both app and user access. Sources: [authorizing GitHub Apps](https://docs.github.com/en/apps/using-github-apps/authorizing-github-apps) and [choosing permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app).

Design consequence: installation access to consumer B does not mean every reader of producer A may learn B exists. Shared check output must be safe for the whole producer-repository audience; personalized detail belongs behind an authenticated authorization check.

The Checks API supports check runs, requested actions and annotations, and limits annotations per request. Source: [Checks API guide](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks) and [check-runs API](https://docs.github.com/en/rest/checks/runs).

Protected-branch documentation describes conclusions including `neutral` and `skipped` in required-check handling. Source: [about protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

Operational caution: a still-pending check can delay merging if configured as required. Reverb’s latency timeout must complete with an explicit neutral/incomplete result rather than remain pending. The reference product does not block merges.

## Indexing protocols and parsers

| System | Verified role | Source |
| --- | --- | --- |
| SCIP | Language-agnostic code-index protocol for definitions/references and code intelligence. | [scip-code/scip](https://github.com/scip-code/scip) |
| Tree-sitter | Incremental parsing system producing concrete syntax trees with broad grammar ecosystem. | [tree-sitter/tree-sitter](https://github.com/tree-sitter/tree-sitter) |
| `buf breaking` | Protobuf compatibility checking against a prior module/image/source according to configured rules. | [Buf breaking-change detection](https://buf.build/docs/breaking/) |

Conclusion: Reverb may consume or wrap these outputs. None independently supplies organization membership, cross-repository service identity, proposition coverage, human labels or ACL-safe delivery.

## AI security terminology

NIST AI 100-2e2025 provides a current taxonomy for adversarial machine-learning attacks and mitigations, including evasion, poisoning, privacy and misuse concerns. Source: [NIST publication](https://www.nist.gov/publications/adversarial-machine-learning-taxonomy-and-terminology-attacks-and-mitigations-0).

If Reverb uses a model for optional adjudication/explanation, source code is untrusted input; the model receives no ambient tools/write credentials and cannot originate or upgrade an edge.

## Current venue dates

These are planning facts, not durable product requirements. Recheck before submission.

| Venue | Date observed | Primary source |
| --- | --- | --- |
| MSR 2027 Registered Reports initial report | 2026-11-20 | [MSR 2027 dates](https://conf.researchr.org/dates/msr-2027) |
| MSR 2027 Technical Papers | 2026-10-23 | [MSR technical CFP](https://2027.msrconf.org/track/msr-2027-technical-papers) |
| ICSE 2027 Tool Demonstrations/Data Showcase | 2026-10-23 | [ICSE demonstrations CFP](https://conf.researchr.org/track/icse-2027/icse-2027-demonstrations) |
| FSE 2027 Research | 2026-10-02 | [FSE research CFP](https://conf.researchr.org/track/fse-2027/fse-2027-papers) |

The full technique paper is realistically a later cycle from a documentation-only starting point.

## Private-host evidence boundary

[Prior-host lessons](prior-system-yanib.md) intentionally contains only generic public design
constraints. Private source revisions, implementation paths, customer topology, and internal
metrics are not publication evidence and are omitted.

## Claim corrections carried into the spec

| Earlier formulation | Correct formulation |
| --- | --- |
| “Nothing has all four.” | Dated scoped search found no public system documenting the complete Reverb constraint set; Repowise and DepRadar occupy much of the space. |
| “SARIF rank is 0–1.” | SARIF result rank is 0–100. |
| “SARIF cannot express coverage.” | Custom properties can carry producer-defined coverage, but no interoperable standard semantics meet Reverb’s needs. |
| “Dashboard findings are ignored.” | PR placement can improve action in reported settings; expert dashboards/queues also have valid roles. |
| “CodeQL bands are calibrated probabilities.” | They are metadata/policy categories, not Reverb calibration. |
| “Ground truth comes only from history.” | History and forward audits support real-world precision; controlled mutations support capability/recall but cannot establish real-world precision alone. |
| “Precision is never pooled.” | Promotion is per stratum; transparent secondary macro/micro/hierarchical summaries are allowed with denominators and heterogeneity. |
| “Action rate is precision.” | Action rate is a workflow outcome and must be reported separately from correctness. |

## Verification backlog before publication

- Refresh Repowise behavior/licensing at a release tag used in experiments.
- Run a systematic literature search with documented databases, queries, dates and inclusion/exclusion decisions.
- Verify every external tool’s current license and supported semantics.
- Archive public web sources/DOIs where venue policy permits.
- Replace planning dates with the selected venue’s final CFP.
- Create immutable permission-safe public artifacts for any host-derived quantitative claim or omit it.
