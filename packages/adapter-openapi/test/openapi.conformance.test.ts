import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanibhq/reverb-domain';
import { verifyExtractionDeterminism, type ArtifactInput } from '@yanibhq/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { openApiAdapter, openApiOperationKey } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'6'.repeat(64)}`);

function artifact(text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath('api/spec.data'),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

describe('OpenAPI conformance', () => {
  it('is deterministic and location-insensitive across formatting', async () => {
    const compact = JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'Pets', version: '1' },
      paths: {
        '/pets': {
          get: { operationId: 'listPets', responses: { '200': { description: 'ok' } } },
        },
      },
    });
    const formatted = JSON.stringify(JSON.parse(compact), null, 2);
    const context = { serviceId: 'svc.pets' };
    const stable = await verifyExtractionDeterminism(openApiAdapter, {
      artifacts: [artifact(compact)],
      configRevision: revision,
      context,
    });
    expect(stable.stable).toBe(true);
    const first = await openApiAdapter.extract({
      artifacts: [artifact(compact)],
      configRevision: revision,
      context,
    });
    const second = await openApiAdapter.extract({
      artifacts: [artifact(formatted)],
      configRevision: revision,
      context,
    });
    expect(first.definitions[0]?.canonicalKey).toBe(openApiOperationKey('svc.pets', 'listPets'));
    expect(first.definitions[0]?.shapeHash).toBe(second.definitions[0]?.shapeHash);
  });
});
