import {
  canonicalJson,
  configRevision,
  contentHash,
  hashCanonical,
  repoPath,
  sha256Bytes,
} from '@yanib/reverb-domain';
import type {
  AdapterPartitionBuildV2,
  AdapterPartitionViewV2,
  AdapterPathChange,
  ArtifactInput,
} from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { httpAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'2'.repeat(64)}`);
const context = { httpServiceId: 'billing-api' } as const;

function artifact(path: string, route: string): ArtifactInput {
  const bytes = new TextEncoder().encode(`app.get('${route}', handler);`);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

function view(partition: AdapterPartitionBuildV2): AdapterPartitionViewV2 {
  return {
    partitionKey: partition.partitionKey,
    ownedPaths: partition.ownedPaths,
    dependencyKeys: partition.dependencyKeys,
    payload: partition.payload,
    outputHash: contentHash(hashCanonical(partition.payload)),
  };
}

async function incremental(input: {
  readonly base: readonly ArtifactInput[];
  readonly head: readonly ArtifactInput[];
  readonly changes: readonly AdapterPathChange[];
  readonly changedArtifacts: readonly ArtifactInput[];
}) {
  const built = await httpAdapter.buildPartitions({
    artifacts: input.base,
    configRevision: revision,
    context,
  });
  const basePartitions = built.partitions.map(view);
  const plan = httpAdapter.planInvalidation({
    partitions: basePartitions,
    changes: input.changes,
    context,
  });
  const updated = await httpAdapter.updatePartitions({
    basePartitions,
    plan,
    changes: input.changes,
    changedArtifacts: input.changedArtifacts,
    configRevision: revision,
    context,
  });
  const partitions = new Map(basePartitions.map((item) => [item.partitionKey, item]));
  updated.tombstones.forEach((key) => partitions.delete(key));
  updated.replacements.forEach((item) => partitions.set(item.partitionKey, view(item)));
  const materialized = await httpAdapter.materializePartitions({
    partitions: [...partitions.values()],
    configRevision: revision,
    context,
  });
  const clean = await httpAdapter.extract({
    artifacts: input.head,
    configRevision: revision,
    context,
  });
  return { updated, materialized, clean };
}

describe('implicit HTTP per-artifact incremental partitions', () => {
  it('replaces one changed route and equals a clean rebuild', async () => {
    const original = artifact('src/accounts.ts', '/accounts/:id');
    const untouched = artifact('src/health.ts', '/health');
    const changed = artifact('src/accounts.ts', '/customers/:id');
    const result = await incremental({
      base: [original, untouched],
      head: [changed, untouched],
      changes: [{ kind: 'modified', path: changed.path }],
      changedArtifacts: [changed],
    });
    expect(result.updated.replacements).toHaveLength(1);
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('handles deletion and rename tombstones with clean equivalence', async () => {
    const removed = artifact('src/old.ts', '/old');
    const original = artifact('src/account.ts', '/accounts');
    const renamed = artifact('src/routes/account.ts', '/accounts');
    const result = await incremental({
      base: [removed, original],
      head: [renamed],
      changes: [
        { kind: 'deleted', path: removed.path },
        { kind: 'renamed', path: renamed.path, previousPath: original.path },
      ],
      changedArtifacts: [renamed],
    });
    expect(result.updated.tombstones).toEqual([
      'http-document:src/account.ts',
      'http-document:src/old.ts',
    ]);
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('reports an unavailable changed blob as partial', async () => {
    const original = artifact('src/account.ts', '/accounts');
    const built = await httpAdapter.buildPartitions({
      artifacts: [original],
      configRevision: revision,
      context,
    });
    const partitions = built.partitions.map(view);
    const changes = [{ kind: 'modified' as const, path: original.path }];
    const plan = httpAdapter.planInvalidation({ partitions, changes, context });
    const updated = await httpAdapter.updatePartitions({
      basePartitions: partitions,
      plan,
      changes,
      changedArtifacts: [],
      configRevision: revision,
      context,
    });
    expect(updated.coverage.state).toBe('partial');
    expect(updated.coverage.limitations).toContainEqual({
      code: 'changed_artifact_missing',
      scope: original.path,
    });
  });
});
