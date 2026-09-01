import {
  contentHash,
  hashCanonical,
  jobId,
  materializeOverlayArtifacts,
  type ArtifactBatch,
  type BoundedDiagnostic,
  type CommitDescriptor,
  type CommitSha,
  type DiffManifest,
  type CoverageRecord,
  type FileArtifact,
  type GenerationId,
  type GenerationLease,
  type Instant,
  type JobId,
  type OverlayEntry,
  type OverlayId,
  type PullRequestOverlay,
  type RegistryRevision,
  type RegistrySnapshot,
  type RepositoryDescriptor,
  type RepositoryGeneration,
  type RepositoryStableId,
  type TreeManifest,
  type WorkspaceId,
} from '@yanib/reverb-domain';
import {
  portFailure,
  portSuccess,
  type AllowedTelemetryEvent,
  type ArtifactBlobStore,
  type ArtifactCacheKey,
  type ArtifactCachePort,
  type AuthorizationDecision,
  type AuthorizationPort,
  type BeginOverlay,
  type BlobRef,
  type CachedArtifact,
  type CancellationPort,
  type CheckWrite,
  type ClaimedJob,
  type Clock,
  type DeliveryWriter,
  type DeriveGeneration,
  type DisclosureProjection,
  type DisclosureRequest,
  type DurableJob,
  type EvidenceStore,
  type ExternalDeliveryRef,
  type GenerationSelection,
  type GenerationSelectionResult,
  type GenerationStore,
  type JobClaim,
  type JobFailure,
  type JobKind,
  type JobQueue,
  type JobResult,
  type OverlaySummary,
  type PortResult,
  type RepositoryReader,
  type RetentionClass,
  type SandboxedToolRequest,
  type SandboxedToolResult,
  type SandboxRunner,
  type Subject,
  type TelemetryPort,
  type WorkerIdentity,
  type WorkspaceRegistry,
  type CanonicalRecord,
} from '@yanib/reverb-application';
import type {
  BeginGeneration,
  BlobResult,
  GenerationFailure,
  GenerationSummary,
  RepositoryAction,
  ReviewEventId,
  AnalysisId,
} from '@yanib/reverb-domain';

const notFound = (subject: string) =>
  portFailure({
    kind: 'not_found',
    code: 'not_found',
    safeMessage: `${subject} was not found.`,
    retryable: false,
  });

const conflict = (message: string) =>
  portFailure({
    kind: 'conflict',
    code: 'invalid_state_transition',
    safeMessage: message,
    retryable: false,
  });

function leaseMatches(stored: GenerationLease, supplied: GenerationLease): boolean {
  return stored.generationId === supplied.generationId && stored.leaseId === supplied.leaseId;
}

export class FakeClock implements Clock {
  public constructor(private current: Instant) {}

  public now(): Instant {
    return this.current;
  }

  public set(now: Instant): void {
    this.current = now;
  }
}

export class InMemoryGenerationStore implements GenerationStore {
  readonly #generations = new Map<GenerationId, RepositoryGeneration>();
  readonly #leases = new Map<GenerationId, GenerationLease>();
  readonly #artifactBatches = new Map<GenerationId, ArtifactBatch[]>();
  readonly #selected = new Map<string, GenerationId>();
  readonly #overlays = new Map<OverlayId, PullRequestOverlay>();
  readonly #overlayLeases = new Map<OverlayId, GenerationLease>();
  readonly #overlayEntries = new Map<OverlayId, OverlayEntry[]>();

  public async beginGeneration(input: BeginGeneration): Promise<PortResult<GenerationLease>> {
    const existingLease = this.#leases.get(input.generationId);
    if (existingLease) return portSuccess({ ...existingLease, existing: true });
    const generation: RepositoryGeneration = {
      id: input.generationId,
      workspaceId: input.workspaceId,
      repositoryId: input.repositoryId,
      commitSha: input.commitSha,
      treeHash: input.treeHash,
      indexerBundleVersion: input.indexerBundleVersion,
      configRevision: input.configRevision,
      registryRevision: input.registryRevision,
      state: 'building',
      startedAt: input.startedAt,
      selectable: false,
    };
    const lease: GenerationLease = {
      generationId: input.generationId,
      leaseId: input.leaseId,
      expiresAt: input.leaseExpiresAt,
      existing: false,
    };
    this.#generations.set(input.generationId, generation);
    this.#leases.set(input.generationId, lease);
    this.#artifactBatches.set(input.generationId, []);
    return portSuccess(lease);
  }

  public async putArtifacts(
    lease: GenerationLease,
    batch: ArtifactBatch,
  ): Promise<PortResult<void>> {
    const stored = this.#leases.get(lease.generationId);
    const generation = this.#generations.get(lease.generationId);
    if (!stored || !generation || !leaseMatches(stored, lease) || generation.state !== 'building') {
      return conflict('Artifact write requires the active building lease.');
    }
    if (batch.artifacts.some((artifact) => artifact.generationId !== lease.generationId)) {
      return conflict('Artifact belongs to a different generation.');
    }
    this.#artifactBatches.get(lease.generationId)!.push(batch);
    return portSuccess(undefined);
  }

  public async completeGeneration(
    lease: GenerationLease,
    summary: GenerationSummary,
  ): Promise<PortResult<GenerationId>> {
    const stored = this.#leases.get(lease.generationId);
    const generation = this.#generations.get(lease.generationId);
    if (!stored || !generation || !leaseMatches(stored, lease) || generation.state !== 'building') {
      return conflict('Generation completion requires the active building lease.');
    }
    const completed: RepositoryGeneration = {
      ...generation,
      state: summary.state,
      completedAt: summary.completedAt,
      coverageHash: summary.coverageHash,
      artifactResultHash: summary.artifactResultHash,
      selectable: summary.selectable,
    };
    this.#generations.set(generation.id, completed);
    this.#leases.delete(generation.id);
    if (summary.selectable) {
      this.#selected.set(`${generation.workspaceId}|${generation.repositoryId}`, generation.id);
    }
    return portSuccess(generation.id);
  }

  public async failGeneration(
    lease: GenerationLease,
    failure: GenerationFailure,
  ): Promise<PortResult<void>> {
    const stored = this.#leases.get(lease.generationId);
    const generation = this.#generations.get(lease.generationId);
    if (!stored || !generation || !leaseMatches(stored, lease) || generation.state !== 'building') {
      return conflict('Generation failure requires the active building lease.');
    }
    this.#generations.set(generation.id, {
      ...generation,
      state: 'failed',
      completedAt: failure.failedAt,
      selectable: false,
    });
    this.#leases.delete(generation.id);
    return portSuccess(undefined);
  }

  public async expireLease(lease: GenerationLease, at: Instant): Promise<PortResult<void>> {
    const stored = this.#leases.get(lease.generationId);
    const generation = this.#generations.get(lease.generationId);
    if (!stored || !generation || !leaseMatches(stored, lease))
      return conflict('Lease is not active.');
    this.#generations.set(generation.id, {
      ...generation,
      state: 'expired',
      completedAt: at,
      selectable: false,
    });
    this.#leases.delete(generation.id);
    return portSuccess(undefined);
  }

  public async getGeneration(id: GenerationId): Promise<PortResult<RepositoryGeneration>> {
    const generation = this.#generations.get(id);
    return generation ? portSuccess(generation) : notFound('Generation');
  }

  public async deriveGeneration(
    input: DeriveGeneration,
  ): Promise<PortResult<RepositoryGeneration>> {
    const existing = this.#generations.get(input.generationId);
    if (existing) {
      const sameDerivation =
        existing.derivation?.baseGenerationId === input.baseGenerationId &&
        existing.derivation.overlayId === input.overlayId &&
        existing.coverageHash === input.coverageHash &&
        existing.artifactResultHash === input.artifactResultHash;
      return sameDerivation
        ? portSuccess(existing)
        : conflict('Generation ID was reused for a different derivation.');
    }
    if (input.generationId === input.baseGenerationId) {
      return conflict('A derived generation cannot be its own base.');
    }
    const base = this.#generations.get(input.baseGenerationId);
    const overlay = this.#overlays.get(input.overlayId);
    if (!base || (base.state !== 'complete' && base.state !== 'partial')) {
      return conflict('Derived generation requires a completed base generation.');
    }
    if (!overlay || (overlay.state !== 'complete' && overlay.state !== 'partial')) {
      return conflict('Derived generation requires a completed overlay.');
    }
    const compatible =
      overlay.baseGenerationId === base.id &&
      overlay.workspaceId === base.workspaceId &&
      overlay.repositoryId === base.repositoryId &&
      overlay.baseSha === base.commitSha &&
      overlay.indexerBundleVersion === base.indexerBundleVersion &&
      overlay.configRevision === base.configRevision &&
      overlay.registryRevision === base.registryRevision;
    if (!compatible) {
      return conflict('Overlay is incompatible with its requested base generation.');
    }
    const generation: RepositoryGeneration = {
      id: input.generationId,
      workspaceId: base.workspaceId,
      repositoryId: base.repositoryId,
      commitSha: overlay.headSha,
      treeHash: overlay.headTreeHash,
      indexerBundleVersion: overlay.indexerBundleVersion,
      configRevision: overlay.configRevision,
      registryRevision: overlay.registryRevision,
      state: base.state === 'partial' || overlay.state === 'partial' ? 'partial' : 'complete',
      startedAt: overlay.startedAt,
      completedAt: input.completedAt,
      coverageHash: input.coverageHash,
      artifactResultHash: input.artifactResultHash,
      selectable: false,
      derivation: {
        baseGenerationId: base.id,
        overlayId: overlay.id,
        storageMode: 'base_overlay',
      },
    };
    this.#generations.set(generation.id, generation);
    this.#artifactBatches.set(generation.id, [
      { artifacts: [], coverage: input.coverage, diagnostics: input.diagnostics },
    ]);
    return portSuccess(generation);
  }

  public async selectGeneration(
    query: GenerationSelection,
  ): Promise<PortResult<GenerationSelectionResult>> {
    const candidates = [...this.#generations.values()].filter(
      (generation) =>
        generation.workspaceId === query.workspaceId &&
        generation.repositoryId === query.repositoryId &&
        (!query.commitSha || generation.commitSha === query.commitSha) &&
        (!query.indexerBundleVersion ||
          generation.indexerBundleVersion === query.indexerBundleVersion) &&
        (!query.configRevision || generation.configRevision === query.configRevision),
    );
    const selectedId = this.#selected.get(`${query.workspaceId}|${query.repositoryId}`);
    const exact = query.commitSha
      ? candidates.find(
          (candidate) =>
            candidate.state === 'complete' || (query.allowPartial && candidate.state === 'partial'),
        )
      : candidates.find((candidate) => candidate.id === selectedId);
    if (exact) return portSuccess({ state: 'selected', generation: exact });
    const failed = candidates.find((candidate) => candidate.state === 'failed');
    return failed
      ? portSuccess({ state: 'failed', generation: failed })
      : portSuccess({ state: 'not_indexed' });
  }

  public async listArtifacts(
    generationId: GenerationId,
  ): Promise<PortResult<readonly FileArtifact[]>> {
    return this.#listArtifacts(generationId, new Set());
  }

  #listArtifacts(
    generationId: GenerationId,
    visited: Set<GenerationId>,
  ): PortResult<readonly FileArtifact[]> {
    const generation = this.#generations.get(generationId);
    if (!generation || (generation.state !== 'complete' && generation.state !== 'partial')) {
      return notFound('Selectable generation artifacts');
    }
    if (!generation.derivation) {
      return portSuccess(
        (this.#artifactBatches.get(generationId) ?? []).flatMap((batch) => [...batch.artifacts]),
      );
    }
    if (visited.has(generationId)) {
      return conflict('Derived generation ancestry contains a cycle.');
    }
    visited.add(generationId);
    const base = this.#listArtifacts(generation.derivation.baseGenerationId, visited);
    visited.delete(generationId);
    if (!base.ok) return base;
    const entries = this.#overlayEntries.get(generation.derivation.overlayId);
    if (!entries) return notFound('Derived generation overlay entries');
    try {
      return portSuccess(materializeOverlayArtifacts(generationId, base.value, entries));
    } catch {
      return conflict('Derived generation overlay entries are invalid.');
    }
  }

  public async getGenerationCoverage(
    generationId: GenerationId,
  ): Promise<PortResult<readonly CoverageRecord[]>> {
    const generation = this.#generations.get(generationId);
    if (!generation || (generation.state !== 'complete' && generation.state !== 'partial')) {
      return notFound('Completed generation coverage');
    }
    return portSuccess(
      (this.#artifactBatches.get(generationId) ?? []).flatMap((batch) => [...batch.coverage]),
    );
  }

  public async getGenerationDiagnostics(
    generationId: GenerationId,
  ): Promise<PortResult<readonly BoundedDiagnostic[]>> {
    const generation = this.#generations.get(generationId);
    if (!generation || (generation.state !== 'complete' && generation.state !== 'partial')) {
      return notFound('Completed generation diagnostics');
    }
    return portSuccess(
      (this.#artifactBatches.get(generationId) ?? []).flatMap((batch) => [...batch.diagnostics]),
    );
  }

  public async beginOverlay(input: BeginOverlay): Promise<PortResult<GenerationLease>> {
    const existing = this.#overlayLeases.get(input.overlay.id);
    if (existing) return portSuccess({ ...existing, existing: true });
    const lease: GenerationLease = {
      generationId: input.overlay.baseGenerationId,
      leaseId: input.leaseId,
      expiresAt: input.leaseExpiresAt,
      existing: false,
    };
    this.#overlays.set(input.overlay.id, input.overlay);
    this.#overlayLeases.set(input.overlay.id, lease);
    this.#overlayEntries.set(input.overlay.id, []);
    return portSuccess(lease);
  }

  public async putOverlayEntries(
    lease: GenerationLease,
    overlayId: OverlayId,
    entries: readonly OverlayEntry[],
  ): Promise<PortResult<void>> {
    const stored = this.#overlayLeases.get(overlayId);
    const overlay = this.#overlays.get(overlayId);
    if (!stored || !overlay || !leaseMatches(stored, lease) || overlay.state !== 'building') {
      return conflict('Overlay write requires the active building lease.');
    }
    this.#overlayEntries.get(overlayId)!.push(...entries);
    return portSuccess(undefined);
  }

  public async completeOverlay(
    lease: GenerationLease,
    overlayId: OverlayId,
    summary: OverlaySummary,
  ): Promise<PortResult<OverlayId>> {
    const stored = this.#overlayLeases.get(overlayId);
    const overlay = this.#overlays.get(overlayId);
    if (!stored || !overlay || !leaseMatches(stored, lease) || overlay.state !== 'building') {
      return conflict('Overlay completion requires the active building lease.');
    }
    this.#overlays.set(overlayId, {
      ...overlay,
      state: summary.state,
      completedAt: summary.completedAt,
      resultHash: summary.resultHash,
    });
    this.#overlayLeases.delete(overlayId);
    return portSuccess(overlayId);
  }

  public async failOverlay(
    lease: GenerationLease,
    overlayId: OverlayId,
    failure: GenerationFailure,
  ): Promise<PortResult<void>> {
    const stored = this.#overlayLeases.get(overlayId);
    const overlay = this.#overlays.get(overlayId);
    if (!stored || !overlay || !leaseMatches(stored, lease) || overlay.state !== 'building') {
      return conflict('Overlay failure requires the active building lease.');
    }
    this.#overlays.set(overlayId, {
      ...overlay,
      state: 'failed',
      completedAt: failure.failedAt,
    });
    this.#overlayLeases.delete(overlayId);
    return portSuccess(undefined);
  }

  public async getOverlay(id: OverlayId): Promise<PortResult<PullRequestOverlay>> {
    const overlay = this.#overlays.get(id);
    return overlay ? portSuccess(overlay) : notFound('Overlay');
  }

  public async listOverlayEntries(id: OverlayId): Promise<PortResult<readonly OverlayEntry[]>> {
    const overlay = this.#overlays.get(id);
    if (!overlay || (overlay.state !== 'complete' && overlay.state !== 'partial')) {
      return notFound('Completed overlay entries');
    }
    return portSuccess(this.#overlayEntries.get(id) ?? []);
  }
}

export class InMemoryRepositoryReader implements RepositoryReader {
  readonly #repositories = new Map<RepositoryStableId, RepositoryDescriptor>();
  readonly #commits = new Map<string, CommitDescriptor>();
  readonly #trees = new Map<string, TreeManifest>();
  readonly #blobs = new Map<string, BlobResult>();
  readonly #diffs = new Map<string, DiffManifest>();

  public addRepository(descriptor: RepositoryDescriptor): void {
    this.#repositories.set(descriptor.id, descriptor);
  }

  public addCommit(descriptor: CommitDescriptor, tree: TreeManifest): void {
    this.#commits.set(`${descriptor.repositoryId}|${descriptor.sha}`, descriptor);
    this.#trees.set(`${descriptor.repositoryId}|${descriptor.sha}`, tree);
  }

  public addRef(repository: RepositoryStableId, ref: string, descriptor: CommitDescriptor): void {
    this.#commits.set(`${repository}|${ref}`, descriptor);
  }

  public addBlob(repository: RepositoryStableId, sha: CommitSha, blob: BlobResult): void {
    this.#blobs.set(`${repository}|${sha}|${blob.path}`, blob);
  }

  public addDiff(diff: DiffManifest): void {
    this.#diffs.set(`${diff.repositoryId}|${diff.baseSha}|${diff.headSha}`, diff);
  }

  public async resolveRepository(
    id: RepositoryStableId,
  ): Promise<PortResult<RepositoryDescriptor>> {
    const descriptor = this.#repositories.get(id);
    return descriptor ? portSuccess(descriptor) : notFound('Repository');
  }

  public async resolveCommit(
    id: RepositoryStableId,
    ref: string,
  ): Promise<PortResult<CommitDescriptor>> {
    const descriptor = this.#commits.get(`${id}|${ref}`);
    return descriptor ? portSuccess(descriptor) : notFound('Commit');
  }

  public async listTree(id: RepositoryStableId, sha: CommitSha): Promise<PortResult<TreeManifest>> {
    const tree = this.#trees.get(`${id}|${sha}`);
    return tree ? portSuccess(tree) : notFound('Tree');
  }

  public async readBlob(
    id: RepositoryStableId,
    sha: CommitSha,
    path: FileArtifact['path'],
    maximumBytes: number,
  ): Promise<PortResult<BlobResult>> {
    const blob = this.#blobs.get(`${id}|${sha}|${path}`);
    if (!blob) return notFound('Blob');
    if (blob.bytes.length <= maximumBytes) return portSuccess(blob);
    return portSuccess({
      ...blob,
      bytes: blob.bytes.slice(0, maximumBytes),
      complete: false,
      truncated: true,
      limitations: [...blob.limitations, { code: 'source_truncated', scope: path }],
    });
  }

  public async compare(
    id: RepositoryStableId,
    base: CommitSha,
    head: CommitSha,
  ): Promise<PortResult<DiffManifest>> {
    const diff = this.#diffs.get(`${id}|${base}|${head}`);
    return diff ? portSuccess(diff) : notFound('Diff');
  }
}

export class InMemoryRegistry implements WorkspaceRegistry {
  readonly #snapshots = new Map<RegistryRevision, RegistrySnapshot>();
  readonly #current = new Map<WorkspaceId, RegistryRevision>();

  public async getRevision(
    workspace: WorkspaceId,
    revision: RegistryRevision,
  ): Promise<PortResult<RegistrySnapshot>> {
    const snapshot = this.#snapshots.get(revision);
    return snapshot && snapshot.revision.workspaceId === workspace
      ? portSuccess(snapshot)
      : notFound('Registry revision');
  }

  public async getCurrentRevision(workspace: WorkspaceId): Promise<PortResult<RegistrySnapshot>> {
    const current = this.#current.get(workspace);
    return current ? this.getRevision(workspace, current) : notFound('Current registry revision');
  }

  public async putRevision(snapshot: RegistrySnapshot): Promise<PortResult<RegistryRevision>> {
    this.#snapshots.set(snapshot.revision.revision, snapshot);
    const current = this.#current.get(snapshot.revision.workspaceId);
    const existing = current ? this.#snapshots.get(current) : undefined;
    if (!existing || existing.revision.sequence < snapshot.revision.sequence) {
      this.#current.set(snapshot.revision.workspaceId, snapshot.revision.revision);
    }
    return portSuccess(snapshot.revision.revision);
  }
}

export class InMemoryArtifactCache implements ArtifactCachePort {
  readonly #values = new Map<string, CachedArtifact>();

  static key(key: ArtifactCacheKey): string {
    return `${key.workspaceId}|${key.sourceBlobId}|${key.indexerBundleVersion}|${key.parserId}|${key.parserVersion}|${key.configRevision}`;
  }

  public async get(key: ArtifactCacheKey): Promise<PortResult<CachedArtifact | null>> {
    return portSuccess(this.#values.get(InMemoryArtifactCache.key(key)) ?? null);
  }

  public async put(value: CachedArtifact): Promise<PortResult<void>> {
    this.#values.set(InMemoryArtifactCache.key(value.key), value);
    return portSuccess(undefined);
  }
}

export class InMemoryAuthorization implements AuthorizationPort {
  readonly #decisions = new Map<string, AuthorizationDecision>();

  public set(
    subject: Subject,
    action: RepositoryAction,
    repository: RepositoryStableId,
    decision: AuthorizationDecision,
  ): void {
    this.#decisions.set(`${subject.kind}|${subject.id}|${action}|${repository}`, decision);
  }

  public async authorizeRepositoryUse(
    subject: Subject,
    action: RepositoryAction,
    repository: RepositoryStableId,
  ): Promise<PortResult<AuthorizationDecision>> {
    return portSuccess(
      this.#decisions.get(`${subject.kind}|${subject.id}|${action}|${repository}`) ?? {
        allowed: false,
        reason: 'default_deny',
        revision:
          'reg_sha256:0000000000000000000000000000000000000000000000000000000000000000' as RegistryRevision,
      },
    );
  }

  public async projectDisclosure(
    input: DisclosureRequest,
  ): Promise<PortResult<DisclosureProjection>> {
    return portSuccess({
      allowedFields: [],
      omittedFields: [...input.requestedFields],
      decisionHash: contentHash(hashCanonical({ audience: input.audience, allowedFields: [] })),
      registryRevision:
        'reg_sha256:0000000000000000000000000000000000000000000000000000000000000000' as RegistryRevision,
    });
  }
}

export class InMemoryCancellation implements CancellationPort {
  readonly #current = new Set<string>();

  public setCurrent(key: string, current: boolean): void {
    if (current) this.#current.add(key);
    else this.#current.delete(key);
  }

  public async isCurrent(key: ReturnType<typeof contentHash>): Promise<PortResult<boolean>> {
    return portSuccess(this.#current.has(key));
  }
}

export class MemoryTelemetry implements TelemetryPort {
  public readonly events: AllowedTelemetryEvent[] = [];

  public emit(event: AllowedTelemetryEvent): void {
    this.events.push(event);
  }
}

export class InMemoryBlobStore implements ArtifactBlobStore {
  readonly #values = new Map<string, Uint8Array>();

  public async put(
    workspaceId: WorkspaceId,
    hash: ReturnType<typeof contentHash>,
    bytes: Uint8Array,
    retentionClass: RetentionClass,
  ): Promise<PortResult<BlobRef>> {
    this.#values.set(`${workspaceId}|${hash}|${retentionClass}`, bytes.slice());
    return portSuccess({ workspaceId, hash, retentionClass });
  }

  public async get(ref: BlobRef): Promise<PortResult<Uint8Array>> {
    const bytes = this.#values.get(`${ref.workspaceId}|${ref.hash}|${ref.retentionClass}`);
    return bytes ? portSuccess(bytes.slice()) : notFound('Blob reference');
  }

  public async delete(ref: BlobRef): Promise<PortResult<void>> {
    this.#values.delete(`${ref.workspaceId}|${ref.hash}|${ref.retentionClass}`);
    return portSuccess(undefined);
  }
}

interface StoredJob {
  readonly id: JobId;
  readonly job: DurableJob;
  state: 'queued' | 'claimed' | 'complete' | 'failed';
  attempt: number;
  claim?: JobClaim;
}

export class InMemoryJobQueue implements JobQueue {
  readonly #jobs = new Map<JobId, StoredJob>();
  readonly #byKey = new Map<string, JobId>();
  #sequence = 0;

  public async enqueue<Payload>(job: DurableJob<Payload>): Promise<PortResult<JobId>> {
    const existing = this.#byKey.get(`${job.workspaceId}|${job.idempotencyKey}`);
    if (existing) return portSuccess(existing);
    this.#sequence += 1;
    const id = jobId(
      `job_01990f64-0000-7000-8000-${this.#sequence.toString(16).padStart(12, '0')}`,
    );
    this.#jobs.set(id, { id, job: job as DurableJob, state: 'queued', attempt: 0 });
    this.#byKey.set(`${job.workspaceId}|${job.idempotencyKey}`, id);
    return portSuccess(id);
  }

  public async claim(
    worker: WorkerIdentity,
    kinds: readonly JobKind[],
  ): Promise<PortResult<ClaimedJob | null>> {
    const stored = [...this.#jobs.values()].find(
      (candidate) => candidate.state === 'queued' && kinds.includes(candidate.job.kind),
    );
    if (!stored) return portSuccess(null);
    stored.state = 'claimed';
    stored.attempt += 1;
    stored.claim = {
      jobId: stored.id,
      worker,
      leaseExpiresAt: stored.job.availableAt,
    };
    return portSuccess({ claim: stored.claim, job: stored.job, attempt: stored.attempt });
  }

  public async heartbeat(claim: JobClaim): Promise<PortResult<void>> {
    const stored = this.#jobs.get(claim.jobId);
    return stored?.claim?.worker.id === claim.worker.id
      ? portSuccess(undefined)
      : conflict('Job claim is not active.');
  }

  public async complete(claim: JobClaim, result: JobResult): Promise<PortResult<void>> {
    void result;
    const stored = this.#jobs.get(claim.jobId);
    if (stored?.claim?.worker.id !== claim.worker.id) return conflict('Job claim is not active.');
    stored.state = 'complete';
    return portSuccess(undefined);
  }

  public async fail(claim: JobClaim, failure: JobFailure): Promise<PortResult<void>> {
    const stored = this.#jobs.get(claim.jobId);
    if (stored?.claim?.worker.id !== claim.worker.id) return conflict('Job claim is not active.');
    stored.state =
      failure.retryable && stored.attempt < stored.job.maximumAttempts ? 'queued' : 'failed';
    return portSuccess(undefined);
  }
}

export class FakeSandbox implements SandboxRunner {
  public result: SandboxedToolResult = {
    exitCode: 0,
    stdout: new Uint8Array(),
    stderrCode: null,
    timedOut: false,
    outputTruncated: false,
  };

  public readonly requests: SandboxedToolRequest[] = [];

  public async run(request: SandboxedToolRequest): Promise<PortResult<SandboxedToolResult>> {
    this.requests.push(request);
    return portSuccess(this.result);
  }
}

export class MemoryDeliveryWriter implements DeliveryWriter {
  public readonly writes: CheckWrite[] = [];

  public async upsertPullRequestCheck(write: CheckWrite): Promise<PortResult<ExternalDeliveryRef>> {
    const existingIndex = this.writes.findIndex(
      (candidate) => candidate.idempotencyKey === write.idempotencyKey,
    );
    if (existingIndex >= 0) this.writes[existingIndex] = write;
    else this.writes.push(write);
    return portSuccess({ provider: 'memory', externalId: write.idempotencyKey });
  }
}

export class InMemoryEvidenceStore implements EvidenceStore {
  public readonly analyses = new Map<AnalysisId, CanonicalRecord>();
  public readonly reviews = new Map<ReviewEventId, CanonicalRecord>();

  public async *readRecords(query: {
    workspaceId: WorkspaceId;
    schema: string;
    generationId?: GenerationId;
  }): AsyncIterable<PortResult<CanonicalRecord>> {
    for (const record of [...this.analyses.values(), ...this.reviews.values()]) {
      if (record.workspaceId === query.workspaceId && record.schema === query.schema) {
        yield portSuccess(record);
      }
    }
  }

  public async persistAnalysis(
    result: CanonicalRecord & { readonly analysisId: AnalysisId },
  ): Promise<PortResult<void>> {
    this.analyses.set(result.analysisId, result);
    return portSuccess(undefined);
  }

  public async appendReview(
    event: CanonicalRecord & { readonly reviewEventId: ReviewEventId },
  ): Promise<PortResult<void>> {
    if (this.reviews.has(event.reviewEventId)) return conflict('Review event already exists.');
    this.reviews.set(event.reviewEventId, event);
    return portSuccess(undefined);
  }
}
