import type { AnalysisScopeProvenanceV2 } from './analysis-scope.js';
import { canonicalJson, hashCanonical } from './canonical.js';
import type { EvidenceRangeV2 } from './evidence-v2.js';
import { invariant } from './errors.js';
import { finalizeExecutionBudgetReportV2, type ExecutionBudgetReportV2 } from './execution-v2.js';
import {
  analysisId,
  commitSha,
  contentHash,
  generationId,
  instant,
  reasoningRunId,
  repoPath,
  repositoryStableId,
  workspaceId,
} from './values.js';
import type {
  AnalysisId,
  CommitSha,
  ContentHash,
  GenerationId,
  Instant,
  ReasoningRunId,
  RepoPath,
  RepositoryStableId,
  WorkspaceId,
} from './values.js';

export const REASONING_SEVERITIES_V2 = ['low', 'medium', 'high', 'critical'] as const;
export type ReasoningSeverityV2 = (typeof REASONING_SEVERITIES_V2)[number];
export const REASONING_CONFIDENCES_V2 = ['low', 'medium', 'high'] as const;
export type ReasoningConfidenceV2 = (typeof REASONING_CONFIDENCES_V2)[number];
export const REASONING_HYPOTHESIS_LIMITATIONS_V2 = [
  'ambiguous_dependency',
  'dynamic_resolution',
  'insufficient_context',
  'weak_evidence',
] as const;
export type ReasoningHypothesisLimitationV2 = (typeof REASONING_HYPOTHESIS_LIMITATIONS_V2)[number];
export const REASONING_RUN_LIMITATIONS_V2 = [
  'reasoning_budget_exhausted',
  'reasoning_circuit_open',
  'reasoning_citation_invalid',
  'reasoning_consent_denied',
  'reasoning_consent_failed',
  'reasoning_consent_timeout',
  'reasoning_data_deleted',
  'reasoning_provider_failed',
  'reasoning_provider_refused',
  'reasoning_provider_timeout',
  'reasoning_response_malformed',
  'reasoning_retrieval_failed',
  'reasoning_retrieval_invalid',
  'reasoning_retrieval_timeout',
  'reasoning_seed_evidence_missing',
  'reasoning_two_sided_context_missing',
] as const;
export type ReasoningRunLimitationV2 = (typeof REASONING_RUN_LIMITATIONS_V2)[number];

export interface ReasoningHypothesisV2 {
  readonly evidenceBasis: 'ai_inferred';
  readonly disposition: 'needs_investigation' | 'withheld';
  readonly severity: ReasoningSeverityV2;
  readonly confidence: ReasoningConfidenceV2;
  readonly producerCitationIds: readonly string[];
  readonly consumerCitationIds: readonly string[];
  readonly limitations: readonly ReasoningHypothesisLimitationV2[];
}

export interface ReasoningProviderProvenanceV2 {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly dataRegion: string;
  readonly retentionMode: 'none' | 'provider_managed' | 'host_managed';
}

export interface ReasoningConsentProvenanceV2 {
  readonly repositoryId: RepositoryStableId;
  readonly allowed: boolean;
  readonly revision: string;
  readonly decisionHash: ContentHash;
}

export interface ReasoningCitationV2 {
  readonly citationId: string;
  readonly origin: 'changed_definition' | 'deterministic_neighbor';
  readonly side: 'producer' | 'consumer';
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly generationId: GenerationId;
  readonly commitSha: CommitSha;
  readonly path: RepoPath;
  readonly range: EvidenceRangeV2;
  readonly contentHash: ContentHash;
  readonly excerptHash: ContentHash;
}

export interface ReasoningRunV2 {
  readonly schema: 'reverb.reasoning-run';
  readonly schemaVersion: '2.0';
  readonly id: ReasoningRunId;
  readonly workspaceId: WorkspaceId;
  readonly analysisId: AnalysisId;
  readonly scopeHash: ContentHash;
  readonly state: 'complete' | 'partial' | 'failed' | 'deleted';
  readonly provider: ReasoningProviderProvenanceV2;
  readonly templateVersion: string;
  readonly reasoningPolicyVersion: string;
  readonly retrievalVersion: string;
  readonly inputHash: ContentHash;
  readonly providerOutputHash?: ContentHash;
  readonly executionBudget: ExecutionBudgetReportV2;
  readonly consentDecisions: readonly ReasoningConsentProvenanceV2[];
  readonly citations: readonly ReasoningCitationV2[];
  readonly hypotheses: readonly ReasoningHypothesisV2[];
  readonly limitations: readonly ReasoningRunLimitationV2[];
  readonly createdAt: Instant;
  readonly deletedAt?: Instant;
  readonly outputHash: ContentHash;
}

function bounded(value: string, maximum = 256): boolean {
  return value.length > 0 && value.length <= maximum && !value.includes('\0');
}

function uniqueSorted<Value extends string>(values: readonly Value[]): readonly Value[] {
  invariant(
    values.every((value) => bounded(value, 512)),
    'invalid_schema',
    'Reasoning values must be bounded.',
  );
  return [...new Set(values)].sort();
}

function validCitation(citation: ReasoningCitationV2, workspace: WorkspaceId): boolean {
  try {
    workspaceId(citation.workspaceId);
    repositoryStableId(citation.repositoryId);
    generationId(citation.generationId);
    commitSha(citation.commitSha);
    repoPath(citation.path);
    contentHash(citation.contentHash);
    contentHash(citation.excerptHash);
  } catch {
    return false;
  }
  return (
    /^cit_sha256:[0-9a-f]{64}$/.test(citation.citationId) &&
    citation.workspaceId === workspace &&
    citation.range.startLine > 0 &&
    citation.range.startColumn > 0 &&
    citation.range.endLine > 0 &&
    citation.range.endColumn > 0 &&
    (citation.range.endLine > citation.range.startLine ||
      (citation.range.endLine === citation.range.startLine &&
        citation.range.endColumn >= citation.range.startColumn))
  );
}

export function finalizeReasoningHypothesisV2(input: ReasoningHypothesisV2): ReasoningHypothesisV2 {
  invariant(
    input.evidenceBasis === 'ai_inferred' &&
      ['needs_investigation', 'withheld'].includes(input.disposition) &&
      REASONING_SEVERITIES_V2.includes(input.severity) &&
      REASONING_CONFIDENCES_V2.includes(input.confidence),
    'invalid_schema',
    'Reasoning records must use the closed evidence, disposition, severity, and confidence vocabulary.',
  );
  const producerCitationIds = uniqueSorted(input.producerCitationIds);
  const consumerCitationIds = uniqueSorted(input.consumerCitationIds);
  const limitations = uniqueSorted(input.limitations);
  invariant(
    [...producerCitationIds, ...consumerCitationIds].every((id) =>
      /^cit_sha256:[0-9a-f]{64}$/.test(id),
    ) && limitations.every((value) => REASONING_HYPOTHESIS_LIMITATIONS_V2.includes(value)),
    'invalid_schema',
    'Reasoning citations and limitations must use their closed vocabularies.',
  );
  invariant(
    input.disposition === 'withheld' ||
      (producerCitationIds.length > 0 && consumerCitationIds.length > 0),
    'invalid_schema',
    'A needs-investigation hypothesis requires producer and consumer citations.',
  );
  return Object.freeze({ ...input, producerCitationIds, consumerCitationIds, limitations });
}

export function finalizeReasoningRunV2(input: Omit<ReasoningRunV2, 'outputHash'>): ReasoningRunV2 {
  reasoningRunId(input.id);
  workspaceId(input.workspaceId);
  analysisId(input.analysisId);
  contentHash(input.scopeHash);
  contentHash(input.inputHash);
  if (input.providerOutputHash !== undefined) contentHash(input.providerOutputHash);
  instant(input.createdAt);
  if (input.deletedAt !== undefined) instant(input.deletedAt);
  invariant(
    ['complete', 'partial', 'failed', 'deleted'].includes(input.state) &&
      bounded(input.provider.providerId) &&
      bounded(input.provider.providerVersion) &&
      bounded(input.provider.modelId) &&
      bounded(input.provider.modelVersion) &&
      bounded(input.provider.dataRegion) &&
      bounded(input.templateVersion) &&
      bounded(input.reasoningPolicyVersion) &&
      bounded(input.retrievalVersion) &&
      ['none', 'provider_managed', 'host_managed'].includes(input.provider.retentionMode),
    'invalid_schema',
    'Reasoning provenance fields must be bounded.',
  );
  invariant(
    input.executionBudget.lane === 'reasoning' &&
      canonicalJson(
        finalizeExecutionBudgetReportV2({
          schema: input.executionBudget.schema,
          schemaVersion: input.executionBudget.schemaVersion,
          lane: input.executionBudget.lane,
          limits: input.executionBudget.limits,
          usage: input.executionBudget.usage,
          exhaustedDimensions: input.executionBudget.exhaustedDimensions,
          startedAt: input.executionBudget.startedAt,
          completedAt: input.executionBudget.completedAt,
        }),
      ) === canonicalJson(input.executionBudget),
    'invalid_schema',
    'Reasoning runs require a canonical reasoning-lane budget.',
  );
  const hypotheses = input.hypotheses
    .map(finalizeReasoningHypothesisV2)
    .sort((left, right) => hashCanonical(left).localeCompare(hashCanonical(right)));
  const limitations = uniqueSorted(input.limitations);
  invariant(
    limitations.every((value) => REASONING_RUN_LIMITATIONS_V2.includes(value)),
    'invalid_schema',
    'Reasoning run limitations must use the closed vocabulary.',
  );
  const consentDecisions = [...input.consentDecisions].sort((left, right) =>
    left.repositoryId.localeCompare(right.repositoryId),
  );
  invariant(
    consentDecisions.every((decision) => {
      try {
        repositoryStableId(decision.repositoryId);
        contentHash(decision.decisionHash);
        return typeof decision.allowed === 'boolean' && bounded(decision.revision);
      } catch {
        return false;
      }
    }) &&
      new Set(consentDecisions.map((decision) => decision.repositoryId)).size ===
        consentDecisions.length,
    'invalid_schema',
    'Reasoning consent decisions must be unique, bounded, and canonical per repository.',
  );
  const citations = [...input.citations].sort((left, right) =>
    left.citationId.localeCompare(right.citationId),
  );
  invariant(
    citations.every(
      (citation) =>
        ['changed_definition', 'deterministic_neighbor'].includes(citation.origin) &&
        ['producer', 'consumer'].includes(citation.side) &&
        validCitation(citation, input.workspaceId),
    ) && new Set(citations.map((citation) => citation.citationId)).size === citations.length,
    'invalid_schema',
    'Reasoning citations must be unique, bounded, and match the run workspace.',
  );
  const citationSides = new Map(citations.map((citation) => [citation.citationId, citation.side]));
  invariant(
    hypotheses.every(
      (hypothesis) =>
        hypothesis.producerCitationIds.every((id) => citationSides.get(id) === 'producer') &&
        hypothesis.consumerCitationIds.every((id) => citationSides.get(id) === 'consumer'),
    ),
    'invalid_schema',
    'Reasoning hypotheses may cite only retained evidence on the declared side.',
  );
  invariant(
    input.state === 'deleted'
      ? input.deletedAt !== undefined &&
          hypotheses.length === 0 &&
          citations.length === 0 &&
          input.providerOutputHash === undefined
      : input.deletedAt === undefined,
    'invalid_schema',
    'Deleted reasoning runs must be scrubbed and timestamped; active runs cannot be marked deleted.',
  );
  invariant(
    input.state === 'complete'
      ? limitations.length === 0 &&
          input.providerOutputHash !== undefined &&
          consentDecisions.length > 0 &&
          consentDecisions.every((decision) => decision.allowed)
      : true,
    'invalid_schema',
    'A complete reasoning run requires provider output provenance and cannot contain limitations.',
  );
  invariant(
    input.state !== 'failed' || hypotheses.length === 0,
    'invalid_schema',
    'A failed reasoning run cannot contain hypotheses.',
  );
  invariant(
    input.providerOutputHash === undefined ||
      (consentDecisions.length > 0 && consentDecisions.every((decision) => decision.allowed)),
    'invalid_schema',
    'Provider output requires affirmative reasoning consent for every recorded repository.',
  );
  invariant(
    input.createdAt === input.executionBudget.completedAt &&
      input.id ===
        reasoningRunIdentity({
          analysisId: input.analysisId,
          scopeHash: input.scopeHash,
          inputHash: input.inputHash,
          provider: input.provider,
          templateVersion: input.templateVersion,
          reasoningPolicyVersion: input.reasoningPolicyVersion,
          retrievalVersion: input.retrievalVersion,
        }),
    'invalid_schema',
    'Reasoning run identity and completion time must match their canonical provenance.',
  );
  const canonical = { ...input, consentDecisions, citations, hypotheses, limitations };
  return Object.freeze({ ...canonical, outputHash: contentHash(hashCanonical(canonical)) });
}

export function reasoningRunIdentity(input: {
  readonly analysisId: AnalysisId;
  readonly scopeHash: ContentHash;
  readonly inputHash: ContentHash;
  readonly provider: ReasoningProviderProvenanceV2;
  readonly templateVersion: string;
  readonly reasoningPolicyVersion: string;
  readonly retrievalVersion: string;
}): ReasoningRunId {
  return reasoningRunId(`rrn_${hashCanonical(input)}`);
}

export function assertReasoningRunScope(
  run: ReasoningRunV2,
  scope: AnalysisScopeProvenanceV2,
): void {
  const repositories = new Set(scope.repositories.map((repository) => repository.repositoryId));
  invariant(
    run.workspaceId === scope.workspaceId &&
      run.scopeHash === scope.scopeHash &&
      run.citations.every((citation) => repositories.has(citation.repositoryId)) &&
      run.consentDecisions.every((decision) => repositories.has(decision.repositoryId)),
    'authorization_denied',
    'Reasoning run provenance is outside the resolved analysis scope.',
  );
}
