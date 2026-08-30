import { randomUUID } from 'node:crypto';

import { contentHash, instant, workspaceId } from '@yanibhq/reverb-domain';
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POSTGRES_MIGRATIONS, PostgresHostedStore } from '../src/index.js';

const workspaceA = workspaceId('wsp_01990f64-0000-7000-8000-000000000101');
const workspaceB = workspaceId('wsp_01990f64-0000-7000-8000-000000000102');
const now = instant('2026-08-28T20:00:00.000Z');
const later = instant('2026-08-28T20:05:00.000Z');
const leaseEnd = instant('2026-08-28T20:01:00.000Z');

function connectionConfig(): PoolConfig {
  const configured = process.env.REVERB_POSTGRES_URL;
  if (configured) return { connectionString: configured };
  if (process.env.CI) {
    return { connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres' };
  }
  return { database: 'postgres' };
}

describe('Postgres hosted control-plane integration', () => {
  const schema = `reverb_test_${randomUUID().replaceAll('-', '')}`;
  const baseConfig = connectionConfig();
  const admin = new Pool(baseConfig);
  let store: PostgresHostedStore;

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    store = new PostgresHostedStore({ ...baseConfig, options: `-c search_path=${schema},public` });
    await store.migrate();
  });

  afterAll(async () => {
    await store.close();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  it('upgrades the oldest hosted schema to the current pointer migration', async () => {
    const upgradeSchema = `reverb_upgrade_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA ${upgradeSchema}`);
    const legacyPool = new Pool({
      ...baseConfig,
      options: `-c search_path=${upgradeSchema},public`,
    });
    const upgradeStore = new PostgresHostedStore({
      ...baseConfig,
      options: `-c search_path=${upgradeSchema},public`,
    });
    try {
      await legacyPool.query(POSTGRES_MIGRATIONS[0]!.sql);
      await legacyPool.query(
        'INSERT INTO reverb_schema_migrations(version, name) VALUES ($1, $2)',
        [POSTGRES_MIGRATIONS[0]!.version, POSTGRES_MIGRATIONS[0]!.name],
      );
      await upgradeStore.migrate();
      const versions = await legacyPool.query<{ version: number }>(
        'SELECT version FROM reverb_schema_migrations ORDER BY version',
      );
      expect(versions.rows.map((row) => row.version)).toEqual([1, 2]);
      const pointerTable = await legacyPool.query<{ name: string | null }>(
        "SELECT to_regclass('reverb_canonical_pointers')::text AS name",
      );
      expect(pointerTable.rows[0]?.name).toBe('reverb_canonical_pointers');
    } finally {
      await upgradeStore.close();
      await legacyPool.end();
      await admin.query(`DROP SCHEMA ${upgradeSchema} CASCADE`);
    }
  });

  it('installs forced RLS on every workspace-scoped table', async () => {
    const result = await admin.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = 'r'
         AND c.relname LIKE 'reverb_%' AND c.relname <> 'reverb_schema_migrations'
       ORDER BY c.relname`,
      [schema],
    );
    expect(result.rows).toHaveLength(8);
    expect(result.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });

  it('isolates tenant canaries and restores a hash-verified canonical backup', async () => {
    const hashA = contentHash(`sha256:${'a'.repeat(64)}`);
    const hashB = contentHash(`sha256:${'b'.repeat(64)}`);
    await store.putCanonicalRecord({
      workspaceId: workspaceA,
      recordType: 'analysis',
      recordId: 'analysis-a',
      repositoryId: 'github:101',
      payloadHash: hashA,
      payload: { tenantCanary: 'alpha-only' },
      createdAt: now,
    });
    await store.putCanonicalPointer({
      workspaceId: workspaceA,
      pointerType: 'current_analysis',
      pointerId: 'pull-request-9',
      repositoryId: 'github:101',
      targetRecordType: 'analysis',
      targetRecordId: 'analysis-a',
      updatedAt: now,
    });
    await store.putCanonicalRecord({
      workspaceId: workspaceB,
      recordType: 'analysis',
      recordId: 'analysis-b',
      repositoryId: 'github:202',
      payloadHash: hashB,
      payload: { tenantCanary: 'beta-only' },
      createdAt: now,
    });
    expect(await store.countRows(workspaceA, 'reverb_canonical_records')).toBe(1);
    expect(await store.countRows(workspaceB, 'reverb_canonical_records')).toBe(1);

    const backup = await store.backupWorkspace({ workspaceId: workspaceA, createdAt: later });
    expect(backup.records.map((record) => record.recordId)).toEqual(['analysis-a']);
    const counts = await store.purgeRepository({
      workspaceId: workspaceA,
      repositoryId: 'github:101',
      authorizationRevision: 'authorization-revoked-1',
      requestedAt: now,
      completedAt: later,
    });
    expect(counts.reverb_canonical_records).toBe(1);
    expect(backup.pointers).toHaveLength(1);
    expect(await store.restoreWorkspace(backup)).toBe(2);
    expect(await store.countRows(workspaceA, 'reverb_canonical_records')).toBe(1);
    expect(await store.countRows(workspaceA, 'reverb_canonical_pointers')).toBe(1);
    expect(await store.countRows(workspaceB, 'reverb_canonical_records')).toBe(1);
  });

  it('deduplicates webhooks/jobs, reclaims expired leases, and completes effects once', async () => {
    const payloadHash = contentHash(`sha256:${'c'.repeat(64)}`);
    const receipt = {
      workspaceId: workspaceA,
      installationId: 77,
      deliveryId: 'delivery-1',
      eventType: 'pull_request',
      repositoryExternalId: 101,
      receivedAt: now,
      signatureValidated: true as const,
      payloadHash,
      pointer: { action: 'synchronize', pullRequestNumber: 9, headSha: 'd'.repeat(40) },
    };
    expect(await store.receiveWebhook(receipt)).toBe(true);
    expect(await store.receiveWebhook(receipt)).toBe(false);
    expect(
      await store.markWebhookProcessed({
        workspaceId: workspaceA,
        installationId: 77,
        deliveryId: 'delivery-1',
        state: 'processed',
      }),
    ).toBe(true);

    const jobInput = {
      workspaceId: workspaceA,
      kind: 'analyze_pull_request',
      idempotencyKey: contentHash(`sha256:${'d'.repeat(64)}`),
      repositoryId: 'github:101',
      supersessionKey: contentHash(`sha256:${'e'.repeat(64)}`),
      payload: { pullRequestNumber: 9 },
      availableAt: now,
      maximumAttempts: 3,
    };
    const jobId = await store.enqueueJob(jobInput);
    expect(await store.enqueueJob(jobInput)).toBe(jobId);
    const first = await store.claimJob({
      workspaceId: workspaceA,
      workerId: 'worker-a',
      now,
      leaseExpiresAt: leaseEnd,
    });
    expect(first).toMatchObject({ jobId, attempt: 1, leaseOwner: 'worker-a' });
    const reclaimed = await store.claimJob({
      workspaceId: workspaceA,
      workerId: 'worker-b',
      now: later,
      leaseExpiresAt: instant('2026-08-28T20:06:00.000Z'),
    });
    expect(reclaimed).toMatchObject({ jobId, attempt: 2, leaseOwner: 'worker-b' });
    expect(
      await store.completeJob({
        workspaceId: workspaceA,
        jobId,
        workerId: 'worker-a',
        resultHash: payloadHash,
      }),
    ).toBe(false);
    expect(
      await store.completeJob({
        workspaceId: workspaceA,
        jobId,
        workerId: 'worker-b',
        resultHash: payloadHash,
      }),
    ).toBe(true);

    const retryJobId = await store.enqueueJob({
      ...jobInput,
      idempotencyKey: contentHash(`sha256:${'6'.repeat(64)}`),
    });
    const retryClaim = await store.claimJob({
      workspaceId: workspaceA,
      workerId: 'worker-c',
      now,
      leaseExpiresAt: leaseEnd,
    });
    expect(retryClaim?.jobId).toBe(retryJobId);
    expect(
      await store.failJob({
        workspaceId: workspaceA,
        jobId: retryJobId,
        workerId: 'worker-c',
        failureCode: 'provider_unavailable',
        retryable: true,
        retryAt: later,
      }),
    ).toBe('retry_scheduled');
    expect(
      await store.claimJob({
        workspaceId: workspaceA,
        workerId: 'worker-d',
        now: later,
        leaseExpiresAt: instant('2026-08-28T20:06:00.000Z'),
      }),
    ).toMatchObject({ jobId: retryJobId, attempt: 2 });

    expect(
      await store.enqueueDelivery({
        workspaceId: workspaceA,
        idempotencyKey: contentHash(`sha256:${'f'.repeat(64)}`),
        repositoryId: 'github:101',
        canonicalRecordHash: contentHash(`sha256:${'a'.repeat(64)}`),
        projectionHash: contentHash(`sha256:${'1'.repeat(64)}`),
        projection: { conclusion: 'neutral' },
        availableAt: now,
        maximumAttempts: 3,
      }),
    ).toBe(true);
    expect(
      await store.enqueueDelivery({
        workspaceId: workspaceA,
        idempotencyKey: contentHash(`sha256:${'f'.repeat(64)}`),
        repositoryId: 'github:101',
        canonicalRecordHash: contentHash(`sha256:${'a'.repeat(64)}`),
        projectionHash: contentHash(`sha256:${'1'.repeat(64)}`),
        projection: { conclusion: 'neutral' },
        availableAt: now,
        maximumAttempts: 3,
      }),
    ).toBe(false);
    const effect = await store.claimDelivery({
      workspaceId: workspaceA,
      workerId: 'writer-a',
      now,
      leaseExpiresAt: leaseEnd,
    });
    expect(effect).toMatchObject({ attempt: 1, leaseOwner: 'writer-a' });
    expect(
      await store.failDelivery({
        workspaceId: workspaceA,
        idempotencyKey: contentHash(`sha256:${'f'.repeat(64)}`),
        workerId: 'writer-a',
        failureCode: 'provider_unavailable',
        retryable: true,
        retryAt: later,
      }),
    ).toBe('retry_scheduled');
    expect(
      await store.claimDelivery({
        workspaceId: workspaceA,
        workerId: 'writer-b',
        now: later,
        leaseExpiresAt: instant('2026-08-28T20:06:00.000Z'),
      }),
    ).toMatchObject({ attempt: 2, leaseOwner: 'writer-b' });
    expect(
      await store.completeDelivery({
        workspaceId: workspaceA,
        idempotencyKey: contentHash(`sha256:${'f'.repeat(64)}`),
        workerId: 'writer-a',
        providerExternalId: 'check-44',
      }),
    ).toBe(false);
    expect(
      await store.completeDelivery({
        workspaceId: workspaceA,
        idempotencyKey: contentHash(`sha256:${'f'.repeat(64)}`),
        workerId: 'writer-b',
        providerExternalId: 'check-44',
      }),
    ).toBe(true);
    expect(
      await store.completeDelivery({
        workspaceId: workspaceA,
        idempotencyKey: contentHash(`sha256:${'f'.repeat(64)}`),
        workerId: 'writer-b',
        providerExternalId: 'check-44',
      }),
    ).toBe(false);
  });

  it('invalidates projections by authorization revision and purges derived rows', async () => {
    await store.putDisclosureProjection({
      workspaceId: workspaceA,
      projectionHash: contentHash(`sha256:${'2'.repeat(64)}`),
      repositoryId: 'github:101',
      authorizationRevision: 'acl-1',
      audience: 'static',
      projection: { title: 'safe' },
      decisionReasons: ['consumer_details_omitted'],
      createdAt: now,
    });
    expect(
      await store.revokeDisclosureRevision({
        workspaceId: workspaceA,
        authorizationRevision: 'acl-1',
        revokedAt: later,
      }),
    ).toBe(1);
    const counts = await store.purgeRepository({
      workspaceId: workspaceA,
      repositoryId: 'github:101',
      authorizationRevision: 'acl-2',
      requestedAt: now,
      completedAt: later,
    });
    expect(counts.reverb_disclosure_projections).toBe(1);
    expect(counts.reverb_delivery_outbox).toBe(1);
    expect(await store.countRows(workspaceB, 'reverb_canonical_records')).toBe(1);
  });
});
