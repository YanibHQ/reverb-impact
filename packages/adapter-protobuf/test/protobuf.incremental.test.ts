import {
  canonicalJson,
  configRevision,
  contentHash,
  hashCanonical,
  repoPath,
  sha256Bytes,
} from '@yanib/reverb-domain';
import type {
  AdapterPartitionBuild,
  AdapterPartitionView,
  AdapterPathChange,
  ArtifactInput,
} from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { protobufAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'9'.repeat(64)}`);
const context = {
  generatedStubBindings: [
    {
      kind: 'method',
      packageName: 'pet.v1',
      declaration: 'PetService',
      member: 'GetPet',
      path: 'generated/pet.ts',
    },
  ],
} as const;

function artifact(path: string, value: unknown): ArtifactInput {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'generated',
  };
}

function descriptor(packageName: string, methodName: string, fieldType = 'TYPE_STRING') {
  return {
    file: [
      {
        name: `${packageName}/service.proto`,
        package: packageName,
        service: [
          {
            name: packageName === 'pet.v1' ? 'PetService' : 'AdminService',
            method: [{ name: methodName, inputType: '.Input', outputType: '.Output' }],
          },
        ],
        messageType: [
          {
            name: 'Record',
            field: [{ name: 'id', number: 1, type: fieldType }],
          },
        ],
      },
    ],
  };
}

function view(partition: AdapterPartitionBuild): AdapterPartitionView {
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
  const built = await protobufAdapter.buildPartitions({
    artifacts: input.base,
    configRevision: revision,
    context,
  });
  const basePartitions = built.partitions.map(view);
  const plan = protobufAdapter.planInvalidation({
    partitions: basePartitions,
    changes: input.changes,
    context,
  });
  const updated = await protobufAdapter.updatePartitions({
    basePartitions,
    plan,
    changes: input.changes,
    changedArtifacts: input.changedArtifacts,
    configRevision: revision,
    context,
  });
  const partitions = new Map(
    basePartitions.map((partition) => [partition.partitionKey, partition]),
  );
  for (const key of updated.tombstones) partitions.delete(key);
  for (const replacement of updated.replacements) {
    partitions.set(replacement.partitionKey, view(replacement));
  }
  const materialized = await protobufAdapter.materializePartitions({
    partitions: [...partitions.values()],
    configRevision: revision,
    context,
  });
  const clean = await protobufAdapter.extract({
    artifacts: input.head,
    configRevision: revision,
    context,
  });
  return { built, plan, updated, materialized, clean };
}

describe('Protobuf incremental descriptor partitions', () => {
  it('replaces only a changed descriptor set and matches clean extraction', async () => {
    const pets = artifact('descriptors/pets.json', descriptor('pet.v1', 'GetPet'));
    const admin = artifact('descriptors/admin.json', descriptor('admin.v1', 'GetAdmin'));
    const changed = artifact('descriptors/pets.json', descriptor('pet.v1', 'GetPet', 'TYPE_INT64'));
    const result = await incremental({
      base: [pets, admin],
      head: [changed, admin],
      changes: [{ kind: 'modified', path: changed.path }],
      changedArtifacts: [changed],
    });

    expect(result.updated.replacements).toHaveLength(1);
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('matches clean extraction after deletion and rename', async () => {
    const pets = artifact('descriptors/pets.json', descriptor('pet.v1', 'GetPet'));
    const admin = artifact('descriptors/admin.json', descriptor('admin.v1', 'GetAdmin'));
    const renamed = artifact('generated/internal.data', descriptor('admin.v1', 'GetAdmin'));
    const result = await incremental({
      base: [pets, admin],
      head: [renamed],
      changes: [
        { kind: 'deleted', path: pets.path },
        { kind: 'renamed', path: renamed.path, previousPath: admin.path },
      ],
      changedArtifacts: [renamed],
    });

    expect(result.updated.tombstones).toEqual([
      'descriptor:descriptors/admin.json',
      'descriptor:descriptors/pets.json',
    ]);
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('discovers an added descriptor set at an arbitrary path', async () => {
    const notes = artifact('notes/data.json', { value: 'not descriptors' });
    const added = artifact('generated/schema.payload', descriptor('pet.v1', 'GetPet'));
    const result = await incremental({
      base: [notes],
      head: [notes, added],
      changes: [{ kind: 'added', path: added.path }],
      changedArtifacts: [added],
    });

    expect(result.plan).toMatchObject({ complete: true, unmatchedPaths: [] });
    expect(result.updated.replacements).toHaveLength(1);
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('ignores a changed non-descriptor after inspecting only that blob', async () => {
    const schema = artifact('descriptors/pets.json', descriptor('pet.v1', 'GetPet'));
    const before = artifact('README.data', 'before');
    const after = artifact('README.data', 'after');
    const result = await incremental({
      base: [schema, before],
      head: [schema, after],
      changes: [{ kind: 'modified', path: after.path }],
      changedArtifacts: [after],
    });

    expect(result.updated).toMatchObject({ replacements: [], tombstones: [] });
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('marks coverage partial when a changed blob is missing', async () => {
    const schema = artifact('descriptors/pets.json', descriptor('pet.v1', 'GetPet'));
    const built = await protobufAdapter.buildPartitions({
      artifacts: [schema],
      configRevision: revision,
      context,
    });
    const basePartitions = built.partitions.map(view);
    const changes = [{ kind: 'modified' as const, path: schema.path }];
    const plan = protobufAdapter.planInvalidation({ partitions: basePartitions, changes, context });
    const updated = await protobufAdapter.updatePartitions({
      basePartitions,
      plan,
      changes,
      changedArtifacts: [],
      configRevision: revision,
      context,
    });

    expect(updated.coverage.state).toBe('partial');
    expect(updated.replacements).toEqual([]);
    expect(updated.diagnostics).toContainEqual(expect.objectContaining({ scope: schema.path }));
  });

  it('persists normalized descriptor facts without source bytes', async () => {
    const built = await protobufAdapter.buildPartitions({
      artifacts: [artifact('private.payload', descriptor('secret.v1', 'DoNotCopyImplementation'))],
      configRevision: revision,
      context,
    });
    const payload = JSON.stringify(built.partitions[0]?.payload);

    expect(payload).not.toContain('bytes');
    expect(payload).not.toContain('"file"');
    expect(payload).toContain('DoNotCopyImplementation');
  });
});
