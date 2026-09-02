import {
  configRevision,
  contentHash,
  hashCanonical,
  repoPath,
  sha256Bytes,
} from '@yanib/reverb-domain';
import type { AdapterPartitionViewV2, ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { httpAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'4'.repeat(64)}`);
const context = { httpServiceId: 'billing-api' } as const;
function artifact(text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath('src/routes.ts'),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

describe('implicit HTTP adapter hostile inputs', () => {
  it('marks dynamic methods, URLs, router mounts, and runtime registration partial', async () => {
    const result = await httpAdapter.extract({
      artifacts: [
        artifact("fetch(url, { method }); app.use('/api', router); fastify.route(options);"),
      ],
      configRevision: revision,
      context,
    });
    expect(result.coverage.state).toBe('partial');
    expect(result.coverage.limitations.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'dynamic_url',
        'mounted_router_prefix_unresolved',
        'runtime_route_registration',
      ]),
    );
  });

  it('rejects validly rehashed nested partition tampering and duplicates', async () => {
    const built = await httpAdapter.buildPartitions({
      artifacts: [artifact("app.get('/accounts', handler);")],
      configRevision: revision,
      context,
    });
    const partition = built.partitions[0]!;
    const document = partition.payload.document as Readonly<Record<string, unknown>>;
    const bindings = document.bindings as readonly Readonly<Record<string, unknown>>[];
    const payload = {
      ...partition.payload,
      document: { ...document, bindings: [{ ...bindings[0], method: 'TRACE' }] },
    };
    const tampered: AdapterPartitionViewV2 = {
      partitionKey: partition.partitionKey,
      ownedPaths: partition.ownedPaths,
      dependencyKeys: partition.dependencyKeys,
      payload,
      outputHash: contentHash(hashCanonical(payload)),
    };
    await expect(
      httpAdapter.materializePartitions({
        partitions: [tampered],
        configRevision: revision,
        context,
      }),
    ).rejects.toMatchObject({ code: 'invalid_partition_payload' });
    const view: AdapterPartitionViewV2 = {
      partitionKey: partition.partitionKey,
      ownedPaths: partition.ownedPaths,
      dependencyKeys: partition.dependencyKeys,
      payload: partition.payload,
      outputHash: contentHash(hashCanonical(partition.payload)),
    };
    await expect(
      httpAdapter.materializePartitions({
        partitions: [view, view],
        configRevision: revision,
        context,
      }),
    ).rejects.toMatchObject({ code: 'invalid_partition_payload' });
  });
});
