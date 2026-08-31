import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import {
  validateAdapterManifest,
  type ArtifactInput,
  type ContractAdapter,
} from '../../adapter-sdk/src/index.js';
import { OPENAPI_ADMISSION_REPORT, openApiAdapter } from '../../adapter-openapi/src/index.js';
import { PROTOBUF_ADMISSION_REPORT, protobufAdapter } from '../../adapter-protobuf/src/index.js';
import {
  TYPESCRIPT_ADMISSION_REPORT,
  typeScriptAdapter,
} from '../../adapter-typescript/src/index.js';
import { describe, expect, it } from 'vitest';

const revision = configRevision(`cfg_sha256:${'3'.repeat(64)}`);

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

async function representativeExtraction(adapter: ContractAdapter) {
  if (adapter === openApiAdapter) {
    return adapter.extract({
      artifacts: [
        artifact(
          'contract',
          'openapi: 3.1.0\ninfo: {title: X, version: 1}\npaths: {/x: {get: {operationId: x, responses: {"204": {description: ok}}}}}\n',
        ),
      ],
      configRevision: revision,
      context: { serviceId: 'svc.x' },
    });
  }
  if (adapter === protobufAdapter) {
    return adapter.extract({
      artifacts: [
        artifact(
          'descriptor',
          JSON.stringify({
            file: [{ package: 'x', service: [{ name: 'X', method: [{ name: 'Get' }] }] }],
          }),
          'generated',
        ),
      ],
      configRevision: revision,
      context: {},
    });
  }
  return adapter.extract({
    artifacts: [
      artifact('package.json', JSON.stringify({ name: '@fixture/x', exports: './dist/index.js' })),
      artifact('src/index.ts', 'export function x(): string { return "x"; }'),
    ],
    configRevision: revision,
    context: {},
  });
}

describe('cross-adapter integration boundary', () => {
  const adapters = [openApiAdapter, protobufAdapter, typeScriptAdapter] as const;

  it('admits all manifests while retaining every evidence stratum as unmeasured', () => {
    for (const adapter of adapters) {
      expect(validateAdapterManifest(adapter.manifest)).toBe(adapter.manifest);
      expect(
        adapter.manifest.evidenceStrata.every((value) => value.promotionState === 'UNMEASURED'),
      ).toBe(true);
    }
    for (const report of [
      OPENAPI_ADMISSION_REPORT,
      PROTOBUF_ADMISSION_REPORT,
      TYPESCRIPT_ADMISSION_REPORT,
    ]) {
      expect(report).toMatchObject({ promotionState: 'UNMEASURED', deliveryReady: false });
    }
  });

  it.each(adapters)(
    '$manifest.id rejects incompatible extraction versions without a breaking claim',
    async (adapter) => {
      const base = await representativeExtraction(adapter);
      const incompatible = { ...base, adapterVersion: '9.0.0' };
      const result = await adapter.diff({
        base,
        head: incompatible,
        configRevision: revision,
        context: {},
      });
      expect(result.coverage.state).toBe('failed');
      expect(result.changes).toEqual([]);
      expect(result.diagnostics[0]?.safeMessage).toMatch(/incompatible/i);
    },
  );
});
