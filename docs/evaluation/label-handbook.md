# Reverb Label Handbook

**Version:** 1.0.0  
**Status:** Frozen for Phase 004 mechanics; revise and version before a real pilot  
**Applies to:** independently reviewed Reverb impact cases

## Purpose

Reviewers label three different questions. Never collapse them into one true/false judgment:

1. **Edge:** does the recorded consumer artifact actually depend on the producer contract?
2. **Impact:** what does the producer change do to that use at the contemporaneous consumer SHA?
3. **Action:** what response, if any, is appropriate for this occurrence?

A structurally correct edge can be compatible. A breaking impact can already be coordinated. An
accepted risk remains a real edge and impact. Clicking, editing, merging, elapsed time, or silence is
usefulness telemetry—not a correctness label.

## Evidence shown to reviewers

Show the exact producer base/head, producer artifact, consumer SHA as of PR open, consumer artifact,
primary evidence path, adapter/identity/evidence versions, relevant coverage, activation timing, and
registry resolution. Hide detector method name and policy band when practical. Never replace source
facts needed for judgment with a model summary.

Future consumer revisions are prohibited: they can contain the downstream fix and leak the answer.
Unrelated build failure is inconclusive. Missing evidence stays visible.

## Edge labels

| Label           | Use when                                                                                                    | Example                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `confirmed`     | The exact contemporaneous consumer artifact uses the canonical contract through the recorded evidence path. | A named TypeScript import resolves to the removed exported symbol.            |
| `absent`        | The alleged artifact does not use that contract or identity resolution is demonstrably wrong.               | Same spelling belongs to another package and no registry mapping connects it. |
| `indeterminate` | Available evidence cannot prove presence or absence.                                                        | Dynamic reflection or an unresolved gateway alias prevents a sound decision.  |

Generated code is still a confirmed edge when it is deployed or compiled into a consumer. Dead or
test-only status belongs on the action axis, not the edge axis.

## Impact labels

| Label           | Use when                                                                                                     | Example                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `breaking`      | The proposed producer change makes the confirmed consumer use invalid under its actual activation semantics. | A deployed client calls a removed operation at its current version. |
| `behavior_risk` | Structure remains valid but behavior may materially change and static evidence cannot settle it.             | Response semantics change without a schema violation.               |
| `compatible`    | The confirmed use remains compatible for the scoped path and activation.                                     | An optional field is added and the consumer ignores unknown fields. |
| `indeterminate` | Missing version, activation, build, or behavioral evidence prevents classification.                          | Consumer dependency version and rollout timing are unavailable.     |

A successful focused replay supports only the exercised path. An unrelated setup failure is
`indeterminate`, not `breaking`.

## Action labels

| Label                 | Use when                                                                       | Example                                                         |
| --------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `coordinate`          | Producer and consumer owners need an explicit compatibility or rollout action. | Preserve the export or land the consumer update first.          |
| `already_coordinated` | A concrete downstream change or rollout plan already addresses the impact.     | A linked consumer PR updates the call before deployment.        |
| `accepted_risk`       | An authorized owner explicitly accepts a bounded risk with review timing.      | A controlled canary consumer accepts a temporary behavior risk. |
| `dead_or_test_only`   | The confirmed edge cannot affect supported production behavior.                | Reference exists only in a retired fixture target.              |
| `no_action`           | The impact is compatible or otherwise needs no consumer response.              | The consumer use remains valid.                                 |
| `indeterminate`       | Available evidence cannot establish the appropriate response.                  | Ownership or activation state cannot be determined.             |

`already_coordinated` and `accepted_risk` do not make an edge false. Risk acceptance is recorded
separately from correctness and should have its own review date.

## Closed reason codes

| Code                                   | Intended use                                               |
| -------------------------------------- | ---------------------------------------------------------- |
| `structural_reference_verified`        | Edge confirmed from the primary structural path.           |
| `reference_not_present`                | Edge absent after inspecting the scoped consumer artifact. |
| `consumer_snapshot_inconclusive`       | Contemporaneous consumer state cannot settle the edge.     |
| `breaking_change_verified`             | Impact is breaking for the scoped activation.              |
| `behavior_requires_runtime_validation` | Static structure leaves a behavioral risk.                 |
| `compatible_change_verified`           | Scoped consumer behavior remains compatible.               |
| `coordination_required`                | Owners must coordinate a remedy or rollout.                |
| `downstream_change_linked`             | A concrete consumer change already coordinates the impact. |
| `risk_explicitly_accepted`             | Authorized, timed risk acceptance exists.                  |
| `dead_code`                            | Confirmed reference is dead.                               |
| `test_only_use`                        | Confirmed reference is limited to non-production tests.    |
| `no_consumer_action_required`          | No consumer response is necessary.                         |
| `evidence_incomplete`                  | Evidence is insufficient; retain `indeterminate`.          |

## Independent review and adjudication

- Two distinct, domain-capable human reviewers label each required case independently.
- Reviewers cannot be models. Detector authors cannot be the sole final labelers; conflicts are
  recorded.
- Disagreement on any axis requires a distinct third human adjudicator.
- `indeterminate` remains in the corpus. Reports include complete-case and best/worst sensitivity.
- Report per-axis confusion matrices, raw agreement with intervals, and nominal Krippendorff alpha
  with a cluster-resampling interval.
- Pilot cases used to revise this handbook must be excluded from confirmatory evaluation or relabeled
  after the version is frozen.

## Suppression guidance

A review may create a separate future suppression. The suppression needs an authorized owner,
specific justification, review time, fallback expiry, and structural invalidation predicates.
Occurrence/finding scopes allow reviewers; contract/repository-pair scopes require repository-owner
authority; adapter/workspace scopes require workspace-admin authority.

Code, reference, contract shape, identity, adapter, evidence stratum, policy, and registry changes
invalidate the relevant rule before its timer. Suppression affects selection only; it never removes
the candidate or its labels from the corpus.

## Corpus subset rules

- `historical` and `forward_shadow` may estimate real-world precision when independently sampled and
  labeled.
- `executable_replay` supports scoped mechanism/compatibility evidence and must retain unrelated
  failures as indeterminate.
- `mutation` measures mechanics and controlled sensitivity only. Never include it in a real-world
  precision numerator or denominator.
- The population comes from eligible PR metadata and supported-artifact discovery. Include every
  finding and a probability sample of no-finding/not-analysed PRs with inverse inclusion weights.

## Confidentiality and release

Every case records evaluation consent, research consent, and one of `public`,
`private_aggregate_only`, or `private_not_releasable`. Repository graphs and stable private hashes
are not public artifacts merely because they are derived. One unresolved wrong-audience disclosure
defect stops promotion.
