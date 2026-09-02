import { describe, expect, it } from 'vitest';

import {
  adapterId,
  assertCanonicalAdapterGenerationSnapshot,
  assertCanonicalAdapterSemanticPartition,
  configRevision,
  finalizeAdapterGenerationSnapshot,
  finalizeAdapterSemanticPartition,
  generationId,
  registryRevision,
  repoPath,
  repositoryStableId,
  workspaceId,
} from '../src/index.js';

const fixture = {
  workspaceId: workspaceId('wsp_01990f64-0000-7000-8000-000000000201'),
  repositoryId: repositoryStableId(
    'local:sha256:1111111111111111111111111111111111111111111111111111111111111111',
  ),
  adapterId: adapterId('reverb.snapshot-test'),
  adapterVersion: '1.0.0',
  identityVersion: 1,
  partitioningVersion: 1,
  configRevision: configRevision(
    'cfg_sha256:2222222222222222222222222222222222222222222222222222222222222222',
  ),
  registryRevision: registryRevision(
    'reg_sha256:3333333333333333333333333333333333333333333333333333333333333333',
  ),
};

describe('adapter semantic snapshots', () => {
  it('canonicalizes partition paths, dependencies, and snapshot entries', () => {
    const partition = finalizeAdapterSemanticPartition({
      ...fixture,
      partitionKey: 'package:fixture',
      ownedPaths: [repoPath('src/z.ts'), repoPath('src/a.ts')],
      dependencyKeys: ['package:z', 'package:a'],
      payload: { definitions: [] },
    });
    expect(partition.ownedPaths).toEqual(['src/a.ts', 'src/z.ts']);
    expect(partition.dependencyKeys).toEqual(['package:a', 'package:z']);
    expect(assertCanonicalAdapterSemanticPartition(partition)).toBe(partition);

    const snapshot = finalizeAdapterGenerationSnapshot({
      ...fixture,
      generationId: generationId('gen_01990f64-0000-7000-8000-000000000201'),
      state: 'complete',
      entries: [
        {
          kind: 'replacement',
          partitionKey: 'package:z',
          partitionHash: partition.outputHash,
        },
        {
          kind: 'replacement',
          partitionKey: 'package:a',
          partitionHash: partition.outputHash,
        },
      ],
    });
    expect(snapshot.entries.map((entry) => entry.partitionKey)).toEqual(['package:a', 'package:z']);
    expect(assertCanonicalAdapterGenerationSnapshot(snapshot)).toBe(snapshot);
  });

  it('rejects root tombstones and content-hash tampering', () => {
    expect(() =>
      finalizeAdapterGenerationSnapshot({
        ...fixture,
        generationId: generationId('gen_01990f64-0000-7000-8000-000000000202'),
        state: 'complete',
        entries: [{ kind: 'tombstone', partitionKey: 'package:deleted' }],
      }),
    ).toThrow(/root adapter snapshot/);

    const partition = finalizeAdapterSemanticPartition({
      ...fixture,
      partitionKey: 'package:fixture',
      ownedPaths: [repoPath('src/index.ts')],
      dependencyKeys: [],
      payload: { definitions: [] },
    });
    expect(() =>
      assertCanonicalAdapterSemanticPartition({
        ...partition,
        payload: { definitions: ['tampered'] },
      }),
    ).toThrow(/not canonical/);
  });
});
