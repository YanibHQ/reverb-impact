import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import type { ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { HTTP_ADAPTER_MANIFEST, httpAdapter, httpRouteKey } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'1'.repeat(64)}`);
const context = {
  httpServiceId: 'billing-api',
  httpServiceAliases: { 'billing.internal': 'billing-api' },
  httpClients: { billingClient: 'billing-api' },
} as const;

function artifact(
  path: string,
  text: string,
  classification: ArtifactInput['classification'] = 'source',
): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification,
  };
}

describe('implicit HTTP adapter', () => {
  it('normalizes framework parameters and bounded client URL composition to one identity', async () => {
    const result = await httpAdapter.extract({
      artifacts: [
        artifact('src/routes.ts', "app.get('/accounts/:accountId', handler);"),
        artifact('src/client.ts', 'fetch(`https://billing.internal/accounts/${accountId}`);'),
        artifact('src/sdk.ts', 'billingClient.get(`/accounts/${input.id}`);'),
      ],
      configRevision: revision,
      context,
    });
    const key = httpRouteKey({
      serviceId: 'billing-api',
      method: 'GET',
      routeTemplate: '/accounts/{param}',
    });
    expect(result.coverage.state).toBe('complete');
    expect(result.definitions).toContainEqual(expect.objectContaining({ canonicalKey: key }));
    expect(result.references.filter((item) => item.canonicalKey === key)).toHaveLength(2);
  });

  it('extracts axios methods and classifies a removed route as breaking', async () => {
    const base = await httpAdapter.extract({
      artifacts: [artifact('src/routes.ts', "router.delete('/accounts/:id', handler);")],
      configRevision: revision,
      context,
    });
    const head = await httpAdapter.extract({ artifacts: [], configRevision: revision, context });
    const consumer = await httpAdapter.extract({
      artifacts: [
        artifact('src/client.ts', 'axios.delete(`https://billing.internal/accounts/${id}`);'),
      ],
      configRevision: revision,
      context,
    });
    const diff = await httpAdapter.diff({ base, head, configRevision: revision, context });
    expect(consumer.references).toHaveLength(1);
    expect(diff.changes).toContainEqual(
      expect.objectContaining({ changeKind: 'route_removed', compatibility: 'unknown' }),
    );
  });

  it('reports dynamic URLs, missing aliases, proxy rewrites, and generated sources as partial', async () => {
    const result = await httpAdapter.extract({
      artifacts: [
        artifact('src/client.ts', "fetch(baseUrl + '/accounts'); app.use('/api', proxyRewrite);"),
        artifact('src/generated.ts', "app.get('/generated', handler);", 'generated'),
      ],
      configRevision: revision,
      context,
    });
    expect(result.coverage.state).toBe('partial');
    expect(result.coverage.limitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'dynamic_url' }),
        expect.objectContaining({ code: 'proxy_rewrite_unsupported' }),
        expect.objectContaining({ code: 'generated_http_source_excluded' }),
      ]),
    );
  });

  it('keeps the new evidence strata unmeasured', () => {
    expect(HTTP_ADAPTER_MANIFEST).toMatchObject({ family: 'implicit_http', externalTools: [] });
  });
});
