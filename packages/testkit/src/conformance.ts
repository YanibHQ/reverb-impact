import assert from 'node:assert/strict';

import {
  adapterId,
  commitSha,
  configRevision,
  contentHash,
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
  type FileArtifact,
  type GenerationId,
} from '@yanib/reverb-domain';
import type { GenerationStore } from '@yanib/reverb-application';

export const CONFORMANCE_FIXTURE = Object.freeze({
  workspaceId: workspaceId('wsp_01990f64-0000-7000-8000-000000000001'),
  repositoryId: repositoryStableId(
    'local:sha256:1111111111111111111111111111111111111111111111111111111111111111',
  ),
  configRevision: configRevision(
    'cfg_sha256:2222222222222222222222222222222222222222222222222222222222222222',
  ),
  registryRevision: registryRevision(
    'reg_sha256:3333333333333333333333333333333333333333333333333333333333333333',
  ),
  now: instant('2026-08-28T20:00:00.000Z'),
  expiresAt: instant('2026-08-28T20:15:00.000Z'),
  later: instant('2026-08-28T20:01:00.000Z'),
});

function begin(sequence: number, shaCharacter: string): BeginGeneration {
  return {
    generationId: generationId(
      `gen_01990f64-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`,
    ),
    workspaceId: CONFORMANCE_FIXTURE.workspaceId,
    repositoryId: CONFORMANCE_FIXTURE.repositoryId,
    commitSha: commitSha(shaCharacter.repeat(40)),
    treeHash: treeHash(
      (Number.parseInt(shaCharacter, 16) + 1).toString(16).repeat(40).slice(0, 40),
    ),
    indexerBundleVersion: 'foundation-1.0.0',
    configRevision: CONFORMANCE_FIXTURE.configRevision,
    registryRevision: CONFORMANCE_FIXTURE.registryRevision,
    startedAt: CONFORMANCE_FIXTURE.now,
    leaseId: generationLeaseId(
      `lea_01990f64-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`,
    ),
    leaseExpiresAt: CONFORMANCE_FIXTURE.expiresAt,
  };
}

function artifact(generation: GenerationId): FileArtifact {
  return {
    generationId: generation,
    path: repoPath('src/index.ts'),
    sourceBlobId: 'a'.repeat(40),
    contentHash: contentHash(
      'sha256:4444444444444444444444444444444444444444444444444444444444444444',
    ),
    size: 12,
    language: 'typescript',
    classification: 'source',
    parseState: 'parsed',
    parserId: adapterId('reverb.file-metadata'),
    parserVersion: '1.0.0',
    configRevision: CONFORMANCE_FIXTURE.configRevision,
    lineCount: 1,
  };
}

async function complete(store: GenerationStore, input: BeginGeneration): Promise<void> {
  const lease = await store.beginGeneration(input);
  assert.equal(lease.ok, true);
  if (!lease.ok) return;
  const batch = await store.putArtifacts(lease.value, {
    artifacts: [artifact(input.generationId)],
    diagnostics: [],
    coverage: [
      {
        dimension: 'file',
        state: 'complete',
        eligible: 1,
        processed: 1,
        skipped: 0,
        failed: 0,
      },
    ],
  });
  assert.equal(batch.ok, true);
  const completed = await store.completeGeneration(lease.value, {
    state: 'complete',
    completedAt: CONFORMANCE_FIXTURE.later,
    selectable: true,
    coverage: [],
    diagnostics: [],
    coverageHash: contentHash(
      'sha256:5555555555555555555555555555555555555555555555555555555555555555',
    ),
    artifactResultHash: contentHash(
      'sha256:6666666666666666666666666666666666666666666666666666666666666666',
    ),
  });
  assert.equal(completed.ok, true);
}

export interface ConformanceStoreHandle {
  readonly store: GenerationStore;
  close(): void | Promise<void>;
}

export type ConformanceStoreFactory = () =>
  | ConformanceStoreHandle
  | Promise<ConformanceStoreHandle>;

export async function runGenerationStoreConformance(
  factory: ConformanceStoreFactory,
): Promise<void> {
  {
    const handle = await factory();
    try {
      const input = begin(1, 'a');
      const lease = await handle.store.beginGeneration(input);
      assert.equal(lease.ok, true);
      if (!lease.ok) throw new Error('Fixture generation lease was not created.');
      const duplicate = await handle.store.beginGeneration(input);
      assert.equal(duplicate.ok, true);
      if (duplicate.ok) assert.equal(duplicate.value.existing, true);
      const put = await handle.store.putArtifacts(lease.value, {
        artifacts: [artifact(input.generationId)],
        diagnostics: [],
        coverage: [],
      });
      assert.equal(put.ok, true);
      const invisible = await handle.store.listArtifacts(input.generationId);
      assert.equal(invisible.ok, false);
      const finished = await handle.store.completeGeneration(lease.value, {
        state: 'complete',
        completedAt: CONFORMANCE_FIXTURE.later,
        selectable: true,
        coverage: [],
        diagnostics: [],
        coverageHash: contentHash(
          'sha256:7777777777777777777777777777777777777777777777777777777777777777',
        ),
        artifactResultHash: contentHash(
          'sha256:8888888888888888888888888888888888888888888888888888888888888888',
        ),
      });
      assert.equal(finished.ok, true);
      const visible = await handle.store.listArtifacts(input.generationId);
      assert.equal(visible.ok, true);
      if (visible.ok) assert.equal(visible.value.length, 1);
    } finally {
      await handle.close();
    }
  }

  {
    const handle = await factory();
    try {
      const healthy = begin(2, 'b');
      await complete(handle.store, healthy);
      const failedInput = begin(3, 'c');
      const lease = await handle.store.beginGeneration(failedInput);
      assert.equal(lease.ok, true);
      if (!lease.ok) throw new Error('Fixture generation lease was not created.');
      const failed = await handle.store.failGeneration(lease.value, {
        failedAt: CONFORMANCE_FIXTURE.later,
        code: 'infrastructure_failure',
        safeMessage: 'fixture failure',
      });
      assert.equal(failed.ok, true);
      const selected = await handle.store.selectGeneration({
        workspaceId: CONFORMANCE_FIXTURE.workspaceId,
        repositoryId: CONFORMANCE_FIXTURE.repositoryId,
        allowPartial: true,
      });
      assert.equal(selected.ok, true);
      if (selected.ok) {
        assert.equal(selected.value.state, 'selected');
        if (selected.value.state === 'selected') {
          assert.equal(selected.value.generation.id, healthy.generationId);
        }
      }
    } finally {
      await handle.close();
    }
  }

  {
    const handle = await factory();
    try {
      const base = begin(4, 'd');
      await complete(handle.store, base);
      const id = overlayId('ovl_01990f64-0000-7000-8000-000000000004');
      const leaseId = generationLeaseId('lea_01990f64-0000-7000-8000-000000000044');
      const overlayLease = await handle.store.beginOverlay({
        overlay: {
          id,
          workspaceId: CONFORMANCE_FIXTURE.workspaceId,
          repositoryId: CONFORMANCE_FIXTURE.repositoryId,
          baseGenerationId: base.generationId,
          baseSha: base.commitSha,
          headSha: commitSha('e'.repeat(40)),
          headTreeHash: treeHash('f'.repeat(40)),
          indexerBundleVersion: base.indexerBundleVersion,
          configRevision: base.configRevision,
          registryRevision: base.registryRevision,
          state: 'building',
          supersessionKey: contentHash(
            'sha256:9999999999999999999999999999999999999999999999999999999999999999',
          ),
          diffHash: contentHash(
            'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          startedAt: CONFORMANCE_FIXTURE.now,
        },
        leaseId,
        leaseExpiresAt: CONFORMANCE_FIXTURE.expiresAt,
      });
      assert.equal(overlayLease.ok, true);
      if (!overlayLease.ok) throw new Error('Fixture overlay lease was not created.');
      const tombstone = {
        overlayId: id,
        path: repoPath('src/deleted.ts'),
        kind: 'tombstone' as const,
      };
      const { generationId: _generationId, ...replacementArtifact } = {
        ...artifact(base.generationId),
        sourceBlobId: 'b'.repeat(40),
        contentHash: contentHash(
          'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        ),
      };
      void _generationId;
      const replacement = {
        overlayId: id,
        path: repoPath('src/index.ts'),
        kind: 'replacement' as const,
        artifact: replacementArtifact,
      };
      assert.equal(
        (await handle.store.putOverlayEntries(overlayLease.value, id, [tombstone, replacement])).ok,
        true,
      );
      assert.equal((await handle.store.listOverlayEntries(id)).ok, false);
      assert.equal(
        (
          await handle.store.completeOverlay(overlayLease.value, id, {
            state: 'complete',
            completedAt: CONFORMANCE_FIXTURE.later,
            resultHash: contentHash(
              'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            ),
          })
        ).ok,
        true,
      );
      const entries = await handle.store.listOverlayEntries(id);
      assert.equal(entries.ok, true);
      if (entries.ok) assert.deepEqual(entries.value, [tombstone, replacement]);

      const derivedId = generationId('gen_01990f64-0000-7000-8000-000000000040');
      const derivation = {
        generationId: derivedId,
        baseGenerationId: base.generationId,
        overlayId: id,
        completedAt: CONFORMANCE_FIXTURE.later,
        coverage: [],
        diagnostics: [],
        coverageHash: contentHash(
          'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        ),
        artifactResultHash: contentHash(
          'sha256:0101010101010101010101010101010101010101010101010101010101010101',
        ),
      };
      const derived = await handle.store.deriveGeneration(derivation);
      assert.equal(derived.ok, true);
      if (!derived.ok) throw new Error('Fixture derived generation was not created.');
      assert.equal(derived.value.selectable, false);
      assert.equal(derived.value.commitSha, commitSha('e'.repeat(40)));
      assert.deepEqual(derived.value.derivation, {
        baseGenerationId: base.generationId,
        overlayId: id,
        storageMode: 'base_overlay',
      });
      const logicalArtifacts = await handle.store.listArtifacts(derivedId);
      assert.equal(logicalArtifacts.ok, true);
      if (logicalArtifacts.ok) {
        assert.equal(logicalArtifacts.value.length, 1);
        assert.equal(logicalArtifacts.value[0]?.generationId, derivedId);
        assert.equal(logicalArtifacts.value[0]?.sourceBlobId, 'b'.repeat(40));
      }
      const retry = await handle.store.deriveGeneration(derivation);
      assert.equal(retry.ok, true);
      const selected = await handle.store.selectGeneration({
        workspaceId: CONFORMANCE_FIXTURE.workspaceId,
        repositoryId: CONFORMANCE_FIXTURE.repositoryId,
        allowPartial: true,
      });
      assert.equal(selected.ok, true);
      if (selected.ok && selected.value.state === 'selected') {
        assert.equal(selected.value.generation.id, base.generationId);
      }
    } finally {
      await handle.close();
    }
  }

  {
    const handle = await factory();
    try {
      const input = begin(5, '1');
      const lease = await handle.store.beginGeneration(input);
      assert.equal(lease.ok, true);
      if (!lease.ok) throw new Error('Fixture generation lease was not created.');
      assert.equal(
        (await handle.store.expireLease(lease.value, CONFORMANCE_FIXTURE.later)).ok,
        true,
      );
      assert.equal(
        (
          await handle.store.putArtifacts(lease.value, {
            artifacts: [artifact(input.generationId)],
            diagnostics: [],
            coverage: [],
          })
        ).ok,
        false,
      );
      const expired = await handle.store.getGeneration(input.generationId);
      assert.equal(expired.ok, true);
      if (expired.ok) assert.equal(expired.value.state, 'expired');
    } finally {
      await handle.close();
    }
  }

  {
    const handle = await factory();
    try {
      const input = begin(6, '2');
      const lease = await handle.store.beginGeneration(input);
      assert.equal(lease.ok, true);
      if (!lease.ok) throw new Error('Fixture generation lease was not created.');
      const wrongGeneration = begin(9, '9').generationId;
      const write = await handle.store.putArtifacts(lease.value, {
        artifacts: [
          artifact(input.generationId),
          { ...artifact(wrongGeneration), path: repoPath('src/wrong.ts') },
        ],
        diagnostics: [],
        coverage: [],
      });
      assert.equal(write.ok, false);
      const completed = await handle.store.completeGeneration(lease.value, {
        state: 'complete',
        completedAt: CONFORMANCE_FIXTURE.later,
        selectable: true,
        coverage: [],
        diagnostics: [],
        coverageHash: contentHash(
          'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        ),
        artifactResultHash: contentHash(
          'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        ),
      });
      assert.equal(completed.ok, true);
      const artifacts = await handle.store.listArtifacts(input.generationId);
      assert.equal(artifacts.ok, true);
      if (artifacts.ok) assert.equal(artifacts.value.length, 0);
    } finally {
      await handle.close();
    }
  }

  {
    const handle = await factory();
    try {
      const failedInput = begin(7, '3');
      const firstLease = await handle.store.beginGeneration(failedInput);
      assert.equal(firstLease.ok, true);
      if (!firstLease.ok) throw new Error('Fixture generation lease was not created.');
      assert.equal(
        (
          await handle.store.failGeneration(firstLease.value, {
            failedAt: CONFORMANCE_FIXTURE.later,
            code: 'infrastructure_failure',
            safeMessage: 'retry fixture',
          })
        ).ok,
        true,
      );
      const retryInput = {
        ...failedInput,
        generationId: begin(8, '3').generationId,
        leaseId: begin(8, '3').leaseId,
      };
      await complete(handle.store, retryInput);
      const selected = await handle.store.selectGeneration({
        workspaceId: CONFORMANCE_FIXTURE.workspaceId,
        repositoryId: CONFORMANCE_FIXTURE.repositoryId,
        commitSha: failedInput.commitSha,
        indexerBundleVersion: failedInput.indexerBundleVersion,
        configRevision: failedInput.configRevision,
        allowPartial: true,
      });
      assert.equal(selected.ok, true);
      if (selected.ok && selected.value.state === 'selected') {
        assert.equal(selected.value.generation.id, retryInput.generationId);
      } else {
        assert.fail('Healthy retry was not selected.');
      }
    } finally {
      await handle.close();
    }
  }
}
