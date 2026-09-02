import {
  commitSha,
  contentHash,
  repoPath,
  repositoryStableId,
  treeHash,
  type RepositoryStableId,
} from '@yanib/reverb-domain';
import { describe, expect, it } from 'vitest';

import { BudgetedRepositoryReader, portSuccess, type RepositoryReader } from '../src/index.js';

const repository = repositoryStableId(
  'local:sha256:1111111111111111111111111111111111111111111111111111111111111111',
);
const sha = commitSha('a'.repeat(40));

function reader(requestedBlobLimits: number[]): RepositoryReader {
  return {
    async resolveRepository(id: RepositoryStableId) {
      return portSuccess({ id, displayName: 'fixture' });
    },
    async resolveCommit(id: RepositoryStableId) {
      return portSuccess({ repositoryId: id, sha, treeHash: treeHash('b'.repeat(40)) });
    },
    async listTree(id: RepositoryStableId) {
      return portSuccess({
        repositoryId: id,
        commitSha: sha,
        treeHash: treeHash('b'.repeat(40)),
        entries: [],
        complete: true,
        limitations: [],
      });
    },
    async compare(id: RepositoryStableId) {
      return portSuccess({
        repositoryId: id,
        baseSha: sha,
        headSha: sha,
        entries: [],
        complete: true,
        renameBasis: 'none',
        limitations: [],
        manifestHash: contentHash(`sha256:${'c'.repeat(64)}`),
      });
    },
    async readBlob(_id, _sha, path, maximumBytes) {
      requestedBlobLimits.push(maximumBytes);
      return portSuccess({
        path,
        bytes: new Uint8Array(Math.min(3, maximumBytes)),
        complete: true,
        truncated: false,
        sourceBlobId: 'd'.repeat(40),
        limitations: [],
      });
    },
  };
}

describe('budgeted repository reader', () => {
  it('reserves call counts before concurrent provider reads', async () => {
    const limits: number[] = [];
    const bounded = new BudgetedRepositoryReader(reader(limits), {
      maximumMetadataCalls: 1,
      maximumBlobReads: 1,
      maximumBlobBytes: 10,
    });
    const metadata = await Promise.all([
      bounded.resolveCommit(repository, sha),
      bounded.listTree(repository, sha),
    ]);
    expect(metadata.filter((result) => result.ok)).toHaveLength(1);
    const blobs = await Promise.all([
      bounded.readBlob(repository, sha, repoPath('a.ts'), 10),
      bounded.readBlob(repository, sha, repoPath('b.ts'), 10),
    ]);
    expect(blobs.filter((result) => result.ok)).toHaveLength(1);
    expect(bounded.usage()).toMatchObject({
      metadataCalls: 1,
      blobReads: 1,
      budgetExhaustions: 2,
    });
  });

  it('passes only the remaining byte allowance to the provider', async () => {
    const limits: number[] = [];
    const bounded = new BudgetedRepositoryReader(reader(limits), {
      maximumMetadataCalls: 0,
      maximumBlobReads: 2,
      maximumBlobBytes: 5,
    });
    expect((await bounded.readBlob(repository, sha, repoPath('a.ts'), 100)).ok).toBe(true);
    expect((await bounded.readBlob(repository, sha, repoPath('b.ts'), 100)).ok).toBe(true);
    expect(limits).toEqual([5, 2]);
    expect(bounded.usage()).toMatchObject({ blobReads: 2, blobBytes: 5 });
    const exhausted = await bounded.readBlob(repository, sha, repoPath('c.ts'), 100);
    expect(exhausted).toMatchObject({
      ok: false,
      failure: { code: 'provider_source_budget_exceeded', retryable: false },
    });
  });

  it('reserves bytes before concurrent provider reads', async () => {
    const limits: number[] = [];
    const bounded = new BudgetedRepositoryReader(reader(limits), {
      maximumMetadataCalls: 0,
      maximumBlobReads: 2,
      maximumBlobBytes: 5,
    });

    const results = await Promise.all([
      bounded.readBlob(repository, sha, repoPath('a.ts'), 100),
      bounded.readBlob(repository, sha, repoPath('b.ts'), 100),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(limits).toEqual([5]);
    expect(bounded.usage()).toMatchObject({
      blobReads: 1,
      blobBytes: 3,
      budgetExhaustions: 1,
    });
  });
});
