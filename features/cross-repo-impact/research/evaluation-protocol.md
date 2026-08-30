# Evaluation Protocol

**Status:** preregistration-ready design; execution requires implementation, ethics review and frozen artifacts.  
**Primary purpose:** decide whether any evidence stratum is accurate, useful and safe enough for advisory PR delivery.

## 1. Evaluation objects

Do not evaluate only user-facing alerts. Preserve the full funnel:

```text
eligible PR
  -> analysis eligibility/coverage
  -> candidate producer changes
  -> candidate consumer edges
  -> impact candidates
  -> policy selection/abstention
  -> delivery
  -> adjudication/action
```

The canonical case is:

```yaml
impact_case:
  organization_id: opaque stable study id
  producer_repository_id: opaque stable id
  producer_base_sha: git object id
  producer_head_sha: git object id
  pr_opened_at: timestamp
  contract_kind: closed vocabulary
  canonical_contract_key: versioned identity
  change_kind: adapter vocabulary
  consumer_repository_id: opaque stable id
  consumer_sha_as_of_pr_open: git object id
  producer_generation_id: immutable id
  consumer_generation_id: immutable id
  adapter_versions: map
  identity_function_version: semver
  registry_revision: id
  evidence_items: versioned records
  coverage_vector: versioned record
  policy_revision: id
  detector_output: candidate/abstained/no-candidate
  edge_label: confirmed/absent/indeterminate
  impact_label: breaking/behavior_risk/compatible/indeterminate
  action_label: closed action vocabulary
  reviewer_provenance: blinded reviewer/adjudicator ids
```

Consumer state must be the state available at the analysis time or a clearly defined counterfactual snapshot. Using a later consumer commit can leak the downstream fix into the answer.

## 2. Populations and sampling frame

Define an **eligible PR** before running the detector:

- producer repository is in the consented study workspace;
- exact base/head is available;
- at least one supported adapter partition is expected;
- repository/provider permissions allow the planned analysis use;
- bot/generated/dependency-only PR inclusion policy is explicit;
- draft/closed/reopened/force-pushed occurrence policy is explicit.

Enumerate the population from provider metadata and supported-artifact discovery, not from detector findings. This preserves denominators.

Stratify by:

- organization and repository family;
- contract kind and language/ecosystem pair;
- adapter/evidence/join stratum;
- change type and activation timing;
- repository size/fanout;
- public/private and ACL topology;
- time window;
- detector candidate/no-candidate outcome for audit sampling.

## 3. Complementary corpora

### Historical real-world corpus

Replay eligible historical PRs against exact producer base/head and contemporaneous consumer snapshots. Sample all delivered/candidate cases plus probability-sampled no-candidate cases. Retain inclusion probabilities and use weights for population estimates.

Advantages: ecological validity, natural noise, real repository topology. Limits: incomplete historical builds/configuration, survivor bias, private release constraints, downstream changes that may be unrecorded.

### Executable replay corpus

Where feasible, build or test the consumer with the proposed producer artifact/schema substitution in repository-owned or dedicated isolated infrastructure.

Record:

- exact commands/container/toolchain;
- dependency substitution mechanism;
- success/failure phase;
- test coverage or target scope;
- unrelated build failures;
- environment and network inputs.

An unrelated failure is `indeterminate`. A successful limited test run is evidence for the paths exercised, not universal compatibility.

### Mutation and designed fixture corpus

Seed known changes that exercise identity, compatibility, coverage, rename/delete, alias, version and stale-index semantics.

Use it for:

- adapter regression;
- controlled sensitivity/known-break recall;
- incremental-versus-full equivalence;
- boundary and security cases;
- conformance across stores/hosts.

Do not report mutation precision as real-world precision or use only synthetic data to justify PR delivery.

### Forward shadow corpus

Run frozen candidate generation on real PRs without author-facing output. Independently audit selected positives and no-finding PRs. This avoids some historical reconstruction ambiguity and is the required bridge before advisory delivery.

## 4. Ground-truth protocol

### Labelers

- Two independent reviewers with relevant ecosystem/domain competence.
- Final adjudicator for disagreements or `indeterminate` review.
- Detector authors excluded from sole final labeling.
- Reviewers blinded to system/baseline and evidence band where practical; source facts required for judgment remain visible.

### Label handbook

The handbook defines the three axes and each reason code with positive, negative and ambiguous examples. It includes:

- package versions and upgrade/deploy activation;
- generated/test/dead code;
- indirect gateway/service resolution;
- behavioral compatibility uncertainty;
- coordinated and accepted changes;
- missing/failed evidence;
- consumer snapshots and future leakage.

Run a pilot batch, revise the handbook before freezing it, then exclude or relabel pilot items for confirmatory analysis.

### Agreement

Report raw agreement, per-label confusion matrices and an appropriate chance-corrected coefficient such as Krippendorff’s alpha, with uncertainty. Preserve `indeterminate`; report complete-case and best/worst-case sensitivity rather than silently dropping it.

### Independence

Cases from one contract, repository pair or organization are clustered. “100 findings” for product promotion means independently adjudicated occurrences but still requires cluster-aware intervals/sensitivity; one mechanically repeated break cannot establish general reliability.

## 5. Baselines

| Baseline | Question answered |
| --- | --- |
| Manifest fanout | What if every declared downstream repository is warned? |
| Lexical search | What does exact route/symbol/schema text matching achieve? |
| Structural reference only | What value comes from AST/SCIP references without semantic differ? |
| Producer-only differ + fanout | What does compatibility checking add before precise consumer join? |
| Declared consumer contract | What happens where Pact-like artifacts already exist? |
| Repowise current pinned release | How does the nearest cross-repo product compare on mutually supported strata? |
| Flat model over diff/snippets | Does non-structural model reasoning help and at what reproducibility/cost? |
| Reverb without optional adjudicator | Is the model necessary? |
| Reverb full frozen policy | Target method. |

DepRadar is important prior art and a runnable baseline only for its supported deep-learning-library domain if the released artifact and inputs permit a fair comparison.

Fairness rules:

- equal source and registry visibility;
- best documented reasonable configuration fixed before holdout;
- separate unsupported from wrong;
- compare shared strata directly and breadth separately;
- report runtime and human setup burden;
- do not translate another tool’s score/band into Reverb probability semantics.

## 6. Ablations

- no canonical identity normalization;
- no service/package registry resolution;
- no manifest/version gating;
- no semantic change classifier;
- no consumer-side structural evidence;
- no expiry/tombstoning;
- no explicit coverage rule;
- no abstention;
- no optional model adjudicator;
- lexical instead of structural retrieval;
- current consumer state instead of contemporaneous state;
- full rebuild versus incremental overlay;
- one evidence source versus evaluated corroborating combination.

Privacy/authorization is not ablated in live systems. Security invariants are constraints, not experimental knobs.

## 7. Metrics and estimands

### Primary offline endpoints

1. **Actionable precision by promoted stratum:** among selected delivered-equivalent findings, the proportion requiring coordination after label adjudication according to the frozen action policy.
2. **Consumer-edge recall on audited population:** proportion of confirmed eligible edges detected, estimated from finding and probability-sampled no-finding cases.
3. **Known-break recall:** proportion of adjudicated real or controlled breaking cases producing the correct candidate.
4. **Selection coverage:** proportion of eligible candidate propositions selected rather than abstained.
5. **False-omission risk:** estimated missed actionable impacts among audited no-finding PRs.

### Secondary endpoints

- edge and impact precision/recall;
- risk–coverage and precision–selection curves;
- findings and alerted PRs per 1,000 eligible PRs;
- per-team weekly burden;
- analysis coverage and freshness distributions;
- p50/p95/p99 index/analysis latency and cost;
- incorrect disclosure/wrong-audience incidents;
- time to first coordination and action rate in deployment.

### Reporting

- Publish numerator, denominator and 95% interval for every proportion.
- Make per-stratum results primary for promotion.
- Macro/micro/hierarchical pooled summaries may be secondary only with weights and heterogeneity visible.
- Do not call action rate precision or silence a true negative by excluding `NOT_ANALYSED`.
- Report conditional metrics alongside coverage/selection denominators.

## 8. Statistical plan

- Freeze adapters, identity functions, policies, prompts and baseline configurations before final evaluation.
- Split chronologically and by repository family; the same contract/repository pair must not leak across development and holdout.
- Use leave-one-organization-out analysis for external generalization where sample permits.
- Preserve a final untouched temporal holdout.
- Use Wilson or exact intervals for simple product-gate binomial proportions; use cluster bootstrap or hierarchical/mixed-effects models for research estimates.
- Use paired bootstrap or a paired binary test where systems run on the same cases.
- Correct confirmatory multiple comparisons, for example with Holm’s method.
- Report effect sizes and intervals, not p-values alone.
- Model organization and repository-pair clustering.
- Use sampling weights for probability-sampled no-finding cases.
- For time-to-coordination, retain censoring and use survival analysis or restricted mean survival time.
- For stochastic model calls, pin provider/model/settings and report repeated-run variability.

A simple independent-binomial planning approximation for precision 0.90 with ±0.05 half-width is roughly 139 cases; actual sample sizing must account for clustering, prevalence, expected indeterminates and the chosen primary comparison. The product gate’s 100 labels is a minimum operational floor, not a guaranteed research-powered sample.

## 9. Drift and temporal validation

Track performance by adapter/differ/identity version and rolling time window. Drift signals include:

- new parser failure modes;
- changed framework/package conventions;
- service registry alias churn;
- precision-interval degradation;
- selection/analysis coverage change;
- alert volume increase;
- subgroup degradation;
- suppressions concentrated around one rule.

Do not mix cases across incompatible identity or label-vocabulary versions without a documented mapping. Re-evaluate changed evidence strata before re-promotion.

## 10. Deployment study

### Sequence

1. Offline replay.
2. Forward shadow run.
3. Authenticated dashboard/preview for platform/reviewer teams.
4. Advisory PR check for promoted strata only.
5. Longitudinal review and possible expansion.

### Design

A cluster-randomized stepped-wedge rollout is preferred: teams/repository groups cross from preview to advisory at scheduled times while all eventually receive the feature. This reduces cross-team contamination better than per-PR randomization.

If organization/sample size cannot support causal inference, use an interrupted time series or observational deployment and say so. Do not relabel it as an A/B experiment.

### Workflow outcomes

- time from PR open/alert to first documented coordination;
- fraction of confirmed actionable findings with a linked remedy/change;
- alert acknowledgement/dismissal/suppression;
- changes in review/merge time, with confounders;
- developer trust/usefulness survey using predeclared instrument;
- qualitative interviews about missed/incorrect findings;
- weekly burden and opt-out.

These outcomes do not replace correctness evaluation.

## 11. Security and privacy evaluation

Build an explicit adversarial test corpus:

- public producer/private consumer;
- two private repositories with unequal readers;
- repository removed from an installation during a run;
- user loses access between check publication and detail view;
- malicious paths, symlinks, archives and generated artifacts;
- cross-tenant identity collisions and cache keys;
- source containing prompt injection and canary secrets;
- feedback/suppression by unauthorized users;
- force-push and old-run publication races;
- deletion/purge propagation to artifacts, caches and evaluation stores.

Release gate: zero unresolved disclosure defects. Aggregate “low rate” is not acceptable for confidentiality failures.

## 12. Reproducibility package

Release where rights allow:

- source and frozen container/toolchain;
- dependency lockfiles and SBOM;
- public corpus manifest with commit SHAs and retrieval scripts;
- corpus JSON Schema and label handbook;
- fixture/mutation generators;
- baseline implementations/configurations;
- raw per-case predictions and inclusion weights;
- coverage records;
- analysis scripts/notebooks and seeds;
- preregistration/registered report;
- machine-readable limitations/data statement;
- DOI-backed archival snapshot.

For private organizations, publish aggregated results, permitted redacted distributions and executable public replicas, plus a precise non-release rationale. Do not publish repository graphs or stable hashes that make private identities guessable.

## 13. Stop conditions

Stop delivery expansion or the study when:

- a confidentiality/authorization defect is unresolved;
- the frozen analysis cannot reconstruct exact base/head/consumer state;
- label independence or train/holdout separation is compromised;
- promoted-stratum precision/alert burden crosses the demotion rule;
- participants cannot meaningfully opt out where required;
- Repowise/baseline results eliminate Reverb’s claimed practical contribution;
- the study is underpowered for its stated causal claim and cannot be reframed honestly.

## 14. Required pre-execution artifacts

- accepted ethics/IRB determination where human-subject data is collected;
- preregistered RQs, endpoints, exclusion/sampling/statistical plan;
- versioned case schema and label handbook;
- frozen adapters/policies/baselines;
- permissions, retention, deletion and research-use approvals;
- power/sample-size analysis;
- reviewer recruitment/training/conflict plan;
- public/private data release plan;
- incident and study-stop procedure.

---

# Promotion statistics — computed

All numbers below were computed directly (regularized incomplete beta via continued fraction,
inverted by bisection; no scipy on the machine). Self-checks passed: the Clopper-Pearson one-sided
bound at `k = n` reproduces the closed form `0.05^(1/n)` to 1.1e-16, and the two-sided upper bound
for 0/10 matches `1 − 0.025^(1/10)`.

## Which interval the gate uses

**Clopper-Pearson for the promotion gate, Wilson reported alongside, Wald never.**

Wald is disqualified at these sample sizes for three independent reasons, all of which appear in
real cases:

- it **overshoots 1.0** — 9/10 gives `[0.7141, 1.0859]`;
- it **degenerates at `p̂ = 1.0`** — 10/10 gives `[1.0, 1.0]`, an assertion of certainty from ten
  observations;
- its **actual coverage collapses**. At n = 10 and true p = 0.95, the nominal-95% Wald lower bound
  covers **40.1%** of the time.

Exact coverage of the one-sided 95% lower bound, computed as the binomial sum rather than by
simulation:

| n | true p | Wald | Wilson | Clopper-Pearson |
| --: | --: | --: | --: | --: |
| 10 | 0.95 | **0.4013** | 1.0000 | 1.0000 |
| 20 | 0.95 | **0.6415** | 1.0000 | 1.0000 |
| 30 | 0.90 | 0.8163 | 0.9576 | 0.9576 |
| 100 | 0.90 | 0.8828 | **0.9424** | 0.9763 |
| 200 | 0.90 | 0.9071 | **0.9434** | 0.9680 |

Wilson is the better *estimator* and has near-nominal average coverage, but it dips below nominal at
points. Clopper-Pearson guarantees coverage at or above 95% everywhere, at the cost of width. For an
irreversible promotion whose failure mode is a permanently muted check, the guarantee is worth the
extra samples. They converge quickly — by n = 200 the two differ by 0.0016.

## What a small sample actually demonstrates

Observed precision 0.90:

| n | k | Wilson 95% two-sided | Clopper-Pearson 95% two-sided | **CP one-sided LB** |
| --: | --: | :-- | :-- | --: |
| 10 | 9 | [0.5958, 0.9821] | [0.5550, 0.9975] | **0.6058** |
| 20 | 18 | [0.6990, 0.9721] | [0.6830, 0.9877] | **0.7174** |
| 30 | 27 | [0.7438, 0.9654] | [0.7347, 0.9789] | **0.7614** |
| 50 | 45 | [0.7864, 0.9565] | [0.7819, 0.9667] | **0.8012** |
| 100 | 90 | [0.8256, 0.9448] | [0.8238, 0.9510] | **0.8363** |
| 300 | 270 | [0.8608, 0.9291] | [0.8603, 0.9315] | **0.8668** |

Observed precision 0.95:

| n | k | Clopper-Pearson 95% two-sided | **CP one-sided LB** |
| --: | --: | :-- | --: |
| 20 | 19 | [0.7513, 0.9987] | **0.7839** |
| 100 | 95 | [0.8872, 0.9836] | **0.8977** |
| 300 | 285 | [0.9189, 0.9717] | **0.9241** |

**The sentence to keep:** at n = 20 with 19 of 20 correct, the 95% one-sided lower bound is **0.784**.
That is not a demonstration of 90% precision. It is a demonstration of "probably better than 78%."
Below roughly n = 50 the interval cannot distinguish a good detector from a mediocre one.

## Minimum sample for a gate

`k = ⌈p·n⌉`, so actual precision is at or above the target:

| observed | gate | min n (CP) | k | CP LB | min n (Wilson) |
| --: | --: | --: | --: | --: | --: |
| 0.90 | 0.80 | **37** | 34 | 0.8036 | 28 |
| 0.90 | 0.85 | **118** | 107 | 0.8504 | 99 |
| 0.90 | 0.90 | **impossible** | — | — | impossible |
| 0.95 | 0.90 | **76** | 73 | 0.9011 | 58 |
| 1.00 | 0.90 | **29** | 29 | 0.9019 | 25 |

Two consequences worth stating in bold in any promotion policy:

1. **Observed 0.90 can never clear a 0.90 gate.** The lower bound is always below the point
   estimate. A "90% precision" bar requires observed precision materially above 90%, or a lower bar.
2. **A perfect record is cheap; a good record is expensive.** Twenty-nine consecutive correct
   findings clear a 0.90 gate. At 95% observed it takes 120.

## The mute budget — the number that reframes the problem

A check muted after two wrong findings is not governed by precision. It is governed by
**P(two failures before the author has seen m findings)**.

| precision | m=10 | m=20 | m=50 | m=100 | E[findings to 2nd false positive] |
| --: | --: | --: | --: | --: | --: |
| 0.90 | 0.264 | 0.608 | 0.966 | 1.000 | 20 |
| 0.95 | 0.086 | 0.264 | **0.721** | 0.963 | 40 |
| 0.98 | 0.016 | 0.060 | 0.264 | 0.597 | 100 |
| 0.99 | 0.004 | 0.017 | 0.089 | 0.264 | 200 |

Precision required to hold P(mute) under a budget:

| findings seen | P(mute) < 0.10 | < 0.05 | < 0.01 |
| --: | --: | --: | --: |
| 10 | 0.9455 | 0.9632 | 0.9845 |
| 20 | 0.9731 | 0.9819 | 0.9924 |
| 50 | 0.9893 | 0.9928 | 0.9970 |
| 100 | 0.9947 | 0.9964 | 0.9985 |

**At 95% precision — a figure most teams would call excellent — 72% of authors who see 50 findings
will have hit the mute trigger.**

The design consequence is not "be more precise." Mute probability is driven by **volume × (1 − p)**,
and volume is the variable actually under our control. **A precision target stated without a
findings-per-author budget is not a specification.** The promotion policy therefore carries both:
a Clopper-Pearson lower bound *and* a cap on findings per author per unit time.

## A leakage warning for our own corpus

"Detecting False Alarms from Automatic Static Analysis Tools: How Far are We?" (arXiv 2202.05982)
shows prior work in this area used procedures causing **data leakage and duplication** — ground-truth
labels leaking into features, and test warnings appearing in training — making results
*"overoptimistic."* The magnitude is not in the abstract (UNVERIFIED).

Applied here: a finding recurs across revisions of the same pull request. **Deduplicate by finding
identity before splitting**, or the same finding appears on both sides of the split and the number
is inflated.
