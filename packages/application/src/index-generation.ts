import {
  contentHash,
  hashCanonical,
  type BoundedDiagnostic,
  type CommitSha,
  type ConfigRevision,
  type CoverageRecord,
  type FileArtifact,
  type GenerationId,
  type GenerationLeaseId,
  type Instant,
  type RegistryRevision,
  type RepositoryStableId,
  type TreeEntry,
  type WorkspaceId,
} from '@yanib/reverb-domain';

import {
  artifactCacheValue,
  cachedArtifactToFile,
  failedArtifact,
  FoundationArtifactParserBoundary,
  FOUNDATION_PARSER_ID,
  FOUNDATION_PARSER_VERSION,
  type ArtifactParserBoundary,
  type ClassifyArtifactInput,
} from './artifacts.js';
import type {
  ArtifactCachePort,
  CancellationPort,
  Clock,
  GenerationStore,
  PortFailure,
  PortResult,
  RepositoryReader,
  TelemetryPort,
} from './ports.js';
import { portFailure, portSuccess } from './ports.js';

export interface IndexRepositoryGenerationRequest {
  readonly generationId: GenerationId;
  readonly leaseId: GenerationLeaseId;
  readonly leaseExpiresAt: Instant;
  readonly workspaceId: WorkspaceId;
  readonly registryRevision: RegistryRevision;
  readonly repositoryId: RepositoryStableId;
  readonly commitSha: CommitSha;
  readonly configRevision: ConfigRevision;
  readonly indexerBundleVersion: string;
  readonly previousGenerationId?: GenerationId;
  readonly maximumFileBytes?: number;
  readonly supersessionKey?: ReturnType<typeof contentHash>;
}

export interface IndexRepositoryGenerationResult {
  readonly generationId: GenerationId;
  readonly state: 'complete' | 'partial';
  readonly artifactCount: number;
  readonly reusedArtifactCount: number;
  readonly coverage: readonly CoverageRecord[];
  readonly diagnostics: readonly BoundedDiagnostic[];
  readonly artifactResultHash: ReturnType<typeof contentHash>;
}

export interface IndexGenerationDependencies {
  readonly reader: RepositoryReader;
  readonly store: GenerationStore;
  readonly cache: ArtifactCachePort;
  readonly clock: Clock;
  readonly telemetry: TelemetryPort;
  readonly cancellation?: CancellationPort;
  readonly parser?: ArtifactParserBoundary;
}

function propagated<Value>(result: {
  readonly ok: false;
  readonly failure: PortFailure;
}): PortResult<Value> {
  return portFailure(result.failure);
}

function elapsedMilliseconds(start: Instant, end: Instant): number {
  return Math.max(0, new Date(end).valueOf() - new Date(start).valueOf());
}

function semanticArtifact(artifact: FileArtifact): Readonly<Record<string, unknown>> {
  return {
    path: artifact.path,
    sourceBlobId: artifact.sourceBlobId,
    contentHash: artifact.contentHash ?? null,
    size: artifact.size,
    language: artifact.language,
    classification: artifact.classification,
    parseState: artifact.parseState,
    parserId: artifact.parserId,
    parserVersion: artifact.parserVersion,
    configRevision: artifact.configRevision,
    lineCount: artifact.lineCount ?? null,
  };
}

function artifactContextHash(entry: TreeEntry, maximumFileBytes: number) {
  return contentHash(
    hashCanonical({
      path: entry.path,
      kind: entry.kind,
      mode: entry.mode,
      size: entry.size ?? null,
      maximumFileBytes,
    }),
  );
}

function previousArtifactMatches(
  artifact: FileArtifact,
  entry: TreeEntry,
  maximumFileBytes: number,
): boolean {
  if (artifact.path !== entry.path || artifact.sourceBlobId !== entry.objectId) return false;
  if (entry.size !== undefined && artifact.size !== entry.size) return false;
  if (entry.kind === 'symlink') return artifact.classification === 'symlink';
  if (entry.kind === 'submodule') return artifact.classification === 'submodule';
  if (artifact.classification === 'symlink' || artifact.classification === 'submodule')
    return false;
  const oversized = entry.size !== undefined && entry.size > maximumFileBytes;
  return oversized
    ? artifact.classification === 'oversized'
    : artifact.classification !== 'oversized';
}

export class IndexRepositoryGeneration {
  public constructor(private readonly dependencies: IndexGenerationDependencies) {}

  public async execute(
    request: IndexRepositoryGenerationRequest,
  ): Promise<PortResult<IndexRepositoryGenerationResult>> {
    const startedAt = this.dependencies.clock.now();
    const resolved = await this.dependencies.reader.resolveCommit(
      request.repositoryId,
      request.commitSha,
    );
    if (!resolved.ok) return propagated(resolved);
    if (
      resolved.value.repositoryId !== request.repositoryId ||
      resolved.value.sha !== request.commitSha
    ) {
      return portFailure({
        kind: 'incomplete_provider_data',
        code: 'commit_mismatch',
        safeMessage: 'Source reader did not resolve the requested exact commit.',
        retryable: false,
      });
    }
    const existing = await this.dependencies.store.selectGeneration({
      workspaceId: request.workspaceId,
      repositoryId: request.repositoryId,
      commitSha: request.commitSha,
      indexerBundleVersion: request.indexerBundleVersion,
      configRevision: request.configRevision,
      allowPartial: true,
    });
    if (!existing.ok) return propagated(existing);
    if (existing.value.state === 'selected') {
      const [artifacts, coverage, diagnostics] = await Promise.all([
        this.dependencies.store.listArtifacts(existing.value.generation.id),
        this.dependencies.store.getGenerationCoverage(existing.value.generation.id),
        this.dependencies.store.getGenerationDiagnostics(existing.value.generation.id),
      ]);
      if (!artifacts.ok) return propagated(artifacts);
      if (!coverage.ok) return propagated(coverage);
      if (!diagnostics.ok) return propagated(diagnostics);
      const artifactResultHash = existing.value.generation.artifactResultHash;
      if (!artifactResultHash) {
        return portFailure({
          kind: 'infrastructure',
          code: 'generation_hash_missing',
          safeMessage: 'Selected generation is missing its result hash.',
          retryable: false,
        });
      }
      return portSuccess({
        generationId: existing.value.generation.id,
        state: existing.value.generation.state as 'complete' | 'partial',
        artifactCount: artifacts.value.length,
        reusedArtifactCount: artifacts.value.length,
        coverage: coverage.value,
        diagnostics: diagnostics.value,
        artifactResultHash,
      });
    }
    const leaseResult = await this.dependencies.store.beginGeneration({
      generationId: request.generationId,
      workspaceId: request.workspaceId,
      repositoryId: request.repositoryId,
      commitSha: request.commitSha,
      treeHash: resolved.value.treeHash,
      indexerBundleVersion: request.indexerBundleVersion,
      configRevision: request.configRevision,
      registryRevision: request.registryRevision,
      startedAt,
      leaseId: request.leaseId,
      leaseExpiresAt: request.leaseExpiresAt,
    });
    if (!leaseResult.ok) return propagated(leaseResult);
    const lease = leaseResult.value;
    const fail = async (
      failure: PortFailure,
    ): Promise<PortResult<IndexRepositoryGenerationResult>> => {
      const failedAt = this.dependencies.clock.now();
      await this.dependencies.store.failGeneration(lease, {
        failedAt,
        code: failure.kind === 'cancelled' ? 'cancelled' : 'infrastructure_failure',
        safeMessage: failure.safeMessage,
      });
      this.dependencies.telemetry.emit({
        type: 'generation_failed',
        reason: failure.code,
        durationMs: elapsedMilliseconds(startedAt, failedAt),
      });
      return portFailure(failure);
    };
    const tree = await this.dependencies.reader.listTree(request.repositoryId, request.commitSha);
    if (!tree.ok) return fail(tree.failure);
    if (
      tree.value.repositoryId !== request.repositoryId ||
      tree.value.commitSha !== request.commitSha ||
      tree.value.treeHash !== resolved.value.treeHash
    ) {
      return fail({
        kind: 'incomplete_provider_data',
        code: 'tree_scope_mismatch',
        safeMessage: 'Source reader returned a tree outside the requested exact commit.',
        retryable: false,
      });
    }

    const maximumFileBytes = request.maximumFileBytes ?? 2 * 1024 * 1024;
    const previousByBlob = new Map<string, FileArtifact>();
    if (request.previousGenerationId) {
      const previousGeneration = await this.dependencies.store.getGeneration(
        request.previousGenerationId,
      );
      if (
        previousGeneration.ok &&
        previousGeneration.value.workspaceId === request.workspaceId &&
        previousGeneration.value.repositoryId === request.repositoryId &&
        previousGeneration.value.indexerBundleVersion === request.indexerBundleVersion &&
        previousGeneration.value.configRevision === request.configRevision
      ) {
        const previous = await this.dependencies.store.listArtifacts(request.previousGenerationId);
        if (previous.ok) {
          for (const artifact of previous.value) {
            previousByBlob.set(`${artifact.sourceBlobId}\0${artifact.path}`, artifact);
          }
        }
      }
    }

    const artifacts: FileArtifact[] = [];
    const diagnostics: BoundedDiagnostic[] = [];
    let reusedArtifactCount = 0;
    let failedFiles = 0;
    let skippedFiles = 0;
    let parsedFiles = 0;
    let supportedLanguages = 0;

    for (const entry of tree.value.entries) {
      if (request.supersessionKey && this.dependencies.cancellation) {
        const current = await this.dependencies.cancellation.isCurrent(request.supersessionKey);
        if (!current.ok) return fail(current.failure);
        if (!current.value) {
          return fail({
            kind: 'cancelled',
            code: 'superseded',
            safeMessage: 'Generation was superseded.',
            retryable: false,
          });
        }
      }

      const previous = previousByBlob.get(`${entry.objectId}\0${entry.path}`);
      if (
        previous &&
        previousArtifactMatches(previous, entry, maximumFileBytes) &&
        previous.parserId === FOUNDATION_PARSER_ID &&
        previous.parserVersion === FOUNDATION_PARSER_VERSION &&
        previous.configRevision === request.configRevision
      ) {
        const artifact = cachedArtifactToFile(
          previous,
          request.generationId,
          entry.path,
          previous.generationId,
        );
        artifacts.push(artifact);
        reusedArtifactCount += 1;
        parsedFiles += artifact.parseState === 'parsed' ? 1 : 0;
        skippedFiles += artifact.parseState === 'skipped' ? 1 : 0;
        supportedLanguages += artifact.language === 'unknown' ? 0 : 1;
        continue;
      }

      const cacheKey = {
        workspaceId: request.workspaceId,
        sourceBlobId: entry.objectId,
        contextHash: artifactContextHash(entry, maximumFileBytes),
        indexerBundleVersion: request.indexerBundleVersion,
        parserId: FOUNDATION_PARSER_ID,
        parserVersion: FOUNDATION_PARSER_VERSION,
        configRevision: request.configRevision,
      };
      const cached = await this.dependencies.cache.get(cacheKey);
      if (!cached.ok) return fail(cached.failure);
      if (cached.value) {
        const artifact = cachedArtifactToFile(
          cached.value.artifact,
          request.generationId,
          entry.path,
          request.previousGenerationId,
        );
        artifacts.push(artifact);
        reusedArtifactCount += 1;
        parsedFiles += artifact.parseState === 'parsed' ? 1 : 0;
        skippedFiles += artifact.parseState === 'skipped' ? 1 : 0;
        supportedLanguages += artifact.language === 'unknown' ? 0 : 1;
        continue;
      }

      let bytes: Uint8Array | undefined;
      let sourceIncomplete = false;
      let fileSourceFailed = false;
      const needsBlob =
        entry.kind === 'blob' && (entry.size === undefined || entry.size <= maximumFileBytes);
      if (needsBlob) {
        const blob = await this.dependencies.reader.readBlob(
          request.repositoryId,
          request.commitSha,
          entry.path,
          maximumFileBytes,
        );
        if (blob.ok) {
          if (blob.value.path !== entry.path) {
            return fail({
              kind: 'incomplete_provider_data',
              code: 'blob_scope_mismatch',
              safeMessage: 'Source reader returned a blob outside the requested path.',
              retryable: false,
            });
          }
          bytes = blob.value.bytes;
          sourceIncomplete = !blob.value.complete;
          fileSourceFailed = !blob.value.complete;
          if (sourceIncomplete)
            diagnostics.push(
              ...blob.value.limitations.map((limitation) => ({
                code: limitation.code,
                severity: 'warning' as const,
                ...(limitation.scope ? { scope: limitation.scope } : {}),
                safeMessage: 'Source blob was incomplete.',
              })),
            );
        } else {
          sourceIncomplete = true;
          fileSourceFailed = true;
          diagnostics.push({
            code: 'unreadable_blob',
            severity: 'error',
            scope: entry.path,
            safeMessage: 'Source blob could not be read.',
          });
        }
      }
      const classifyInput: ClassifyArtifactInput = {
        generationId: request.generationId,
        entry,
        ...(bytes ? { bytes } : {}),
        configRevision: request.configRevision,
        maximumBytes: maximumFileBytes,
      };
      let parserFailed = false;
      let classified;
      if (fileSourceFailed) {
        classified = failedArtifact(
          classifyInput,
          'unreadable_blob',
          'Source was incomplete and could not be parsed.',
        );
      } else {
        try {
          classified = await (
            this.dependencies.parser ?? new FoundationArtifactParserBoundary()
          ).classify(classifyInput);
        } catch {
          parserFailed = true;
          classified = failedArtifact(
            classifyInput,
            'parse_failure',
            'Parser failed inside its bounded execution boundary.',
          );
        }
      }
      artifacts.push(classified.artifact);
      diagnostics.push(...classified.diagnostics);
      parsedFiles += classified.artifact.parseState === 'parsed' ? 1 : 0;
      skippedFiles += classified.artifact.parseState === 'skipped' ? 1 : 0;
      supportedLanguages += classified.artifact.language === 'unknown' ? 0 : 1;
      if (fileSourceFailed || parserFailed) failedFiles += 1;
      if (!fileSourceFailed && !parserFailed) {
        const cacheArtifact = artifactCacheValue(classified.artifact);
        const cacheWrite = await this.dependencies.cache.put({
          key: cacheKey,
          artifact: cacheArtifact,
        });
        if (!cacheWrite.ok) return fail(cacheWrite.failure);
      }
    }

    const completeArtifacts = artifacts.filter(
      (artifact) => artifact.classification === 'source' && artifact.parseState === 'parsed',
    ).length;
    const partial =
      !tree.value.complete ||
      failedFiles > 0 ||
      artifacts.some(
        (artifact) => artifact.classification !== 'source' || artifact.parseState !== 'parsed',
      );
    const coverage: CoverageRecord[] = [
      {
        dimension: 'repository',
        state: tree.value.complete && failedFiles === 0 ? 'complete' : 'partial',
        eligible: 1,
        processed: 1,
        skipped: 0,
        failed: tree.value.complete ? 0 : 1,
        ...(!tree.value.complete ? { reason: 'incomplete_tree' as const } : {}),
      },
      {
        dimension: 'tree',
        state: tree.value.complete ? 'complete' : 'partial',
        eligible: tree.value.entries.length,
        processed: artifacts.length,
        skipped: 0,
        failed: tree.value.complete ? 0 : 1,
        ...(!tree.value.complete ? { reason: 'incomplete_tree' as const } : {}),
      },
      {
        dimension: 'file',
        state: failedFiles > 0 ? 'partial' : 'complete',
        eligible: tree.value.entries.length,
        processed: artifacts.length - failedFiles,
        skipped: skippedFiles,
        failed: failedFiles,
      },
      {
        dimension: 'language',
        state: supportedLanguages === artifacts.length ? 'complete' : 'partial',
        eligible: artifacts.length,
        processed: supportedLanguages,
        skipped: artifacts.length - supportedLanguages,
        failed: 0,
        ...(supportedLanguages !== artifacts.length
          ? { reason: 'unsupported_language' as const }
          : {}),
      },
      {
        dimension: 'parser',
        state: completeArtifacts === artifacts.length ? 'complete' : 'partial',
        eligible: artifacts.length,
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
    const artifactResultHash = contentHash(
      hashCanonical(
        artifacts
          .map(semanticArtifact)
          .sort((left, right) => String(left.path).localeCompare(String(right.path))),
      ),
    );
    const coverageHash = contentHash(hashCanonical({ coverage, diagnostics }));
    const batchWrite = await this.dependencies.store.putArtifacts(lease, {
      artifacts,
      diagnostics,
      coverage,
    });
    if (!batchWrite.ok) return fail(batchWrite.failure);
    const completedAt = this.dependencies.clock.now();
    const state = partial ? 'partial' : 'complete';
    const completed = await this.dependencies.store.completeGeneration(lease, {
      state,
      completedAt,
      selectable: true,
      coverage,
      diagnostics,
      coverageHash,
      artifactResultHash,
    });
    if (!completed.ok) return propagated(completed);
    this.dependencies.telemetry.emit({
      type: 'generation_completed',
      state,
      fileCount: artifacts.length,
      reusedCount: reusedArtifactCount,
      durationMs: elapsedMilliseconds(startedAt, completedAt),
    });
    return portSuccess({
      generationId: request.generationId,
      state,
      artifactCount: artifacts.length,
      reusedArtifactCount,
      coverage,
      diagnostics,
      artifactResultHash,
    });
  }
}
