import {
  configRevision,
  contentHash,
  hashCanonical,
  repoPath,
  sha256Bytes,
} from '@yanib/reverb-domain';
import type { AdapterPartitionViewV2, ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { eventAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'a'.repeat(64)}`);

function artifact(text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath('hostile/events.yaml'),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

async function extract(text: string) {
  return eventAdapter.extract({
    artifacts: [artifact(text)],
    configRevision: revision,
    context: {},
  });
}

describe('event adapter hostile inputs', () => {
  it('fails malformed probable manifests rather than claiming complete empty coverage', async () => {
    const result = await extract(
      "schema: reverb.events\nschemaVersion: '1.0'\nbindings: [unterminated",
    );
    expect(result.coverage).toMatchObject({ state: 'failed', failedArtifacts: 1 });
    expect(result.definitions).toEqual([]);
  });

  it('rejects YAML alias expansion', async () => {
    const result = await extract(`
schema: reverb.events
schemaVersion: '1.0'
binding: &binding {role: producer, provider: kafka, brokerNamespace: prod, destination: orders}
bindings: [*binding]
`);
    expect(result.coverage.state).toBe('failed');
  });

  it('rejects a tampered persisted partition envelope', async () => {
    const built = await eventAdapter.buildPartitions({
      artifacts: [
        artifact(
          "schema: reverb.events\nschemaVersion: '1.0'\nbindings: [{role: producer, provider: kafka, brokerNamespace: prod, destination: orders}]\n",
        ),
      ],
      configRevision: revision,
      context: {},
    });
    const partition = built.partitions[0]!;
    const tampered: AdapterPartitionViewV2 = {
      partitionKey: partition.partitionKey,
      ownedPaths: partition.ownedPaths,
      dependencyKeys: partition.dependencyKeys,
      payload: { ...partition.payload, schema: 'tampered' },
      outputHash: contentHash(hashCanonical(partition.payload)),
    };
    await expect(
      eventAdapter.materializePartitions({
        partitions: [tampered],
        configRevision: revision,
        context: {},
      }),
    ).rejects.toMatchObject({ code: 'invalid_partition_payload' });
  });

  it('rejects tampered nested bindings and partition integrity metadata', async () => {
    const built = await eventAdapter.buildPartitions({
      artifacts: [
        artifact(
          "schema: reverb.events\nschemaVersion: '1.0'\nbindings: [{role: producer, provider: kafka, brokerNamespace: prod, destination: orders}]\n",
        ),
      ],
      configRevision: revision,
      context: {},
    });
    const partition = built.partitions[0]!;
    const document = partition.payload.document as Readonly<Record<string, unknown>>;
    const bindings = document.bindings as readonly Readonly<Record<string, unknown>>[];
    const nestedTamper: AdapterPartitionViewV2 = {
      partitionKey: partition.partitionKey,
      ownedPaths: partition.ownedPaths,
      dependencyKeys: partition.dependencyKeys,
      payload: {
        ...partition.payload,
        document: {
          ...document,
          bindings: [{ ...bindings[0], provider: 'untrusted_provider' }],
        },
      },
      outputHash: contentHash(hashCanonical(partition.payload)),
    };
    await expect(
      eventAdapter.materializePartitions({
        partitions: [nestedTamper],
        configRevision: revision,
        context: {},
      }),
    ).rejects.toMatchObject({ code: 'invalid_partition_payload' });

    const integrityTamper: AdapterPartitionViewV2 = {
      partitionKey: partition.partitionKey,
      ownedPaths: [],
      dependencyKeys: partition.dependencyKeys,
      payload: partition.payload,
      outputHash: contentHash(hashCanonical(partition.payload)),
    };
    await expect(
      eventAdapter.materializePartitions({
        partitions: [integrityTamper],
        configRevision: revision,
        context: {},
      }),
    ).rejects.toMatchObject({ code: 'invalid_partition_payload' });
  });
});
