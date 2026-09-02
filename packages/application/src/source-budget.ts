import type {
  BlobResult,
  CommitDescriptor,
  CommitSha,
  DiffManifest,
  FileArtifact,
  RepositoryDescriptor,
  RepositoryStableId,
  TreeManifest,
} from '@yanib/reverb-domain';

import { portFailure, type PortResult, type RepositoryReader } from './ports.js';

export interface ProviderSourceBudget {
  readonly maximumMetadataCalls: number;
  readonly maximumBlobReads: number;
  readonly maximumBlobBytes: number;
}

export interface ProviderSourceUsage {
  readonly resolveRepositoryCalls: number;
  readonly resolveCommitCalls: number;
  readonly listTreeCalls: number;
  readonly compareCalls: number;
  readonly metadataCalls: number;
  readonly blobReads: number;
  readonly blobBytes: number;
  readonly budgetExhaustions: number;
}

type MetadataOperation =
  | 'resolveRepositoryCalls'
  | 'resolveCommitCalls'
  | 'listTreeCalls'
  | 'compareCalls';

function validLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function exhausted<Value>(message: string): PortResult<Value> {
  return portFailure({
    kind: 'incomplete_provider_data',
    code: 'provider_source_budget_exceeded',
    safeMessage: message,
    retryable: false,
  });
}

/**
 * Hard provider-read boundary for a single bounded run. Counters are reserved
 * synchronously before delegate calls, so concurrent callers cannot exceed the
 * configured call counts. Exhaustion never widens the source set.
 */
export class BudgetedRepositoryReader implements RepositoryReader {
  #reservedBlobBytes = 0;
  readonly #usage = {
    resolveRepositoryCalls: 0,
    resolveCommitCalls: 0,
    listTreeCalls: 0,
    compareCalls: 0,
    metadataCalls: 0,
    blobReads: 0,
    blobBytes: 0,
    budgetExhaustions: 0,
  };

  public constructor(
    private readonly delegate: RepositoryReader,
    private readonly budget: ProviderSourceBudget,
  ) {
    if (
      !validLimit(budget.maximumMetadataCalls) ||
      !validLimit(budget.maximumBlobReads) ||
      !validLimit(budget.maximumBlobBytes)
    ) {
      throw new RangeError('Provider source budgets must be non-negative safe integers.');
    }
  }

  public usage(): ProviderSourceUsage {
    return { ...this.#usage };
  }

  #reserveMetadata(operation: MetadataOperation): PortResult<never> | null {
    if (this.#usage.metadataCalls >= this.budget.maximumMetadataCalls) {
      this.#usage.budgetExhaustions += 1;
      return exhausted('Provider metadata-call budget was exhausted.');
    }
    this.#usage.metadataCalls += 1;
    this.#usage[operation] += 1;
    return null;
  }

  public async resolveRepository(
    id: RepositoryStableId,
  ): Promise<PortResult<RepositoryDescriptor>> {
    const exhaustedResult = this.#reserveMetadata('resolveRepositoryCalls');
    return exhaustedResult ?? this.delegate.resolveRepository(id);
  }

  public async resolveCommit(
    id: RepositoryStableId,
    ref: string,
  ): Promise<PortResult<CommitDescriptor>> {
    const exhaustedResult = this.#reserveMetadata('resolveCommitCalls');
    return exhaustedResult ?? this.delegate.resolveCommit(id, ref);
  }

  public async listTree(id: RepositoryStableId, sha: CommitSha): Promise<PortResult<TreeManifest>> {
    const exhaustedResult = this.#reserveMetadata('listTreeCalls');
    return exhaustedResult ?? this.delegate.listTree(id, sha);
  }

  public async compare(
    id: RepositoryStableId,
    base: CommitSha,
    head: CommitSha,
  ): Promise<PortResult<DiffManifest>> {
    const exhaustedResult = this.#reserveMetadata('compareCalls');
    return exhaustedResult ?? this.delegate.compare(id, base, head);
  }

  public async readBlob(
    id: RepositoryStableId,
    sha: CommitSha,
    path: FileArtifact['path'],
    maximumBytes: number,
  ): Promise<PortResult<BlobResult>> {
    if (this.#usage.blobReads >= this.budget.maximumBlobReads) {
      this.#usage.budgetExhaustions += 1;
      return exhausted('Provider blob-read budget was exhausted.');
    }
    const remainingBytes =
      this.budget.maximumBlobBytes - this.#usage.blobBytes - this.#reservedBlobBytes;
    if (remainingBytes <= 0) {
      this.#usage.budgetExhaustions += 1;
      return exhausted('Provider blob-byte budget was exhausted.');
    }
    this.#usage.blobReads += 1;
    const boundedMaximum = Math.min(maximumBytes, remainingBytes);
    this.#reservedBlobBytes += boundedMaximum;
    try {
      const result = await this.delegate.readBlob(id, sha, path, boundedMaximum);
      if (!result.ok) return result;
      this.#usage.blobBytes += result.value.bytes.byteLength;
      if (result.value.bytes.byteLength > boundedMaximum) {
        this.#usage.budgetExhaustions += 1;
        return exhausted('Provider returned a blob larger than the bounded request.');
      }
      return result;
    } finally {
      this.#reservedBlobBytes -= boundedMaximum;
    }
  }
}
