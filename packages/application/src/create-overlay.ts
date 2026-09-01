import {
  contentHash,
  hashCanonical,
  type BoundedDiagnostic,
  type CommitSha,
  type ConfigRevision,
  type CoverageRecord,
  type GenerationId,
  type GenerationLeaseId,
  type Instant,
  type OverlayEntry,
  type OverlayId,
  type RegistryRevision,
  type RepositoryStableId,
  type WorkspaceId,
} from '@yanib/reverb-domain';

import {
  failedArtifact,
  FoundationArtifactParserBoundary,
  overlayArtifactValue,
  type ArtifactParserBoundary,
  type ClassifyArtifactInput,
} from './artifacts.js';
import { portFailure, portSuccess } from './ports.js';
import type {
  CancellationPort,
  Clock,
  GenerationStore,
  PortFailure,
  PortResult,
  RepositoryReader,
  TelemetryPort,
} from './ports.js';

export interface CreatePullRequestOverlayRequest {
  readonly overlayId: OverlayId;
  readonly leaseId: GenerationLeaseId;
  readonly leaseExpiresAt: Instant;
  readonly workspaceId: WorkspaceId;
  readonly registryRevision: RegistryRevision;
  readonly repositoryId: RepositoryStableId;
  readonly baseGenerationId: GenerationId;
  readonly baseSha: CommitSha;
  readonly headSha: CommitSha;
  readonly configRevision: ConfigRevision;
  readonly indexerBundleVersion: string;
  readonly supersessionKey: ReturnType<typeof contentHash>;
  readonly maximumFileBytes?: number;
}

export interface CreatePullRequestOverlayResult {
  readonly overlayId: OverlayId;
  readonly state: 'complete' | 'partial';
  readonly entryCount: number;
  readonly resultHash: ReturnType<typeof contentHash>;
  readonly coverage: readonly CoverageRecord[];
  readonly diagnostics: readonly BoundedDiagnostic[];
}

export interface OverlayDependencies {
  readonly reader: RepositoryReader;
  readonly store: GenerationStore;
  readonly clock: Clock;
  readonly telemetry: TelemetryPort;
  readonly cancellation?: CancellationPort;
  readonly parser?: ArtifactParserBoundary;
}

function propagated<Value>(failure: PortFailure): PortResult<Value> {
  return portFailure(failure);
}

export class CreatePullRequestOverlay {
  public constructor(private readonly dependencies: OverlayDependencies) {}

  public async execute(
    request: CreatePullRequestOverlayRequest,
  ): Promise<PortResult<CreatePullRequestOverlayResult>> {
    const startedAt = this.dependencies.clock.now();
    const base = await this.dependencies.store.getGeneration(request.baseGenerationId);
    if (!base.ok) return propagated(base.failure);
    if (
      base.value.workspaceId !== request.workspaceId ||
      base.value.commitSha !== request.baseSha ||
      base.value.repositoryId !== request.repositoryId ||
      base.value.indexerBundleVersion !== request.indexerBundleVersion ||
      base.value.configRevision !== request.configRevision ||
      (base.value.state !== 'complete' && base.value.state !== 'partial')
    ) {
      return portFailure({
        kind: 'domain',
        code: 'base_generation_mismatch',
        safeMessage: 'Overlay base generation does not match the exact requested base.',
        retryable: false,
      });
    }
    const head = await this.dependencies.reader.resolveCommit(
      request.repositoryId,
      request.headSha,
    );
    if (!head.ok) return propagated(head.failure);
    if (head.value.repositoryId !== request.repositoryId || head.value.sha !== request.headSha) {
      return portFailure({
        kind: 'incomplete_provider_data',
        code: 'head_commit_mismatch',
        safeMessage: 'Source reader did not resolve the requested exact head.',
        retryable: false,
      });
    }
    const diff = await this.dependencies.reader.compare(
      request.repositoryId,
      request.baseSha,
      request.headSha,
    );
    if (!diff.ok) return propagated(diff.failure);
    if (
      diff.value.repositoryId !== request.repositoryId ||
      diff.value.baseSha !== request.baseSha ||
      diff.value.headSha !== request.headSha
    ) {
      return portFailure({
        kind: 'incomplete_provider_data',
        code: 'diff_scope_mismatch',
        safeMessage: 'Source reader returned a diff outside the requested exact commits.',
        retryable: false,
      });
    }
    const overlay = {
      id: request.overlayId,
      workspaceId: request.workspaceId,
      repositoryId: request.repositoryId,
      baseGenerationId: request.baseGenerationId,
      baseSha: request.baseSha,
      headSha: request.headSha,
      headTreeHash: head.value.treeHash,
      indexerBundleVersion: request.indexerBundleVersion,
      configRevision: request.configRevision,
      registryRevision: request.registryRevision,
      state: 'building' as const,
      supersessionKey: request.supersessionKey,
      diffHash: diff.value.manifestHash,
      startedAt,
    };
    const leaseResult = await this.dependencies.store.beginOverlay({
      overlay,
      leaseId: request.leaseId,
      leaseExpiresAt: request.leaseExpiresAt,
    });
    if (!leaseResult.ok) return propagated(leaseResult.failure);
    const lease = leaseResult.value;
    const fail = async (
      failure: PortFailure,
    ): Promise<PortResult<CreatePullRequestOverlayResult>> => {
      await this.dependencies.store.failOverlay(lease, request.overlayId, {
        failedAt: this.dependencies.clock.now(),
        code: failure.kind === 'cancelled' ? 'cancelled' : 'infrastructure_failure',
        safeMessage: failure.safeMessage,
      });
      return portFailure(failure);
    };
    const maximumFileBytes = request.maximumFileBytes ?? 2 * 1024 * 1024;
    const headTree = await this.dependencies.reader.listTree(request.repositoryId, request.headSha);
    if (!headTree.ok) return fail(headTree.failure);
    if (
      headTree.value.repositoryId !== request.repositoryId ||
      headTree.value.commitSha !== request.headSha ||
      headTree.value.treeHash !== head.value.treeHash
    ) {
      return fail({
        kind: 'incomplete_provider_data',
        code: 'tree_scope_mismatch',
        safeMessage: 'Source reader returned a tree outside the requested exact head.',
        retryable: false,
      });
    }
    const headEntries = new Map(headTree.value.entries.map((entry) => [entry.path, entry]));
    const entries: OverlayEntry[] = [];
    const diagnostics: BoundedDiagnostic[] = [
      ...diff.value.limitations.map((limitation) => ({
        code: limitation.code,
        severity: 'warning' as const,
        ...(limitation.scope ? { scope: limitation.scope } : {}),
        safeMessage: 'Diff provider data was incomplete.',
      })),
      ...headTree.value.limitations.map((limitation) => ({
        code: limitation.code,
        severity: 'warning' as const,
        ...(limitation.scope ? { scope: limitation.scope } : {}),
        safeMessage: 'Head tree provider data was incomplete.',
      })),
    ];
    let partial = !diff.value.complete || !headTree.value.complete;
    let replacementFiles = 0;
    let failedFiles = 0;
    let parsedFiles = 0;
    let skippedFiles = 0;
    let supportedLanguages = 0;

    for (const change of diff.value.entries) {
      if (this.dependencies.cancellation) {
        const current = await this.dependencies.cancellation.isCurrent(request.supersessionKey);
        if (!current.ok) return fail(current.failure);
        if (!current.value) {
          return fail({
            kind: 'cancelled',
            code: 'superseded',
            safeMessage: 'Overlay was superseded.',
            retryable: false,
          });
        }
      }
      if (change.kind === 'deleted') {
        entries.push({ overlayId: request.overlayId, path: change.path, kind: 'tombstone' });
        continue;
      }
      if (change.kind === 'renamed' && change.previousPath) {
        entries.push({
          overlayId: request.overlayId,
          path: change.previousPath,
          kind: 'tombstone',
        });
      }
      const treeEntry = headEntries.get(change.path);
      replacementFiles += 1;
      if (!treeEntry) {
        partial = true;
        failedFiles += 1;
        diagnostics.push({
          code: 'missing_blob',
          severity: 'error',
          scope: change.path,
          safeMessage: 'Changed path was absent from the exact head tree.',
        });
        continue;
      }
      let bytes: Uint8Array | undefined;
      let sourceFailed = false;
      if (
        treeEntry.kind === 'blob' &&
        (treeEntry.size === undefined || treeEntry.size <= maximumFileBytes)
      ) {
        const blob = await this.dependencies.reader.readBlob(
          request.repositoryId,
          request.headSha,
          change.path,
          maximumFileBytes,
        );
        if (!blob.ok) {
          partial = true;
          sourceFailed = true;
        } else {
          if (blob.value.path !== change.path || blob.value.sourceBlobId !== treeEntry.objectId) {
            return fail({
              kind: 'incomplete_provider_data',
              code: 'blob_scope_mismatch',
              safeMessage: 'Source reader returned a blob outside the requested tree entry.',
              retryable: false,
            });
          }
          bytes = blob.value.bytes;
          partial ||= !blob.value.complete;
          sourceFailed = !blob.value.complete;
        }
      }
      const classifyInput: ClassifyArtifactInput = {
        generationId: request.baseGenerationId,
        entry: treeEntry,
        ...(bytes ? { bytes } : {}),
        configRevision: request.configRevision,
        maximumBytes: maximumFileBytes,
      };
      let classified;
      if (sourceFailed) {
        classified = failedArtifact(
          classifyInput,
          'unreadable_blob',
          'Overlay source was incomplete and could not be parsed.',
        );
      } else {
        try {
          classified = await (
            this.dependencies.parser ?? new FoundationArtifactParserBoundary()
          ).classify(classifyInput);
        } catch {
          classified = failedArtifact(
            classifyInput,
            'parse_failure',
            'Parser failed inside its bounded execution boundary.',
          );
        }
      }
      partial ||= !classified.complete;
      diagnostics.push(...classified.diagnostics);
      parsedFiles += classified.artifact.parseState === 'parsed' ? 1 : 0;
      skippedFiles += classified.artifact.parseState === 'skipped' ? 1 : 0;
      failedFiles += classified.artifact.parseState === 'failed' ? 1 : 0;
      supportedLanguages += classified.artifact.language === 'unknown' ? 0 : 1;
      const artifact = overlayArtifactValue(classified.artifact);
      entries.push({
        overlayId: request.overlayId,
        path: change.path,
        kind: 'replacement',
        artifact,
        ...(change.previousPath ? { previousPath: change.previousPath } : {}),
      });
    }
    const sortedEntries = entries.sort((left, right) => left.path.localeCompare(right.path));
    const coverage: CoverageRecord[] = [
      {
        dimension: 'repository',
        state: partial ? 'partial' : 'complete',
        eligible: 1,
        processed: 1,
        skipped: 0,
        failed: diff.value.complete && headTree.value.complete ? 0 : 1,
      },
      {
        dimension: 'tree',
        state: diff.value.complete && headTree.value.complete ? 'complete' : 'partial',
        eligible: headTree.value.entries.length,
        processed: headTree.value.entries.length,
        skipped: 0,
        failed: diff.value.complete && headTree.value.complete ? 0 : 1,
        ...(!diff.value.complete || !headTree.value.complete
          ? { reason: 'incomplete_tree' as const }
          : {}),
      },
      {
        dimension: 'file',
        state: failedFiles === 0 ? 'complete' : 'partial',
        eligible: diff.value.entries.length,
        processed: diff.value.entries.length - failedFiles,
        skipped: 0,
        failed: failedFiles,
      },
      {
        dimension: 'language',
        state: supportedLanguages === replacementFiles ? 'complete' : 'partial',
        eligible: replacementFiles,
        processed: supportedLanguages,
        skipped: replacementFiles - supportedLanguages,
        failed: 0,
        ...(supportedLanguages !== replacementFiles
          ? { reason: 'unsupported_language' as const }
          : {}),
      },
      {
        dimension: 'parser',
        state: parsedFiles === replacementFiles && failedFiles === 0 ? 'complete' : 'partial',
        eligible: replacementFiles,
        processed: parsedFiles,
        skipped: skippedFiles,
        failed: failedFiles,
      },
      {
        dimension: 'adapter',
        state: 'not_analysed',
        eligible: 0,
        processed: 0,
        skipped: 0,
        failed: 0,
      },
    ];
    const resultHash = contentHash(
      hashCanonical({ entries: sortedEntries, coverage, diagnostics }),
    );
    const write = await this.dependencies.store.putOverlayEntries(
      lease,
      request.overlayId,
      sortedEntries,
    );
    if (!write.ok) return fail(write.failure);
    const completedAt = this.dependencies.clock.now();
    const state = partial ? 'partial' : 'complete';
    const completed = await this.dependencies.store.completeOverlay(lease, request.overlayId, {
      state,
      completedAt,
      resultHash,
    });
    if (!completed.ok) return propagated(completed.failure);
    this.dependencies.telemetry.emit({
      type: 'overlay_completed',
      state,
      changedFileCount: diff.value.entries.length,
      durationMs: Math.max(0, new Date(completedAt).valueOf() - new Date(startedAt).valueOf()),
    });
    return portSuccess({
      overlayId: request.overlayId,
      state,
      entryCount: sortedEntries.length,
      resultHash,
      coverage,
      diagnostics,
    });
  }
}
