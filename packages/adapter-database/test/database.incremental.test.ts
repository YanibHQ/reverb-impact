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

import { databaseAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'4'.repeat(64)}`);
const context = { databaseNamespace: 'billing-primary', sqlDialect: 'postgresql' } as const;

function artifact(path: string, text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
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
  const built = await databaseAdapter.buildPartitions({
    artifacts: input.base,
    configRevision: revision,
    context,
  });
  const basePartitions = built.partitions.map(view);
  const plan = databaseAdapter.planInvalidation({
    partitions: basePartitions,
    changes: input.changes,
    context,
  });
  const updated = await databaseAdapter.updatePartitions({
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
  const materialized = await databaseAdapter.materializePartitions({
    partitions: [...partitions.values()],
    configRevision: revision,
    context,
  });
  const clean = await databaseAdapter.extract({
    artifacts: input.head,
    configRevision: revision,
    context,
  });
  return { plan, updated, materialized, clean };
}

const initial = artifact(
  'migrations/001.sql',
  'CREATE TABLE public.accounts (id uuid NOT NULL, email text NULL);',
);
const reader = artifact('src/read.ts', "client.query('SELECT id, email FROM public.accounts');");

describe('database per-artifact incremental partitions', () => {
  it('replaces only a changed artifact and equals a clean rebuild', async () => {
    const changed = artifact(
      'migrations/001.sql',
      'CREATE TABLE public.accounts (id uuid NOT NULL, email varchar(512) NULL);',
    );
    const result = await incremental({
      base: [initial, reader],
      head: [changed, reader],
      changes: [{ kind: 'modified', path: changed.path }],
      changedArtifacts: [changed],
    });
    expect(result.updated.replacements.map((item) => item.partitionKey)).toEqual([
      'database-document:migrations/001.sql',
    ]);
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('adds a later migration without rebuilding retained documents', async () => {
    const added = artifact(
      'migrations/002.sql',
      'ALTER TABLE public.accounts ADD COLUMN display_name text NULL;',
    );
    const result = await incremental({
      base: [initial, reader],
      head: [initial, added, reader],
      changes: [{ kind: 'added', path: added.path }],
      changedArtifacts: [added],
    });
    expect(result.updated.replacements).toHaveLength(1);
    expect(result.updated.coverage.state).toBe('complete');
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('emits deletion and rename tombstones with clean equivalence', async () => {
    const renamed = artifact(
      'src/account-reader.ts',
      "client.query('SELECT id, email FROM public.accounts');",
    );
    const result = await incremental({
      base: [initial, reader],
      head: [renamed],
      changes: [
        { kind: 'deleted', path: initial.path },
        { kind: 'renamed', path: renamed.path, previousPath: reader.path },
      ],
      changedArtifacts: [renamed],
    });
    expect(result.updated.tombstones).toEqual([
      'database-document:migrations/001.sql',
      'database-document:src/read.ts',
    ]);
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('reports a missing changed blob without scanning wider', async () => {
    const built = await databaseAdapter.buildPartitions({
      artifacts: [initial],
      configRevision: revision,
      context,
    });
    const partitions = built.partitions.map(view);
    const changes = [{ kind: 'modified' as const, path: initial.path }];
    const plan = databaseAdapter.planInvalidation({ partitions, changes, context });
    const updated = await databaseAdapter.updatePartitions({
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
      scope: initial.path,
    });
  });
});
