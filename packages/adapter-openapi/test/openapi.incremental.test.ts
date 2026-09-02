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

import { openApiAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'8'.repeat(64)}`);
const context = {
  serviceId: 'svc.petstore',
  generatedClientBindings: [{ operationId: 'getPet', path: 'generated/client.ts' }],
} as const;

function artifact(path: string, text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

function api(operationId: string, response = 'ok'): string {
  return `
openapi: 3.1.0
info: {title: Pets, version: 1}
paths:
  /pets:
    get:
      operationId: ${operationId}
      responses: {'200': {description: ${response}}}
`;
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
  const built = await openApiAdapter.buildPartitions({
    artifacts: input.base,
    configRevision: revision,
    context,
  });
  const basePartitions = built.partitions.map(view);
  const plan = openApiAdapter.planInvalidation({
    partitions: basePartitions,
    changes: input.changes,
    context,
  });
  const updated = await openApiAdapter.updatePartitions({
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
  const materialized = await openApiAdapter.materializePartitions({
    partitions: [...partitions.values()],
    configRevision: revision,
    context,
  });
  const clean = await openApiAdapter.extract({
    artifacts: input.head,
    configRevision: revision,
    context,
  });
  return { built, plan, updated, materialized, clean };
}

describe('OpenAPI incremental document partitions', () => {
  it('preserves local path-item references through partition persistence', async () => {
    const referenced = artifact(
      'contracts/referenced.yaml',
      `
openapi: 3.1.0
info: {title: Referenced paths, version: 1}
paths:
  /pets:
    $ref: '#/components/pathItems/Pets'
components:
  pathItems:
    Pets:
      get:
        operationId: listPets
        responses: {'200': {description: ok}}
`,
    );
    const built = await openApiAdapter.buildPartitions({
      artifacts: [referenced],
      configRevision: revision,
      context,
    });
    const materialized = await openApiAdapter.materializePartitions({
      partitions: built.partitions.map(view),
      configRevision: revision,
      context,
    });
    const clean = await openApiAdapter.extract({
      artifacts: [referenced],
      configRevision: revision,
      context,
    });

    expect(canonicalJson(materialized)).toBe(canonicalJson(clean));
    expect(materialized.definitions).toContainEqual(
      expect.objectContaining({ displayName: 'listPets' }),
    );
  });

  it('replaces only the changed document and matches a clean extraction', async () => {
    const base = [
      artifact('contracts/pets.yaml', api('getPet')),
      artifact('contracts/admin.yaml', api('getAdmin')),
    ];
    const changed = artifact('contracts/pets.yaml', api('getPet', 'changed'));
    const result = await incremental({
      base,
      head: [changed, base[1]!],
      changes: [{ kind: 'modified', path: changed.path }],
      changedArtifacts: [changed],
    });

    expect(result.updated.replacements).toHaveLength(1);
    expect(result.updated.replacements[0]?.partitionKey).toBe('document:contracts/pets.yaml');
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('matches clean extraction for deletion and rename', async () => {
    const pets = artifact('contracts/pets.yaml', api('getPet'));
    const admin = artifact('contracts/admin.yaml', api('getAdmin'));
    const renamed = artifact('api/internal.txt', api('getAdmin'));
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
      'document:contracts/admin.yaml',
      'document:contracts/pets.yaml',
    ]);
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('discovers an added spec by content at an arbitrary path', async () => {
    const unrelated = artifact('notes/api.data', 'not an API');
    const added = artifact('generated/spec.data', api('createPet'));
    const result = await incremental({
      base: [unrelated],
      head: [unrelated, added],
      changes: [{ kind: 'added', path: added.path }],
      changedArtifacts: [added],
    });

    expect(result.plan).toMatchObject({ complete: true, unmatchedPaths: [] });
    expect(result.updated.replacements).toHaveLength(1);
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('ignores a changed non-spec after inspecting only that changed blob', async () => {
    const spec = artifact('contracts/pets.yaml', api('getPet'));
    const oldNotes = artifact('README.md', 'old');
    const newNotes = artifact('README.md', 'new');
    const result = await incremental({
      base: [spec, oldNotes],
      head: [spec, newNotes],
      changes: [{ kind: 'modified', path: newNotes.path }],
      changedArtifacts: [newNotes],
    });

    expect(result.updated).toMatchObject({ replacements: [], tombstones: [] });
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('marks coverage partial when any changed blob needed for discovery is missing', async () => {
    const spec = artifact('contracts/pets.yaml', api('getPet'));
    const built = await openApiAdapter.buildPartitions({
      artifacts: [spec],
      configRevision: revision,
      context,
    });
    const basePartitions = built.partitions.map(view);
    const changes = [{ kind: 'modified' as const, path: spec.path }];
    const plan = openApiAdapter.planInvalidation({ partitions: basePartitions, changes, context });
    const updated = await openApiAdapter.updatePartitions({
      basePartitions,
      plan,
      changes,
      changedArtifacts: [],
      configRevision: revision,
      context,
    });

    expect(updated.coverage.state).toBe('partial');
    expect(updated.replacements).toEqual([]);
    expect(updated.diagnostics).toContainEqual(expect.objectContaining({ scope: spec.path }));
  });

  it('persists normalized operation facts without source bytes', async () => {
    const source = api('secretOperation', 'do-not-copy-source');
    const built = await openApiAdapter.buildPartitions({
      artifacts: [artifact('contracts/private.yaml', source)],
      configRevision: revision,
      context,
    });
    const payload = JSON.stringify(built.partitions[0]?.payload);

    expect(payload).not.toContain('bytes');
    expect(payload).not.toContain('openapi: 3.1.0');
    expect(payload).toContain('secretOperation');
  });
});
