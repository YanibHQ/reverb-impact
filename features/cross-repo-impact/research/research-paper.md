# Research-Paper Plan

**Status:** full research agenda; no empirical result is claimed yet  
**Planning date:** 2026-08-28  
**Recommendation:** two papers plus a public tool/data artifact, not one overloaded submission.

## 1. Research thesis

Modern organizations split contracts and consumers across independently versioned repositories. Pull-request analysis can find cross-repository impacts before merge when it combines exact producer change semantics, structural consumer evidence, historically correct repository snapshots, explicit analysis coverage, selective abstention, and permission-aware delivery.

The scientific question is not whether a graph can connect repositories. The question is whether those combined constraints improve consumer-edge discovery and actionable impact precision at acceptable coverage, latency and alert burden across multiple contract kinds.

## 2. Honest novelty position

Do not claim “first PR-time cross-repository impact analysis.”

- Current Repowise already provides multi-repository workspaces, contract/provider-consumer linking, blast radius, breaking-change guard and PR-oriented risk output; see the [Repowise workspace documentation](https://github.com/repowise-dev/repowise/blob/main/docs/scale/WORKSPACES.md) and the [pinned teardown](repowise-teardown.md).
- DepRadar, accepted at ICSE 2026, studies downstream-client impact for deep-learning library changes. Its official page reports evaluation on 122 clients and published precision/recall; see the [ICSE 2026 paper page](https://conf.researchr.org/details/icse-2026/icse-2026-research-track/235/Depradar-Agentic-Coordination-for-Context-Aware-Defect-Impact-Analysis-in-Deep-Learn) and [paper](https://arxiv.org/abs/2601.09440).
- Schema differs, package graphs, code indexes, consumer-driven contracts and large-company analyzers solve important components.

Candidate contributions that require evidence:

1. **Contract-general representation:** one canonical producer/change/consumer/evidence model across package symbols, OpenAPI and Protobuf/gRPC, with extensibility to other boundary kinds.
2. **Snapshot-correct cross-repository analysis:** exact PR base/head overlay joined to each consumer’s recorded contemporaneous SHA/generation.
3. **Selective reliability contract:** proposition-specific coverage, evidence strata, calibration and abstention instead of a global opaque confidence score.
4. **ACL-safe delivery model:** repository existence, identity, contract and location disclosed only to authorized audiences despite a static PR check surface.
5. **Benchmark and label protocol:** separate edge, impact and action labels, including probability-sampled no-finding audits.
6. **Deployment evidence:** effect on coordination time and alert burden, separated from correctness.

“First multi-language” or “first multi-contract” remains an unverified hypothesis until a systematic literature and product search is documented.

## 3. Two-paper strategy

### Paper A — Technique and benchmark

Working title:

> Reverb: Coverage-Aware Cross-Repository Impact Analysis for Pull Requests

Scope:

- canonical model and exact snapshot semantics;
- extraction and producer-consumer joins for three initial adapters;
- compatibility classification and activation/version timing;
- coverage-aware abstention;
- offline historical, executable and mutation evaluation;
- comparison with simpler baselines and Repowise on shared strata;
- scalability and reproducibility artifact.

Primary claim type: technical and empirical accuracy/coverage/performance.

### Paper B — Registered deployment study

Working title:

> From Blast Radius to Coordination: A Registered Study of Cross-Repository PR Advisories

Scope:

- preview versus PR-integrated advisory placement;
- time to first coordination;
- alert burden, trust and action outcomes;
- longitudinal drift and suppression patterns;
- privacy/consent and organizational conditions;
- qualitative failure taxonomy.

Primary claim type: workflow outcome under a preregistered design. It must not use action rate as a proxy for detector correctness.

### Tool/data artifact

A tool demonstration or data showcase can present the public CLI/GitHub workflow, benchmark manifest, schema, fixtures and reproductions. It complements the scientific papers; it does not replace them.

## 4. Paper A research questions

**RQ1 — Edge discovery:** How accurately and completely does Reverb identify repositories and artifacts that consume a changed contract?

**RQ2 — Impact classification:** Given a confirmed consumer edge, how accurately does Reverb distinguish breaking, behavior-risk and compatible changes?

**RQ3 — Comparative value:** At matched selection coverage or recall, how does Reverb compare with manifest fanout, lexical search, structural-reference-only analysis, producer-only differs and current Repowise on shared supported strata?

**RQ4 — Selective reliability:** How do precision and false-omission risk change as Reverb abstains from weaker or incomplete evidence?

**RQ5 — Generalization:** How do results vary by organization, repository family, contract kind, language/ecosystem, evidence class and time?

**RQ6 — Systems cost:** What full/incremental index cost, storage growth and PR latency occur as repository count, source size and graph fanout grow?

Possible preregistered hypotheses:

- H1: structural contract joins provide higher actionable precision than manifest fanout at matched consumer-edge recall;
- H2: semantic change classification reduces alert volume without reducing known-break recall relative to alerting on every changed used contract;
- H3: stronger abstention lowers selective risk while reducing selection coverage;
- H4: exact historical consumer snapshots materially change measured results compared with present-day consumer snapshots.

Do not hypothesize one universal threshold across adapters.

## 5. Paper B research questions

**RQ7 — Placement:** Does author-facing PR advisory delivery reduce time to first cross-team coordination compared with an authenticated preview workflow?

**RQ8 — Burden:** What alert burden, dismissal, suppression and opt-out patterns emerge by team and evidence stratum?

**RQ9 — Trust:** Which evidence, explanations, remedies and coverage disclosures influence developer trust and action?

**RQ10 — Drift:** How do correctness, selection coverage and workflow outcomes change over time as codebases, teams and adapters evolve?

Possible preregistered hypothesis:

- H5: PR-integrated advisory delivery reduces restricted mean time to first coordination versus preview-only delivery without exceeding the predeclared weekly alert budget.

## 6. Proposed method

The normative experimental detail is in [evaluation-protocol.md](evaluation-protocol.md). In summary:

- enumerate eligible PRs independently of detector output;
- replay exact producer base/head and contemporaneous consumer snapshots;
- combine historical cases, forward shadow cases, executable replays and controlled mutations;
- use all findings plus probability-sampled no-finding PRs;
- obtain two independent three-axis labels and adjudicate disagreement;
- split by repository family, organization and time to prevent leakage;
- freeze adapters, policy, prompts and baselines before holdout;
- report per-stratum metrics with selection/analysis/label coverage;
- use cluster-aware inference and preserve `indeterminate` outcomes;
- release raw predictions and sampling weights where rights permit.

## 7. Baselines and related-system treatment

### Required baselines

1. Manifest/package-dependency fanout.
2. Exact lexical contract-key search.
3. Structural reference without semantic compatibility.
4. Producer-only compatibility differ plus declared fanout.
5. Consumer-driven contract artifacts where available.
6. Repowise pinned current version on shared supported strata.
7. Flat model over diff/retrieved snippets, if model comparison is in scope.
8. Reverb without optional model adjudication.

### Repowise comparison

Repowise is both prior art and a product benchmark. Treat it respectfully and reproducibly:

- pin source/release/configuration;
- provide equivalent repository/registry visibility;
- compare common contract strata;
- report unsupported cases and breadth separately;
- do not copy implementation code;
- do not imply license model is an accuracy flaw;
- retest current behavior at paper freeze.

### DepRadar comparison

DepRadar establishes that downstream PR/commit impact is not an empty research space. It is an empirical/runnable baseline only where data and domain overlap permit a fair run. Otherwise compare problem, method and evaluation design, not headline scores across different populations.

## 8. Key ablations

- canonical identity normalization;
- service/package registry resolution;
- manifest/version gating;
- producer semantic differ;
- consumer structural evidence;
- coverage rule;
- abstention;
- edge expiry/tombstone semantics;
- optional model adjudicator;
- exact historical versus current consumer snapshot;
- incremental overlay versus clean full scan;
- evidence corroboration versus primary proof alone.

The ACL/privacy layer is not a live ablation. A study cannot deliberately disclose restricted data for an accuracy comparison.

## 9. Candidate abstract for Paper A

> Software contracts and their consumers increasingly live in separate repositories, leaving pull-request review unable to see downstream impact. Existing dependency graphs over-approximate affected repositories, while schema differs do not prove that a changed contract is used by a particular consumer. We present Reverb, a host-neutral cross-repository impact analyzer that joins semantic producer changes with structural consumer references at exact repository snapshots. Reverb records proposition-specific analysis coverage and abstains when missing evidence could change a conclusion. We evaluate three contract families across historical pull requests, executable replays and controlled mutations, comparing with manifest, lexical, structural-only, producer-only and current cross-repository baselines. We report consumer-edge and actionable precision, audited false omissions, selection coverage, latency and alert burden by evidence stratum. We further evaluate permission-aware delivery for repositories with unequal access control. The artifact includes a public engine, benchmark schema, fixtures, raw predictions and reproducible analyses.

This is a template. Replace every empirical noun/number only after frozen evaluation.

## 10. Expected paper structure

1. Introduction and motivating failure.
2. Problem definition and threat/authorization boundary.
3. Related systems and scoped novelty.
4. Canonical model and snapshot semantics.
5. Extraction, semantic diff and cross-repository join.
6. Coverage, evidence strata and abstention.
7. Implementation and initial adapters.
8. Evaluation design.
9. Accuracy/selective-risk results.
10. Performance/scalability results.
11. Security/privacy evaluation.
12. Discussion and adoption boundary.
13. Threats to validity.
14. Ethics, data and reproducibility statements.
15. Conclusion.

## 11. Figures and tables to plan

- End-to-end producer-change-to-consumer-evidence pipeline.
- Temporal snapshot/PR overlay diagram.
- Coverage lattice and state funnel.
- Primary-proof/evidence-stratum example.
- Dataset flow and split diagram.
- Risk–coverage curves per adapter.
- Precision/recall/selection table per stratum and baseline.
- False-omission audit table.
- Latency/storage scaling plots.
- Error taxonomy and confusion matrices.
- ACL-safe projection example.
- Repowise/Reverb capability-boundary table, dated and scoped.

Do not use a single pooled score as the headline.

## 12. Threats to validity

### Construct

- A dependency edge, breaking change and required action are different constructs.
- Static reference does not prove runtime exposure.
- Passing builds/tests cover only exercised paths.
- Action rate measures workflow behavior, not correctness.
- Alert burden depends on organization policy and PR mix.

### Internal

- Present-day consumer snapshots leak future fixes.
- Detector authors or visible bands can bias labels.
- Thresholds/prompts can overfit evaluation cases.
- Build failures can be unrelated to the producer change.
- Preview exposure can contaminate later workflow groups.

### External

- Opt-in organizations may have unusually mature contracts/registries.
- Public OSS differs from private service fleets and ACL topology.
- Initial TypeScript/OpenAPI/Protobuf support biases conclusions.
- Large monorepos and micro-repositories may behave differently.

### Conclusion

- Findings within repository pairs are correlated.
- Rare impacts create wide intervals.
- Dropping indeterminate cases inflates performance.
- Many adapters/metrics create multiple-comparison risk.
- Aggregate results can hide subgroup regressions.

### Reproducibility

- Private source and architecture may not be releaseable.
- Upstream history can be rewritten or disappear.
- package registries, parsers and hosted models evolve;
- historical provider/ACL state may be unrecoverable.

## 13. Ethics and privacy

- Obtain an ethics/IRB determination before collecting identifiable feedback, response times, dismissals, interviews or team behavior.
- Never use findings or response telemetry for individual performance evaluation.
- Give participants notice, an opt-out/withdrawal path and a retention/deletion policy.
- Separate source-analysis consent, evaluation use and research/publication use.
- Do not publish private repository names, paths, snippets, topology or guessable hashed identifiers.
- Treat the dependency graph itself as sensitive architecture.
- Keep public-repository benchmark and private industrial study datasets separate.
- Release commit manifests/fetch scripts rather than redistributing source without rights.
- scan artifacts for secrets and personal information;
- report subgroup support and limitations;
- disclose generative-AI use under the selected venue’s current rules.

## 14. Venue strategy as of 2026-08-28

Dates change; verify the official calls before committing.

| Target | Current fit and planning reality |
| --- | --- |
| MSR 2027 Registered Reports | Best immediate fit for a preregistered deployment/empirical study; the official dates list an initial report deadline of 2026-11-20 ([MSR 2027 dates](https://conf.researchr.org/dates/msr-2027)). |
| MSR 2027 Technical Papers | Strong if corpus, repository mining and empirical evaluation are mature; current deadline is 2026-10-23 ([official CFP](https://2027.msrconf.org/track/msr-2027-technical-papers)). |
| ICSE 2027 Tool Demonstration/Data Showcase | Plausible for a running public tool or benchmark, not a substitute for the technique paper; current deadline is 2026-10-23 ([official CFP](https://conf.researchr.org/track/icse-2027/icse-2027-demonstrations)). |
| FSE 2027 Research | Strong technique venue, but the current 2026-10-02 deadline is unrealistic from a documentation-only starting point ([official CFP](https://conf.researchr.org/track/fse-2027/fse-2027-papers)). |
| 2028 ICSE/FSE/ASE/ISSTA cycles | Honest target for a full implementation and multi-organization evaluation. |

Recommendation for the remainder of 2026:

1. publish the architecture, threat model and benchmark schema;
2. implement a reproducible vertical slice;
3. run public fixtures and a small shadow feasibility corpus;
4. preregister/submit a registered-report plan only if partners, power and ethics approvals are credible;
5. target later full research/tool venues rather than rushing unmeasured claims.

## 15. Reproducibility and artifact badges

Prepare:

- Apache-2.0 source release and signed version tag;
- frozen OCI images and lockfiles;
- public benchmark manifest with immutable SHAs;
- versioned JSON Schemas and label handbook;
- mutation/fixture generator;
- baseline commands/configurations;
- raw public per-case results and inclusion weights;
- analysis scripts/notebooks/seeds;
- coverage reports and system logs without source leakage;
- preregistration and deviation log;
- DOI-backed archive;
- artifact/data availability and non-release statements.

Aim for available, functional and reusable artifact criteria where the venue offers them. The artifact must work without private Yanib data.

## 16. Claim ledger

Before submission, keep a table with one row per abstract/introduction/result claim:

| Claim | Type | Required evidence | Status |
| --- | --- | --- | --- |
| Reverb finds cross-repo consumer edges | capability | public fixtures + real held-out cases | untested |
| Exact snapshots change evaluation outcomes | empirical | paired historical/current-snapshot ablation | untested |
| Coverage-aware abstention improves selective precision | empirical | frozen risk–coverage comparison | untested |
| Reverb beats manifest fanout at matched recall | comparative | paired holdout + clustered interval | untested |
| Reverb is faster than latency budget | systems | representative scale benchmark | untested |
| ACL projection prevents unauthorized disclosure | security | threat corpus + review | untested |
| PR delivery improves coordination time | causal/workflow | registered deployment design | untested |

No row advances from `untested` to `supported` without an immutable result artifact.

## 17. Paper-readiness gate

Paper A is ready to draft as a results paper only when:

- the three-adapter vertical slice is frozen;
- exact historical snapshots are reproducible;
- corpus/sample design and label handbook are frozen;
- independent labels and no-finding audits meet planned power;
- all baselines run fairly on shared strata;
- security evaluation has no unresolved disclosure defects;
- system benchmarks cover representative scale;
- held-out results and analysis scripts are immutable;
- novelty search is refreshed at submission time;
- the claim ledger contains no unsupported headline claim.

Paper B additionally requires ethics approval, preregistration, partner commitment, a powered rollout design and explicit participant protections.
