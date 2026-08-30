import { hashCanonical } from './canonical.js';
import {
  contentHash,
  findingFingerprint,
  findingOccurrenceId,
  type AnalysisId,
  type CommitSha,
  type ContentHash,
  type FindingFingerprint,
  type FindingOccurrenceId,
  type Instant,
  type PolicyRevision,
  type RegistryRevision,
  type RepositoryStableId,
  type WorkspaceId,
} from './values.js';
import type { AbstentionReason, AnalysisState } from './vocabularies.js';
import type { ConsumerGenerationSelection, EvidenceEdge, IndexedContractChange } from './graph.js';

export interface FindingClaims {
  readonly edge: 'candidate' | 'abstained';
  readonly impact: 'breaking' | 'potentially_breaking' | 'compatible' | 'unknown';
  readonly action: 'coordinate' | 'review' | 'none';
}

export interface FindingAbstention {
  readonly fingerprint?: FindingFingerprint;
  readonly consumerRepositoryId: RepositoryStableId;
  readonly reason: AbstentionReason;
  readonly safeMessage: string;
}

export interface FindingOccurrence {
  readonly id: FindingOccurrenceId;
  readonly analysisId: AnalysisId;
  readonly fingerprint: FindingFingerprint;
  readonly state: Extract<AnalysisState, 'CANDIDATE' | 'ABSTAINED' | 'PREVIEW'>;
  readonly change: IndexedContractChange;
  readonly edge: EvidenceEdge;
  readonly consumer: ConsumerGenerationSelection;
  readonly claims: FindingClaims;
  readonly coverageDependencies: readonly string[];
  readonly remedy: IndexedContractChange['remedy'];
  readonly delivery:
    | { readonly decision: 'preview_only'; readonly reason: 'stratum_unmeasured' }
    | {
        readonly decision: 'suppressed';
        readonly reason: 'matched_active_suppression';
        readonly suppressionRuleId: string;
      };
}

export interface AnalysisResult {
  readonly schema: 'reverb.analysis-result';
  readonly schemaVersion: '1.0';
  readonly analysisId: AnalysisId;
  readonly workspaceId: WorkspaceId;
  readonly producerRepositoryId: RepositoryStableId;
  readonly pullRequest: {
    readonly provider: 'local' | 'github';
    readonly number?: number;
    readonly baseSha: CommitSha;
    readonly headSha: CommitSha;
  };
  readonly registryRevision: RegistryRevision;
  readonly policyRevision: PolicyRevision;
  readonly policyMajor: number;
  readonly state: 'complete' | 'partial' | 'superseded' | 'not_analysed';
  readonly current: boolean;
  readonly consumers: readonly ConsumerGenerationSelection[];
  readonly findings: readonly FindingOccurrence[];
  readonly abstentions: readonly FindingAbstention[];
  readonly startedAt: Instant;
  readonly completedAt: Instant;
  readonly outputHash: ContentHash;
}

export function fingerprintFinding(input: {
  readonly workspaceId: WorkspaceId;
  readonly producerRepositoryId: RepositoryStableId;
  readonly change: Pick<IndexedContractChange, 'contractKind' | 'canonicalKey' | 'changeKind'>;
  readonly edge: Pick<EvidenceEdge, 'consumerRepositoryId' | 'stableReferenceId'>;
  readonly policyMajor: number;
}): FindingFingerprint {
  return findingFingerprint(
    `fnd_${hashCanonical({
      workspaceId: input.workspaceId,
      producerRepositoryId: input.producerRepositoryId,
      contractKind: input.change.contractKind,
      canonicalKey: input.change.canonicalKey,
      changeKind: input.change.changeKind,
      consumerRepositoryId: input.edge.consumerRepositoryId,
      stableReferenceId: input.edge.stableReferenceId,
      policyMajor: input.policyMajor,
    })}`,
  );
}

function occurrenceId(
  analysisId: AnalysisId,
  fingerprint: FindingFingerprint,
  baseSha: CommitSha,
  headSha: CommitSha,
): FindingOccurrenceId {
  return findingOccurrenceId(`occ_${hashCanonical({ analysisId, fingerprint, baseSha, headSha })}`);
}

function abstentionFor(selection: ConsumerGenerationSelection): AbstentionReason | undefined {
  if (selection.state === 'stale') return 'stale_consumer_generation';
  if (selection.state === 'unsupported') return 'unsupported_language';
  if (selection.state === 'unauthorized') return 'privacy_restricted';
  if (selection.state === 'failed' || selection.state === 'not_indexed') return 'incomplete_index';
  return undefined;
}

export function createFindingOccurrences(input: {
  readonly analysisId: AnalysisId;
  readonly workspaceId: WorkspaceId;
  readonly producerRepositoryId: RepositoryStableId;
  readonly baseSha: CommitSha;
  readonly headSha: CommitSha;
  readonly policyMajor: number;
  readonly changes: readonly IndexedContractChange[];
  readonly edges: readonly EvidenceEdge[];
  readonly consumers: readonly ConsumerGenerationSelection[];
}): {
  readonly findings: readonly FindingOccurrence[];
  readonly abstentions: readonly FindingAbstention[];
} {
  const changes = new Map(
    input.changes.map((change) => [`${change.contractKind}\0${change.canonicalKey}`, change]),
  );
  const selections = new Map(
    input.consumers.map((selection) => [selection.repositoryId, selection]),
  );
  const findings: FindingOccurrence[] = [];
  const abstentions: FindingAbstention[] = [];
  for (const edge of input.edges) {
    const change = changes.get(`${edge.contractKind}\0${edge.definitionKey}`);
    const consumer = selections.get(edge.consumerRepositoryId);
    if (change === undefined || consumer === undefined) continue;
    const fingerprint = fingerprintFinding({
      workspaceId: input.workspaceId,
      producerRepositoryId: input.producerRepositoryId,
      change,
      edge,
      policyMajor: input.policyMajor,
    });
    const selectionAbstention = abstentionFor(consumer);
    const producerIncomplete =
      change.coverageState !== 'complete' && /removed|deleted/.test(change.changeKind);
    const reason = producerIncomplete ? 'incomplete_index' : selectionAbstention;
    if (reason !== undefined) {
      abstentions.push({
        fingerprint,
        consumerRepositoryId: consumer.repositoryId,
        reason,
        safeMessage: producerIncomplete
          ? 'Producer coverage is incomplete for a removal-sensitive claim.'
          : 'Consumer snapshot cannot support a current impact claim.',
      });
    }
    const claims: FindingClaims = {
      edge: reason === undefined ? 'candidate' : 'abstained',
      impact: change.compatibility,
      action:
        change.compatibility === 'breaking' || change.compatibility === 'potentially_breaking'
          ? 'coordinate'
          : change.compatibility === 'unknown'
            ? 'review'
            : 'none',
    };
    findings.push({
      id: occurrenceId(input.analysisId, fingerprint, input.baseSha, input.headSha),
      analysisId: input.analysisId,
      fingerprint,
      state: reason === undefined ? 'PREVIEW' : 'ABSTAINED',
      change,
      edge,
      consumer,
      claims,
      coverageDependencies: [
        ...new Set([...change.coverageDependencies, `consumer:${consumer.state}`]),
      ].sort(),
      remedy: change.remedy,
      delivery: { decision: 'preview_only', reason: 'stratum_unmeasured' },
    });
  }
  return {
    findings: findings.sort((left, right) => left.fingerprint.localeCompare(right.fingerprint)),
    abstentions: abstentions.sort((left, right) =>
      `${left.consumerRepositoryId}\0${left.reason}`.localeCompare(
        `${right.consumerRepositoryId}\0${right.reason}`,
      ),
    ),
  };
}

export function finalizeAnalysisResult(input: Omit<AnalysisResult, 'outputHash'>): AnalysisResult {
  const canonical = {
    ...input,
    consumers: [...input.consumers].sort((left, right) =>
      left.repositoryId.localeCompare(right.repositoryId),
    ),
    findings: [...input.findings].sort((left, right) =>
      left.fingerprint.localeCompare(right.fingerprint),
    ),
    abstentions: [...input.abstentions].sort((left, right) =>
      `${left.consumerRepositoryId}\0${left.reason}`.localeCompare(
        `${right.consumerRepositoryId}\0${right.reason}`,
      ),
    ),
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

export function analysisSupersessionKey(input: {
  readonly workspaceId: WorkspaceId;
  readonly producerRepositoryId: RepositoryStableId;
  readonly provider: 'local' | 'github';
  readonly pullRequestNumber?: number;
  readonly policyMajor: number;
}): ContentHash {
  return contentHash(hashCanonical(input));
}
