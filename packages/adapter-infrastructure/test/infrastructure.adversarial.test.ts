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
import { infrastructureAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'4'.repeat(64)}`);
const context = {
  infrastructureEnvironment: 'production',
  infrastructureServiceScope: 'payments',
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

describe('infrastructure adapter hostile inputs', () => {
  it('fails malformed Kubernetes YAML rather than returning clean empty coverage', async () => {
    const result = await infrastructureAdapter.extract({
      artifacts: [artifact('k8s/service.yaml', 'apiVersion: v1\nkind: Service\nmetadata: [bad')],
      configRevision: revision,
      context,
    });
    expect(result.coverage.state).toBe('failed');
    expect(result.definitions).toEqual([]);
  });

  it('rejects YAML aliases and excludes Secret documents before parsing or persistence', async () => {
    const secretValue = 'SUPER-SECRET-VALUE-123';
    const secret = artifact(
      'k8s/secret.yaml',
      `apiVersion: v1\nkind: Secret\nmetadata:\n  name: billing\nstringData:\n  token: ${secretValue}\n`,
    );
    const alias = artifact(
      'k8s/service.yaml',
      'apiVersion: v1\nkind: Service\nmetadata: &metadata\n  name: billing\nspec:\n  selector: *metadata\n',
    );
    const built = await infrastructureAdapter.buildPartitions({
      artifacts: [secret, alias],
      configRevision: revision,
      context,
    });
    expect(built.coverage.state).not.toBe('complete');
    expect(canonicalJson(built)).not.toContain(secretValue);
    expect(canonicalJson(built)).not.toContain('stringData');
  });

  it.each(['terraform.tfstate', 'terraform.tfplan', 'production.tfvars', 'credentials/main.tf'])(
    'excludes sensitive Terraform input %s without retaining values',
    async (path) => {
      const canary = 'provider-secret-canary';
      const built = await infrastructureAdapter.buildPartitions({
        artifacts: [artifact(path, `token = "${canary}"`)],
        configRevision: revision,
        context,
      });
      expect(built.coverage.state).toBe('partial');
      expect(canonicalJson(built)).not.toContain(canary);
    },
  );

  it('rejects rehashed nested fact tampering and duplicate partitions', async () => {
    const built = await infrastructureAdapter.buildPartitions({
      artifacts: [
        artifact('k8s/service.yaml', 'apiVersion: v1\nkind: Service\nmetadata:\n  name: billing\n'),
      ],
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
        facts: [{ ...facts[0], kind: 'endpoint' }],
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
      infrastructureAdapter.materializePartitions({
        partitions: [tampered],
        configRevision: revision,
        context,
      }),
    ).rejects.toMatchObject({ code: 'invalid_partition_payload' });
    const unknownLimitationPayload = {
      ...partition.payload,
      document: { ...document, limitations: ['invented_clean_override'] },
    };
    const unknownLimitation: AdapterPartitionViewV2 = {
      partitionKey: partition.partitionKey,
      ownedPaths: partition.ownedPaths,
      dependencyKeys: partition.dependencyKeys,
      payload: unknownLimitationPayload,
      outputHash: contentHash(hashCanonical(unknownLimitationPayload)),
    };
    await expect(
      infrastructureAdapter.materializePartitions({
        partitions: [unknownLimitation],
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
      infrastructureAdapter.materializePartitions({
        partitions: [view, view],
        configRevision: revision,
        context,
      }),
    ).rejects.toMatchObject({ code: 'invalid_partition_payload' });
  });
});
