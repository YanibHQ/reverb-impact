import { hashCanonical } from '@yanib/reverb-domain';
import type { ContentHash, Instant, WorkspaceId } from '@yanib/reverb-domain';
import { Pool } from 'pg';
import type { PoolClient, PoolConfig, QueryResultRow } from 'pg';

import { POSTGRES_MIGRATIONS } from './migrations.js';

export interface CanonicalHostedRecord {
  readonly workspaceId: WorkspaceId;
  readonly recordType: string;
  readonly recordId: string;
  readonly repositoryId?: string;
  readonly payloadHash: ContentHash;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: Instant;
}

export interface CanonicalHostedPointer {
  readonly workspaceId: WorkspaceId;
  readonly pointerType: string;
  readonly pointerId: string;
  readonly repositoryId?: string;
  readonly targetRecordType: string;
  readonly targetRecordId: string;
  readonly updatedAt: Instant;
}

export interface WebhookInboxEntry {
  readonly workspaceId: WorkspaceId;
  readonly installationId: number;
  readonly deliveryId: string;
  readonly eventType: string;
  readonly repositoryExternalId?: number;
  readonly receivedAt: Instant;
  readonly signatureValidated: true;
  readonly payloadHash: ContentHash;
  readonly pointer: Readonly<Record<string, unknown>>;
}

export interface WebhookInboxClaim extends WebhookInboxEntry {
  readonly attempt: number;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Instant;
}

export interface HostedJobInput {
  readonly workspaceId: WorkspaceId;
  readonly kind: string;
  readonly idempotencyKey: ContentHash;
  readonly repositoryId?: string;
  readonly supersessionKey?: ContentHash;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly availableAt: Instant;
  readonly maximumAttempts: number;
}

export interface HostedJobClaim extends HostedJobInput {
  readonly jobId: string;
  readonly attempt: number;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Instant;
}

export interface DeliveryOutboxInput {
  readonly workspaceId: WorkspaceId;
  readonly idempotencyKey: ContentHash;
  readonly repositoryId: string;
  readonly canonicalRecordHash: ContentHash;
  readonly projectionHash: ContentHash;
  readonly projection: Readonly<Record<string, unknown>>;
  readonly availableAt: Instant;
  readonly maximumAttempts: number;
  readonly state?: 'available' | 'disabled';
}

export interface DeliveryOutboxClaim extends DeliveryOutboxInput {
  readonly attempt: number;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Instant;
}

export interface DisclosureProjectionRecord {
  readonly workspaceId: WorkspaceId;
  readonly projectionHash: ContentHash;
  readonly repositoryId: string;
  readonly authorizationRevision: string;
  readonly audience: 'static' | 'personalized';
  readonly projection: Readonly<Record<string, unknown>>;
  readonly decisionReasons: readonly string[];
  readonly createdAt: Instant;
}

export interface WorkspaceBackup {
  readonly schema: 'reverb.postgres-workspace-backup';
  readonly schemaVersion: '1.0';
  readonly workspaceId: WorkspaceId;
  readonly createdAt: Instant;
  readonly records: readonly CanonicalHostedRecord[];
  readonly pointers: readonly CanonicalHostedPointer[];
  readonly outputHash: ContentHash;
}

function dateString(value: unknown): Instant {
  if (value instanceof Date) return value.toISOString() as Instant;
  return String(value) as Instant;
}

function jsonRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }
  throw new Error('Postgres returned a non-object JSON value.');
}

export class PostgresHostedStore {
  readonly #pool: Pool;
  readonly #ownsPool: boolean;

  public constructor(config: Pool | PoolConfig) {
    this.#ownsPool = !(config instanceof Pool);
    this.#pool = config instanceof Pool ? config : new Pool(config);
  }

  public async close(): Promise<void> {
    if (this.#ownsPool) await this.#pool.end();
  }

  public async migrate(): Promise<void> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE TABLE IF NOT EXISTS reverb_schema_migrations (
          version integer PRIMARY KEY,
          name text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
        )
      `);
      for (const migration of POSTGRES_MIGRATIONS) {
        const existing = await client.query<{ version: number }>(
          'SELECT version FROM reverb_schema_migrations WHERE version = $1',
          [migration.version],
        );
        if (existing.rowCount === 0) {
          await client.query(migration.sql);
          await client.query(
            'INSERT INTO reverb_schema_migrations (version, name) VALUES ($1, $2)',
            [migration.version, migration.name],
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async #workspace<Value>(
    workspaceId: WorkspaceId,
    operation: (client: PoolClient) => Promise<Value>,
  ): Promise<Value> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('reverb.workspace_id', $1, true)", [workspaceId]);
      const value = await operation(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async putCanonicalRecord(record: CanonicalHostedRecord): Promise<boolean> {
    return this.#workspace(record.workspaceId, async (client) => {
      const result = await client.query(
        `INSERT INTO reverb_canonical_records
          (workspace_id, record_type, record_id, repository_id, payload_hash, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (workspace_id, record_type, record_id) DO NOTHING`,
        [
          record.workspaceId,
          record.recordType,
          record.recordId,
          record.repositoryId ?? null,
          record.payloadHash,
          JSON.stringify(record.payload),
          record.createdAt,
        ],
      );
      if (result.rowCount === 1) return true;
      const existing = await client.query<{ payload_hash: ContentHash }>(
        `SELECT payload_hash FROM reverb_canonical_records
         WHERE workspace_id = $1 AND record_type = $2 AND record_id = $3`,
        [record.workspaceId, record.recordType, record.recordId],
      );
      if (existing.rows[0]?.payload_hash !== record.payloadHash) {
        throw new Error('Canonical record identity conflicts with an immutable payload.');
      }
      return false;
    });
  }

  public async getCanonicalRecord(input: {
    readonly workspaceId: WorkspaceId;
    readonly recordType: string;
    readonly recordId: string;
  }): Promise<CanonicalHostedRecord | null> {
    return this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query<{
        repository_id: string | null;
        payload_hash: ContentHash;
        payload: unknown;
        created_at: Date;
      }>(
        `SELECT repository_id, payload_hash, payload, created_at
         FROM reverb_canonical_records
         WHERE workspace_id = $1 AND record_type = $2 AND record_id = $3`,
        [input.workspaceId, input.recordType, input.recordId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        workspaceId: input.workspaceId,
        recordType: input.recordType,
        recordId: input.recordId,
        ...(row.repository_id === null ? {} : { repositoryId: row.repository_id }),
        payloadHash: row.payload_hash,
        payload: jsonRecord(row.payload),
        createdAt: dateString(row.created_at),
      };
    });
  }

  public async putCanonicalPointer(pointer: CanonicalHostedPointer): Promise<void> {
    await this.#workspace(pointer.workspaceId, async (client) => {
      await client.query(
        `INSERT INTO reverb_canonical_pointers
          (workspace_id, pointer_type, pointer_id, repository_id, target_record_type,
           target_record_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (workspace_id, pointer_type, pointer_id) DO UPDATE SET
           repository_id = excluded.repository_id,
           target_record_type = excluded.target_record_type,
           target_record_id = excluded.target_record_id,
           updated_at = excluded.updated_at`,
        [
          pointer.workspaceId,
          pointer.pointerType,
          pointer.pointerId,
          pointer.repositoryId ?? null,
          pointer.targetRecordType,
          pointer.targetRecordId,
          pointer.updatedAt,
        ],
      );
    });
  }

  public async getCanonicalPointer(input: {
    readonly workspaceId: WorkspaceId;
    readonly pointerType: string;
    readonly pointerId: string;
  }): Promise<CanonicalHostedPointer | null> {
    return this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query<{
        repository_id: string | null;
        target_record_type: string;
        target_record_id: string;
        updated_at: Date;
      }>(
        `SELECT repository_id, target_record_type, target_record_id, updated_at
         FROM reverb_canonical_pointers
         WHERE workspace_id = $1 AND pointer_type = $2 AND pointer_id = $3`,
        [input.workspaceId, input.pointerType, input.pointerId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        workspaceId: input.workspaceId,
        pointerType: input.pointerType,
        pointerId: input.pointerId,
        ...(row.repository_id === null ? {} : { repositoryId: row.repository_id }),
        targetRecordType: row.target_record_type,
        targetRecordId: row.target_record_id,
        updatedAt: dateString(row.updated_at),
      };
    });
  }

  public async receiveWebhook(entry: WebhookInboxEntry): Promise<boolean> {
    if (!entry.signatureValidated) throw new Error('Webhook signature must be validated first.');
    return this.#workspace(entry.workspaceId, async (client) => {
      const result = await client.query(
        `INSERT INTO reverb_webhook_inbox
          (workspace_id, installation_id, delivery_id, event_type, repository_external_id,
           received_at, signature_validated, payload_hash, pointer, processing_state)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8::jsonb, 'pending')
         ON CONFLICT (workspace_id, installation_id, delivery_id) DO NOTHING`,
        [
          entry.workspaceId,
          entry.installationId,
          entry.deliveryId,
          entry.eventType,
          entry.repositoryExternalId ?? null,
          entry.receivedAt,
          entry.payloadHash,
          JSON.stringify(entry.pointer),
        ],
      );
      return result.rowCount === 1;
    });
  }

  public async markWebhookProcessed(input: {
    readonly workspaceId: WorkspaceId;
    readonly installationId: number;
    readonly deliveryId: string;
    readonly state: 'pending' | 'processed' | 'failed';
  }): Promise<boolean> {
    return this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE reverb_webhook_inbox SET processing_state = $4
         WHERE workspace_id = $1 AND installation_id = $2 AND delivery_id = $3
           AND processing_state = 'pending'`,
        [input.workspaceId, input.installationId, input.deliveryId, input.state],
      );
      return result.rowCount === 1;
    });
  }

  public async claimWebhook(input: {
    readonly workspaceId: WorkspaceId;
    readonly workerId: string;
    readonly now: Instant;
    readonly leaseExpiresAt: Instant;
  }): Promise<WebhookInboxClaim | null> {
    return this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query<{
        installation_id: string;
        delivery_id: string;
        event_type: string;
        repository_external_id: string | null;
        received_at: Date;
        payload_hash: ContentHash;
        pointer: unknown;
        attempt: number;
        lease_owner: string;
        lease_expires_at: Date;
      }>(
        `WITH selected AS (
           SELECT installation_id, delivery_id FROM reverb_webhook_inbox
           WHERE workspace_id = $1
             AND (processing_state = 'pending' OR
                  (processing_state = 'processing' AND lease_expires_at <= $2))
           ORDER BY received_at, delivery_id
           FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE reverb_webhook_inbox AS inbox
         SET processing_state = 'processing', attempt = attempt + 1,
             lease_owner = $3, lease_expires_at = $4
         FROM selected
         WHERE inbox.workspace_id = $1
           AND inbox.installation_id = selected.installation_id
           AND inbox.delivery_id = selected.delivery_id
         RETURNING inbox.*`,
        [input.workspaceId, input.now, input.workerId, input.leaseExpiresAt],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        workspaceId: input.workspaceId,
        installationId: Number(row.installation_id),
        deliveryId: row.delivery_id,
        eventType: row.event_type,
        ...(row.repository_external_id === null
          ? {}
          : { repositoryExternalId: Number(row.repository_external_id) }),
        receivedAt: dateString(row.received_at),
        signatureValidated: true,
        payloadHash: row.payload_hash,
        pointer: jsonRecord(row.pointer),
        attempt: row.attempt,
        leaseOwner: row.lease_owner,
        leaseExpiresAt: dateString(row.lease_expires_at),
      };
    });
  }

  public async resolveWebhook(input: {
    readonly workspaceId: WorkspaceId;
    readonly installationId: number;
    readonly deliveryId: string;
    readonly workerId: string;
    readonly state: 'processed' | 'failed';
    readonly failureCode?: string;
  }): Promise<boolean> {
    return this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE reverb_webhook_inbox
         SET processing_state = $5, failure_code = $6,
             lease_owner = NULL, lease_expires_at = NULL
         WHERE workspace_id = $1 AND installation_id = $2 AND delivery_id = $3
           AND processing_state = 'processing' AND lease_owner = $4`,
        [
          input.workspaceId,
          input.installationId,
          input.deliveryId,
          input.workerId,
          input.state,
          input.failureCode ?? null,
        ],
      );
      return result.rowCount === 1;
    });
  }

  public async enqueueJob(input: HostedJobInput): Promise<string> {
    if (input.maximumAttempts < 1) throw new Error('maximumAttempts must be positive.');
    const jobId = `job_${hashCanonical({
      workspaceId: input.workspaceId,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
    }).slice('sha256:'.length)}`;
    return this.#workspace(input.workspaceId, async (client) => {
      await client.query(
        `INSERT INTO reverb_hosted_jobs
          (workspace_id, job_id, kind, idempotency_key, repository_id, supersession_key, payload,
           state, available_at, maximum_attempts)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'available', $8, $9)
         ON CONFLICT (workspace_id, kind, idempotency_key) DO NOTHING`,
        [
          input.workspaceId,
          jobId,
          input.kind,
          input.idempotencyKey,
          input.repositoryId ?? null,
          input.supersessionKey ?? null,
          JSON.stringify(input.payload),
          input.availableAt,
          input.maximumAttempts,
        ],
      );
      const found = await client.query<{ job_id: string }>(
        `SELECT job_id FROM reverb_hosted_jobs
         WHERE workspace_id = $1 AND kind = $2 AND idempotency_key = $3`,
        [input.workspaceId, input.kind, input.idempotencyKey],
      );
      return found.rows[0]!.job_id;
    });
  }

  public async claimJob(input: {
    readonly workspaceId: WorkspaceId;
    readonly workerId: string;
    readonly now: Instant;
    readonly leaseExpiresAt: Instant;
    readonly kinds?: readonly string[];
  }): Promise<HostedJobClaim | null> {
    return this.#workspace(input.workspaceId, async (client) => {
      const parameters: unknown[] = [
        input.workspaceId,
        input.now,
        input.workerId,
        input.leaseExpiresAt,
      ];
      const kindFilter =
        input.kinds && input.kinds.length > 0
          ? `AND kind = ANY($${parameters.push(input.kinds)}::text[])`
          : '';
      const result = await client.query<{
        job_id: string;
        kind: string;
        idempotency_key: ContentHash;
        repository_id: string | null;
        supersession_key: ContentHash | null;
        payload: unknown;
        available_at: Date;
        maximum_attempts: number;
        attempt: number;
        lease_owner: string;
        lease_expires_at: Date;
      }>(
        `WITH selected AS (
           SELECT job_id FROM reverb_hosted_jobs
           WHERE workspace_id = $1
             AND available_at <= $2
             AND attempt < maximum_attempts
             AND (state = 'available' OR (state = 'leased' AND lease_expires_at <= $2))
             ${kindFilter}
           ORDER BY available_at, job_id
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE reverb_hosted_jobs AS jobs
         SET state = 'leased', attempt = attempt + 1, lease_owner = $3, lease_expires_at = $4
         FROM selected
         WHERE jobs.workspace_id = $1 AND jobs.job_id = selected.job_id
         RETURNING jobs.*`,
        parameters,
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        workspaceId: input.workspaceId,
        jobId: row.job_id,
        kind: row.kind,
        idempotencyKey: row.idempotency_key,
        ...(row.repository_id === null ? {} : { repositoryId: row.repository_id }),
        ...(row.supersession_key === null ? {} : { supersessionKey: row.supersession_key }),
        payload: jsonRecord(row.payload),
        availableAt: dateString(row.available_at),
        maximumAttempts: row.maximum_attempts,
        attempt: row.attempt,
        leaseOwner: row.lease_owner,
        leaseExpiresAt: dateString(row.lease_expires_at),
      };
    });
  }

  public async completeJob(input: {
    readonly workspaceId: WorkspaceId;
    readonly jobId: string;
    readonly workerId: string;
    readonly resultHash: ContentHash;
  }): Promise<boolean> {
    return this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE reverb_hosted_jobs SET state = 'complete', result_hash = $4,
           lease_owner = NULL, lease_expires_at = NULL
         WHERE workspace_id = $1 AND job_id = $2 AND state = 'leased' AND lease_owner = $3`,
        [input.workspaceId, input.jobId, input.workerId, input.resultHash],
      );
      return result.rowCount === 1;
    });
  }

  public async failJob(input: {
    readonly workspaceId: WorkspaceId;
    readonly jobId: string;
    readonly workerId: string;
    readonly failureCode: string;
    readonly retryable: boolean;
    readonly retryAt: Instant;
  }): Promise<'retry_scheduled' | 'failed' | 'stale_claim'> {
    return this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query<{ state: 'available' | 'failed' }>(
        `UPDATE reverb_hosted_jobs
         SET state = CASE WHEN $5 AND attempt < maximum_attempts THEN 'available' ELSE 'failed' END,
             available_at = CASE WHEN $5 AND attempt < maximum_attempts THEN $6 ELSE available_at END,
             failure_code = $4, lease_owner = NULL, lease_expires_at = NULL
         WHERE workspace_id = $1 AND job_id = $2 AND state = 'leased' AND lease_owner = $3
         RETURNING state`,
        [
          input.workspaceId,
          input.jobId,
          input.workerId,
          input.failureCode,
          input.retryable,
          input.retryAt,
        ],
      );
      const state = result.rows[0]?.state;
      return state === undefined
        ? 'stale_claim'
        : state === 'available'
          ? 'retry_scheduled'
          : 'failed';
    });
  }

  public async supersedeJobs(input: {
    readonly workspaceId: WorkspaceId;
    readonly supersessionKey: ContentHash;
    readonly exceptJobId?: string;
  }): Promise<number> {
    return this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE reverb_hosted_jobs SET state = 'superseded', lease_owner = NULL,
           lease_expires_at = NULL
         WHERE workspace_id = $1 AND supersession_key = $2
           AND state IN ('available', 'leased') AND ($3::text IS NULL OR job_id <> $3)`,
        [input.workspaceId, input.supersessionKey, input.exceptJobId ?? null],
      );
      return result.rowCount ?? 0;
    });
  }

  public async enqueueDelivery(input: DeliveryOutboxInput): Promise<boolean> {
    return this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query(
        `INSERT INTO reverb_delivery_outbox
          (workspace_id, idempotency_key, repository_id, canonical_record_hash, projection_hash,
           projection, state, available_at, maximum_attempts)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
         ON CONFLICT (workspace_id, idempotency_key) DO NOTHING`,
        [
          input.workspaceId,
          input.idempotencyKey,
          input.repositoryId,
          input.canonicalRecordHash,
          input.projectionHash,
          JSON.stringify(input.projection),
          input.state ?? 'available',
          input.availableAt,
          input.maximumAttempts,
        ],
      );
      return result.rowCount === 1;
    });
  }

  public async claimDelivery(input: {
    readonly workspaceId: WorkspaceId;
    readonly workerId: string;
    readonly now: Instant;
    readonly leaseExpiresAt: Instant;
  }): Promise<DeliveryOutboxClaim | null> {
    return this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query<{
        idempotency_key: ContentHash;
        repository_id: string;
        canonical_record_hash: ContentHash;
        projection_hash: ContentHash;
        projection: unknown;
        available_at: Date;
        maximum_attempts: number;
        attempt: number;
        lease_owner: string;
        lease_expires_at: Date;
      }>(
        `WITH selected AS (
           SELECT idempotency_key FROM reverb_delivery_outbox
           WHERE workspace_id = $1 AND available_at <= $2 AND attempt < maximum_attempts
             AND (state = 'available' OR (state = 'leased' AND lease_expires_at <= $2))
           ORDER BY available_at, idempotency_key
           FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE reverb_delivery_outbox AS effects
         SET state = 'leased', attempt = attempt + 1, lease_owner = $3, lease_expires_at = $4
         FROM selected
         WHERE effects.workspace_id = $1 AND effects.idempotency_key = selected.idempotency_key
         RETURNING effects.*`,
        [input.workspaceId, input.now, input.workerId, input.leaseExpiresAt],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        workspaceId: input.workspaceId,
        idempotencyKey: row.idempotency_key,
        repositoryId: row.repository_id,
        canonicalRecordHash: row.canonical_record_hash,
        projectionHash: row.projection_hash,
        projection: jsonRecord(row.projection),
        availableAt: dateString(row.available_at),
        maximumAttempts: row.maximum_attempts,
        attempt: row.attempt,
        leaseOwner: row.lease_owner,
        leaseExpiresAt: dateString(row.lease_expires_at),
      };
    });
  }

  public async completeDelivery(input: {
    readonly workspaceId: WorkspaceId;
    readonly idempotencyKey: ContentHash;
    readonly workerId: string;
    readonly providerExternalId: string;
  }): Promise<boolean> {
    return this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE reverb_delivery_outbox SET state = 'delivered', provider_external_id = $4,
           lease_owner = NULL, lease_expires_at = NULL
         WHERE workspace_id = $1 AND idempotency_key = $2
           AND state = 'leased' AND lease_owner = $3`,
        [input.workspaceId, input.idempotencyKey, input.workerId, input.providerExternalId],
      );
      return result.rowCount === 1;
    });
  }

  public async resolveDelivery(input: {
    readonly workspaceId: WorkspaceId;
    readonly idempotencyKey: ContentHash;
    readonly workerId: string;
    readonly state: 'delivered' | 'disabled' | 'superseded';
    readonly providerExternalId?: string;
  }): Promise<boolean> {
    return this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE reverb_delivery_outbox SET state = $4, provider_external_id = $5,
           lease_owner = NULL, lease_expires_at = NULL
         WHERE workspace_id = $1 AND idempotency_key = $2
           AND state = 'leased' AND lease_owner = $3`,
        [
          input.workspaceId,
          input.idempotencyKey,
          input.workerId,
          input.state,
          input.providerExternalId ?? null,
        ],
      );
      return result.rowCount === 1;
    });
  }

  public async failDelivery(input: {
    readonly workspaceId: WorkspaceId;
    readonly idempotencyKey: ContentHash;
    readonly workerId: string;
    readonly failureCode: string;
    readonly retryable: boolean;
    readonly retryAt: Instant;
  }): Promise<'retry_scheduled' | 'failed' | 'stale_claim'> {
    return this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query<{ state: 'available' | 'failed' }>(
        `UPDATE reverb_delivery_outbox
         SET state = CASE WHEN $5 AND attempt < maximum_attempts THEN 'available' ELSE 'failed' END,
             available_at = CASE WHEN $5 AND attempt < maximum_attempts THEN $6 ELSE available_at END,
             failure_code = $4, lease_owner = NULL, lease_expires_at = NULL
         WHERE workspace_id = $1 AND idempotency_key = $2
           AND state = 'leased' AND lease_owner = $3
         RETURNING state`,
        [
          input.workspaceId,
          input.idempotencyKey,
          input.workerId,
          input.failureCode,
          input.retryable,
          input.retryAt,
        ],
      );
      const state = result.rows[0]?.state;
      return state === undefined
        ? 'stale_claim'
        : state === 'available'
          ? 'retry_scheduled'
          : 'failed';
    });
  }

  public async disablePendingDeliveries(workspaceId: WorkspaceId): Promise<number> {
    return this.#workspace(workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE reverb_delivery_outbox SET state = 'disabled', lease_owner = NULL,
           lease_expires_at = NULL
         WHERE workspace_id = $1 AND state IN ('available', 'leased')`,
        [workspaceId],
      );
      return result.rowCount ?? 0;
    });
  }

  public async putDisclosureProjection(record: DisclosureProjectionRecord): Promise<boolean> {
    return this.#workspace(record.workspaceId, async (client) => {
      const result = await client.query(
        `INSERT INTO reverb_disclosure_projections
          (workspace_id, projection_hash, repository_id, authorization_revision, audience,
           projection, decision_reasons, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
         ON CONFLICT (workspace_id, projection_hash) DO NOTHING`,
        [
          record.workspaceId,
          record.projectionHash,
          record.repositoryId,
          record.authorizationRevision,
          record.audience,
          JSON.stringify(record.projection),
          JSON.stringify(record.decisionReasons),
          record.createdAt,
        ],
      );
      return result.rowCount === 1;
    });
  }

  public async appendAudit(input: {
    readonly workspaceId: WorkspaceId;
    readonly eventType: string;
    readonly reasonCode: string;
    readonly subject: string;
    readonly details: Readonly<Record<string, string | number | boolean>>;
    readonly occurredAt: Instant;
  }): Promise<string> {
    const subjectHash = hashCanonical(input.subject);
    const auditId = hashCanonical({
      workspaceId: input.workspaceId,
      eventType: input.eventType,
      reasonCode: input.reasonCode,
      subjectHash,
      details: input.details,
      occurredAt: input.occurredAt,
    });
    await this.#workspace(input.workspaceId, async (client) => {
      await client.query(
        `INSERT INTO reverb_audit_events
          (workspace_id, audit_id, event_type, reason_code, subject_hash, details, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (workspace_id, audit_id) DO NOTHING`,
        [
          input.workspaceId,
          auditId,
          input.eventType,
          input.reasonCode,
          subjectHash,
          JSON.stringify(input.details),
          input.occurredAt,
        ],
      );
    });
    return auditId;
  }

  public async revokeDisclosureRevision(input: {
    readonly workspaceId: WorkspaceId;
    readonly authorizationRevision: string;
    readonly revokedAt: Instant;
  }): Promise<number> {
    return this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query(
        `UPDATE reverb_disclosure_projections SET revoked_at = $3
         WHERE workspace_id = $1 AND authorization_revision = $2 AND revoked_at IS NULL`,
        [input.workspaceId, input.authorizationRevision, input.revokedAt],
      );
      return result.rowCount ?? 0;
    });
  }

  public async backupWorkspace(input: {
    readonly workspaceId: WorkspaceId;
    readonly createdAt: Instant;
  }): Promise<WorkspaceBackup> {
    const records = await this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query<{
        record_type: string;
        record_id: string;
        repository_id: string | null;
        payload_hash: ContentHash;
        payload: unknown;
        created_at: Date;
      }>(
        `SELECT record_type, record_id, repository_id, payload_hash, payload, created_at
         FROM reverb_canonical_records WHERE workspace_id = $1
         ORDER BY record_type, record_id`,
        [input.workspaceId],
      );
      return result.rows.map((row) => ({
        workspaceId: input.workspaceId,
        recordType: row.record_type,
        recordId: row.record_id,
        ...(row.repository_id === null ? {} : { repositoryId: row.repository_id }),
        payloadHash: row.payload_hash,
        payload: jsonRecord(row.payload),
        createdAt: dateString(row.created_at),
      }));
    });
    const pointers = await this.#workspace(input.workspaceId, async (client) => {
      const result = await client.query<{
        pointer_type: string;
        pointer_id: string;
        repository_id: string | null;
        target_record_type: string;
        target_record_id: string;
        updated_at: Date;
      }>(
        `SELECT pointer_type, pointer_id, repository_id, target_record_type, target_record_id,
                updated_at
         FROM reverb_canonical_pointers WHERE workspace_id = $1
         ORDER BY pointer_type, pointer_id`,
        [input.workspaceId],
      );
      return result.rows.map((row) => ({
        workspaceId: input.workspaceId,
        pointerType: row.pointer_type,
        pointerId: row.pointer_id,
        ...(row.repository_id === null ? {} : { repositoryId: row.repository_id }),
        targetRecordType: row.target_record_type,
        targetRecordId: row.target_record_id,
        updatedAt: dateString(row.updated_at),
      }));
    });
    const draft = {
      schema: 'reverb.postgres-workspace-backup' as const,
      schemaVersion: '1.0' as const,
      workspaceId: input.workspaceId,
      createdAt: input.createdAt,
      records,
      pointers,
    };
    return { ...draft, outputHash: hashCanonical(draft) as ContentHash };
  }

  public async restoreWorkspace(backup: WorkspaceBackup): Promise<number> {
    const expected = hashCanonical({
      schema: backup.schema,
      schemaVersion: backup.schemaVersion,
      workspaceId: backup.workspaceId,
      createdAt: backup.createdAt,
      records: backup.records,
      pointers: backup.pointers,
    });
    if (expected !== backup.outputHash) throw new Error('Workspace backup hash does not match.');
    let restored = 0;
    for (const record of backup.records) {
      if (record.workspaceId !== backup.workspaceId) {
        throw new Error('Workspace backup contains a cross-tenant record.');
      }
      if (await this.putCanonicalRecord(record)) restored += 1;
    }
    for (const pointer of backup.pointers) {
      if (pointer.workspaceId !== backup.workspaceId) {
        throw new Error('Workspace backup contains a cross-tenant pointer.');
      }
      await this.putCanonicalPointer(pointer);
      restored += 1;
    }
    return restored;
  }

  public async purgeRepository(input: {
    readonly workspaceId: WorkspaceId;
    readonly repositoryId: string;
    readonly authorizationRevision: string;
    readonly requestedAt: Instant;
    readonly completedAt: Instant;
  }): Promise<Readonly<Record<string, number>>> {
    return this.#workspace(input.workspaceId, async (client) => {
      const purgeKey = hashCanonical({
        workspaceId: input.workspaceId,
        repositoryId: input.repositoryId,
        authorizationRevision: input.authorizationRevision,
      });
      const repositoryIdHash = hashCanonical(input.repositoryId);
      await client.query(
        `INSERT INTO reverb_purge_ledger
          (workspace_id, purge_key, repository_id_hash, authorization_revision, state,
           deleted_counts, requested_at)
         VALUES ($1, $2, $3, $4, 'requested', '{}'::jsonb, $5)
         ON CONFLICT (workspace_id, purge_key) DO NOTHING`,
        [
          input.workspaceId,
          purgeKey,
          repositoryIdHash,
          input.authorizationRevision,
          input.requestedAt,
        ],
      );
      const tables = [
        ['reverb_delivery_outbox', 'repository_id'],
        ['reverb_disclosure_projections', 'repository_id'],
        ['reverb_hosted_jobs', 'repository_id'],
        ['reverb_canonical_pointers', 'repository_id'],
        ['reverb_canonical_records', 'repository_id'],
      ] as const;
      const counts: Record<string, number> = {};
      for (const [table, column] of tables) {
        const deleted = await client.query(
          `DELETE FROM ${table} WHERE workspace_id = $1 AND ${column} = $2`,
          [input.workspaceId, input.repositoryId],
        );
        counts[table] = deleted.rowCount ?? 0;
      }
      const externalRepositoryId = /^github:([1-9][0-9]*)$/.exec(input.repositoryId)?.[1];
      if (externalRepositoryId !== undefined) {
        const deletedWebhooks = await client.query(
          `DELETE FROM reverb_webhook_inbox
           WHERE workspace_id = $1 AND repository_external_id = $2`,
          [input.workspaceId, Number(externalRepositoryId)],
        );
        counts.reverb_webhook_inbox = deletedWebhooks.rowCount ?? 0;
      }
      await client.query(
        `UPDATE reverb_purge_ledger SET state = 'complete', deleted_counts = $4::jsonb,
           completed_at = $5
         WHERE workspace_id = $1 AND purge_key = $2 AND authorization_revision = $3`,
        [
          input.workspaceId,
          purgeKey,
          input.authorizationRevision,
          JSON.stringify(counts),
          input.completedAt,
        ],
      );
      return counts;
    });
  }

  public async countRows(workspaceId: WorkspaceId, table: string): Promise<number> {
    const allowed = new Set([
      'reverb_canonical_records',
      'reverb_canonical_pointers',
      'reverb_webhook_inbox',
      'reverb_hosted_jobs',
      'reverb_delivery_outbox',
      'reverb_disclosure_projections',
      'reverb_audit_events',
      'reverb_purge_ledger',
    ]);
    if (!allowed.has(table)) throw new Error('Table is not allowlisted.');
    return this.#workspace(workspaceId, async (client) => {
      const result = await client.query<QueryResultRow & { count: string }>(
        `SELECT count(*)::text AS count FROM ${table} WHERE workspace_id = $1`,
        [workspaceId],
      );
      return Number(result.rows[0]!.count);
    });
  }
}
