import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import type { AdapterPartitionView, ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { protobufAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'e'.repeat(64)}`);

function input(text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath('hostile/descriptor'),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'generated',
  };
}

describe('Protobuf hostile inputs', () => {
  it('fails a malformed probable descriptor without echoing input', async () => {
    const result = await protobufAdapter.extract({
      artifacts: [input('{"file":[{"messageType":[{"name":"SECRET","field":[{}]}]}]}')],
      configRevision: revision,
      context: {},
    });
    expect(result.coverage.state).toBe('failed');
    expect(result.diagnostics[0]?.safeMessage).not.toContain('SECRET');
  });

  it('keeps compatibility unknown when Buf input is missing', async () => {
    const base = await protobufAdapter.extract({
      artifacts: [
        input(
          '{"file":[{"package":"x","messageType":[{"name":"X","field":[{"name":"id","number":1,"type":"TYPE_STRING"}]}]}]}',
        ),
      ],
      configRevision: revision,
      context: {},
    });
    const head = await protobufAdapter.extract({
      artifacts: [input('{"file":[{"package":"x","messageType":[{"name":"X","field":[]}]}]}')],
      configRevision: revision,
      context: {},
    });
    const diff = await protobufAdapter.diff({ base, head, configRevision: revision, context: {} });
    expect(diff.changes[0]?.compatibility).toBe('unknown');
  });

  it('rejects tampered persisted descriptor facts', async () => {
    const built = await protobufAdapter.buildPartitions({
      artifacts: [input('{"file":[]}')],
      configRevision: revision,
      context: {},
    });
    const partition = built.partitions[0]!;
    const tampered: AdapterPartitionView = {
      partitionKey: partition.partitionKey,
      ownedPaths: partition.ownedPaths,
      dependencyKeys: partition.dependencyKeys,
      payload: { ...partition.payload, schema: 'tampered' },
      outputHash: contentHash(`sha256:${'7'.repeat(64)}`),
    };

    await expect(
      protobufAdapter.materializePartitions({
        partitions: [tampered],
        configRevision: revision,
        context: {},
      }),
    ).rejects.toMatchObject({ code: 'invalid_partition_payload' });
  });
});
