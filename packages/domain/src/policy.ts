import { hashCanonical } from './canonical.js';
import { invariant } from './errors.js';
import { evaluateMetricSet, type EvaluationMetricSet } from './evaluation.js';
import type { ImpactCase } from './corpus.js';
import {
  contentHash,
  promotionRecordId,
  type ContentHash,
  type Instant,
  type PolicyRevision,
  type PromotionRecordId,
} from './values.js';

export interface FrozenPolicy {
  readonly revision: PolicyRevision;
  readonly allowedStrata: readonly string[];
  readonly allowedImpactClaims: readonly ('breaking' | 'behavior_risk')[];
  readonly respectFrozenSuppressions: boolean;
  readonly maximumAlertsPerThousand: number;
}

export interface PolicySimulationArm {
  readonly policyRevision: PolicyRevision;
  readonly deliveries: number;
  readonly abstentions: number;
  readonly suppressions: number;
  readonly metrics: EvaluationMetricSet;
  readonly warnings: readonly string[];
}

export interface PolicySimulationResult {
  readonly schema: 'reverb.policy-simulation';
  readonly schemaVersion: '1.0';
  readonly corpusRevision: ContentHash;
  readonly baseline: PolicySimulationArm;
  readonly candidate: PolicySimulationArm;
  readonly inputHash: ContentHash;
  readonly resultHash: ContentHash;
}

function simulateArm(cases: readonly ImpactCase[], policy: FrozenPolicy): PolicySimulationArm {
  const replayed = cases.map((value) => {
    const stratumAllowed = policy.allowedStrata.includes(value.stratum.key);
    const impactAllowed = policy.allowedImpactClaims.includes(
      value.detectorClaims.impact as 'breaking' | 'behavior_risk',
    );
    const selected =
      value.detectorOutput === 'candidate' &&
      stratumAllowed &&
      impactAllowed &&
      (!policy.respectFrozenSuppressions || !value.suppressed);
    return { ...value, policySelected: selected };
  });
  const metrics = evaluateMetricSet(replayed.filter((value) => value.subset !== 'mutation'));
  const warnings = [
    ...(metrics.alertedPullRequestsPerThousand > policy.maximumAlertsPerThousand
      ? [
          `Alert volume ${metrics.alertedPullRequestsPerThousand.toFixed(2)}/1000 exceeds policy budget ${policy.maximumAlertsPerThousand}/1000.`,
        ]
      : []),
    ...(metrics.actionablePrecision.total === 0
      ? ['No labelled actionable deliveries are available for this policy.']
      : []),
  ];
  return {
    policyRevision: policy.revision,
    deliveries: replayed.filter((value) => value.policySelected).length,
    abstentions: replayed.filter(
      (value) =>
        value.detectorOutput === 'abstained' ||
        (value.detectorOutput === 'candidate' && !value.policySelected && !value.suppressed),
    ).length,
    suppressions: replayed.filter(
      (value) => value.detectorOutput === 'candidate' && value.suppressed,
    ).length,
    metrics,
    warnings,
  };
}

export function simulateFrozenPolicy(input: {
  readonly corpusRevision: ContentHash;
  readonly cases: readonly ImpactCase[];
  readonly baseline: FrozenPolicy;
  readonly candidate: FrozenPolicy;
}): PolicySimulationResult {
  invariant(
    input.cases.every((value) => value.outputHash.length > 0),
    'non_frozen_simulation_input',
    'Policy simulation accepts only materialized frozen corpus cases.',
  );
  const inputHash = contentHash(
    hashCanonical({
      corpusRevision: input.corpusRevision,
      caseHashes: [...input.cases.map((value) => value.outputHash)].sort(),
      baseline: input.baseline,
      candidate: input.candidate,
    }),
  );
  const canonical = {
    schema: 'reverb.policy-simulation' as const,
    schemaVersion: '1.0' as const,
    corpusRevision: input.corpusRevision,
    baseline: simulateArm(input.cases, input.baseline),
    candidate: simulateArm(input.cases, input.candidate),
    inputHash,
  };
  return { ...canonical, resultHash: contentHash(hashCanonical(canonical)) };
}

export interface PromotionVersionStamp {
  readonly producerExtractorId: string;
  readonly producerExtractorVersion: string;
  readonly consumerExtractorId: string;
  readonly consumerExtractorVersion: string;
  readonly identityVersion: number;
  readonly joinStrategy: string;
  readonly evidenceComposition: readonly string[];
  readonly policyRevision: PolicyRevision;
}

export interface PromotionGate {
  readonly revision: string;
  readonly minimumIndependentLabels: number;
  readonly minimumActionableWilsonLower95: number;
  readonly minimumEdgeWilsonLower95: number;
  readonly minimumFalseOmissionAudits: number;
  readonly maximumConfidentialityDefects: number;
  readonly maximumRemovalCoverageDefects: number;
  readonly maximumAlertedPullRequestsPerThousand: number;
  readonly maximumP95LatencyMs: number;
  readonly requireEveryDeliveryRemedy: boolean;
  readonly alternativeDecisionReference?: string;
}

export const DEFAULT_ADVISORY_PROMOTION_GATE: PromotionGate = Object.freeze({
  revision: 'default-advisory-v1-wilson',
  minimumIndependentLabels: 100,
  minimumActionableWilsonLower95: 0.9,
  minimumEdgeWilsonLower95: 0.95,
  minimumFalseOmissionAudits: 100,
  maximumConfidentialityDefects: 0,
  maximumRemovalCoverageDefects: 0,
  maximumAlertedPullRequestsPerThousand: 50,
  maximumP95LatencyMs: 600_000,
  requireEveryDeliveryRemedy: true,
});

export type PromotionState = 'UNMEASURED' | 'PREVIEW' | 'PROMOTED' | 'DEMOTED';

export interface PromotionEvidence {
  readonly stratumKey: string;
  readonly corpusRevision: ContentHash;
  readonly evaluationReportHash: ContentHash;
  readonly simulatorResultHash: ContentHash;
  readonly metrics: EvaluationMetricSet;
  readonly confidentialityDefects: number;
  readonly removalCoverageDefects: number;
  readonly deliveriesWithoutRemedy: number;
  readonly versions: PromotionVersionStamp;
  readonly evaluationWindow: { readonly startedAt: Instant; readonly endedAt: Instant };
}

export interface PromotionRecord {
  readonly schema: 'reverb.promotion-record';
  readonly schemaVersion: '1.0';
  readonly id: PromotionRecordId;
  readonly stratumKey: string;
  readonly state: PromotionState;
  readonly previousState: PromotionState;
  readonly decision: 'promote' | 'remain_preview' | 'demote' | 'reset_unmeasured';
  readonly reasons: readonly string[];
  readonly gate: PromotionGate;
  readonly evidence: PromotionEvidence;
  readonly decidedAt: Instant;
  readonly decidedBy: string;
  readonly outputHash: ContentHash;
}

export function promotionVersionsEqual(
  left: PromotionVersionStamp,
  right: PromotionVersionStamp,
): boolean {
  return hashCanonical(left) === hashCanonical(right);
}

function gateFailures(evidence: PromotionEvidence, gate: PromotionGate): string[] {
  const failures: string[] = [];
  if (evidence.metrics.actionablePrecision.total < gate.minimumIndependentLabels) {
    failures.push('insufficient_independent_labels');
  }
  if (
    evidence.metrics.actionablePrecision.wilsonOneSidedLower95 < gate.minimumActionableWilsonLower95
  ) {
    failures.push('actionable_precision_lower_bound_below_gate');
  }
  if (evidence.metrics.edgePrecision.wilsonOneSidedLower95 < gate.minimumEdgeWilsonLower95) {
    failures.push('edge_precision_lower_bound_below_gate');
  }
  if (evidence.metrics.falseOmissionAudit.total < gate.minimumFalseOmissionAudits) {
    failures.push('insufficient_false_omission_audit');
  }
  if (evidence.confidentialityDefects > gate.maximumConfidentialityDefects) {
    failures.push('unresolved_confidentiality_defect');
  }
  if (evidence.removalCoverageDefects > gate.maximumRemovalCoverageDefects) {
    failures.push('unsafe_removal_coverage_defect');
  }
  if (
    evidence.metrics.alertedPullRequestsPerThousand > gate.maximumAlertedPullRequestsPerThousand
  ) {
    failures.push('alert_budget_exceeded');
  }
  if (evidence.metrics.latencyMs.p95 > gate.maximumP95LatencyMs) {
    failures.push('latency_budget_exceeded');
  }
  if (gate.requireEveryDeliveryRemedy && evidence.deliveriesWithoutRemedy > 0) {
    failures.push('delivery_without_remedy');
  }
  return failures;
}

export function decidePromotion(input: {
  readonly previous?: PromotionRecord;
  readonly evidence: PromotionEvidence;
  readonly gate?: PromotionGate;
  readonly decidedAt: Instant;
  readonly decidedBy: string;
  readonly compatibilityEvaluationHash?: ContentHash;
}): PromotionRecord {
  const gate = input.gate ?? DEFAULT_ADVISORY_PROMOTION_GATE;
  invariant(
    input.evidence.simulatorResultHash.length > 0,
    'promotion_requires_simulation',
    'No policy may be promoted without a frozen policy simulation result.',
  );
  invariant(
    gate === DEFAULT_ADVISORY_PROMOTION_GATE ||
      (gate.alternativeDecisionReference?.trim().length ?? 0) > 0,
    'unrecorded_promotion_policy',
    'An alternative promotion gate requires a versioned decision reference.',
  );
  const previousState = input.previous?.state ?? 'UNMEASURED';
  const versionsChanged =
    input.previous !== undefined &&
    !promotionVersionsEqual(input.previous.evidence.versions, input.evidence.versions) &&
    input.compatibilityEvaluationHash === undefined;
  const failures = versionsChanged
    ? ['incompatible_version_change']
    : gateFailures(input.evidence, gate);
  const state: PromotionState = versionsChanged
    ? 'UNMEASURED'
    : failures.length === 0
      ? 'PROMOTED'
      : previousState === 'PROMOTED'
        ? 'DEMOTED'
        : 'PREVIEW';
  const decision: PromotionRecord['decision'] = versionsChanged
    ? 'reset_unmeasured'
    : state === 'PROMOTED'
      ? 'promote'
      : state === 'DEMOTED'
        ? 'demote'
        : 'remain_preview';
  const identity = {
    stratumKey: input.evidence.stratumKey,
    ...(input.previous === undefined ? {} : { previousId: input.previous.id }),
    evidenceHash: input.evidence.evaluationReportHash,
    simulatorResultHash: input.evidence.simulatorResultHash,
    gateRevision: gate.revision,
    decidedAt: input.decidedAt,
  };
  const id = promotionRecordId(`pro_${hashCanonical(identity)}`);
  const canonical = {
    schema: 'reverb.promotion-record' as const,
    schemaVersion: '1.0' as const,
    id,
    stratumKey: input.evidence.stratumKey,
    state,
    previousState,
    decision,
    reasons: failures,
    gate,
    evidence: input.evidence,
    decidedAt: input.decidedAt,
    decidedBy: input.decidedBy,
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}
