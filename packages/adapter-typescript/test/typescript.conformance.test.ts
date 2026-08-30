import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanibhq/reverb-domain';
import { verifyExtractionDeterminism, type ArtifactInput } from '@yanibhq/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { typeScriptAdapter } from '../src/index.js';

function artifact(path: string, text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

describe('TypeScript adapter conformance', () => {
  it('is deterministic across repeated barrel and overload extraction', async () => {
    const report = await verifyExtractionDeterminism(typeScriptAdapter, {
      artifacts: [
        artifact(
          'package.json',
          JSON.stringify({ name: '@fixture/api', exports: './dist/index.js' }),
        ),
        artifact('src/index.ts', `export * from './value.js';`),
        artifact(
          'src/value.ts',
          `export function value(id: string): string; export function value(id: string): string { return id; }`,
        ),
      ],
      configRevision: configRevision(`cfg_sha256:${'1'.repeat(64)}`),
      context: { packageRegistry: 'npm' },
    });
    expect(report.stable).toBe(true);
  });
});
