import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import type { ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { typeScriptAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'2'.repeat(64)}`);

function artifact(path: string, text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

describe('TypeScript hostile and unresolved inputs', () => {
  it('retains dynamic and namespace imports as unresolved without inventing a symbol', async () => {
    const result = await typeScriptAdapter.extract({
      artifacts: [
        artifact('package.json', JSON.stringify({ name: '@fixture/consumer' })),
        artifact(
          'src/index.ts',
          `import * as pets from '@acme/pets'; export async function load(name: string) { return import(name); } void pets;`,
        ),
      ],
      configRevision: revision,
      context: {},
    });
    expect(result.references).toHaveLength(2);
    expect(result.references.every((value) => value.canonicalKey === undefined)).toBe(true);
    expect(result.references.map((value) => value.unresolvedReason)).toEqual([
      'namespace_member_unknown',
      'dynamic_import',
    ]);
  });

  it('fails syntax errors instead of returning complete empty coverage', async () => {
    const result = await typeScriptAdapter.extract({
      artifacts: [artifact('src/index.ts', 'export function SECRET( {')],
      configRevision: revision,
      context: {},
    });
    expect(result.coverage.state).toBe('failed');
    expect(result.diagnostics[0]?.safeMessage).not.toContain('SECRET');
  });
});
