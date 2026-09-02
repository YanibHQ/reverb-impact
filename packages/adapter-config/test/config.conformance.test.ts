import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import { verifyExtractionDeterminismV2, type ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';
import { configAdapter, configurationKey } from '../src/index.js';
const revision = configRevision(`cfg_sha256:${'7'.repeat(64)}`);
function artifact(text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath('src/config.ts'),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}
describe('configuration adapter v2 conformance', () => {
  it('is deterministic and keeps namespace and key case in identity', async () => {
    const report = await verifyExtractionDeterminismV2(configAdapter, {
      artifacts: [artifact("defineConfigKey('API_KEY');")],
      configRevision: revision,
      context: { configurationNamespace: 'prod' },
    });
    expect(report.stable).toBe(true);
    expect(configurationKey({ configurationNamespace: 'prod', key: 'API_KEY' })).not.toBe(
      configurationKey({ configurationNamespace: 'prod', key: 'api_key' }),
    );
  });
});
