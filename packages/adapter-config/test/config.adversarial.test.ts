import {
  canonicalJson,
  configRevision,
  contentHash,
  hashCanonical,
  repoPath,
  sha256Bytes,
} from '@yanib/reverb-domain';
import type { AdapterPartitionViewV2, ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';
import { configAdapter } from '../src/index.js';
const revision = configRevision(`cfg_sha256:${'8'.repeat(64)}`);
const context = {
  configurationNamespace: 'prod',
  secretIdentitySalt: 'fixture-only-secret-salt',
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
describe('configuration adapter hostile inputs', () => {
  it('fails malformed explicit manifests rather than returning clean empty coverage', async () => {
    const result = await configAdapter.extract({
      artifacts: [
        artifact(
          'reverb.config.json',
          '{"schema":"reverb.configuration","schemaVersion":"1.0","entries":[bad',
        ),
      ],
      configRevision: revision,
      context,
    });
    expect(result.coverage.state).toBe('partial');
    expect(result.definitions).toEqual([]);
  });
  it('never retains secret values or identifiers from excluded and supported inputs', async () => {
    const value = 'SUPER-SECRET-VALUE-123';
    const identifier = 'secret/account/password';
    const built = await configAdapter.buildPartitions({
      artifacts: [
        artifact('.env', `PASSWORD=${value}`),
        artifact('src/secret.ts', `secretManager.getSecret('${identifier}')`),
      ],
      configRevision: revision,
      context,
    });
    const serialized = canonicalJson(built);
    expect(serialized).not.toContain(value);
    expect(serialized).not.toContain(identifier);
  });
  it('rejects rehashed nested tampering and duplicate partitions', async () => {
    const built = await configAdapter.buildPartitions({
      artifacts: [artifact('src/config.ts', "defineConfigKey('A');")],
      configRevision: revision,
      context,
    });
    const partition = built.partitions[0]!;
    const document = partition.payload.document as Readonly<Record<string, unknown>>;
    const facts = document.facts as readonly Readonly<Record<string, unknown>>[];
    const payload = {
      ...partition.payload,
      document: {
        ...document,
        facts: [{ ...facts[0], kind: 'secret_reference', identifierHash: 'raw-secret' }],
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
      configAdapter.materializePartitions({
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
      configAdapter.materializePartitions({
        partitions: [view, view],
        configRevision: revision,
        context,
      }),
    ).rejects.toMatchObject({ code: 'invalid_partition_payload' });
  });
});
