import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import { verifyExtractionDeterminismV2, type ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';
import { infrastructureAdapter, infrastructureServiceKey } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'2'.repeat(64)}`);
function artifact(text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath('k8s/service.yaml'),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

describe('infrastructure adapter v2 conformance', () => {
  it('is deterministic and scopes identical names by environment and service scope', async () => {
    const report = await verifyExtractionDeterminismV2(infrastructureAdapter, {
      artifacts: [artifact('apiVersion: v1\nkind: Service\nmetadata:\n  name: billing\n')],
      configRevision: revision,
      context: { infrastructureEnvironment: 'production', infrastructureServiceScope: 'payments' },
    });
    expect(report.stable).toBe(true);
    const production = infrastructureServiceKey({
      environment: 'production',
      serviceScope: 'payments',
      serviceName: 'billing',
    });
    expect(production).not.toBe(
      infrastructureServiceKey({
        environment: 'staging',
        serviceScope: 'payments',
        serviceName: 'billing',
      }),
    );
    expect(production).not.toBe(
      infrastructureServiceKey({
        environment: 'production',
        serviceScope: 'ledger',
        serviceName: 'billing',
      }),
    );
  });
});
