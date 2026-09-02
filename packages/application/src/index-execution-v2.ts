import type {
  BlobResult,
  CommitDescriptor,
  CommitSha,
  DiffManifest,
  ExecutionBudgetLimitsV2,
  ExecutionBudgetReportV2,
  FileArtifact,
  RepositoryDescriptor,
  RepositoryStableId,
  TreeManifest,
} from '@yanib/reverb-domain';

import {
  CreatePullRequestOverlay,
  type CreatePullRequestOverlayRequest,
  type CreatePullRequestOverlayResult,
  type OverlayDependencies,
} from './create-overlay.js';
import { ExecutionBudgetV2, type ExecutionBudgetTelemetryPortV2 } from './execution-budget-v2.js';
import {
  IndexRepositoryGeneration,
  type IndexGenerationDependencies,
  type IndexRepositoryGenerationRequest,
  type IndexRepositoryGenerationResult,
} from './index-generation.js';
import { portFailure } from './ports.js';
import type { PortResult, RepositoryReader } from './ports.js';

function budgetFailure<Value>(result: PortResult<void>): PortResult<Value> {
  if (result.ok) throw new Error('Expected an exhausted execution budget.');
  return result;
}

export class ExecutionBudgetRepositoryReaderV2 implements RepositoryReader {
  public constructor(
    private readonly delegate: RepositoryReader,
    private readonly budget: ExecutionBudgetV2,
    private readonly artifactAccounting: 'tree' | 'diff' = 'tree',
  ) {}

  #reserveProvider<Value>(): PortResult<Value> | null {
    const reserved = this.budget.reserve({ providerRequests: 1 });
    return reserved.ok ? null : budgetFailure<Value>(reserved);
  }

  public async resolveRepository(
    id: RepositoryStableId,
  ): Promise<PortResult<RepositoryDescriptor>> {
    const exhausted = this.#reserveProvider<RepositoryDescriptor>();
    return exhausted ?? this.delegate.resolveRepository(id);
  }

  public async resolveCommit(
    id: RepositoryStableId,
    ref: string,
  ): Promise<PortResult<CommitDescriptor>> {
    const exhausted = this.#reserveProvider<CommitDescriptor>();
    return exhausted ?? this.delegate.resolveCommit(id, ref);
  }

  public async listTree(id: RepositoryStableId, sha: CommitSha): Promise<PortResult<TreeManifest>> {
    const exhausted = this.#reserveProvider<TreeManifest>();
    if (exhausted !== null) return exhausted;
    const result = await this.delegate.listTree(id, sha);
    if (!result.ok) return result;
    const artifacts = this.budget.reserve({
      artifacts: this.artifactAccounting === 'tree' ? result.value.entries.length : 0,
    });
    return artifacts.ok ? result : budgetFailure<TreeManifest>(artifacts);
  }

  public async compare(
    id: RepositoryStableId,
    base: CommitSha,
    head: CommitSha,
  ): Promise<PortResult<DiffManifest>> {
    const exhausted = this.#reserveProvider<DiffManifest>();
    if (exhausted !== null) return exhausted;
    const result = await this.delegate.compare(id, base, head);
    if (!result.ok) return result;
    const artifacts = this.budget.reserve({
      artifacts: this.artifactAccounting === 'diff' ? result.value.entries.length : 0,
    });
    return artifacts.ok ? result : budgetFailure<DiffManifest>(artifacts);
  }

  public async readBlob(
    id: RepositoryStableId,
    sha: CommitSha,
    path: FileArtifact['path'],
    maximumBytes: number,
  ): Promise<PortResult<BlobResult>> {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
      throw new RangeError('Blob limits must be non-negative safe integers.');
    }
    const remainingBytes = this.budget.remaining().sourceBytes;
    if (maximumBytes > 0 && remainingBytes === 0) {
      return budgetFailure(this.budget.reserve({ sourceBytes: 1 }));
    }
    const reservedBytes = Math.min(maximumBytes, remainingBytes);
    const reservation = this.budget.reserve({
      providerRequests: 1,
      sourceBytes: reservedBytes,
    });
    if (!reservation.ok) return budgetFailure(reservation);
    try {
      const result = await this.delegate.readBlob(id, sha, path, reservedBytes);
      if (!result.ok) {
        this.budget.release({ sourceBytes: reservedBytes });
        return result;
      }
      if (result.value.bytes.byteLength > reservedBytes) {
        const forceExhaustion = this.budget.remaining().sourceBytes + 1;
        this.budget.reserve({ sourceBytes: forceExhaustion });
        return portFailure({
          kind: 'incomplete_provider_data',
          code: 'execution_budget_exceeded',
          safeMessage: 'The provider exceeded the bounded source-byte request.',
          retryable: false,
        });
      }
      this.budget.release({ sourceBytes: reservedBytes - result.value.bytes.byteLength });
      return result;
    } catch (error) {
      this.budget.release({ sourceBytes: reservedBytes });
      throw error;
    }
  }
}

const CLEANUP_METHODS = new Set(['failGeneration', 'expireLease', 'failOverlay']);

export function withStorageQueryBudgetV2<Port extends object>(
  delegate: Port,
  budget: ExecutionBudgetV2,
): Port {
  return new Proxy(delegate, {
    get(target, property) {
      const member = Reflect.get(target, property, target) as unknown;
      if (typeof member !== 'function') return member;
      if (typeof property === 'string' && CLEANUP_METHODS.has(property)) return member.bind(target);
      return (...args: unknown[]) => {
        const reserved = budget.reserve({ storageQueries: 1 });
        if (!reserved.ok) return Promise.resolve(reserved);
        return Reflect.apply(member, target, args) as unknown;
      };
    },
  });
}

export interface IndexRepositoryGenerationV2Request extends IndexRepositoryGenerationRequest {
  readonly executionBudget: ExecutionBudgetLimitsV2;
}

export interface IndexRepositoryGenerationV2Result {
  readonly lane: 'bootstrap_index' | 'incremental_index';
  readonly state: 'complete' | 'partial';
  readonly legacyResult: IndexRepositoryGenerationResult;
  readonly executionBudget: ExecutionBudgetReportV2;
}

export interface IndexGenerationV2Dependencies extends IndexGenerationDependencies {
  readonly executionTelemetry?: ExecutionBudgetTelemetryPortV2;
}

export class IndexRepositoryGenerationV2 {
  public constructor(private readonly dependencies: IndexGenerationV2Dependencies) {}

  public async execute(
    request: IndexRepositoryGenerationV2Request,
  ): Promise<PortResult<IndexRepositoryGenerationV2Result>> {
    const lane =
      request.previousGenerationId === undefined ? 'bootstrap_index' : 'incremental_index';
    const budget = new ExecutionBudgetV2(
      lane,
      request.executionBudget,
      this.dependencies.clock,
      this.dependencies.executionTelemetry,
    );
    let legacy: PortResult<IndexRepositoryGenerationResult>;
    try {
      legacy = await new IndexRepositoryGeneration({
        ...this.dependencies,
        reader: new ExecutionBudgetRepositoryReaderV2(this.dependencies.reader, budget, 'tree'),
        store: withStorageQueryBudgetV2(this.dependencies.store, budget),
        cache: withStorageQueryBudgetV2(this.dependencies.cache, budget),
      }).execute(request);
    } catch (error) {
      budget.complete();
      throw error;
    }
    const executionBudget = budget.complete();
    if (!legacy.ok) return legacy;
    return {
      ok: true,
      value: {
        lane,
        state:
          legacy.value.state === 'partial' || executionBudget.exhaustedDimensions.length > 0
            ? 'partial'
            : 'complete',
        legacyResult: legacy.value,
        executionBudget,
      },
    };
  }
}

export interface CreatePullRequestOverlayV2Request extends CreatePullRequestOverlayRequest {
  readonly executionBudget: ExecutionBudgetLimitsV2;
}

export interface CreatePullRequestOverlayV2Result {
  readonly lane: 'pull_request';
  readonly state: 'complete' | 'partial';
  readonly legacyResult: CreatePullRequestOverlayResult;
  readonly executionBudget: ExecutionBudgetReportV2;
}

export interface OverlayV2Dependencies extends OverlayDependencies {
  readonly executionTelemetry?: ExecutionBudgetTelemetryPortV2;
}

export class CreatePullRequestOverlayV2 {
  public constructor(private readonly dependencies: OverlayV2Dependencies) {}

  public async execute(
    request: CreatePullRequestOverlayV2Request,
  ): Promise<PortResult<CreatePullRequestOverlayV2Result>> {
    const budget = new ExecutionBudgetV2(
      'pull_request',
      request.executionBudget,
      this.dependencies.clock,
      this.dependencies.executionTelemetry,
    );
    let legacy: PortResult<CreatePullRequestOverlayResult>;
    try {
      legacy = await new CreatePullRequestOverlay({
        ...this.dependencies,
        reader: new ExecutionBudgetRepositoryReaderV2(this.dependencies.reader, budget, 'diff'),
        store: withStorageQueryBudgetV2(this.dependencies.store, budget),
      }).execute(request);
    } catch (error) {
      budget.complete();
      throw error;
    }
    const executionBudget = budget.complete();
    if (!legacy.ok) return legacy;
    return {
      ok: true,
      value: {
        lane: 'pull_request',
        state:
          legacy.value.state === 'partial' || executionBudget.exhaustedDimensions.length > 0
            ? 'partial'
            : 'complete',
        legacyResult: legacy.value,
        executionBudget,
      },
    };
  }
}
