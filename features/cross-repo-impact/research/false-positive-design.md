# False-Positive, Abstention, and Review Design

**Status:** normative design input for Phase 004  
**Principle:** a finding can contain a real dependency, a compatible change, and no required action at the same time. One binary label cannot represent that.

## 1. What can be wrong

Reverb’s reasoning chain has distinct failure points:

```text
producer extraction
  -> contract identity
  -> change classification
  -> consumer extraction
  -> service/package/resource resolution
  -> cross-repository edge
  -> activation/version timing
  -> actionability and remedy
  -> authorized delivery
```

A user-facing “false positive” can mean any of the following:

- the producer contract was not actually changed;
- the consumer reference points somewhere else;
- the edge exists but at a version not affected by this PR;
- the change is semantically compatible;
- the path is test/generated/dead code;
- a coordinated downstream change already handles the impact;
- the impact is accepted and requires no new action;
- the finding is duplicated or delivered to the wrong audience.

The system records the failed proposition, not only a dislike button.

## 2. Three independent labels

### Edge label

Does the named consumer artifact actually consume the named producer contract?

```text
confirmed | absent | indeterminate
```

### Impact label

For the recorded producer base/head and consumer snapshot, what is the compatibility result?

```text
breaking | behavior_risk | compatible | indeterminate
```

### Action label

Does this finding require coordination or code/configuration action?

```text
coordinate
already_coordinated
accepted_risk
dead_or_test_only
no_action
indeterminate
```

Labels are append-only events with reviewer, authority, reason, timestamp, subject version and optional superseded decision. Workflow events such as opening a detail view or merging a PR are not labels.

## 3. Closed reason vocabulary

Every non-confirming label selects one or more reason codes; `OTHER_REQUIRES_NOTE` requires text.

| Code | Axis | Meaning |
| --- | --- | --- |
| `PRODUCER_EXTRACTION_WRONG` | impact | Changed contract artifact/range was extracted incorrectly. |
| `CONSUMER_EXTRACTION_WRONG` | edge | Reference was extracted incorrectly. |
| `IDENTITY_COLLISION` | edge | Canonical keys merged distinct providers/contracts. |
| `SERVICE_RESOLUTION_WRONG` | edge | Base URL, gateway, registry or alias resolved to the wrong provider. |
| `PACKAGE_RESOLUTION_WRONG` | edge | Import/lock/version provenance points elsewhere. |
| `NOT_A_REAL_CONSUMER` | edge | Artifact resembles use but does not consume the contract. |
| `TEST_OR_FIXTURE` | action | Valid use is isolated to test/example/fixture scope. |
| `GENERATED_OR_VENDORED` | action | Reference is generated/vendor material not independently actionable. |
| `DEAD_CODE` | action | Reference is structurally present but not a live supported path. |
| `VERSION_NOT_AFFECTED` | impact | Consumer is pinned/deployed against a non-affected version. |
| `COMPATIBLE_CHANGE` | impact | Change does not break the consumer contract. |
| `BEHAVIORAL_CONTEXT_MISSING` | impact | Static evidence cannot settle runtime behavior. |
| `ALREADY_COORDINATED` | action | A linked downstream change or rollout plan already covers it. |
| `ACCEPTED_BREAK` | action | Authorized owner accepts the risk. |
| `DUPLICATE_FINDING` | delivery | Same actionable subject was delivered more than once. |
| `WRONG_AUDIENCE` | delivery | Correct fact was disclosed/delivered to an inappropriate destination. |
| `STALE_CONSUMER_SNAPSHOT` | edge/impact | Recorded consumer generation no longer satisfies policy freshness. |
| `INSUFFICIENT_EVIDENCE` | any | Reviewer cannot determine the proposition from available evidence. |
| `OTHER_REQUIRES_NOTE` | any | Exception not yet represented; note is mandatory and reviewed for taxonomy promotion. |

The vocabulary is versioned. Code changes require a migration mapping so historical metrics remain interpretable.

## 4. Candidate and delivery state machine

```text
NOT_ANALYSED
  -> NO_CANDIDATE
  -> CANDIDATE
       -> ABSTAINED
       -> PREVIEW
       -> DELIVERED
            -> ADJUDICATED
```

The states are not a single terminal enum in storage; they are projections over immutable analysis, policy, delivery and label events. A candidate may be delivered under policy v3 and abstained under replayed policy v4 without mutating history.

Definitions:

- `NOT_ANALYSED`: eligible unit not processed or required coverage absent.
- `NO_CANDIDATE`: analysis completed but generated no candidate.
- `CANDIDATE`: structural reasoning produced a proposition before delivery policy.
- `ABSTAINED`: candidate withheld because required evidence/coverage/calibration/policy was insufficient.
- `PREVIEW`: visible only in authorized opt-in detail or shadow corpus.
- `DELIVERED`: appeared in an author-facing advisory surface.
- `ADJUDICATED`: received independent human labels.

Persist candidate generation before suppression and delivery. Otherwise suppressions and thresholds can manufacture apparently better detector precision by removing the denominator.

## 5. Coverage model

### Analysis coverage

What eligible source, contract, reference, registry and differ partitions were successfully inspected?

Examples: 95/100 TypeScript files parsed; imported OpenAPI component missing; base descriptor complete, head descriptor incomplete; one of three consumer repositories stale.

### Selection coverage

What proportion of eligible candidates or PRs reached preview/delivery under policy?

This is the cost of abstention. Precision without selection coverage is not meaningful.

### Label coverage

What proportion of emitted/no-finding samples have valid independent human labels?

Do not silently report only easy or voluntarily reviewed findings.

### Positive and negative rule

An exact positive survives unrelated incomplete coverage. If a TypeScript import and resolved package identity prove a consumer edge, an unreadable unrelated Python file does not erase it.

A negative/removal conclusion abstains when missing input could change that proposition. “No consumers found” and “operation removed” require the relevant expected partitions to be complete according to the adapter’s declared coverage contract.

## 6. Evidence combination

Each candidate has one **primary proof path**. Required steps in that path have evidence strengths and coverage requirements. The weakest required step limits the delivery stratum.

Optional context does not downgrade the primary path. A low-quality README mention attached to an exact SCIP reference does not turn the exact reference into a weak finding.

Independent corroboration may define a new measured stratum only when the combination rule is versioned and evaluated. Scores from unrelated adapters are not added as if they were calibrated probabilities.

Contradictory evidence causes abstention or an explicitly evaluated contradiction stratum. It is never hidden inside a mean score.

## 7. Evidence strata

A stratum key includes at least:

```text
contract kind
+ producer extractor/version family
+ consumer extractor/version family
+ join rule/version
+ change classifier/ruleset
+ primary evidence class
+ relevant language/ecosystem
```

Example human-readable strata:

- `protobuf.buf.breaking + generated-client SCIP exact reference`;
- `openapi.operation-removed + generated-client operationId resolution`;
- `typescript.export-removed + lockfile-resolved import exact symbol`;
- `framework-http.route-removed + literal path + ambiguous base`.

The last may remain preview-only indefinitely. High/medium/low names are policy labels, not probabilities.

## 8. Metrics

### Correctness

- edge precision and recall;
- impact precision and known-break recall;
- actionable precision;
- false-omission rate on audited no-finding PRs;
- confusion matrices including `indeterminate`;
- 95% intervals and denominators per stratum.

### Selective prediction

- selection coverage;
- risk–coverage curve;
- precision versus abstention threshold;
- proportion abstained by reason;
- supported input/analysis coverage.

### Operational noise and usefulness

- findings per 1,000 eligible PRs;
- alerted PRs per 1,000 eligible PRs;
- findings per alerted PR;
- weekly findings per team;
- time to first coordination;
- action rate by action category;
- dismiss/accept/suppress behavior as telemetry.

Action rate is a workflow outcome, not precision. A correct warning can require no action because coordination already happened; an incorrect warning can still cause activity.

### System

- p50/p95/p99 analysis latency;
- timeout/supersession rate;
- index freshness and coverage;
- compute/storage cost per repository and PR;
- disclosure/security defect count.

## 9. Default promotion gate

An evidence stratum may move from preview to author-facing advisory only when all are true:

1. At least 100 independently human-labelled emitted findings in the target stratum.
2. The 95% Wilson lower bound for actionable precision is at least 0.90.
3. The 95% Wilson lower bound for edge precision is at least 0.95.
4. At least 100 sampled eligible no-finding PRs are independently audited, or an approved power/sample-size analysis defines a stronger alternative.
5. No unresolved confidentiality or wrong-audience defect exists in the release candidate.
6. No missing required coverage can turn the candidate into a different conclusion.
7. Alert volume is no more than 50 alerted PRs per 1,000 eligible PRs unless an organization explicitly approves a different budget after simulation.
8. p95 end-to-end completion is at most 10 minutes for the target workspace class; timeouts complete as neutral/incomplete rather than remaining pending.
9. Every delivered finding has an actionable remedy or coordination instruction.
10. Corpus, policy and adapter versions are frozen and reproducible.

These are conservative product defaults, not scientifically universal constants. Organizations may choose stricter policy. Relaxation requires a recorded decision, replayed impact and owner approval; it cannot retroactively change reported metrics.

## 10. Demotion and hysteresis

Promotion is not permanent. A stratum returns to preview when:

- a confidentiality defect appears;
- required adapter/identity semantics change without bridging evaluation;
- rolling adjudicated precision crosses a predeclared demotion boundary;
- drift/coverage monitoring is insufficient to establish continued support;
- alert volume exceeds budget for two evaluation windows;
- a repeated remedy is no longer valid.

Use hysteresis: promotion uses the stronger gate; demotion uses a separately predeclared lower boundary and minimum sample/evidence rule to avoid oscillation on one review. Security defects bypass hysteresis.

## 11. Suppressions

Suppressions are policy decisions, not labels. They are applied after candidate generation and never alter detector-evaluation history.

Allowed scopes:

- one occurrence;
- one stable finding fingerprint;
- one contract in one consumer;
- one join/evidence rule in one repository;
- one adapter or policy version in a workspace.

Every suppression records scope, owner, authorization, reason, creation, invalidation conditions, optional expiry and audit history. Broad scopes require explicit owner and justification.

Invalidate or require review when relevant consumer code/reference identity, producer contract identity, service/package registry mapping, adapter, differ, identity function or policy changes. A complete re-index that proves a reference was removed tombstones the edge immediately. Time expiry is a fallback, not the only freshness mechanism.

## 12. Review workflow

The review UI presents:

- exact producer base/head and change evidence;
- consumer SHA/generation and reference evidence;
- join steps and primary proof path;
- coverage and freshness relevant to the proposition;
- delivery policy/stratum and last measured interval;
- three independent label controls and reason codes;
- suppression as a separate authorized action;
- disclosure boundary and who can see the result.

Reviewers can select `indeterminate`. The product must not pressure them to produce a binary answer for metric completeness.

## 13. Label independence and poisoning controls

- PR authors may provide feedback, but promotion labels require independent authorized reviewers according to the evaluation protocol.
- Detector authors are blinded to method/band during final adjudication where practical.
- Labels cannot directly update a model or rule in place; they feed a versioned development/training process.
- Train/calibration/holdout repository families and time windows remain separate.
- Repeated feedback from one user, repository or organization is clustered in analysis and cannot dominate an “independent findings” count.
- Organization-wide suppressions require stronger authorization than occurrence feedback.
- Audit logs are immutable and tenant-scoped.

## 14. Model-assisted adjudication

An optional model may inspect already-selected, minimized evidence to recommend downgrade or abstention. It may not:

- create a producer contract, consumer reference or edge;
- upgrade weak evidence into a delivered stratum;
- override missing coverage;
- receive ambient tools, network or write credentials;
- expose source to an unapproved provider;
- replace human ground truth.

Record model/provider/version, prompt/schema revision, content digests, output and latency. Treat repository text as untrusted prompt-injection content. A cache hit helps repeatability; a cache miss is not deterministic merely because a prompt hash exists.

## 15. Failure examples

### True edge, compatible change

The consumer imports a symbol, but the producer only adds an optional parameter. Edge label is `confirmed`; impact label is `compatible`; action is `no_action`. Calling the whole finding a false positive loses the useful distinction.

### True break, already coordinated

An OpenAPI route is removed and the consumer PR is linked. Edge `confirmed`; impact `breaking`; action `already_coordinated`. The detector is correct and the alert may still be unnecessary under a coordination-aware policy.

### Exact positive under partial unrelated coverage

One exact gRPC client reference is found, while another repository’s Java extractor fails. Deliver the exact authorized finding if its required proof path is complete; report the workspace coverage gap separately.

### Apparent removal under incomplete head

The head descriptor omits an imported file due to extraction failure. Do not generate a removal candidate. Record `NOT_ANALYSED`/coverage failure for that identity partition.

### Merge with no action

A PR merges after an alert, but nobody changes code. This does not prove `no_action`, `accepted_risk`, or false positive. It is telemetry until adjudicated.

---

# Suppression, adjudication and metrics — evidence

## Suppression mechanisms and how each rots

| Mechanism | How it rots | Has a rot detector? |
| :-- | :-- | :-- |
| Inline comment (`// nosemgrep`, `// eslint-disable-next-line`, `# noqa`) | Code moves, the comment stays. The blanket form suppresses rules invented years later. Copy-paste propagates it | **ESLint yes** — `reportUnusedDisableDirectives` defaults to `"warn"`. **Semgrep no** |
| Config baseline (`.semgrepignore`, `eslint-suppressions.json`) | Path globs over-suppress silently — a glob written for `tst/**` swallows a real finding when production code moves under it | **ESLint yes** (`--prune-suppressions`). Others no |
| New-code baseline (SonarQube) | Nothing rots, because nothing is enumerated. The backlog is permanently invisible instead | n/a by design |
| UI dismissal | Invisible in the repository. A new maintainer cannot see that a finding was considered and rejected | rare |

**Semgrep's one design choice worth copying**: ignoring code "still generates a finding. The finding
is automatically set to the **Ignored** triage state." Suppression is a state transition, not a
deletion, so the count stays auditable. It supports no required justification and no expiry.

**ESLint's suppression RFC is the best prior art for treating a suppression as a record.** It exists
so that suppressions with justifications get *exported*, mapping onto SARIF's `suppressions` array
with `kind` and `justification`, driven by security-development-lifecycle auditing requirements.

## The structural flaw in count-based baselines

ESLint's baseline file is keyed on **(file, rule, count)**:

```json
{ "src/app/foobar.component.ts": { "@typescript-eslint/no-explicit-any": { "count": 1 } } }
```

Matching: if errors equal the count, suppress all; if fewer, suppress and lower the count; if more,
report all.

**So fixing one violation and introducing a different one in the same file under the same rule
leaves the count matching, and the new violation is silently suppressed.** That is the central
failure mode of every count-based or path-based baseline, and it is structural rather than a bug.
(This reading is derived from the RFC's own matching rules, not stated by it.)

The staleness handling is the good part: ESLint exits non-zero with "There are suppressions left
that do not occur anymore. Consider re-running the command with `--prune-suppressions`." An escape
hatch exists — `--pass-on-unpruned-suppressions` — and is precisely where rot re-enters.

**SonarQube took the better route for our shape:** rather than enumerate a backlog, redefine the
scope. In pull-request analysis "new code is defined as the code that has changed in the pull
request branch compared to the target branch," and the quality gate applies only to new code. There
is no suppression list to rot because there is no enumerated backlog. Mapped to cross-repository
impact: **report breakage only against call sites present in the consumer's HEAD as of this pull
request.**

## Developers do not mostly suppress because a finding is wrong

"Quieting the Static: A Study of Static Analysis Alert Suppressions" (arXiv 2311.07482), over 1,425
Java projects, reports that **"false positives account for a minor proportion of suppressions"** and
that "a significant number of suppressions introduce technical debt." The percentage breakdowns are
not in the abstract — **UNVERIFIED** without the full paper.

The qualitative finding is the useful one and it cuts against the obvious design: developers
suppress mostly because acting is inconvenient, not because the tool was wrong. **A dismissal prompt
that asks "was this wrong?" therefore mismeasures**, and a dismissal reason enum has to separate
"the claim is false" from "the claim is true and I am not acting on it."

## Extinction and staleness are two different signals

No static-analysis tool reachable implements time-based suppression expiry. The nearest analog is
LaunchDarkly's flag tooling, and its structure is the transferable part: after all code references
to a flag are removed "LaunchDarkly creates an extinction event", and — explicitly — "Stale flag
detection is separate and does not use archive checks." Staleness is age-based; extinction is
reference-based; they are deliberately independent.

Mapped onto suppressions, this gives two cheap and independent signals:

- **Extinction** — the consumer call site the suppression covered no longer exists. Drop the
  suppression automatically and silently. ESLint's `--prune-suppressions` is exactly this.
- **Staleness** — the suppression is months old and still live. Resurface once, at low severity, to
  one owner.

Conflating them means either deleting live suppressions or nagging about dead ones.

## Who owns a cross-repository suppression

**No prior art was found for suppressing a finding raised in repository A about breakage in
repository B.** Every mechanism above assumes the suppression lives in the repository being scanned.
Caveat: this is "not found by targeted fetching", not "does not exist" — search budget was exhausted,
and this deserves one more pass before the claim appears in a paper.

The nearest analogues all resolve ownership the same way — **the consumer opts in, and the producer's
tool reports only on consumers who registered**:

- **Rust Crater** builds a large crate population against two compiler versions and compares results
  between them. The two-version differential *is* the false-positive control: a crate already broken
  does not count, and no consumer ever suppresses anything.
- **vite-ecosystem-ci** is the closest structural match. Downstream projects are enumerated as test
  suites **in the producer's repository**, run on a schedule and on demand via `/ecosystem-ci run`,
  restricted to users with triage permission — and **results go to a chat channel, not to the pull
  request.** Two decisions worth copying: the consumer list is producer-owned and version-controlled,
  so suppression is just editing a suite; and the expensive, noisy cross-repository signal is kept
  off the pull request by default.
- **cargo-semver-checks** takes the hardest line — "A design goal is to not have false positives. If
  they do occur, they are considered bugs" — and buys it by reporting only what is derivable from the
  producer's own API surface, never consumer code, accepting large recall gaps in exchange.

**Recommendation:** the suppression lives with the **producer**, because that is who is interrupted
and who must act in one place. It is **keyed to the consumer's call-site identity**, so it extincts
automatically when the consumer deletes the call. A consumer-side suppression is unworkable — it asks
a team in another repository to act on a finding they never saw.

## The adjudicator may only downgrade

**Every deployed system found is already built this way**, across independent vendors. Semgrep's
assistant "is explicitly designed to recommend and comment rather than unilaterally act"; its
autotriage "makes recommendations to ignore findings" but does not suppress; only its noise filter
acts, and it acts by *suppressing*. Qodo's judge agent "merges their findings, removes duplicates,
and filters out anything low-confidence" — filtering only.

The decisive argument for our setting is adversarial. "One Token to Fool LLM-as-a-Judge"
(arXiv 2507.08794) shows superficial inputs such as `":"` can "consistently elicit false positive
rewards" across leading proprietary models. **Our adjudicator reads diff text the pull-request author
controls.** A downgrade-only adjudicator that is fooled produces a *missed* finding; a create-capable
one produces a *fabricated* finding attributed to us — which under a two-strike mute rule is a
permanent loss of that repository.

It also preserves measurability: if the model can only remove, the detector's recall remains an upper
bound measurable by sampling what the adjudicator dropped. If it can add, precision and recall
entangle across two components and a regression cannot be attributed.

**Make it structural, not instructional.** Do not prompt "do not invent findings." Give the model a
closed input — one candidate finding — and a closed output enum: `CONFIRM`, `DOWNGRADE`, `SUPPRESS`,
`ABSTAIN`, plus a reason. Creating a finding is then not representable.

Cost, stated honestly: this caps recall at the detector's recall permanently. **No published A/B
evidence for the constraint was found** — it is reasoned, not cited.

## What the published LLM-triage numbers do and do not show

| Study | Setting | Result | Recall cost? |
| :-- | :-- | :-- | :-- |
| Tencent industrial study (arXiv 2601.18844) | 433 alarms, enterprise tool | eliminates 94–98% of false positives; $0.0011–$0.12 per alarm against 10–20 min manual | "high recall" claimed, **no number — UNVERIFIED** |
| ZeroFalse (arXiv 2510.02534) | OWASP Java Benchmark | F1 0.912–0.955, "recall and precision above 90%" | **Yes, bounded ≥90%** — the only real bound found |
| SkipAnalyzer (arXiv 2310.18532) | 222 null-deref, 46 resource-leak | filter precision 93.88% null-deref, **63.33% resource-leak** | No |
| BugLens (arXiv 2504.11711) | Linux kernel taint | precision 0.10 → 0.72 | No |
| SAST-Genius (arXiv 2509.15433) | vs Semgrep | 225 → 20 false positives | No |

**Six of seven report only the precision side.** The single recall bound is on a synthetic security
benchmark. And SkipAnalyzer's 63.33% on one category against 93.88% on another shows the filter's
accuracy varies enormously **by finding category** — which is an argument for adjudicating per
contract kind rather than globally.

Semgrep's vendor claim is the best-documented in the category — 95% accuracy at categorizing false
positives, a 96% human-agree rate over 3,500+ customers and 6,500,000+ findings, and internal
benchmarks over 2,000+ findings reviewed by rotating security engineers on a non-cherry-picked
dataset. Its own caveat is the most useful sentence found anywhere in this research:

> A high confidence rate means users can trust when Multimodal identifies a false positive — it does
> not mean that Multimodal catches all false positives.

**No false-negative rate is published, by anyone.** Budget to measure our own; import none of these.

## Which metric is primary

**Primary: the "not useful" rate per finding. Co-primary and mandatory: alerts per pull request.
Precision is a diagnostic, not a goal.**

1. **Precision is unmeasurable at pull-request time without labels we do not have.** Only the
   author's action is observable, which is why the effective-false-positive framing — the developer's
   judgement rather than the analysis's soundness — is the right unit, and why the check must be
   instrumented to *capture* the judgement rather than infer it.
2. **Fix rate is biased, and especially so here.** Developers suppress for reasons other than
   wrongness (above), and symmetrically a *correct* cross-repository finding may go unfixed because
   the fix belongs in the other repository. For this check the correct response is frequently "I will
   tell the other team", which leaves no trace in the pull request at all.
3. **Alerts per pull request must be co-primary** because of the mute arithmetic in
   [`evaluation-protocol.md`](evaluation-protocol.md). A check at 95% precision firing three times per
   pull request mutes faster than one at 90% firing once every five.
4. **Mute rate is the true objective but is terminal and low-frequency.** By the time it is
   measurable the repository is lost. Use it to validate the leading indicators, never to operate on.

Log the "not useful" **reason** as a small enum. "The call site does not exist", "that repository is
dead", and "intentional break, already coordinated" are three completely different defects, and an
undifferentiated dismissal count hides which one we have.

**No published threshold exists for the alert volume at which developers disable a check**, beyond
the ≤10% effective-false-positive rule. What exists is three independent teams reaching the same
structural conclusion: SonarQube scopes to changed code, Semgrep's Monitor mode exists so a rule can
generate volume somewhere invisible first, and vite-ecosystem-ci keeps cross-repository results off
the pull request entirely. **The volume tolerable in a dashboard is not tolerable in a pull request.**

## The promotion ladder, and where ours differs

Semgrep's three modes are the closest documented ladder: **Monitor** (findings visible only in the
platform), **Comment** (findings reach the pull request), **Block** (non-zero exit). Promotion
guidance is to change mode "as you develop confidence in these rules", evaluating "their true
positive rate and other criteria you may have."

**Critically, no statistical criterion for promotion is provided.** That is the gap this design
fills: the same three-state ladder, with the Monitor-to-Comment transition gated on a
Clopper-Pearson one-sided lower bound at a minimum sample size, rather than on judgement.

And replay is **differential**, following Crater: run the proposed rule at the base and at the head
and count only what changed, so pre-existing breakage never enters the count and no suppression list
is needed to exclude it.
