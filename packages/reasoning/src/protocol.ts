import type {
  CommitSha,
  ContentHash,
  EvidenceRangeV2,
  GenerationId,
  ReasoningConfidenceV2,
  ReasoningHypothesisLimitationV2,
  ReasoningProviderProvenanceV2,
  ReasoningSeverityV2,
  RepoPath,
  RepositoryStableId,
  ScopedReadCapability,
  WorkspaceId,
} from '@yanib/reverb-domain';
import type { PortResult, Subject } from '@yanib/reverb-application';

export interface ReasoningEvidenceHandleV1 {
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
}

export interface RetrievedReasoningEvidenceV1 extends ReasoningEvidenceHandleV1 {
  readonly excerpt: string;
}

export interface ReasoningContextV1 extends ReasoningEvidenceHandleV1 {
  readonly excerpt: string;
  readonly excerptHash: ContentHash;
}

export interface ReasoningCandidateV1 {
  readonly severity: ReasoningSeverityV2;
  readonly confidence: ReasoningConfidenceV2;
  readonly producerCitationIds: readonly string[];
  readonly consumerCitationIds: readonly string[];
  readonly limitations: readonly ReasoningHypothesisLimitationV2[];
}

export interface StructuredReasoningRequestV1 {
  readonly schema: 'reverb.reasoning-request';
  readonly schemaVersion: '1.0';
  readonly templateVersion: string;
  readonly reasoningPolicyVersion: string;
  readonly retrievalVersion: string;
  readonly evidence: readonly ReasoningContextV1[];
  readonly maximumCandidates: number;
  readonly maximumOutputTokens: number;
  readonly inputHash: ContentHash;
}

export interface StructuredReasoningResponseV1 {
  readonly schema: 'reverb.reasoning-response';
  readonly schemaVersion: '1.0';
  readonly state: 'complete' | 'refused';
  readonly candidates: readonly ReasoningCandidateV1[];
  readonly modelTokens: number;
}

export interface ReasoningPortV1 {
  reason(request: StructuredReasoningRequestV1, signal: AbortSignal): Promise<unknown>;
}

export interface ReasoningRetrievalPortV1 {
  retrieve(input: {
    readonly capability: ScopedReadCapability;
    readonly handles: readonly ReasoningEvidenceHandleV1[];
    readonly maximumBytes: number;
    readonly signal: AbortSignal;
  }): Promise<PortResult<readonly RetrievedReasoningEvidenceV1[]>>;
}

export interface ReasoningConsentDecisionV1 {
  readonly allowed: boolean;
  readonly revision: string;
  readonly decisionHash: ContentHash;
}

export interface ReasoningConsentPortV1 {
  authorize(input: {
    readonly subject: Subject;
    readonly workspaceId: WorkspaceId;
    readonly repositoryId: RepositoryStableId;
    readonly scopeHash: ContentHash;
    readonly provider: ReasoningProviderProvenanceV2;
    readonly signal: AbortSignal;
  }): Promise<PortResult<ReasoningConsentDecisionV1>>;
}

export type ReasoningTelemetryEventV1 = {
  readonly type: 'reasoning_completed';
  readonly state: 'complete' | 'partial' | 'failed';
  readonly evidenceCount: number;
  readonly candidateCount: number;
  readonly sourceBytes: number;
  readonly modelTokens: number;
  readonly latencyMs: number;
  readonly limitationCodes: readonly string[];
};

export interface ReasoningTelemetryPortV1 {
  emit(event: ReasoningTelemetryEventV1): void;
}

export interface ReasoningEngineConfigurationV1 {
  readonly provider: ReasoningProviderProvenanceV2;
  readonly templateVersion: string;
  readonly reasoningPolicyVersion: string;
  readonly retrievalVersion: string;
  readonly maximumCandidates: number;
  readonly circuitBreakerFailureThreshold: number;
  readonly circuitBreakerCooldownMs: number;
}
