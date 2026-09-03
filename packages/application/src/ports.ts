import type {
  AnalysisId,
  AnalysisResult,
  AnalysisResultV2,
  AdapterGenerationSnapshot,
  AdapterId,
  AdapterSemanticPartition,
  ArtifactBatch,
  BeginGeneration,
  BlobResult,
  BoundedDiagnostic,
  CommitDescriptor,
  CommitSha,
  ConfigRevision,
  ConsumerGenerationSelection,
  ContractGenerationObservation,
  ContentHash,
  CoverageRecord,
  DiffManifest,
  EvidenceEdge,
  FileArtifact,
  FindingFingerprint,
  FindingOccurrence,
  GenerationFailure,
  GenerationId,
  GenerationLease,
  GenerationLeaseId,
  GenerationSummary,
  IndexedContractDefinition,
  IndexedContractReference,
  Instant,
  JobId,
  OverlayEntry,
  OverlayId,
  PullRequestOverlay,
  RegistryRevision,
  RegistrySnapshot,
  RepositoryAction,
  RepositoryDescriptor,
  RepositoryGeneration,
  RepositoryStableId,
  ReasoningRunId,
  ReasoningRunV2,
  ReviewEvent,
  ReviewEventId,
  SuppressionRule,
  SuppressionStateEvent,
  PromotionRecord,
  CorpusManifest,
  ImpactCase,
  EvaluationReport,
  TreeManifest,
  WorkspaceId,
} from '@yanib/reverb-domain';

export type PortFailureKind =
  | 'domain'
  | 'infrastructure'
  | 'authorization_denied'
  | 'incomplete_provider_data'
  | 'cancelled'
  | 'not_found'
  | 'conflict';

export interface PortFailure {
  readonly kind: PortFailureKind;
  readonly code: string;
  readonly safeMessage: string;
  readonly retryable: boolean;
}

export type PortResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly failure: PortFailure };

export const portSuccess = <Value>(value: Value): PortResult<Value> => ({ ok: true, value });
export const portFailure = (failure: PortFailure): PortResult<never> => ({ ok: false, failure });

export interface RepositoryReader {
  resolveRepository(id: RepositoryStableId): Promise<PortResult<RepositoryDescriptor>>;
  resolveCommit(id: RepositoryStableId, ref: string): Promise<PortResult<CommitDescriptor>>;
  listTree(id: RepositoryStableId, sha: CommitSha): Promise<PortResult<TreeManifest>>;
  readBlob(
    id: RepositoryStableId,
    sha: CommitSha,
    path: FileArtifact['path'],
    maximumBytes: number,
  ): Promise<PortResult<BlobResult>>;
  compare(
    id: RepositoryStableId,
    base: CommitSha,
    head: CommitSha,
  ): Promise<PortResult<DiffManifest>>;
}

export interface GenerationSelection {
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly commitSha?: CommitSha;
  readonly indexerBundleVersion?: string;
  readonly configRevision?: ConfigRevision;
  readonly allowPartial: boolean;
}

export type GenerationSelectionResult =
  | { readonly state: 'selected'; readonly generation: RepositoryGeneration }
  | { readonly state: 'not_indexed' }
  | { readonly state: 'failed'; readonly generation: RepositoryGeneration };

export interface BeginOverlay {
  readonly overlay: PullRequestOverlay;
  readonly leaseId: GenerationLeaseId;
  readonly leaseExpiresAt: Instant;
}

export interface OverlaySummary {
  readonly state: 'complete' | 'partial';
  readonly completedAt: Instant;
  readonly resultHash: ContentHash;
}

export interface DeriveGeneration {
  readonly generationId: GenerationId;
  readonly baseGenerationId: GenerationId;
  readonly overlayId: OverlayId;
  readonly completedAt: Instant;
  readonly coverage: readonly CoverageRecord[];
  readonly diagnostics: readonly BoundedDiagnostic[];
  readonly coverageHash: ContentHash;
  readonly artifactResultHash: ContentHash;
}

export interface GenerationStore {
  beginGeneration(input: BeginGeneration): Promise<PortResult<GenerationLease>>;
  putArtifacts(lease: GenerationLease, batch: ArtifactBatch): Promise<PortResult<void>>;
  completeGeneration(
    lease: GenerationLease,
    summary: GenerationSummary,
  ): Promise<PortResult<GenerationId>>;
  failGeneration(lease: GenerationLease, failure: GenerationFailure): Promise<PortResult<void>>;
  expireLease(lease: GenerationLease, at: Instant): Promise<PortResult<void>>;
  getGeneration(id: GenerationId): Promise<PortResult<RepositoryGeneration>>;
  deriveGeneration(input: DeriveGeneration): Promise<PortResult<RepositoryGeneration>>;
  selectGeneration(query: GenerationSelection): Promise<PortResult<GenerationSelectionResult>>;
  listArtifacts(generationId: GenerationId): Promise<PortResult<readonly FileArtifact[]>>;
  getGenerationCoverage(generationId: GenerationId): Promise<PortResult<readonly CoverageRecord[]>>;
  getGenerationDiagnostics(
    generationId: GenerationId,
  ): Promise<PortResult<readonly BoundedDiagnostic[]>>;
  beginOverlay(input: BeginOverlay): Promise<PortResult<GenerationLease>>;
  putOverlayEntries(
    lease: GenerationLease,
    overlayId: OverlayId,
    entries: readonly OverlayEntry[],
  ): Promise<PortResult<void>>;
  completeOverlay(
    lease: GenerationLease,
    overlayId: OverlayId,
    summary: OverlaySummary,
  ): Promise<PortResult<OverlayId>>;
  failOverlay(
    lease: GenerationLease,
    overlayId: OverlayId,
    failure: GenerationFailure,
  ): Promise<PortResult<void>>;
  getOverlay(id: OverlayId): Promise<PortResult<PullRequestOverlay>>;
  listOverlayEntries(id: OverlayId): Promise<PortResult<readonly OverlayEntry[]>>;
}

export interface AdapterSnapshotQuery {
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly generationId: GenerationId;
  readonly adapterId: AdapterId;
}

export interface AdapterSnapshotStore {
  putAdapterPartition(partition: AdapterSemanticPartition): Promise<PortResult<ContentHash>>;
  getAdapterPartition(
    workspaceId: WorkspaceId,
    outputHash: ContentHash,
  ): Promise<PortResult<AdapterSemanticPartition | null>>;
  putAdapterSnapshot(snapshot: AdapterGenerationSnapshot): Promise<PortResult<ContentHash>>;
  getAdapterSnapshot(
    query: AdapterSnapshotQuery,
  ): Promise<PortResult<AdapterGenerationSnapshot | null>>;
  getAdapterSnapshotByHash(
    workspaceId: WorkspaceId,
    outputHash: ContentHash,
  ): Promise<PortResult<AdapterGenerationSnapshot | null>>;
  resolveAdapterPartitions(
    query: AdapterSnapshotQuery,
  ): Promise<PortResult<readonly AdapterSemanticPartition[]>>;
}

export interface CanonicalRecord {
  readonly schema: string;
  readonly schemaVersion: string;
  readonly workspaceId: WorkspaceId;
  readonly payloadHash: ContentHash;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface EvidenceStore {
  readRecords(query: {
    workspaceId: WorkspaceId;
    schema: string;
    generationId?: GenerationId;
  }): AsyncIterable<PortResult<CanonicalRecord>>;
  persistAnalysis(
    result: CanonicalRecord & { readonly analysisId: AnalysisId },
  ): Promise<PortResult<void>>;
  appendReview(
    event: CanonicalRecord & { readonly reviewEventId: ReviewEventId },
  ): Promise<PortResult<void>>;
}

export interface DefinitionQuery {
  readonly workspaceId: WorkspaceId;
  readonly generationId?: GenerationId;
  readonly repositoryId?: RepositoryStableId;
  readonly contractKind?: IndexedContractDefinition['contractKind'];
  readonly canonicalKeys?: readonly string[];
}

export interface ReferenceQuery {
  readonly workspaceId: WorkspaceId;
  readonly generationIds?: readonly GenerationId[];
  readonly repositoryId?: RepositoryStableId;
  readonly contractKind?: IndexedContractReference['contractKind'];
  readonly canonicalKeys?: readonly string[];
}

export interface EdgeQuery {
  readonly workspaceId: WorkspaceId;
  readonly producerRepositoryId?: RepositoryStableId;
  readonly consumerRepositoryId?: RepositoryStableId;
  readonly canonicalKeys?: readonly string[];
  readonly currentAt?: Instant;
  readonly freshnessTtlMs?: number;
}

export interface EvidenceGraphStore {
  putContractObservation(observation: ContractGenerationObservation): Promise<PortResult<void>>;
  getContractObservation(
    generationId: GenerationId,
  ): Promise<PortResult<ContractGenerationObservation | null>>;
  readDefinitions(
    query: DefinitionQuery,
  ): Promise<PortResult<readonly IndexedContractDefinition[]>>;
  readReferences(query: ReferenceQuery): Promise<PortResult<readonly IndexedContractReference[]>>;
  observeEdges(edges: readonly EvidenceEdge[]): Promise<PortResult<void>>;
  readEdges(query: EdgeQuery): Promise<PortResult<readonly EvidenceEdge[]>>;
  rebuildServiceEdges(workspaceId: WorkspaceId): Promise<PortResult<number>>;
  persistAnalysis(result: AnalysisResult, supersessionKey: ContentHash): Promise<PortResult<void>>;
  getAnalysis(analysisId: AnalysisId): Promise<PortResult<AnalysisResult>>;
  getCurrentAnalysis(supersessionKey: ContentHash): Promise<PortResult<AnalysisResult | null>>;
  findFinding(
    workspaceId: WorkspaceId,
    fingerprint: FindingFingerprint,
  ): Promise<
    PortResult<{ readonly analysis: AnalysisResult; readonly finding: FindingOccurrence }>
  >;
}

export interface AnalysisResultStoreV2 {
  persistAnalysisV2(
    result: AnalysisResultV2,
    reasoningRun?: ReasoningRunV2,
  ): Promise<PortResult<void>>;
  getAnalysisV2(
    workspaceId: WorkspaceId,
    analysisId: AnalysisId,
  ): Promise<PortResult<AnalysisResultV2 | null>>;
}

export interface ReasoningRunStoreV2 {
  getReasoningRunV2(
    workspaceId: WorkspaceId,
    reasoningRunId: ReasoningRunId,
  ): Promise<PortResult<ReasoningRunV2 | null>>;
  purgeReasoningRunV2(
    workspaceId: WorkspaceId,
    reasoningRunId: ReasoningRunId,
    deletedAt: Instant,
  ): Promise<PortResult<ReasoningRunV2 | null>>;
}

export interface ReviewEvaluationStore {
  appendReview(input: {
    readonly event: ReviewEvent;
    readonly suppression?: SuppressionRule;
  }): Promise<PortResult<void>>;
  listReviews(
    workspaceId: WorkspaceId,
    fingerprint: FindingFingerprint,
  ): Promise<PortResult<readonly ReviewEvent[]>>;
  appendSuppressionState(event: SuppressionStateEvent): Promise<PortResult<void>>;
  listSuppressions(workspaceId: WorkspaceId): Promise<PortResult<readonly SuppressionRule[]>>;
  listSuppressionStateEvents(
    workspaceId: WorkspaceId,
  ): Promise<PortResult<readonly SuppressionStateEvent[]>>;
  putCorpus(manifest: CorpusManifest, cases: readonly ImpactCase[]): Promise<PortResult<void>>;
  getCorpus(
    revision: ContentHash,
  ): Promise<
    PortResult<{ readonly manifest: CorpusManifest; readonly cases: readonly ImpactCase[] }>
  >;
  putEvaluationReport(report: EvaluationReport): Promise<PortResult<void>>;
  getEvaluationReport(outputHash: ContentHash): Promise<PortResult<EvaluationReport>>;
  appendPromotion(record: PromotionRecord): Promise<PortResult<void>>;
  listPromotions(stratumKey: string): Promise<PortResult<readonly PromotionRecord[]>>;
}

export interface ConsumerRefreshRequest {
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly maximumDurationMs: number;
}

export interface ConsumerRefreshPort {
  refresh(request: ConsumerRefreshRequest): Promise<PortResult<ConsumerGenerationSelection | null>>;
}

export interface WorkspaceRegistry {
  getRevision(
    workspace: WorkspaceId,
    revision: RegistryRevision,
  ): Promise<PortResult<RegistrySnapshot>>;
  getCurrentRevision(workspace: WorkspaceId): Promise<PortResult<RegistrySnapshot>>;
  putRevision(snapshot: RegistrySnapshot): Promise<PortResult<RegistryRevision>>;
}

export interface Subject {
  readonly kind: 'user' | 'service' | 'workspace';
  readonly id: string;
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly revision: RegistryRevision;
}

export interface DisclosureRequest {
  readonly workspaceId: WorkspaceId;
  readonly destinationRepositoryId: RepositoryStableId;
  readonly audience: 'static' | 'personalized';
  readonly viewer?: Subject;
  readonly requestedFields: readonly (
    | 'repository_identity'
    | 'contract_identity'
    | 'location'
    | 'snippet'
  )[];
}

export interface DisclosureProjection {
  readonly allowedFields: readonly string[];
  readonly omittedFields: readonly string[];
  readonly decisionHash: ContentHash;
  readonly registryRevision: RegistryRevision;
}

export interface AuthorizationPort {
  authorizeRepositoryUse(
    subject: Subject,
    action: RepositoryAction,
    repository: RepositoryStableId,
  ): Promise<PortResult<AuthorizationDecision>>;
  projectDisclosure(input: DisclosureRequest): Promise<PortResult<DisclosureProjection>>;
}

export type JobKind =
  | 'index_generation'
  | 'create_overlay'
  | 'analyze_pull_request'
  | 'purge_repository'
  | 'reconcile_provider';

export interface DurableJob<Payload = Readonly<Record<string, unknown>>> {
  readonly workspaceId: WorkspaceId;
  readonly kind: JobKind;
  readonly idempotencyKey: ContentHash;
  readonly payload: Payload;
  readonly availableAt: Instant;
  readonly maximumAttempts: number;
}

export interface WorkerIdentity {
  readonly id: string;
}

export interface JobClaim {
  readonly jobId: JobId;
  readonly worker: WorkerIdentity;
  readonly leaseExpiresAt: Instant;
}

export interface ClaimedJob {
  readonly claim: JobClaim;
  readonly job: DurableJob;
  readonly attempt: number;
}

export interface JobResult {
  readonly resultHash: ContentHash;
}

export interface JobFailure {
  readonly code: string;
  readonly safeMessage: string;
  readonly retryable: boolean;
}

export interface JobQueue {
  enqueue<Payload>(job: DurableJob<Payload>): Promise<PortResult<JobId>>;
  claim(worker: WorkerIdentity, kinds: readonly JobKind[]): Promise<PortResult<ClaimedJob | null>>;
  heartbeat(claim: JobClaim): Promise<PortResult<void>>;
  complete(claim: JobClaim, result: JobResult): Promise<PortResult<void>>;
  fail(claim: JobClaim, failure: JobFailure): Promise<PortResult<void>>;
}

export interface CancellationPort {
  isCurrent(key: ContentHash): Promise<PortResult<boolean>>;
}

export interface Clock {
  now(): Instant;
}

export interface SandboxedToolRequest {
  readonly toolId: string;
  readonly argv: readonly string[];
  readonly inputRefs: readonly string[];
  readonly timeoutMs: number;
  readonly maximumOutputBytes: number;
  readonly network: false;
}

export interface SandboxedToolResult {
  readonly exitCode: number | null;
  readonly stdout: Uint8Array;
  readonly stderrCode: string | null;
  readonly timedOut: boolean;
  readonly outputTruncated: boolean;
}

export interface SandboxRunner {
  run(request: SandboxedToolRequest): Promise<PortResult<SandboxedToolResult>>;
}

export interface CheckWrite {
  readonly idempotencyKey: ContentHash;
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly headSha: CommitSha;
  readonly conclusion: 'success' | 'neutral' | 'skipped';
  readonly projectionHash: ContentHash;
  readonly projection: Readonly<Record<string, unknown>>;
}

export interface ExternalDeliveryRef {
  readonly provider: string;
  readonly externalId: string;
}

export interface DeliveryWriter {
  upsertPullRequestCheck(write: CheckWrite): Promise<PortResult<ExternalDeliveryRef>>;
}

export type RetentionClass = 'ephemeral_source' | 'derived_generation' | 'uploaded_index';

export interface BlobRef {
  readonly workspaceId: WorkspaceId;
  readonly hash: ContentHash;
  readonly retentionClass: RetentionClass;
}

export interface ArtifactBlobStore {
  put(
    workspaceId: WorkspaceId,
    hash: ContentHash,
    bytes: Uint8Array,
    policy: RetentionClass,
  ): Promise<PortResult<BlobRef>>;
  get(ref: BlobRef): Promise<PortResult<Uint8Array>>;
  delete(ref: BlobRef): Promise<PortResult<void>>;
}

export interface ArtifactCacheKey {
  readonly workspaceId: WorkspaceId;
  readonly sourceBlobId: string;
  readonly indexerBundleVersion: string;
  readonly parserId: string;
  readonly parserVersion: string;
  readonly configRevision: ConfigRevision;
}

export interface CachedArtifact {
  readonly key: ArtifactCacheKey;
  readonly artifact: Omit<FileArtifact, 'generationId' | 'path' | 'reusedFromGenerationId'>;
}

export interface ArtifactCachePort {
  get(key: ArtifactCacheKey): Promise<PortResult<CachedArtifact | null>>;
  put(value: CachedArtifact): Promise<PortResult<void>>;
}

export type AllowedTelemetryEvent =
  | {
      readonly type: 'generation_completed';
      readonly state: 'complete' | 'partial';
      readonly fileCount: number;
      readonly reusedCount: number;
      readonly durationMs: number;
    }
  | {
      readonly type: 'generation_failed';
      readonly reason: string;
      readonly durationMs: number;
    }
  | {
      readonly type: 'overlay_completed';
      readonly state: 'complete' | 'partial';
      readonly changedFileCount: number;
      readonly durationMs: number;
    };

export interface TelemetryPort {
  emit(event: AllowedTelemetryEvent): void;
}
