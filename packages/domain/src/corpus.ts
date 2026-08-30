import { hashCanonical } from './canonical.js';
import { invariant } from './errors.js';
import { contentHash, corpusCaseId } from './values.js';
import type {
  AdapterId,
  CommitSha,
  ContentHash,
  CorpusCaseId,
  GenerationId,
  Instant,
  PolicyRevision,
  RegistryRevision,
  RepositoryStableId,
  StableReferenceId,
} from './values.js';
import type { ActionLabel, ContractKind, EdgeLabel, ImpactLabel } from './vocabularies.js';

export type CorpusSubset = 'historical' | 'executable_replay' | 'mutation' | 'forward_shadow';
export type DetectorOutput = 'candidate' | 'abstained' | 'no_candidate' | 'not_analysed';

export interface ImpactCaseLabels {
  readonly edge: EdgeLabel;
  readonly impact: ImpactLabel;
  readonly action: ActionLabel;
}

export interface LabelerProvenance {
  readonly reviewerIds: readonly string[];
  readonly adjudicatorId?: string;
  readonly independentlyLabeled: boolean;
  readonly blindedToMethod: boolean;
  readonly blindedToBand: boolean;
  readonly handbookVersion: string;
  readonly detectorAuthorConflicts: readonly string[];
  readonly adjudicatedAt: Instant;
}

export interface EvidenceStratumDescriptor {
  readonly key: string;
  readonly contractKind: ContractKind;
  readonly producerLanguageTier: string;
  readonly consumerLanguageTier: string;
  readonly producerExtractor: { readonly id: AdapterId; readonly version: string };
  readonly consumerExtractor: { readonly id: AdapterId; readonly version: string };
  readonly identityVersion: number;
  readonly joinStrategy: string;
  readonly evidenceComposition: readonly string[];
  readonly coverageCompletenessClass: string;
}

export interface ImpactCase {
  readonly schema: 'reverb.impact-case';
  readonly schemaVersion: '1.0';
  readonly id: CorpusCaseId;
  readonly subset: CorpusSubset;
  readonly organizationId: string;
  readonly repositoryFamilyId: string;
  readonly teamId: string;
  readonly eligiblePullRequestId: string;
  readonly producerRepositoryId: RepositoryStableId;
  readonly producerBaseSha: CommitSha;
  readonly producerHeadSha: CommitSha;
  readonly pullRequestOpenedAt: Instant;
  readonly consumerRepositoryId: RepositoryStableId;
  readonly consumerShaAsOfPullRequestOpen: CommitSha;
  readonly consumerSnapshotObservedAt: Instant;
  readonly producerGenerationId: GenerationId;
  readonly consumerGenerationId: GenerationId;
  readonly stableConsumerReferenceId: StableReferenceId;
  readonly contractKind: ContractKind;
  readonly canonicalContractKey: string;
  readonly changeKind: string;
  readonly stratum: EvidenceStratumDescriptor;
  readonly adapterVersions: Readonly<Record<string, string>>;
  readonly identityFunctionVersion: string;
  readonly registryRevision: RegistryRevision;
  readonly policyRevision: PolicyRevision;
  readonly evidence: readonly Readonly<Record<string, unknown>>[];
  readonly coverage: readonly Readonly<Record<string, unknown>>[];
  readonly detectorOutput: DetectorOutput;
  readonly analysisOutcome: 'completed' | 'superseded' | 'timeout' | 'not_analysed';
  readonly detectorClaims: {
    readonly impact: 'breaking' | 'behavior_risk' | 'compatible' | 'unknown';
    readonly action: 'coordinate' | 'review' | 'none';
  };
  readonly policySelected: boolean;
  readonly suppressed: boolean;
  readonly requiredForEvaluation: boolean;
  readonly labels?: ImpactCaseLabels;
  readonly labelerProvenance?: LabelerProvenance;
  readonly sampling: {
    readonly frameSource: 'provider_metadata' | 'supported_artifact_discovery';
    readonly inclusionProbability: number;
    readonly samplingWeight: number;
    readonly seed: string;
  };
  readonly releaseability: 'public' | 'private_aggregate_only' | 'private_not_releasable';
  readonly evaluationConsent: boolean;
  readonly researchConsent: boolean;
  readonly analysisLatencyMs: number;
  readonly costMicrounits: number;
  readonly confidentialityDefects: number;
  readonly removalCoverageDefect: boolean;
  readonly remedyAvailable: boolean;
  readonly actionObserved?: boolean;
  readonly timeToActionMs?: number;
  readonly actionCensored?: boolean;
  readonly outputHash: ContentHash;
}

export type ImpactCaseDraft = Omit<
  ImpactCase,
  'schema' | 'schemaVersion' | 'id' | 'outputHash' | 'sampling'
>;

function assertCaseValidity(
  input: Omit<ImpactCase, 'schema' | 'schemaVersion' | 'id' | 'outputHash'>,
): void {
  invariant(
    input.organizationId.trim().length > 0 &&
      input.repositoryFamilyId.trim().length > 0 &&
      input.teamId.trim().length > 0 &&
      input.eligiblePullRequestId.trim().length > 0,
    'invalid_corpus_case',
    'Population and cluster identifiers are required.',
  );
  invariant(
    new Date(input.consumerSnapshotObservedAt).valueOf() <=
      new Date(input.pullRequestOpenedAt).valueOf(),
    'future_snapshot_leakage',
    'Consumer snapshots must be contemporaneous and cannot include a future downstream fix.',
  );
  invariant(
    input.stratum.key.trim().length > 0 && input.stratum.identityVersion >= 1,
    'invalid_corpus_case',
    'A complete versioned evidence stratum is required.',
  );
  invariant(
    input.sampling.inclusionProbability > 0 && input.sampling.inclusionProbability <= 1,
    'invalid_sampling_probability',
    'Inclusion probability must be in (0, 1].',
  );
  invariant(
    Math.abs(input.sampling.samplingWeight - 1 / input.sampling.inclusionProbability) < 1e-9,
    'invalid_sampling_weight',
    'Sampling weight must be the inverse inclusion probability.',
  );
  invariant(
    input.analysisLatencyMs >= 0 &&
      input.costMicrounits >= 0 &&
      Number.isInteger(input.confidentialityDefects) &&
      input.confidentialityDefects >= 0,
    'invalid_corpus_measurement',
    'Latency, cost, and defect counts must be non-negative.',
  );
  invariant(
    input.timeToActionMs === undefined || input.timeToActionMs >= 0,
    'invalid_corpus_measurement',
    'Time to action must be non-negative when recorded.',
  );
  if (input.labels !== undefined) {
    invariant(
      input.labelerProvenance !== undefined,
      'invalid_label_provenance',
      'Labels require independent reviewer provenance.',
    );
  }
}

export function createImpactCase(
  input: Omit<ImpactCase, 'schema' | 'schemaVersion' | 'id' | 'outputHash'>,
): ImpactCase {
  assertCaseValidity(input);
  const identity = {
    subset: input.subset,
    organizationId: input.organizationId,
    producerRepositoryId: input.producerRepositoryId,
    producerBaseSha: input.producerBaseSha,
    producerHeadSha: input.producerHeadSha,
    consumerRepositoryId: input.consumerRepositoryId,
    consumerShaAsOfPullRequestOpen: input.consumerShaAsOfPullRequestOpen,
    stableConsumerReferenceId: input.stableConsumerReferenceId,
    contractKind: input.contractKind,
    canonicalContractKey: input.canonicalContractKey,
    stratumKey: input.stratum.key,
  };
  const id = corpusCaseId(`cas_${hashCanonical(identity)}`);
  const canonical = {
    ...input,
    schema: 'reverb.impact-case' as const,
    schemaVersion: '1.0' as const,
    id,
    adapterVersions: Object.fromEntries(Object.entries(input.adapterVersions).sort()),
    evidence: [...input.evidence],
    coverage: [...input.coverage],
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

function unitInterval(seed: string): number {
  const digest = hashCanonical(seed).slice('sha256:'.length, 'sha256:'.length + 13);
  return Number.parseInt(digest, 16) / 0x1_0000_0000_0000;
}

export function sampleImpactPopulation(input: {
  readonly population: readonly ImpactCaseDraft[];
  readonly noFindingProbability: number;
  readonly seed: string;
  readonly frameSource: ImpactCase['sampling']['frameSource'];
}): readonly ImpactCase[] {
  invariant(
    input.population.length > 0,
    'empty_sampling_frame',
    'Corpus sampling requires an independently enumerated eligible population.',
  );
  invariant(
    input.noFindingProbability > 0 && input.noFindingProbability <= 1,
    'invalid_sampling_probability',
    'No-finding sampling probability must be in (0, 1].',
  );
  return input.population.flatMap((draft) => {
    const finding = draft.detectorOutput === 'candidate' || draft.detectorOutput === 'abstained';
    const probability = finding ? 1 : input.noFindingProbability;
    if (!finding && unitInterval(`${input.seed}\0${draft.eligiblePullRequestId}`) >= probability) {
      return [];
    }
    return [
      createImpactCase({
        ...draft,
        sampling: {
          frameSource: input.frameSource,
          inclusionProbability: probability,
          samplingWeight: 1 / probability,
          seed: input.seed,
        },
      }),
    ];
  });
}

export interface CorpusManifest {
  readonly schema: 'reverb.corpus-manifest';
  readonly schemaVersion: '1.0';
  readonly revision: ContentHash;
  readonly createdAt: Instant;
  readonly handbookVersion: string;
  readonly frameSource: ImpactCase['sampling']['frameSource'];
  readonly populationHash: ContentHash;
  readonly eligiblePopulationCount: number;
  readonly caseIds: readonly CorpusCaseId[];
  readonly subsetCounts: Readonly<Record<CorpusSubset, number>>;
  readonly publicCaseIds: readonly CorpusCaseId[];
  readonly outputHash: ContentHash;
}

export function createCorpusManifest(input: {
  readonly createdAt: Instant;
  readonly handbookVersion: string;
  readonly frameSource: ImpactCase['sampling']['frameSource'];
  readonly populationHash: ContentHash;
  readonly eligiblePopulationCount: number;
  readonly cases: readonly ImpactCase[];
}): CorpusManifest {
  invariant(
    input.eligiblePopulationCount >=
      new Set(input.cases.map((value) => value.eligiblePullRequestId)).size,
    'invalid_corpus_manifest',
    'Sampled pull requests cannot exceed the independently enumerated population.',
  );
  invariant(
    input.handbookVersion.trim().length > 0,
    'invalid_corpus_manifest',
    'A frozen label handbook version is required.',
  );
  const cases = [...input.cases].sort((left, right) => left.id.localeCompare(right.id));
  const subsetCounts = Object.fromEntries(
    (['historical', 'executable_replay', 'mutation', 'forward_shadow'] as const).map((subset) => [
      subset,
      cases.filter((value) => value.subset === subset).length,
    ]),
  ) as Readonly<Record<CorpusSubset, number>>;
  const canonical = {
    schema: 'reverb.corpus-manifest' as const,
    schemaVersion: '1.0' as const,
    createdAt: input.createdAt,
    handbookVersion: input.handbookVersion,
    frameSource: input.frameSource,
    populationHash: input.populationHash,
    eligiblePopulationCount: input.eligiblePopulationCount,
    caseIds: cases.map((value) => value.id),
    subsetCounts,
    publicCaseIds: cases
      .filter(
        (value) =>
          value.releaseability === 'public' && value.researchConsent && value.evaluationConsent,
      )
      .map((value) => value.id),
  };
  const revision = contentHash(hashCanonical(canonical));
  return {
    ...canonical,
    revision,
    outputHash: contentHash(hashCanonical({ ...canonical, revision })),
  };
}

export interface ExecutableReplayRecord {
  readonly caseId: CorpusCaseId;
  readonly commandHash: ContentHash;
  readonly containerHash: ContentHash;
  readonly toolchainHash: ContentHash;
  readonly substitution: string;
  readonly phase: 'setup' | 'compile' | 'test';
  readonly outcome: 'pass' | 'relevant_failure' | 'unrelated_failure' | 'timeout';
  readonly exercisedScope: string;
}

export function executableReplayImpactLabel(record: ExecutableReplayRecord): ImpactLabel {
  if (record.outcome === 'relevant_failure') return 'breaking';
  if (record.outcome === 'pass' && record.exercisedScope.trim().length > 0) return 'compatible';
  return 'indeterminate';
}

export function importMutationCases(cases: readonly ImpactCase[]): readonly ImpactCase[] {
  invariant(
    cases.every((value) => value.subset === 'mutation'),
    'invalid_mutation_import',
    'Mutation fixtures must carry the explicit mutation subset tag.',
  );
  return [...cases];
}

export interface IndependentLabelSubmission {
  readonly caseId: CorpusCaseId;
  readonly reviewerId: string;
  readonly domainCapability: string;
  readonly submittedAt: Instant;
  readonly labels: ImpactCaseLabels;
  readonly blindedToMethod: boolean;
  readonly blindedToBand: boolean;
  readonly detectorAuthorConflict: boolean;
  readonly reviewerKind: 'human';
}

export function adjudicateLabels(input: {
  readonly caseId: CorpusCaseId;
  readonly primary: readonly IndependentLabelSubmission[];
  readonly adjudicator?: IndependentLabelSubmission;
  readonly handbookVersion: string;
}): { readonly labels: ImpactCaseLabels; readonly provenance: LabelerProvenance } {
  invariant(
    input.primary.length === 2 &&
      input.primary[0]!.reviewerId !== input.primary[1]!.reviewerId &&
      input.primary.every(
        (value) =>
          value.caseId === input.caseId &&
          value.reviewerKind === 'human' &&
          value.domainCapability.trim().length > 0,
      ),
    'invalid_labeling_panel',
    'Exactly two independent, domain-capable human reviewers are required.',
  );
  invariant(
    input.primary.some((value) => !value.detectorAuthorConflict) &&
      (input.adjudicator === undefined || !input.adjudicator.detectorAuthorConflict),
    'invalid_labeling_panel',
    'Detector authors cannot constitute the sole final labeling authority.',
  );
  const agreement =
    hashCanonical(input.primary[0]!.labels) === hashCanonical(input.primary[1]!.labels);
  if (!agreement) {
    invariant(
      input.adjudicator !== undefined &&
        input.adjudicator.caseId === input.caseId &&
        !input.primary.some((value) => value.reviewerId === input.adjudicator!.reviewerId),
      'adjudication_required',
      'Conflicting labels require a distinct third human adjudicator.',
    );
  }
  const labels = agreement ? input.primary[0]!.labels : input.adjudicator!.labels;
  const provenance: LabelerProvenance = {
    reviewerIds: input.primary.map((value) => value.reviewerId).sort(),
    ...(agreement ? {} : { adjudicatorId: input.adjudicator!.reviewerId }),
    independentlyLabeled: true,
    blindedToMethod: input.primary.every((value) => value.blindedToMethod),
    blindedToBand: input.primary.every((value) => value.blindedToBand),
    handbookVersion: input.handbookVersion,
    detectorAuthorConflicts: [...input.primary, ...(input.adjudicator ? [input.adjudicator] : [])]
      .filter((value) => value.detectorAuthorConflict)
      .map((value) => value.reviewerId)
      .sort(),
    adjudicatedAt: agreement
      ? input.primary
          .map((value) => value.submittedAt)
          .sort()
          .at(-1)!
      : input.adjudicator!.submittedAt,
  };
  return { labels, provenance };
}
