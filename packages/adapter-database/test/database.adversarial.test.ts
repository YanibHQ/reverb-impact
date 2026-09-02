import {
  configRevision,
  contentHash,
  hashCanonical,
  repoPath,
  sha256Bytes,
} from '@yanib/reverb-domain';
import type { AdapterPartitionViewV2, ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { databaseAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'6'.repeat(64)}`);
const context = { databaseNamespace: 'billing-primary', sqlDialect: 'postgresql' } as const;

function artifact(text: string, path = 'migrations/001.sql'): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

describe('database adapter hostile inputs', () => {
  it('fails probable invalid UTF-8 and oversized SQL without attempting a clean claim', async () => {
    const invalidBytes = Uint8Array.from([0xc3, 0x28]);
    const invalid: ArtifactInput = {
      path: repoPath('migrations/invalid.sql'),
      contentHash: contentHash(sha256Bytes(invalidBytes)),
      bytes: invalidBytes,
      classification: 'source',
    };
    const invalidResult = await databaseAdapter.extract({
      artifacts: [invalid],
      configRevision: revision,
      context,
    });
    expect(invalidResult.coverage).toMatchObject({ state: 'failed', failedArtifacts: 1 });

    const oversized = artifact(`CREATE TABLE public.accounts (id text);${' '.repeat(8_388_608)}`);
    const oversizedResult = await databaseAdapter.extract({
      artifacts: [oversized],
      configRevision: revision,
      context,
    });
    expect(oversizedResult.coverage).toMatchObject({ state: 'failed', failedArtifacts: 1 });
  });

  it('keeps exact positive evidence while marking dynamic and stored SQL partial', async () => {
    const result = await databaseAdapter.extract({
      artifacts: [
        artifact(`
CREATE TABLE public.accounts (id uuid NOT NULL);
CREATE FUNCTION lookup_account(name text) RETURNS void AS $$ BEGIN EXECUTE format(name); END $$ LANGUAGE plpgsql;
client.query('SELECT id FROM public.accounts');
client.query('SELECT * FROM ' + tableName);
`),
      ],
      configRevision: revision,
      context,
    });
    expect(result.coverage.state).toBe('partial');
    expect(result.coverage.limitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'dynamic_sql' }),
        expect.objectContaining({ code: 'stored_procedure_unsupported' }),
      ]),
    );
    expect(result.definitions).not.toHaveLength(0);
    expect(result.references).not.toHaveLength(0);
  });

  it('rejects tampered nested facts even when the payload hash is recomputed', async () => {
    const built = await databaseAdapter.buildPartitions({
      artifacts: [artifact('CREATE TABLE public.accounts (id uuid NOT NULL);')],
      configRevision: revision,
      context,
    });
    const partition = built.partitions[0]!;
    const document = partition.payload.document as Readonly<Record<string, unknown>>;
    const operations = document.operations as readonly Readonly<Record<string, unknown>>[];
    const payload = {
      ...partition.payload,
      document: {
        ...document,
        operations: [{ ...operations[0], kind: 'execute_network_sql' }],
      },
    };
    const tampered: AdapterPartitionViewV2 = {
      partitionKey: partition.partitionKey,
      ownedPaths: partition.ownedPaths,
      dependencyKeys: partition.dependencyKeys,
      payload,
      outputHash: contentHash(hashCanonical(payload)),
    };
    await expect(
      databaseAdapter.materializePartitions({
        partitions: [tampered],
        configRevision: revision,
        context,
      }),
    ).rejects.toMatchObject({ code: 'invalid_partition_payload' });
  });

  it('rejects duplicate partitions and forged integrity metadata', async () => {
    const built = await databaseAdapter.buildPartitions({
      artifacts: [artifact('CREATE TABLE public.accounts (id uuid NOT NULL);')],
      configRevision: revision,
      context,
    });
    const partition = built.partitions[0]!;
    const view: AdapterPartitionViewV2 = {
      partitionKey: partition.partitionKey,
      ownedPaths: partition.ownedPaths,
      dependencyKeys: partition.dependencyKeys,
      payload: partition.payload,
      outputHash: contentHash(hashCanonical(partition.payload)),
    };
    await expect(
      databaseAdapter.materializePartitions({
        partitions: [view, view],
        configRevision: revision,
        context,
      }),
    ).rejects.toMatchObject({ code: 'invalid_partition_payload' });
    await expect(
      databaseAdapter.materializePartitions({
        partitions: [{ ...view, ownedPaths: [] }],
        configRevision: revision,
        context,
      }),
    ).rejects.toMatchObject({ code: 'invalid_partition_payload' });
  });

  it('reports ALTER-only migration streams as missing-base partial coverage', async () => {
    const result = await databaseAdapter.extract({
      artifacts: [artifact('ALTER TABLE public.accounts DROP COLUMN email;')],
      configRevision: revision,
      context,
    });
    expect(result.coverage).toMatchObject({
      state: 'partial',
      limitations: [expect.objectContaining({ code: 'migration_base_missing' })],
    });
    expect(result.definitions).toEqual([]);
  });
});
