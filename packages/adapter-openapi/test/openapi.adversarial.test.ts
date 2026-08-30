import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanibhq/reverb-domain';
import type { ArtifactInput } from '@yanibhq/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { openApiAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'7'.repeat(64)}`);

function artifact(text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath('hostile/input'),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

async function extract(text: string) {
  return openApiAdapter.extract({
    artifacts: [artifact(text)],
    configRevision: revision,
    context: { serviceId: 'svc.hostile' },
  });
}

describe('OpenAPI hostile inputs', () => {
  it('does not fetch a remote reference and marks coverage partial', async () => {
    const result = await extract(`
openapi: 3.1.0
info: {title: Hostile, version: 1}
paths:
  /x:
    get:
      operationId: x
      responses: {'200': {description: ok, content: {application/json: {schema: {$ref: 'https://127.0.0.1/private'}}}}}
`);
    expect(result.coverage.state).toBe('partial');
    expect(result.coverage.limitations).toContainEqual({
      code: 'remote_ref_not_fetched',
      scope: repoPath('hostile/input'),
    });
    expect(result.diagnostics[0]?.safeMessage).not.toContain('127.0.0.1');
  });

  it('fails malformed probable OpenAPI instead of manufacturing an empty complete result', async () => {
    const result = await extract('openapi: 3.1.0\npaths: [unterminated');
    expect(result.coverage).toMatchObject({ state: 'failed', failedArtifacts: 1 });
    expect(result.definitions).toEqual([]);
  });

  it('rejects YAML alias expansion', async () => {
    const result = await extract(`
openapi: 3.1.0
info: &info {title: Alias, version: 1}
copy: *info
paths: {}
`);
    expect(result.coverage.state).toBe('failed');
  });
});
