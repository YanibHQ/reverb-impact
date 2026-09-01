import {
  configRevision,
  contentHash,
  repoPath,
  sha256Bytes,
  type ConfigRevision,
} from '@yanib/reverb-domain';
import type { AdapterSandboxRunner, ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import {
  OPENAPI_ADMISSION_REPORT,
  openApiAdapter,
  openApiFallbackKey,
  openApiOperationKey,
} from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'3'.repeat(64)}`);

function artifact(path: string, text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

function request(text: string, config: ConfigRevision = revision) {
  return {
    artifacts: [artifact('contracts/not-an-openapi-name.txt', text)],
    configRevision: config,
    context: {
      serviceId: 'svc.petstore',
      generatedClientBindings: [{ operationId: 'getPet', path: 'generated/pet-client.ts' }],
    },
  } as const;
}

const base = `
openapi: 3.1.0
info: { title: Pets, version: 1.0.0 }
paths:
  /pets/{petId}:
    get:
      operationId: getPet
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Pet' }
  /health/:
    get:
      responses: { '204': { description: healthy } }
components:
  schemas:
    Pet: { type: object, properties: { id: { type: string } } }
`;

function sandbox(exitCode: number): AdapterSandboxRunner {
  return {
    async run() {
      return {
        ok: true,
        value: {
          exitCode,
          stdout: new Uint8Array(),
          stderrCode: null,
          timedOut: false,
          outputTruncated: false,
        },
      };
    },
  };
}

describe('OpenAPI adapter', () => {
  it('extracts operations from local path-item references', async () => {
    const result = await openApiAdapter.extract(
      request(`
openapi: 3.1.0
info: { title: Referenced paths, version: 1 }
paths:
  /pets:
    $ref: '#/components/pathItems/Pets'
components:
  pathItems:
    Pets:
      get:
        operationId: listPets
        responses: { '200': { description: ok } }
`),
    );

    expect(result.coverage.state).toBe('complete');
    expect(result.definitions).toContainEqual(
      expect.objectContaining({ canonicalKey: openApiOperationKey('svc.petstore', 'listPets') }),
    );
  });

  it('discovers by content, resolves local refs, and maps generated clients to exact identity', async () => {
    const result = await openApiAdapter.extract(request(base));
    expect(result.coverage).toMatchObject({ state: 'complete', eligibleArtifacts: 1 });
    expect(result.definitions.map((value) => value.canonicalKey)).toEqual([
      openApiFallbackKey('svc.petstore', 'get', '/health/'),
      openApiOperationKey('svc.petstore', 'getPet'),
    ]);
    expect(result.references[0]?.canonicalKey).toBe(openApiOperationKey('svc.petstore', 'getPet'));
    expect(result.references[0]?.activation).toBe('on_deploy');
  });

  it('keeps exact and fallback identities in different strata', () => {
    expect(openApiOperationKey('svc.petstore', 'getPet')).not.toBe(
      openApiFallbackKey('svc.petstore', 'get', '/pets/{id}'),
    );
    expect(openApiFallbackKey('svc.petstore', 'GET', '/pets/{id}/')).toBe(
      openApiFallbackKey('svc.petstore', 'get', '/pets/{petId}'),
    );
  });

  it('reports a valid empty API as complete rather than failed', async () => {
    const result = await openApiAdapter.extract(
      request('openapi: 3.1.0\ninfo: {title: Empty, version: 1}\npaths: {}\n'),
    );
    expect(result.coverage.state).toBe('complete');
    expect(result.definitions).toEqual([]);
  });

  it('uses the pinned differ and never calls a breaking addition breaking', async () => {
    const before = await openApiAdapter.extract(request(base));
    const after = await openApiAdapter.extract(
      request(
        base.replace(
          'components:\n',
          `  /new:\n    post:\n      operationId: createPet\n      responses: {'204': {description: ok}}\ncomponents:\n`,
        ),
      ),
    );
    const diff = await openApiAdapter.diff({
      base: before,
      head: after,
      configRevision: revision,
      context: {
        sandbox: sandbox(1),
        baseBlobRef: `blob:sha256:${'4'.repeat(64)}`,
        headBlobRef: `blob:sha256:${'5'.repeat(64)}`,
      },
    });
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({
      changeKind: 'operation_added',
      compatibility: 'compatible',
      activation: 'on_deploy',
    });
    expect(diff.changes[0]?.differ).toMatchObject({
      toolId: 'oasdiff-linux-amd64',
      toolVersion: '1.28.0',
      toolLicense: 'Apache-2.0',
    });
  });

  it('delegates request-direction compatibility to the pinned differ', async () => {
    const before = await openApiAdapter.extract(request(base));
    const changed = base.replace(
      'operationId: getPet\n      responses:',
      'operationId: getPet\n      requestBody: { required: true, content: {application/json: {schema: {type: object}}}}\n      responses:',
    );
    const after = await openApiAdapter.extract(request(changed));
    const diff = await openApiAdapter.diff({
      base: before,
      head: after,
      configRevision: revision,
      context: {
        sandbox: sandbox(1),
        baseBlobRef: `blob:sha256:${'6'.repeat(64)}`,
        headBlobRef: `blob:sha256:${'7'.repeat(64)}`,
      },
    });
    expect(diff.changes).toContainEqual(
      expect.objectContaining({
        canonicalKey: openApiOperationKey('svc.petstore', 'getPet'),
        compatibility: 'breaking',
        remedy: expect.objectContaining({ kind: 'coordinate_contract_rollout' }),
      }),
    );
  });

  it('keeps admission synthetic and non-deliverable', () => {
    expect(OPENAPI_ADMISSION_REPORT).toMatchObject({
      promotionState: 'UNMEASURED',
      deliveryReady: false,
      realLabelledCorpusState: 'absent',
    });
  });
});
