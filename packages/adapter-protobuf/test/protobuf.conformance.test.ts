import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import { verifyExtractionDeterminism, type ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { protobufAdapter } from '../src/index.js';

describe('Protobuf conformance', () => {
  it('produces a stable output hash for repeated descriptor extraction', async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        file: [
          {
            name: 'x.proto',
            package: 'x.v1',
            messageType: [{ name: 'X', field: [{ name: 'id', number: 1, type: 'TYPE_STRING' }] }],
          },
        ],
      }),
    );
    const artifact: ArtifactInput = {
      path: repoPath('image.json'),
      contentHash: contentHash(sha256Bytes(bytes)),
      bytes,
      classification: 'generated',
    };
    const report = await verifyExtractionDeterminism(protobufAdapter, {
      artifacts: [artifact],
      configRevision: configRevision(`cfg_sha256:${'d'.repeat(64)}`),
      context: {},
    });
    expect(report.stable).toBe(true);
  });
});
