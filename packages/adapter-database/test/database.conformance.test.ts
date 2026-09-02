import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import { verifyExtractionDeterminismV2, type ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import { databaseAdapter, databaseTableKey } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'5'.repeat(64)}`);
const context = { databaseNamespace: 'billing-primary', sqlDialect: 'postgresql' } as const;

function artifact(text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath('migrations/schema.sql'),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

describe('database adapter v2 conformance', () => {
  it('is deterministic and implements PostgreSQL quoted identifier identity', async () => {
    const report = await verifyExtractionDeterminismV2(databaseAdapter, {
      artifacts: [
        artifact(
          'CREATE TABLE public.Accounts (id uuid); CREATE TABLE public."Accounts" (id uuid);',
        ),
      ],
      configRevision: revision,
      context,
    });
    expect(report.stable).toBe(true);
    expect(
      databaseTableKey({
        databaseNamespace: 'billing-primary',
        schemaName: 'public',
        tableName: 'accounts',
      }),
    ).not.toBe(
      databaseTableKey({
        databaseNamespace: 'billing-primary',
        schemaName: 'public',
        tableName: 'Accounts',
      }),
    );
  });

  it('applies migration documents in canonical lexicographic path order', async () => {
    const first = artifact('CREATE TABLE public.accounts (id uuid);');
    const secondBytes = new TextEncoder().encode(
      'ALTER TABLE public.accounts ADD COLUMN email text NULL;',
    );
    const second: ArtifactInput = {
      path: repoPath('migrations/002.sql'),
      contentHash: contentHash(sha256Bytes(secondBytes)),
      bytes: secondBytes,
      classification: 'source',
    };
    const result = await databaseAdapter.extract({
      artifacts: [second, { ...first, path: repoPath('migrations/001.sql') }],
      configRevision: revision,
      context,
    });
    expect(result.coverage.state).toBe('complete');
    expect(result.definitions.map((value) => value.displayName)).toContain('public.accounts.email');
  });
});
