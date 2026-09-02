import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import { verifyExtractionDeterminismV2, type ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { eventAdapter, eventDestinationKey } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'9'.repeat(64)}`);

function artifact(text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath('events.yaml'),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

describe('event adapter v2 conformance', () => {
  it('is deterministic and preserves case-sensitive destination identity', async () => {
    const text = `schema: reverb.events\nschemaVersion: '1.0'\nbindings:\n  - {role: producer, provider: kafka, brokerNamespace: prod, destination: Orders}\n`;
    const report = await verifyExtractionDeterminismV2(eventAdapter, {
      artifacts: [artifact(text)],
      configRevision: revision,
      context: {},
    });
    expect(report.stable).toBe(true);
    expect(
      eventDestinationKey({
        provider: 'kafka',
        brokerNamespace: 'prod',
        destinationKind: 'topic',
        destination: 'Orders',
      }),
    ).not.toBe(
      eventDestinationKey({
        provider: 'kafka',
        brokerNamespace: 'prod',
        destinationKind: 'topic',
        destination: 'orders',
      }),
    );
  });
});
