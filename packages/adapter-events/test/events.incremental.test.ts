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

import { eventAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'8'.repeat(64)}`);

function artifact(path: string, destination: string): ArtifactInput {
  const bytes = new TextEncoder().encode(`
schema: reverb.events
schemaVersion: '1.0'
bindings:
  - role: producer
    provider: kafka
    brokerNamespace: prod
    destination: ${destination}
`);
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
  const built = await eventAdapter.buildPartitions({
    artifacts: input.base,
    configRevision: revision,
    context: {},
  });
  const basePartitions = built.partitions.map(view);
  const plan = eventAdapter.planInvalidation({
    partitions: basePartitions,
    changes: input.changes,
    context: {},
  });
  const updated = await eventAdapter.updatePartitions({
    basePartitions,
    plan,
    changes: input.changes,
    changedArtifacts: input.changedArtifacts,
    configRevision: revision,
    context: {},
  });
  const partitions = new Map(basePartitions.map((item) => [item.partitionKey, item]));
  updated.tombstones.forEach((key) => partitions.delete(key));
  updated.replacements.forEach((item) => partitions.set(item.partitionKey, view(item)));
  const materialized = await eventAdapter.materializePartitions({
    partitions: [...partitions.values()],
    configRevision: revision,
    context: {},
  });
  const clean = await eventAdapter.extract({
    artifacts: input.head,
    configRevision: revision,
    context: {},
  });
  return { plan, updated, materialized, clean };
}

describe('event per-artifact incremental partitions', () => {
  it('replaces only a changed manifest and equals a clean rebuild', async () => {
    const first = artifact('events/a.yaml', 'orders.created');
    const untouched = artifact('events/b.yaml', 'billing.created');
    const changed = artifact('events/a.yaml', 'orders.v2');
    const result = await incremental({
      base: [first, untouched],
      head: [changed, untouched],
      changes: [{ kind: 'modified', path: changed.path }],
      changedArtifacts: [changed],
    });
    expect(result.updated.replacements).toHaveLength(1);
    expect(result.updated.replacements[0]?.partitionKey).toBe('event-document:events/a.yaml');
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('emits tombstones for deletion and rename while preserving clean equivalence', async () => {
    const removed = artifact('events/a.yaml', 'orders.created');
    const original = artifact('events/b.yaml', 'billing.created');
    const renamed = artifact('config/events.yaml', 'billing.created');
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
      'event-document:events/a.yaml',
      'event-document:events/b.yaml',
    ]);
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('never scans wider and reports a missing changed blob as partial', async () => {
    const original = artifact('events/a.yaml', 'orders.created');
    const built = await eventAdapter.buildPartitions({
      artifacts: [original],
      configRevision: revision,
      context: {},
    });
    const partitions = built.partitions.map(view);
    const changes = [{ kind: 'modified' as const, path: original.path }];
    const plan = eventAdapter.planInvalidation({ partitions, changes, context: {} });
    const updated = await eventAdapter.updatePartitions({
      basePartitions: partitions,
      plan,
      changes,
      changedArtifacts: [],
      configRevision: revision,
      context: {},
    });
    expect(updated.coverage.state).toBe('partial');
    expect(updated.coverage.limitations).toContainEqual({
      code: 'changed_artifact_missing',
      scope: original.path,
    });
  });
});
