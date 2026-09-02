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
import { infrastructureAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'3'.repeat(64)}`);
const context = {
  infrastructureEnvironment: 'production',
  infrastructureServiceScope: 'payments',
} as const;
function artifact(path: string, name: string): ArtifactInput {
  const bytes = new TextEncoder().encode(
    `apiVersion: v1\nkind: Service\nmetadata:\n  name: ${name}\nspec:\n  ports:\n    - port: 8080\n`,
  );
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}
function view(item: AdapterPartitionBuildV2): AdapterPartitionViewV2 {
  return {
    partitionKey: item.partitionKey,
    ownedPaths: item.ownedPaths,
    dependencyKeys: item.dependencyKeys,
    payload: item.payload,
    outputHash: contentHash(hashCanonical(item.payload)),
  };
}
async function incremental(input: {
  base: readonly ArtifactInput[];
  head: readonly ArtifactInput[];
  changes: readonly AdapterPathChange[];
  changedArtifacts: readonly ArtifactInput[];
}) {
  const built = await infrastructureAdapter.buildPartitions({
    artifacts: input.base,
    configRevision: revision,
    context,
  });
  const basePartitions = built.partitions.map(view);
  const plan = infrastructureAdapter.planInvalidation({
    partitions: basePartitions,
    changes: input.changes,
    context,
  });
  const updated = await infrastructureAdapter.updatePartitions({
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
  const materialized = await infrastructureAdapter.materializePartitions({
    partitions: [...partitions.values()],
    configRevision: revision,
    context,
  });
  const clean = await infrastructureAdapter.extract({
    artifacts: input.head,
    configRevision: revision,
    context,
  });
  return { updated, materialized, clean };
}

describe('infrastructure per-artifact incremental partitions', () => {
  it('replaces only a changed manifest and equals a clean rebuild', async () => {
    const first = artifact('k8s/a.yaml', 'a');
    const untouched = artifact('k8s/b.yaml', 'b');
    const changed = artifact('k8s/a.yaml', 'a-v2');
    const result = await incremental({
      base: [first, untouched],
      head: [changed, untouched],
      changes: [{ kind: 'modified', path: changed.path }],
      changedArtifacts: [changed],
    });
    expect(result.updated.replacements).toHaveLength(1);
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('handles deletion and rename tombstones', async () => {
    const removed = artifact('k8s/a.yaml', 'a');
    const original = artifact('k8s/b.yaml', 'b');
    const renamed = artifact('manifests/b.yaml', 'b');
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
      'infrastructure-document:k8s/a.yaml',
      'infrastructure-document:k8s/b.yaml',
    ]);
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('reports a missing changed blob as partial', async () => {
    const first = artifact('k8s/a.yaml', 'a');
    const built = await infrastructureAdapter.buildPartitions({
      artifacts: [first],
      configRevision: revision,
      context,
    });
    const partitions = built.partitions.map(view);
    const changes = [{ kind: 'modified' as const, path: first.path }];
    const plan = infrastructureAdapter.planInvalidation({ partitions, changes, context });
    const updated = await infrastructureAdapter.updatePartitions({
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
      scope: first.path,
    });
  });
});
