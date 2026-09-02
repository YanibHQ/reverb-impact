import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import { verifyExtractionDeterminismV2, type ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { httpAdapter, httpRouteKey } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'3'.repeat(64)}`);

function artifact(text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath('src/routes.ts'),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

describe('implicit HTTP adapter v2 conformance', () => {
  it('is deterministic and normalizes parameter names without folding literal path case', async () => {
    const report = await verifyExtractionDeterminismV2(httpAdapter, {
      artifacts: [artifact("fastify.get('/Accounts/:accountId', handler);")],
      configRevision: revision,
      context: { httpServiceId: 'billing-api' },
    });
    expect(report.stable).toBe(true);
    expect(
      httpRouteKey({ serviceId: 'billing-api', method: 'GET', routeTemplate: '/accounts/{param}' }),
    ).not.toBe(
      httpRouteKey({ serviceId: 'billing-api', method: 'GET', routeTemplate: '/Accounts/{param}' }),
    );
  });
});
