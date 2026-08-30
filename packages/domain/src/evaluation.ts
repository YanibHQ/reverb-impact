import { hashCanonical } from './canonical.js';
import { invariant } from './errors.js';
import type { ImpactCase, ImpactCaseLabels, IndependentLabelSubmission } from './corpus.js';
import type { ActionLabel, EdgeLabel, ImpactLabel } from './vocabularies.js';
import { contentHash, type ContentHash, type Instant } from './values.js';

const ONE_SIDED_95_Z = 1.6448536269514722;
const TWO_SIDED_95_Z = 1.959963984540054;

export interface Interval {
  readonly lower: number;
  readonly upper: number;
}

export interface BinomialSummary {
  readonly successes: number;
  readonly total: number;
  readonly estimate: number;
  readonly wilsonOneSidedLower95: number;
  readonly wilsonTwoSided95: Interval;
  readonly clopperPearsonOneSidedLower95: number;
}

export function wilsonInterval(successes: number, total: number, z = TWO_SIDED_95_Z): Interval {
  invariant(
    total >= 0 && successes >= 0 && successes <= total,
    'invalid_binomial',
    'Binomial counts are invalid.',
  );
  if (total === 0) return { lower: 0, upper: 1 };
  const proportion = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (proportion + (z * z) / (2 * total)) / denominator;
  const radius =
    (z / denominator) *
    Math.sqrt((proportion * (1 - proportion)) / total + (z * z) / (4 * total * total));
  return { lower: Math.max(0, center - radius), upper: Math.min(1, center + radius) };
}

function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
    12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (value < 0.5)
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const shifted = value - 1;
  let series = 0.9999999999998099;
  coefficients.forEach((coefficient, index) => {
    series += coefficient / (shifted + index + 1);
  });
  const t = shifted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(series);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maximumIterations = 300;
  const epsilon = 3e-14;
  const floor = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < floor) d = floor;
  d = 1 / d;
  let result = d;
  for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
    const even = 2 * iteration;
    let numerator = (iteration * (b - iteration) * x) / ((qam + even) * (a + even));
    d = 1 + numerator * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + numerator / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    result *= d * c;
    numerator = (-(a + iteration) * (qab + iteration) * x) / ((a + even) * (qap + even));
    d = 1 + numerator * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + numerator / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return result;
}

function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

export function clopperPearsonOneSidedLower95(successes: number, total: number): number {
  invariant(
    Number.isInteger(successes) &&
      Number.isInteger(total) &&
      total >= 0 &&
      successes >= 0 &&
      successes <= total,
    'invalid_binomial',
    'Exact binomial counts must be non-negative integers.',
  );
  if (successes === 0 || total === 0) return 0;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (regularizedBeta(midpoint, successes, total - successes + 1) < 0.05) low = midpoint;
    else high = midpoint;
  }
  return (low + high) / 2;
}

export function summarizeBinomial(successes: number, total: number): BinomialSummary {
  const oneSided = wilsonInterval(successes, total, ONE_SIDED_95_Z);
  return {
    successes,
    total,
    estimate: total === 0 ? 0 : successes / total,
    wilsonOneSidedLower95: oneSided.lower,
    wilsonTwoSided95: wilsonInterval(successes, total),
    clopperPearsonOneSidedLower95: clopperPearsonOneSidedLower95(successes, total),
  };
}

export interface ProportionMetric extends BinomialSummary {
  readonly indeterminate: number;
  readonly weightedSuccesses: number;
  readonly weightedTotal: number;
  readonly weightedEstimate: number;
  readonly sensitivity: { readonly worstCase: number; readonly bestCase: number };
}

interface AxisObservation {
  readonly success: boolean;
  readonly indeterminate: boolean;
  readonly weight: number;
}

function proportionMetric(observations: readonly AxisObservation[]): ProportionMetric {
  const complete = observations.filter((value) => !value.indeterminate);
  const successes = complete.filter((value) => value.success).length;
  const indeterminate = observations.length - complete.length;
  const weightedSuccesses = complete
    .filter((value) => value.success)
    .reduce((sum, value) => sum + value.weight, 0);
  const weightedTotal = complete.reduce((sum, value) => sum + value.weight, 0);
  const base = summarizeBinomial(successes, complete.length);
  return {
    ...base,
    indeterminate,
    weightedSuccesses,
    weightedTotal,
    weightedEstimate: weightedTotal === 0 ? 0 : weightedSuccesses / weightedTotal,
    sensitivity: {
      worstCase: observations.length === 0 ? 0 : successes / observations.length,
      bestCase: observations.length === 0 ? 0 : (successes + indeterminate) / observations.length,
    },
  };
}

function actionableLabel(label: ActionLabel): boolean {
  return label === 'coordinate' || label === 'already_coordinated' || label === 'accepted_risk';
}

function selectedFindingCases(cases: readonly ImpactCase[]): readonly ImpactCase[] {
  return cases.filter(
    (value) => value.policySelected && value.detectorOutput === 'candidate' && !value.suppressed,
  );
}

export interface EvaluationMetricSet {
  readonly sampledCases: number;
  readonly independentlyLabeledCases: number;
  readonly edgePrecision: ProportionMetric;
  readonly impactPrecision: ProportionMetric;
  readonly actionablePrecision: ProportionMetric;
  readonly consumerEdgeRecall: ProportionMetric;
  readonly knownBreakRecall: ProportionMetric;
  readonly falseOmissionAudit: ProportionMetric;
  readonly prAlertPrecision: ProportionMetric;
  readonly analysisCoverage: number;
  readonly selectionCoverage: number;
  readonly labelCoverage: number;
  readonly findingsPerThousandEligiblePullRequests: number;
  readonly alertedPullRequestsPerThousand: number;
  readonly latencyMs: { readonly p50: number; readonly p95: number; readonly p99: number };
  readonly totalCostMicrounits: number;
  readonly meanCostMicrounitsPerEligiblePullRequest: number;
  readonly supersededAnalyses: number;
  readonly timedOutAnalyses: number;
  readonly usefulness: {
    readonly observedActions: number;
    readonly eligible: number;
    readonly actionRate: number;
    readonly medianTimeToActionMs: number;
    readonly censored: number;
  };
}

function quantile(values: readonly number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(probability * sorted.length) - 1] ?? sorted.at(-1)!;
}

function caseWeight(value: ImpactCase): number {
  return value.sampling.samplingWeight;
}

export function evaluateMetricSet(cases: readonly ImpactCase[]): EvaluationMetricSet {
  const selected = selectedFindingCases(cases);
  const edgePrecision = proportionMetric(
    selected.map((value) => ({
      success: value.labels?.edge === 'confirmed',
      indeterminate: value.labels?.edge === 'indeterminate',
      weight: caseWeight(value),
    })),
  );
  const impactPrecision = proportionMetric(
    selected.map((value) => ({
      success: value.labels?.impact === value.detectorClaims.impact,
      indeterminate:
        value.labels?.impact === 'indeterminate' || value.detectorClaims.impact === 'unknown',
      weight: caseWeight(value),
    })),
  );
  const actionablePrecision = proportionMetric(
    selected
      .filter((value) => value.detectorClaims.action === 'coordinate')
      .map((value) => ({
        success: value.labels !== undefined && actionableLabel(value.labels.action),
        indeterminate: value.labels?.action === 'indeterminate',
        weight: caseWeight(value),
      })),
  );
  const confirmedEdges = cases.filter(
    (value) => value.labels?.edge === 'confirmed' || value.labels?.edge === 'indeterminate',
  );
  const consumerEdgeRecall = proportionMetric(
    confirmedEdges.map((value) => ({
      success: value.detectorOutput === 'candidate' || value.detectorOutput === 'abstained',
      indeterminate: value.labels?.edge === 'indeterminate',
      weight: caseWeight(value),
    })),
  );
  const knownBreaks = cases.filter(
    (value) => value.labels?.impact === 'breaking' || value.labels?.impact === 'indeterminate',
  );
  const knownBreakRecall = proportionMetric(
    knownBreaks.map((value) => ({
      success: value.detectorOutput === 'candidate' || value.detectorOutput === 'abstained',
      indeterminate: value.labels?.impact === 'indeterminate',
      weight: caseWeight(value),
    })),
  );
  const noFindings = cases.filter(
    (value) => value.detectorOutput === 'no_candidate' || value.detectorOutput === 'not_analysed',
  );
  const falseOmissionAudit = proportionMetric(
    noFindings.map((value) => ({
      success: value.labels !== undefined && !actionableLabel(value.labels.action),
      indeterminate: value.labels?.action === 'indeterminate',
      weight: caseWeight(value),
    })),
  );

  const pullRequests = new Map<string, ImpactCase[]>();
  cases.forEach((value) => {
    const key = `${value.organizationId}\0${value.eligiblePullRequestId}`;
    pullRequests.set(key, [...(pullRequests.get(key) ?? []), value]);
  });
  const selectedPullRequests = [...pullRequests.values()].filter((group) =>
    group.some(
      (value) => value.policySelected && value.detectorOutput === 'candidate' && !value.suppressed,
    ),
  );
  const prAlertPrecision = proportionMetric(
    selectedPullRequests.map((group) => ({
      success: group.some(
        (value) => value.labels !== undefined && actionableLabel(value.labels.action),
      ),
      indeterminate: group.every((value) => value.labels?.action === 'indeterminate'),
      weight: Math.max(...group.map(caseWeight)),
    })),
  );
  const populationWeight = [...pullRequests.values()].reduce(
    (sum, group) => sum + Math.max(...group.map(caseWeight)),
    0,
  );
  const analyzedWeight = [...pullRequests.values()]
    .filter((group) => group.some((value) => value.detectorOutput !== 'not_analysed'))
    .reduce((sum, group) => sum + Math.max(...group.map(caseWeight)), 0);
  const candidateWeight = cases
    .filter((value) => value.detectorOutput === 'candidate' || value.detectorOutput === 'abstained')
    .reduce((sum, value) => sum + caseWeight(value), 0);
  const selectedWeight = selected.reduce((sum, value) => sum + caseWeight(value), 0);
  const labeledWeight = cases
    .filter((value) => value.labels !== undefined)
    .reduce((sum, value) => sum + caseWeight(value), 0);
  const casePopulationWeight = cases.reduce((sum, value) => sum + caseWeight(value), 0);
  const selectedPullRequestWeight = selectedPullRequests.reduce(
    (sum, group) => sum + Math.max(...group.map(caseWeight)),
    0,
  );
  const latency = [...pullRequests.values()].map((group) =>
    Math.max(...group.map((value) => value.analysisLatencyMs)),
  );
  const totalCost = cases.reduce((sum, value) => sum + value.costMicrounits * caseWeight(value), 0);
  return {
    sampledCases: cases.length,
    independentlyLabeledCases: cases.filter(
      (value) => value.labelerProvenance?.independentlyLabeled === true,
    ).length,
    edgePrecision,
    impactPrecision,
    actionablePrecision,
    consumerEdgeRecall,
    knownBreakRecall,
    falseOmissionAudit,
    prAlertPrecision,
    analysisCoverage: populationWeight === 0 ? 0 : analyzedWeight / populationWeight,
    selectionCoverage: candidateWeight === 0 ? 0 : selectedWeight / candidateWeight,
    labelCoverage: casePopulationWeight === 0 ? 0 : labeledWeight / casePopulationWeight,
    findingsPerThousandEligiblePullRequests:
      populationWeight === 0 ? 0 : (selectedWeight / populationWeight) * 1_000,
    alertedPullRequestsPerThousand:
      populationWeight === 0 ? 0 : (selectedPullRequestWeight / populationWeight) * 1_000,
    latencyMs: {
      p50: quantile(latency, 0.5),
      p95: quantile(latency, 0.95),
      p99: quantile(latency, 0.99),
    },
    totalCostMicrounits: totalCost,
    meanCostMicrounitsPerEligiblePullRequest:
      populationWeight === 0 ? 0 : totalCost / populationWeight,
    supersededAnalyses: cases.filter((value) => value.analysisOutcome === 'superseded').length,
    timedOutAnalyses: cases.filter((value) => value.analysisOutcome === 'timeout').length,
    usefulness: {
      observedActions: cases.filter((value) => value.actionObserved === true).length,
      eligible: cases.filter((value) => value.actionObserved !== undefined).length,
      actionRate:
        cases.filter((value) => value.actionObserved !== undefined).length === 0
          ? 0
          : cases.filter((value) => value.actionObserved === true).length /
            cases.filter((value) => value.actionObserved !== undefined).length,
      medianTimeToActionMs: quantile(
        cases.flatMap((value) =>
          value.timeToActionMs === undefined ? [] : [value.timeToActionMs],
        ),
        0.5,
      ),
      censored: cases.filter((value) => value.actionCensored === true).length,
    },
  };
}

export interface RiskCoveragePoint {
  readonly includedStrata: readonly string[];
  readonly selectionCoverage: number;
  readonly actionablePrecision: ProportionMetric;
  readonly findingsPerThousandEligiblePullRequests: number;
}

export interface EvaluationReport {
  readonly schema: 'reverb.evaluation-report';
  readonly schemaVersion: '1.0';
  readonly corpusRevision: ContentHash;
  readonly generatedAt: Instant;
  readonly realWorld: EvaluationMetricSet;
  readonly mutationCapability: EvaluationMetricSet;
  readonly byStratum: Readonly<Record<string, EvaluationMetricSet>>;
  readonly byContractKind: Readonly<Record<string, EvaluationMetricSet>>;
  readonly byLanguagePair: Readonly<Record<string, EvaluationMetricSet>>;
  readonly byOrganization: Readonly<Record<string, EvaluationMetricSet>>;
  readonly byMonth: Readonly<Record<string, EvaluationMetricSet>>;
  readonly riskCoverage: readonly RiskCoveragePoint[];
  readonly weeklyTeamBurden: Readonly<Record<string, number>>;
  readonly clusterSummary: {
    readonly organizationCount: number;
    readonly repositoryPairCount: number;
    readonly warning?: string;
    readonly actionablePrecisionByRepositoryPair: {
      readonly estimate: number;
      readonly lower95: number;
      readonly upper95: number;
      readonly clusterCount: number;
      readonly iterations: number;
    };
  };
  readonly warnings: readonly string[];
  readonly outputHash: ContentHash;
}

function grouped(
  cases: readonly ImpactCase[],
  key: (value: ImpactCase) => string,
): Readonly<Record<string, EvaluationMetricSet>> {
  const groups = new Map<string, ImpactCase[]>();
  cases.forEach((value) => groups.set(key(value), [...(groups.get(key(value)) ?? []), value]));
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([groupKey, values]) => [groupKey, evaluateMetricSet(values)]),
  );
}

function clusterBootstrapActionable(cases: readonly ImpactCase[]) {
  const observations = selectedFindingCases(cases).filter(
    (value) =>
      value.detectorClaims.action === 'coordinate' && value.labels?.action !== 'indeterminate',
  );
  const groups = new Map<string, ImpactCase[]>();
  observations.forEach((value) => {
    const key = `${value.organizationId}\0${value.producerRepositoryId}\0${value.consumerRepositoryId}`;
    groups.set(key, [...(groups.get(key) ?? []), value]);
  });
  const clusters = [...groups.values()];
  const estimateFor = (values: readonly ImpactCase[]) => {
    const denominator = values.reduce((sum, value) => sum + caseWeight(value), 0);
    const numerator = values
      .filter((value) => value.labels !== undefined && actionableLabel(value.labels.action))
      .reduce((sum, value) => sum + caseWeight(value), 0);
    return denominator === 0 ? 0 : numerator / denominator;
  };
  const iterations = clusters.length === 0 ? 0 : 1_000;
  let state = Number.parseInt(
    hashCanonical(observations.map((value) => value.id)).slice(7, 15),
    16,
  );
  const next = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const samples = Array.from({ length: iterations }, () => {
    const draw = Array.from(
      { length: clusters.length },
      () => clusters[Math.floor(next() * clusters.length)]!,
    ).flat();
    return estimateFor(draw);
  }).sort((left, right) => left - right);
  return {
    estimate: estimateFor(observations),
    lower95: samples[Math.floor(samples.length * 0.025)] ?? 0,
    upper95: samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.975))] ?? 1,
    clusterCount: clusters.length,
    iterations,
  };
}

export function evaluateCorpus(input: {
  readonly corpusRevision: ContentHash;
  readonly generatedAt: Instant;
  readonly cases: readonly ImpactCase[];
  readonly riskOrder?: readonly string[];
}): EvaluationReport {
  const missing = input.cases.filter(
    (value) =>
      value.requiredForEvaluation &&
      (value.labels === undefined || value.labelerProvenance === undefined),
  );
  invariant(
    missing.length === 0,
    'required_case_unlabelled',
    `Evaluation cannot skip ${missing.length} required unlabelled case(s).`,
  );
  const realWorld = input.cases.filter((value) => value.subset !== 'mutation');
  const mutation = input.cases.filter((value) => value.subset === 'mutation');
  const strata = [...new Set(realWorld.map((value) => value.stratum.key))].sort();
  const order = input.riskOrder ?? strata;
  const riskCoverage = order.map((_, index) => {
    const included = order.slice(0, index + 1);
    const scoped = realWorld.map((value) => ({
      ...value,
      policySelected: value.policySelected && included.includes(value.stratum.key),
    }));
    const metrics = evaluateMetricSet(scoped);
    return {
      includedStrata: included,
      selectionCoverage: metrics.selectionCoverage,
      actionablePrecision: metrics.actionablePrecision,
      findingsPerThousandEligiblePullRequests: metrics.findingsPerThousandEligiblePullRequests,
    };
  });
  const weeks = new Set(realWorld.map((value) => value.pullRequestOpenedAt.slice(0, 10))).size || 1;
  const weeklyTeamBurden = Object.fromEntries(
    [...new Set(realWorld.map((value) => value.teamId))].sort().map((team) => [
      team,
      new Set(
        selectedFindingCases(realWorld)
          .filter((value) => value.teamId === team)
          .map((value) => value.eligiblePullRequestId),
      ).size / weeks,
    ]),
  );
  const repositoryPairs = new Set(
    realWorld.map((value) => `${value.producerRepositoryId}\0${value.consumerRepositoryId}`),
  );
  const warnings = [
    ...(realWorld.length === 0
      ? ['No real-world cases are available; mutation results are not precision.']
      : []),
    ...(new Set(realWorld.map((value) => value.organizationId)).size < 2
      ? ['Fewer than two organizations; external generalization is unmeasured.']
      : []),
  ];
  const canonical = {
    schema: 'reverb.evaluation-report' as const,
    schemaVersion: '1.0' as const,
    corpusRevision: input.corpusRevision,
    generatedAt: input.generatedAt,
    realWorld: evaluateMetricSet(realWorld),
    mutationCapability: evaluateMetricSet(mutation),
    byStratum: grouped(realWorld, (value) => value.stratum.key),
    byContractKind: grouped(realWorld, (value) => value.contractKind),
    byLanguagePair: grouped(
      realWorld,
      (value) => `${value.stratum.producerLanguageTier}->${value.stratum.consumerLanguageTier}`,
    ),
    byOrganization: grouped(realWorld, (value) => value.organizationId),
    byMonth: grouped(realWorld, (value) => value.pullRequestOpenedAt.slice(0, 7)),
    riskCoverage,
    weeklyTeamBurden,
    clusterSummary: {
      organizationCount: new Set(realWorld.map((value) => value.organizationId)).size,
      repositoryPairCount: repositoryPairs.size,
      ...(repositoryPairs.size < 10
        ? { warning: 'Fewer than ten repository-pair clusters; cluster uncertainty is unstable.' }
        : {}),
      actionablePrecisionByRepositoryPair: clusterBootstrapActionable(realWorld),
    },
    warnings,
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

type LabelAxis = 'edge' | 'impact' | 'action';

export interface AxisAgreement {
  readonly rawAgreement: BinomialSummary;
  readonly krippendorffAlphaNominal: number;
  readonly krippendorffAlphaInterval95: Interval;
  readonly confusion: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface AgreementReport {
  readonly caseCount: number;
  readonly edge: AxisAgreement;
  readonly impact: AxisAgreement;
  readonly action: AxisAgreement;
}

function axisAgreement(
  pairs: readonly [
    ImpactCaseLabels[keyof ImpactCaseLabels],
    ImpactCaseLabels[keyof ImpactCaseLabels],
  ][],
): AxisAgreement {
  const confusion: Record<string, Record<string, number>> = {};
  let agreements = 0;
  pairs.forEach(([left, right]) => {
    confusion[left] ??= {};
    confusion[left]![right] = (confusion[left]![right] ?? 0) + 1;
    if (left === right) agreements += 1;
  });
  const alphaFor = (
    values: readonly [
      ImpactCaseLabels[keyof ImpactCaseLabels],
      ImpactCaseLabels[keyof ImpactCaseLabels],
    ][],
  ) => {
    const ratings = new Map<string, number>();
    let equal = 0;
    values.forEach(([left, right]) => {
      ratings.set(left, (ratings.get(left) ?? 0) + 1);
      ratings.set(right, (ratings.get(right) ?? 0) + 1);
      if (left === right) equal += 1;
    });
    const observedDisagreement = values.length === 0 ? 0 : 1 - equal / values.length;
    const totalRatings = values.length * 2;
    const expectedAgreement =
      totalRatings === 0
        ? 1
        : [...ratings.values()].reduce((sum, count) => sum + (count / totalRatings) ** 2, 0);
    const expectedDisagreement = 1 - expectedAgreement;
    return expectedDisagreement === 0 ? 1 : 1 - observedDisagreement / expectedDisagreement;
  };
  let state = Number.parseInt(hashCanonical(pairs).slice(7, 15), 16);
  const next = () => {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    return state / 0x1_0000_0000;
  };
  const bootstrap =
    pairs.length === 0
      ? []
      : Array.from({ length: 500 }, () =>
          alphaFor(
            Array.from({ length: pairs.length }, () => pairs[Math.floor(next() * pairs.length)]!),
          ),
        ).sort((left, right) => left - right);
  return {
    rawAgreement: summarizeBinomial(agreements, pairs.length),
    krippendorffAlphaNominal: alphaFor(pairs),
    krippendorffAlphaInterval95: {
      lower: bootstrap[Math.floor(bootstrap.length * 0.025)] ?? 0,
      upper: bootstrap[Math.min(bootstrap.length - 1, Math.floor(bootstrap.length * 0.975))] ?? 1,
    },
    confusion,
  };
}

export function reportLabelAgreement(
  submissions: readonly IndependentLabelSubmission[],
): AgreementReport {
  const groups = new Map<string, IndependentLabelSubmission[]>();
  submissions.forEach((value) =>
    groups.set(value.caseId, [...(groups.get(value.caseId) ?? []), value]),
  );
  const pairs = [...groups.values()].map((values) => {
    invariant(
      values.length === 2 && values[0]!.reviewerId !== values[1]!.reviewerId,
      'invalid_agreement_panel',
      'Agreement requires exactly two independent submissions per case.',
    );
    invariant(
      values.every(
        (value) => value.reviewerKind === 'human' && value.domainCapability.trim().length > 0,
      ),
      'invalid_agreement_panel',
      'Agreement inputs require domain-capable human reviewers.',
    );
    return values as [IndependentLabelSubmission, IndependentLabelSubmission];
  });
  const forAxis = (axis: LabelAxis) =>
    pairs.map(
      ([left, right]) =>
        [left.labels[axis], right.labels[axis]] as [
          EdgeLabel | ImpactLabel | ActionLabel,
          EdgeLabel | ImpactLabel | ActionLabel,
        ],
    );
  return {
    caseCount: pairs.length,
    edge: axisAgreement(forAxis('edge')),
    impact: axisAgreement(forAxis('impact')),
    action: axisAgreement(forAxis('action')),
  };
}
