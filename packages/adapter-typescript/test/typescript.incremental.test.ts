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

import { typeScriptAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'e'.repeat(64)}`);
const context = {
  packageRegistry: 'npm',
  packageRoot: '.',
  lockedVersions: { '@acme/auth': '2.1.0' },
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

function fixture(): readonly ArtifactInput[] {
  return [
    artifact(
      'package.json',
      JSON.stringify({
        name: '@acme/pets',
        version: '1.0.0',
        exports: './dist/index.js',
        dependencies: { '@acme/auth': '^2.0.0' },
      }),
    ),
    artifact('src/index.ts', `export { getPet } from './api.js';`),
    artifact('src/api.ts', `export function getPet(id: string): string { return id; }`),
    artifact('src/consumer.ts', `import { token } from '@acme/auth/session'; token();`),
  ];
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
  const built = await typeScriptAdapter.buildPartitions({
    artifacts: input.base,
    configRevision: revision,
    context,
  });
  const basePartitions = built.partitions.map(view);
  const plan = typeScriptAdapter.planInvalidation({
    partitions: basePartitions,
    changes: input.changes,
    context,
  });
  const updated = await typeScriptAdapter.updatePartitions({
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
  const materialized = await typeScriptAdapter.materializePartitions({
    partitions: [...partitions.values()],
    configRevision: revision,
    context,
  });
  const clean = await typeScriptAdapter.extract({
    artifacts: input.head,
    configRevision: revision,
    context,
  });
  return { built, plan, updated, materialized, clean };
}

function replace(
  values: readonly ArtifactInput[],
  path: string,
  next: ArtifactInput,
): readonly ArtifactInput[] {
  return values.map((value) => (value.path === path ? next : value));
}

describe('TypeScript incremental package partitions', () => {
  it('matches a clean extraction after a public API edit', async () => {
    const base = fixture();
    const changed = artifact(
      'src/api.ts',
      `export function getPet(id: string, region: string): string { return id + region; }`,
    );
    const result = await incremental({
      base,
      head: replace(base, 'src/api.ts', changed),
      changes: [{ kind: 'modified', path: repoPath('src/api.ts') }],
      changedArtifacts: [changed],
    });

    expect(result.plan.complete).toBe(true);
    expect(result.updated.replacements).toHaveLength(1);
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('matches a clean extraction after a deletion and barrel update', async () => {
    const base = fixture();
    const barrel = artifact('src/index.ts', `export const apiVersion = '2';`);
    const head = replace(base, 'src/index.ts', barrel).filter(
      (value) => value.path !== 'src/api.ts',
    );
    const result = await incremental({
      base,
      head,
      changes: [
        { kind: 'deleted', path: repoPath('src/api.ts') },
        { kind: 'modified', path: repoPath('src/index.ts') },
      ],
      changedArtifacts: [barrel],
    });

    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
    expect(result.materialized.definitions.map((definition) => definition.displayName)).toEqual([
      'apiVersion',
    ]);
  });

  it('matches a clean extraction after a rename and dependent barrel edit', async () => {
    const base = fixture();
    const renamed = artifact(
      'src/service.ts',
      `export function getPet(id: string): string { return id; }`,
    );
    const barrel = artifact('src/index.ts', `export { getPet } from './service.js';`);
    const head = [
      ...base.filter((value) => value.path !== 'src/api.ts' && value.path !== 'src/index.ts'),
      barrel,
      renamed,
    ];
    const result = await incremental({
      base,
      head,
      changes: [
        {
          kind: 'renamed',
          path: repoPath('src/service.ts'),
          previousPath: repoPath('src/api.ts'),
        },
        { kind: 'modified', path: repoPath('src/index.ts') },
      ],
      changedArtifacts: [renamed, barrel],
    });

    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
    expect(result.materialized.definitions[0]?.path).toBe(repoPath('src/index.ts'));
  });

  it('assigns an unowned addition to the existing package without a scan', async () => {
    const base = fixture();
    const added = artifact('src/admin.ts', `import { admin } from '@acme/auth/admin'; admin();`);
    const result = await incremental({
      base,
      head: [...base, added],
      changes: [{ kind: 'added', path: repoPath('src/admin.ts') }],
      changedArtifacts: [added],
    });

    expect(result.plan).toMatchObject({ complete: true, unmatchedPaths: [] });
    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
    expect(result.materialized.references.some((reference) => reference.path === added.path)).toBe(
      true,
    );
  });

  it('matches clean output for package metadata-only changes', async () => {
    const base = fixture();
    const metadata = artifact(
      'package.json',
      JSON.stringify({
        name: '@acme/pets',
        version: '1.0.1',
        exports: './dist/index.js',
        dependencies: { '@acme/auth': '^2.0.0' },
      }),
    );
    const result = await incremental({
      base,
      head: replace(base, 'package.json', metadata),
      changes: [{ kind: 'modified', path: repoPath('package.json') }],
      changedArtifacts: [metadata],
    });

    expect(canonicalJson(result.materialized)).toBe(canonicalJson(result.clean));
  });

  it('fails closed when a required changed blob is missing', async () => {
    const base = fixture();
    const built = await typeScriptAdapter.buildPartitions({
      artifacts: base,
      configRevision: revision,
      context,
    });
    const basePartitions = built.partitions.map(view);
    const changes = [{ kind: 'modified' as const, path: repoPath('src/api.ts') }];
    const plan = typeScriptAdapter.planInvalidation({
      partitions: basePartitions,
      changes,
      context,
    });
    const updated = await typeScriptAdapter.updatePartitions({
      basePartitions,
      plan,
      changes,
      changedArtifacts: [],
      configRevision: revision,
      context,
    });

    expect(updated.coverage.state).toBe('partial');
    expect(updated.diagnostics).toContainEqual(
      expect.objectContaining({ scope: repoPath('src/api.ts') }),
    );
  });

  it('persists semantic facts without source bytes', async () => {
    const source = `export function secretImplementation(id: string): string { return id + '-secret'; }`;
    const metadata = artifact(
      'package.json',
      JSON.stringify({
        name: '@acme/pets',
        exports: './dist/index.js',
        scripts: { privateReleaseCommand: 'send-private-token' },
      }),
    );
    const built = await typeScriptAdapter.buildPartitions({
      artifacts: replace(
        replace(fixture(), 'package.json', metadata),
        'src/api.ts',
        artifact('src/api.ts', source),
      ),
      configRevision: revision,
      context,
    });
    const payload = JSON.stringify(built.partitions[0]?.payload);

    expect(payload).not.toContain('bytes');
    expect(payload).not.toContain('secretImplementation(id: string)');
    expect(payload).not.toContain("return id + '-secret'");
    expect(payload).not.toContain('privateReleaseCommand');
    expect(payload).not.toContain('send-private-token');
  });
});
