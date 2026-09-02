import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import type { AdapterPartitionView, ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { typeScriptAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'2'.repeat(64)}`);

function artifact(path: string, text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

describe('TypeScript hostile and unresolved inputs', () => {
  it('retains dynamic and namespace imports as unresolved without inventing a symbol', async () => {
    const result = await typeScriptAdapter.extract({
      artifacts: [
        artifact('package.json', JSON.stringify({ name: '@fixture/consumer' })),
        artifact(
          'src/index.ts',
          `import * as pets from '@acme/pets'; export async function load(name: string) { return import(name); } void pets;`,
        ),
      ],
      configRevision: revision,
      context: {},
    });
    expect(result.references).toHaveLength(2);
    expect(result.references.every((value) => value.canonicalKey === undefined)).toBe(true);
    expect(result.references.map((value) => value.unresolvedReason)).toEqual([
      'namespace_member_unknown',
      'dynamic_import',
    ]);
  });

  it('fails syntax errors instead of returning complete empty coverage', async () => {
    const result = await typeScriptAdapter.extract({
      artifacts: [artifact('src/index.ts', 'export function SECRET( {')],
      configRevision: revision,
      context: {},
    });
    expect(result.coverage.state).toBe('failed');
    expect(result.diagnostics[0]?.safeMessage).not.toContain('SECRET');
  });

  it('rejects tampered persisted semantic state', async () => {
    const built = await typeScriptAdapter.buildPartitions({
      artifacts: [
        artifact('package.json', JSON.stringify({ name: '@fixture/api' })),
        artifact('src/index.ts', 'export const value = 1;'),
      ],
      configRevision: revision,
      context: {},
    });
    const partition = built.partitions[0]!;
    const tampered: AdapterPartitionView = {
      partitionKey: partition.partitionKey,
      ownedPaths: partition.ownedPaths,
      dependencyKeys: partition.dependencyKeys,
      payload: { ...partition.payload, schema: 'tampered' },
      outputHash: contentHash(`sha256:${'9'.repeat(64)}`),
    };

    await expect(
      typeScriptAdapter.materializePartitions({
        partitions: [tampered],
        configRevision: revision,
        context: {},
      }),
    ).rejects.toMatchObject({ code: 'invalid_partition_payload' });
  });

  it('abstains from an unowned update when no base partition exists', async () => {
    const changes = [{ kind: 'added' as const, path: repoPath('src/new.ts') }];
    const plan = typeScriptAdapter.planInvalidation({ partitions: [], changes, context: {} });
    const updated = await typeScriptAdapter.updatePartitions({
      basePartitions: [],
      plan,
      changes,
      changedArtifacts: [artifact('src/new.ts', 'export const value = 1;')],
      configRevision: revision,
      context: {},
    });

    expect(plan.complete).toBe(false);
    expect(updated).toMatchObject({
      replacements: [],
      coverage: { state: 'partial' },
    });
  });
});
