import assert from 'node:assert/strict';

import {
  adapterId,
  commitSha,
  configRevision,
  contentHash,
  finalizeAdapterGenerationSnapshot,
  finalizeAdapterSemanticPartition,
  generationId,
  generationLeaseId,
  instant,
  overlayId,
  registryRevision,
  repoPath,
  repositoryStableId,
  treeHash,
  workspaceId,
  type BeginGeneration,
} from '@yanib/reverb-domain';
import type { AdapterSnapshotStore, GenerationStore } from '@yanib/reverb-application';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000101');
const repository = repositoryStableId(
  'local:sha256:1010101010101010101010101010101010101010101010101010101010101010',
);
const config = configRevision(
  'cfg_sha256:2020202020202020202020202020202020202020202020202020202020202020',
);
const registry = registryRevision(
  'reg_sha256:3030303030303030303030303030303030303030303030303030303030303030',
);
const adapter = adapterId('reverb.snapshot-fixture');
const now = instant('2026-09-01T20:00:00.000Z');
const later = instant('2026-09-01T20:01:00.000Z');

function generation(sequence: number, sha: string): BeginGeneration {
  return {
    generationId: generationId(
      `gen_01990f64-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`,
    ),
    workspaceId: workspace,
    repositoryId: repository,
    commitSha: commitSha(sha.repeat(40)),
    treeHash: treeHash((sha === 'a' ? 'b' : 'c').repeat(40)),
    indexerBundleVersion: 'snapshot-fixture-1.0.0',
    configRevision: config,
    registryRevision: registry,
    startedAt: now,
    leaseId: generationLeaseId(
      `lea_01990f64-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`,
    ),
    leaseExpiresAt: later,
  };
}

async function complete(store: GenerationStore, input: BeginGeneration): Promise<void> {
  const lease = await store.beginGeneration(input);
  assert.equal(lease.ok, true);
  if (!lease.ok) return;
  const result = await store.completeGeneration(lease.value, {
    state: 'complete',
    completedAt: later,
    selectable: true,
    coverage: [],
    diagnostics: [],
    coverageHash: contentHash(
      'sha256:4040404040404040404040404040404040404040404040404040404040404040',
    ),
    artifactResultHash: contentHash(
      'sha256:5050505050505050505050505050505050505050505050505050505050505050',
    ),
  });
  assert.equal(result.ok, true);
}

function partition(key: string, path: string, value: number) {
  return finalizeAdapterSemanticPartition({
    workspaceId: workspace,
    repositoryId: repository,
    adapterId: adapter,
    adapterVersion: '1.0.0',
    identityVersion: 1,
    partitioningVersion: 1,
    configRevision: config,
    registryRevision: registry,
    partitionKey: key,
    ownedPaths: [repoPath(path)],
    dependencyKeys: [],
    payload: { value },
  });
}

export interface AdapterSnapshotStoreHandle {
  readonly store: GenerationStore & AdapterSnapshotStore;
  close(): void | Promise<void>;
}

export type AdapterSnapshotStoreFactory = () =>
  | AdapterSnapshotStoreHandle
  | Promise<AdapterSnapshotStoreHandle>;

export async function runAdapterSnapshotStoreConformance(
  factory: AdapterSnapshotStoreFactory,
): Promise<void> {
  const handle = await factory();
  try {
    const baseGeneration = generation(101, 'a');
    const headGeneration = generation(102, 'b');
    await complete(handle.store, baseGeneration);
    const overlay = overlayId('ovl_01990f64-0000-7000-8000-000000000101');
    const overlayLease = await handle.store.beginOverlay({
      overlay: {
        id: overlay,
        workspaceId: workspace,
        repositoryId: repository,
        baseGenerationId: baseGeneration.generationId,
        baseSha: baseGeneration.commitSha,
        headSha: headGeneration.commitSha,
        headTreeHash: headGeneration.treeHash,
        indexerBundleVersion: baseGeneration.indexerBundleVersion,
        configRevision: config,
        registryRevision: registry,
        state: 'building',
        supersessionKey: contentHash(
          'sha256:6060606060606060606060606060606060606060606060606060606060606060',
        ),
        diffHash: contentHash(
          'sha256:7070707070707070707070707070707070707070707070707070707070707070',
        ),
        startedAt: now,
      },
      leaseId: headGeneration.leaseId,
      leaseExpiresAt: headGeneration.leaseExpiresAt,
    });
    assert.equal(overlayLease.ok, true);
    if (!overlayLease.ok) return;
    assert.equal(
      (
        await handle.store.completeOverlay(overlayLease.value, overlay, {
          state: 'complete',
          completedAt: later,
          resultHash: contentHash(
            'sha256:8080808080808080808080808080808080808080808080808080808080808080',
          ),
        })
      ).ok,
      true,
    );
    assert.equal(
      (
        await handle.store.deriveGeneration({
          generationId: headGeneration.generationId,
          baseGenerationId: baseGeneration.generationId,
          overlayId: overlay,
          completedAt: later,
          coverage: [],
          diagnostics: [],
          coverageHash: contentHash(
            'sha256:9090909090909090909090909090909090909090909090909090909090909090',
          ),
          artifactResultHash: contentHash(`sha256:${'a'.repeat(64)}`),
        })
      ).ok,
      true,
    );

    const first = partition('package:a', 'packages/a/index.ts', 1);
    const stable = partition('package:stable', 'packages/stable/index.ts', 2);
    const replacement = partition('package:c', 'packages/c/index.ts', 3);
    for (const value of [first, stable, replacement]) {
      const written = await handle.store.putAdapterPartition(value);
      assert.equal(written.ok, true);
      if (written.ok) assert.equal(written.value, value.outputHash);
    }

    const baseSnapshot = finalizeAdapterGenerationSnapshot({
      workspaceId: workspace,
      repositoryId: repository,
      generationId: baseGeneration.generationId,
      adapterId: adapter,
      adapterVersion: '1.0.0',
      identityVersion: 1,
      partitioningVersion: 1,
      configRevision: config,
      registryRevision: registry,
      state: 'complete',
      entries: [
        {
          kind: 'replacement',
          partitionKey: first.partitionKey,
          partitionHash: first.outputHash,
        },
        {
          kind: 'replacement',
          partitionKey: stable.partitionKey,
          partitionHash: stable.outputHash,
        },
      ],
    });
    assert.equal((await handle.store.putAdapterSnapshot(baseSnapshot)).ok, true);

    const headSnapshot = finalizeAdapterGenerationSnapshot({
      workspaceId: workspace,
      repositoryId: repository,
      generationId: headGeneration.generationId,
      adapterId: adapter,
      adapterVersion: '1.0.0',
      identityVersion: 1,
      partitioningVersion: 1,
      configRevision: config,
      registryRevision: registry,
      state: 'complete',
      baseSnapshotHash: baseSnapshot.outputHash,
      entries: [
        { kind: 'tombstone', partitionKey: first.partitionKey },
        {
          kind: 'replacement',
          partitionKey: replacement.partitionKey,
          partitionHash: replacement.outputHash,
        },
      ],
    });
    const written = await handle.store.putAdapterSnapshot(headSnapshot);
    assert.equal(written.ok, true);
    assert.equal((await handle.store.putAdapterSnapshot(headSnapshot)).ok, true);

    const query = {
      workspaceId: workspace,
      repositoryId: repository,
      generationId: headGeneration.generationId,
      adapterId: adapter,
    };
    const selected = await handle.store.getAdapterSnapshot(query);
    assert.equal(selected.ok, true);
    if (selected.ok) assert.equal(selected.value?.outputHash, headSnapshot.outputHash);
    const resolved = await handle.store.resolveAdapterPartitions(query);
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.deepEqual(
        resolved.value.map((value) => value.partitionKey),
        ['package:c', 'package:stable'],
      );
    }

    const conflicting = finalizeAdapterGenerationSnapshot({
      ...headSnapshot,
      entries: [],
      baseSnapshotHash: baseSnapshot.outputHash,
    });
    assert.equal((await handle.store.putAdapterSnapshot(conflicting)).ok, false);
  } finally {
    await handle.close();
  }
}
