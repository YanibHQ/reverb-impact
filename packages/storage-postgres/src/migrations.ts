export interface PostgresMigration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

const SCOPED_TABLES = [
  'reverb_canonical_records',
  'reverb_webhook_inbox',
  'reverb_hosted_jobs',
  'reverb_delivery_outbox',
  'reverb_disclosure_projections',
  'reverb_audit_events',
  'reverb_purge_ledger',
] as const;

const rlsStatements = SCOPED_TABLES.map(
  (table) => `
ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ${table}_workspace_isolation ON ${table};
CREATE POLICY ${table}_workspace_isolation ON ${table}
  USING (workspace_id = NULLIF(current_setting('reverb.workspace_id', true), ''))
  WITH CHECK (workspace_id = NULLIF(current_setting('reverb.workspace_id', true), ''));`,
).join('\n');

export const POSTGRES_MIGRATIONS: readonly PostgresMigration[] = [
  {
    version: 1,
    name: 'hosted_control_plane',
    sql: `
CREATE TABLE IF NOT EXISTS reverb_schema_migrations (
  version integer PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS reverb_canonical_records (
  workspace_id text NOT NULL,
  record_type text NOT NULL,
  record_id text NOT NULL,
  repository_id text,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, record_type, record_id),
  UNIQUE (workspace_id, payload_hash)
);
CREATE INDEX IF NOT EXISTS reverb_canonical_records_repository
  ON reverb_canonical_records (workspace_id, repository_id, record_type);

CREATE TABLE IF NOT EXISTS reverb_webhook_inbox (
  workspace_id text NOT NULL,
  installation_id bigint NOT NULL,
  delivery_id text NOT NULL,
  event_type text NOT NULL,
  repository_external_id bigint,
  received_at timestamptz NOT NULL,
  signature_validated boolean NOT NULL CHECK (signature_validated),
  payload_hash text NOT NULL,
  pointer jsonb NOT NULL,
  processing_state text NOT NULL CHECK (processing_state IN ('pending', 'processed', 'failed')),
  PRIMARY KEY (workspace_id, installation_id, delivery_id)
);

CREATE TABLE IF NOT EXISTS reverb_hosted_jobs (
  workspace_id text NOT NULL,
  job_id text NOT NULL,
  kind text NOT NULL,
  idempotency_key text NOT NULL,
  repository_id text,
  supersession_key text,
  payload jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('available', 'leased', 'complete', 'failed', 'superseded')),
  attempt integer NOT NULL DEFAULT 0,
  maximum_attempts integer NOT NULL CHECK (maximum_attempts > 0),
  available_at timestamptz NOT NULL,
  lease_owner text,
  lease_expires_at timestamptz,
  result_hash text,
  failure_code text,
  PRIMARY KEY (workspace_id, job_id),
  UNIQUE (workspace_id, kind, idempotency_key)
);
CREATE INDEX IF NOT EXISTS reverb_hosted_jobs_claim
  ON reverb_hosted_jobs (workspace_id, state, available_at);
CREATE INDEX IF NOT EXISTS reverb_hosted_jobs_supersession
  ON reverb_hosted_jobs (workspace_id, supersession_key, state);

CREATE TABLE IF NOT EXISTS reverb_delivery_outbox (
  workspace_id text NOT NULL,
  idempotency_key text NOT NULL,
  repository_id text NOT NULL,
  canonical_record_hash text NOT NULL,
  projection_hash text NOT NULL,
  projection jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('available', 'leased', 'delivered', 'failed', 'disabled', 'superseded')),
  attempt integer NOT NULL DEFAULT 0,
  maximum_attempts integer NOT NULL CHECK (maximum_attempts > 0),
  available_at timestamptz NOT NULL,
  lease_owner text,
  lease_expires_at timestamptz,
  provider_external_id text,
  failure_code text,
  PRIMARY KEY (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, canonical_record_hash)
    REFERENCES reverb_canonical_records (workspace_id, payload_hash)
);
CREATE INDEX IF NOT EXISTS reverb_delivery_outbox_claim
  ON reverb_delivery_outbox (workspace_id, state, available_at);

CREATE TABLE IF NOT EXISTS reverb_disclosure_projections (
  workspace_id text NOT NULL,
  projection_hash text NOT NULL,
  repository_id text NOT NULL,
  authorization_revision text NOT NULL,
  audience text NOT NULL CHECK (audience IN ('static', 'personalized')),
  projection jsonb NOT NULL,
  decision_reasons jsonb NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, projection_hash)
);
CREATE INDEX IF NOT EXISTS reverb_disclosure_projection_revision
  ON reverb_disclosure_projections (workspace_id, authorization_revision, revoked_at);

CREATE TABLE IF NOT EXISTS reverb_audit_events (
  workspace_id text NOT NULL,
  audit_id text NOT NULL,
  event_type text NOT NULL,
  reason_code text NOT NULL,
  subject_hash text NOT NULL,
  details jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, audit_id)
);

CREATE TABLE IF NOT EXISTS reverb_purge_ledger (
  workspace_id text NOT NULL,
  purge_key text NOT NULL,
  repository_id_hash text NOT NULL,
  authorization_revision text NOT NULL,
  state text NOT NULL CHECK (state IN ('requested', 'complete', 'failed')),
  deleted_counts jsonb NOT NULL,
  requested_at timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY (workspace_id, purge_key)
);

${rlsStatements}
`,
  },
  {
    version: 2,
    name: 'canonical_pointers',
    sql: `
CREATE TABLE IF NOT EXISTS reverb_canonical_pointers (
  workspace_id text NOT NULL,
  pointer_type text NOT NULL,
  pointer_id text NOT NULL,
  repository_id text,
  target_record_type text NOT NULL,
  target_record_id text NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, pointer_type, pointer_id),
  FOREIGN KEY (workspace_id, target_record_type, target_record_id)
    REFERENCES reverb_canonical_records (workspace_id, record_type, record_id)
);
CREATE INDEX IF NOT EXISTS reverb_canonical_pointers_repository
  ON reverb_canonical_pointers (workspace_id, repository_id, pointer_type);
ALTER TABLE reverb_canonical_pointers ENABLE ROW LEVEL SECURITY;
ALTER TABLE reverb_canonical_pointers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reverb_canonical_pointers_workspace_isolation
  ON reverb_canonical_pointers;
CREATE POLICY reverb_canonical_pointers_workspace_isolation ON reverb_canonical_pointers
  USING (workspace_id = NULLIF(current_setting('reverb.workspace_id', true), ''))
  WITH CHECK (workspace_id = NULLIF(current_setting('reverb.workspace_id', true), ''));
`,
  },
];

export const POSTGRES_TARGET_MAJOR = 18;
