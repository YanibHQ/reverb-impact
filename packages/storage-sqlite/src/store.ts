import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

import {
  adapterId,
  applyCompleteReferenceObservation,
  currentEvidenceEdges,
  finalizeAnalysisResult,
  commitSha,
  configRevision,
  contentHash,
  generationId,
  generationLeaseId,
  instant,
  overlayId,
  registryRevision,
  repoPath,
  repositoryStableId,
  treeHash,
  workspaceId,
  type AnalysisResult,
  type AnalysisId,
  type ContentHash,
  type ArtifactBatch,
  type BeginGeneration,
  type BoundedDiagnostic,
  type CoverageRecord,
  type ContractGenerationObservation,
  type EvidenceEdge,
  type FindingFingerprint,
  type FindingOccurrence,
  type FileArtifact,
  type GenerationFailure,
  type GenerationId,
  type GenerationLease,
  type GenerationSummary,
  type OverlayEntry,
  type OverlayId,
  type PullRequestOverlay,
  type RegistryRevision,
  type RegistrySnapshot,
  type RepositoryGeneration,
  type IndexedContractDefinition,
  type IndexedContractReference,
  type WorkspaceId,
  type ReviewEvent,
  type SuppressionRule,
  type SuppressionStateEvent,
  type CorpusManifest,
  type ImpactCase,
  type EvaluationReport,
  type PromotionRecord,
} from '@yanibhq/reverb-domain';
import {
  portFailure,
  portSuccess,
  type ArtifactCacheKey,
  type ArtifactCachePort,
  type BeginOverlay,
  type CachedArtifact,
  type DefinitionQuery,
  type EdgeQuery,
  type EvidenceGraphStore,
  type GenerationSelection,
  type GenerationSelectionResult,
  type GenerationStore,
  type OverlaySummary,
  type PortFailure,
  type PortResult,
  type ReferenceQuery,
  type WorkspaceRegistry,
  type ReviewEvaluationStore,
} from '@yanibhq/reverb-application';

export const SQLITE_SCHEMA_VERSION = 5;

interface GenerationRow {
  generation_id: string;
  workspace_id: string;
  repository_id: string;
  commit_sha: string;
  tree_hash: string;
  indexer_bundle_version: string;
  config_revision: string;
  registry_revision: string;
  state: RepositoryGeneration['state'];
  started_at: string;
  completed_at: string | null;
  coverage_hash: string | null;
  artifact_result_hash: string | null;
  selectable: number;
}

interface LeaseRow {
  generation_id: string;
  lease_id: string;
  expires_at: string;
}

interface OverlayRow {
  overlay_id: string;
  workspace_id: string;
  repository_id: string;
  base_generation_id: string;
  base_sha: string;
  head_sha: string;
  head_tree_hash: string;
  indexer_bundle_version: string;
  config_revision: string;
  registry_revision: string;
  state: PullRequestOverlay['state'];
  supersession_key: string;
  diff_hash: string;
  result_hash: string | null;
  started_at: string;
  completed_at: string | null;
}

interface ContractObservationRow {
  generation_id: string;
  observation_json: string;
  output_hash: string;
}

interface EvidenceEdgeRow {
  edge_id: string;
  edge_json: string;
}

interface AnalysisRow {
  analysis_id: string;
  result_json: string;
  output_hash: string;
}

const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS workspace_revisions (
  workspace_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  config_revision TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  source TEXT NOT NULL,
  reason TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, revision_id),
  UNIQUE (workspace_id, sequence)
) STRICT;

CREATE TABLE IF NOT EXISTS workspace_current_revisions (
  workspace_id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS repository_memberships (
  workspace_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  membership_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, revision_id, repository_id)
) STRICT;

CREATE TABLE IF NOT EXISTS service_identities (
  workspace_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  service_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, revision_id, service_id)
) STRICT;

CREATE TABLE IF NOT EXISTS service_aliases (
  workspace_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  alias_kind TEXT NOT NULL,
  alias_value TEXT NOT NULL,
  alias_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, revision_id, service_id, alias_kind, alias_value)
) STRICT;

CREATE TABLE IF NOT EXISTS consent_grants (
  workspace_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  action TEXT NOT NULL,
  grantee TEXT NOT NULL,
  consent_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, revision_id, repository_id, action, grantee)
) STRICT;

CREATE TABLE IF NOT EXISTS generations (
  generation_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  tree_hash TEXT NOT NULL,
  indexer_bundle_version TEXT NOT NULL,
  config_revision TEXT NOT NULL,
  registry_revision TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('building', 'complete', 'partial', 'failed', 'expired')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  coverage_hash TEXT,
  artifact_result_hash TEXT,
  selectable INTEGER NOT NULL DEFAULT 0 CHECK (selectable IN (0, 1)),
  UNIQUE (workspace_id, repository_id, commit_sha, indexer_bundle_version, config_revision)
) STRICT;

CREATE INDEX IF NOT EXISTS generations_selection_idx
  ON generations (workspace_id, repository_id, commit_sha, state, completed_at);

CREATE TABLE IF NOT EXISTS generation_leases (
  generation_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  lease_id TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS selected_generations (
  workspace_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  selected_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, repository_id)
) STRICT;

CREATE TABLE IF NOT EXISTS file_artifacts (
  workspace_id TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  path TEXT NOT NULL,
  source_blob_id TEXT NOT NULL,
  content_hash TEXT,
  size INTEGER NOT NULL,
  language TEXT NOT NULL,
  classification TEXT NOT NULL,
  parse_state TEXT NOT NULL,
  parser_id TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  config_revision TEXT NOT NULL,
  line_count INTEGER,
  reused_from_generation_id TEXT,
  PRIMARY KEY (workspace_id, generation_id, path)
) STRICT;

CREATE INDEX IF NOT EXISTS file_artifacts_blob_idx
  ON file_artifacts (workspace_id, source_blob_id, parser_id, parser_version, config_revision);

CREATE TABLE IF NOT EXISTS artifact_diagnostics (
  workspace_id TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  diagnostic_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, generation_id, sequence)
) STRICT;

CREATE TABLE IF NOT EXISTS coverage_records (
  workspace_id TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  coverage_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, generation_id, sequence)
) STRICT;

CREATE TABLE IF NOT EXISTS overlays (
  overlay_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  base_generation_id TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  head_tree_hash TEXT NOT NULL,
  indexer_bundle_version TEXT NOT NULL,
  config_revision TEXT NOT NULL,
  registry_revision TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('building', 'complete', 'partial', 'failed')),
  supersession_key TEXT NOT NULL,
  diff_hash TEXT NOT NULL,
  result_hash TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (workspace_id, repository_id, base_sha, head_sha, indexer_bundle_version, config_revision)
) STRICT;

CREATE TABLE IF NOT EXISTS overlay_leases (
  overlay_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  base_generation_id TEXT NOT NULL,
  lease_id TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS overlay_entries (
  workspace_id TEXT NOT NULL,
  overlay_id TEXT NOT NULL,
  path TEXT NOT NULL,
  entry_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, overlay_id, path)
) STRICT;

CREATE TABLE IF NOT EXISTS artifact_cache (
  workspace_id TEXT NOT NULL,
  source_blob_id TEXT NOT NULL,
  parser_id TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  config_revision TEXT NOT NULL,
  artifact_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, source_blob_id, parser_id, parser_version, config_revision)
) STRICT;

CREATE TABLE IF NOT EXISTS jobs (
  workspace_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, job_id),
  UNIQUE (workspace_id, idempotency_key)
) STRICT;

CREATE TABLE IF NOT EXISTS audit_events (
  workspace_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, event_id)
) STRICT;
`;

const MIGRATION_002 = `
ALTER TABLE artifact_cache
  ADD COLUMN indexer_bundle_version TEXT NOT NULL DEFAULT '';
CREATE INDEX artifact_cache_compatibility_idx
  ON artifact_cache (
    workspace_id, source_blob_id, indexer_bundle_version,
    parser_id, parser_version, config_revision
  );
`;

const MIGRATION_003 = `
CREATE TABLE generations_v3 (
  generation_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  tree_hash TEXT NOT NULL,
  indexer_bundle_version TEXT NOT NULL,
  config_revision TEXT NOT NULL,
  registry_revision TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('building', 'complete', 'partial', 'failed', 'expired')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  coverage_hash TEXT,
  artifact_result_hash TEXT,
  selectable INTEGER NOT NULL DEFAULT 0 CHECK (selectable IN (0, 1))
) STRICT;
INSERT INTO generations_v3 SELECT * FROM generations;
DROP TABLE generations;
ALTER TABLE generations_v3 RENAME TO generations;
CREATE INDEX generations_selection_idx
  ON generations (workspace_id, repository_id, commit_sha, state, completed_at);

CREATE TABLE overlays_v3 (
  overlay_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  base_generation_id TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  head_tree_hash TEXT NOT NULL,
  indexer_bundle_version TEXT NOT NULL,
  config_revision TEXT NOT NULL,
  registry_revision TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('building', 'complete', 'partial', 'failed')),
  supersession_key TEXT NOT NULL,
  diff_hash TEXT NOT NULL,
  result_hash TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
) STRICT;
INSERT INTO overlays_v3 SELECT * FROM overlays;
DROP TABLE overlays;
ALTER TABLE overlays_v3 RENAME TO overlays;
`;

const MIGRATION_004 = `
CREATE TABLE contract_observations (
  generation_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  coverage_state TEXT NOT NULL CHECK (coverage_state IN ('complete', 'partial', 'unsupported', 'failed')),
  observed_at TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  observation_json TEXT NOT NULL
) STRICT;
CREATE INDEX contract_observations_repository_idx
  ON contract_observations (workspace_id, repository_id, observed_at);

CREATE TABLE contract_definitions (
  workspace_id TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  contract_kind TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  definition_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, generation_id, sequence)
) STRICT;
CREATE INDEX contract_definitions_join_idx
  ON contract_definitions (workspace_id, contract_kind, canonical_key, generation_id);

CREATE TABLE contract_references (
  workspace_id TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  contract_kind TEXT NOT NULL,
  canonical_key TEXT,
  constrained_contract_key TEXT,
  stable_reference_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  reference_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, generation_id, sequence)
) STRICT;
CREATE INDEX contract_references_exact_join_idx
  ON contract_references (workspace_id, contract_kind, canonical_key, generation_id);
CREATE INDEX contract_references_constrained_join_idx
  ON contract_references (workspace_id, contract_kind, constrained_contract_key, generation_id);
CREATE INDEX contract_references_stable_idx
  ON contract_references (workspace_id, repository_id, stable_reference_id);

CREATE TABLE contract_changes (
  workspace_id TEXT NOT NULL,
  analysis_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  producer_repository_id TEXT NOT NULL,
  contract_kind TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  change_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, analysis_id, sequence)
) STRICT;
CREATE INDEX contract_changes_join_idx
  ON contract_changes (workspace_id, producer_repository_id, contract_kind, canonical_key);

CREATE TABLE evidence_edges (
  edge_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  producer_repository_id TEXT NOT NULL,
  consumer_repository_id TEXT NOT NULL,
  contract_kind TEXT NOT NULL,
  definition_key TEXT NOT NULL,
  stable_reference_id TEXT NOT NULL,
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  invalidated_at TEXT,
  edge_json TEXT NOT NULL
) STRICT;
CREATE INDEX evidence_edges_current_idx
  ON evidence_edges (workspace_id, producer_repository_id, consumer_repository_id, definition_key, invalidated_at);
CREATE INDEX evidence_edges_reference_idx
  ON evidence_edges (workspace_id, consumer_repository_id, stable_reference_id, invalidated_at);

CREATE TABLE service_edges (
  workspace_id TEXT NOT NULL,
  producer_service_id TEXT NOT NULL,
  consumer_service_id TEXT NOT NULL,
  evidence_edge_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, producer_service_id, consumer_service_id, evidence_edge_id)
) STRICT;

CREATE TABLE analysis_results (
  analysis_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  producer_repository_id TEXT NOT NULL,
  supersession_key TEXT NOT NULL,
  current INTEGER NOT NULL CHECK (current IN (0, 1)),
  state TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  result_json TEXT NOT NULL
) STRICT;
CREATE INDEX analysis_results_fingerprint_scope_idx
  ON analysis_results (workspace_id, producer_repository_id, current);

CREATE TABLE current_analyses (
  supersession_key TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  analysis_id TEXT NOT NULL
) STRICT;
`;

const MIGRATION_005 = `
CREATE TABLE review_events (
  review_event_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  finding_occurrence_id TEXT NOT NULL,
  finding_fingerprint TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  supersedes_event_id TEXT UNIQUE,
  output_hash TEXT NOT NULL,
  event_json TEXT NOT NULL
) STRICT;
CREATE INDEX review_events_finding_idx
  ON review_events (workspace_id, finding_fingerprint, occurred_at);

CREATE TABLE suppression_rules (
  suppression_rule_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  rule_json TEXT NOT NULL
) STRICT;
CREATE INDEX suppression_rules_workspace_idx
  ON suppression_rules (workspace_id, scope, created_at);

CREATE TABLE suppression_state_events (
  event_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  suppression_rule_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  event_json TEXT NOT NULL
) STRICT;
CREATE INDEX suppression_state_rule_idx
  ON suppression_state_events (workspace_id, suppression_rule_id, occurred_at);

CREATE TABLE corpus_manifests (
  revision TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  manifest_json TEXT NOT NULL
) STRICT;

CREATE TABLE corpus_cases (
  corpus_revision TEXT NOT NULL,
  case_id TEXT NOT NULL,
  subset TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  stratum_key TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  case_json TEXT NOT NULL,
  PRIMARY KEY (corpus_revision, case_id)
) STRICT;
CREATE INDEX corpus_cases_stratum_idx
  ON corpus_cases (corpus_revision, subset, stratum_key, organization_id);

CREATE TABLE evaluation_reports (
  output_hash TEXT PRIMARY KEY,
  corpus_revision TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  report_json TEXT NOT NULL
) STRICT;

CREATE TABLE promotion_records (
  promotion_record_id TEXT PRIMARY KEY,
  stratum_key TEXT NOT NULL,
  state TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  record_json TEXT NOT NULL
) STRICT;
CREATE INDEX promotion_records_stratum_idx
  ON promotion_records (stratum_key, decided_at);
`;

function infrastructureFailure(code: string, message: string, retryable = false): PortFailure {
  return { kind: 'infrastructure', code, safeMessage: message, retryable };
}

function conflict(message: string): PortResult<never> {
  return portFailure({
    kind: 'conflict',
    code: 'invalid_state_transition',
    safeMessage: message,
    retryable: false,
  });
}

function notFound(subject: string): PortResult<never> {
  return portFailure({
    kind: 'not_found',
    code: 'not_found',
    safeMessage: `${subject} was not found.`,
    retryable: false,
  });
}

function generationFromRow(row: GenerationRow): RepositoryGeneration {
  return {
    id: generationId(row.generation_id),
    workspaceId: workspaceId(row.workspace_id),
    repositoryId: repositoryStableId(row.repository_id),
    commitSha: commitSha(row.commit_sha),
    treeHash: treeHash(row.tree_hash),
    indexerBundleVersion: row.indexer_bundle_version,
    configRevision: configRevision(row.config_revision),
    registryRevision: registryRevision(row.registry_revision),
    state: row.state,
    startedAt: instant(row.started_at),
    ...(row.completed_at ? { completedAt: instant(row.completed_at) } : {}),
    ...(row.coverage_hash ? { coverageHash: contentHash(row.coverage_hash) } : {}),
    ...(row.artifact_result_hash
      ? { artifactResultHash: contentHash(row.artifact_result_hash) }
      : {}),
    selectable: row.selectable === 1,
  };
}

function overlayFromRow(row: OverlayRow): PullRequestOverlay {
  return {
    id: overlayId(row.overlay_id),
    workspaceId: workspaceId(row.workspace_id),
    repositoryId: repositoryStableId(row.repository_id),
    baseGenerationId: generationId(row.base_generation_id),
    baseSha: commitSha(row.base_sha),
    headSha: commitSha(row.head_sha),
    headTreeHash: treeHash(row.head_tree_hash),
    indexerBundleVersion: row.indexer_bundle_version,
    configRevision: configRevision(row.config_revision),
    registryRevision: registryRevision(row.registry_revision),
    state: row.state,
    supersessionKey: contentHash(row.supersession_key),
    diffHash: contentHash(row.diff_hash),
    ...(row.result_hash ? { resultHash: contentHash(row.result_hash) } : {}),
    startedAt: instant(row.started_at),
    ...(row.completed_at ? { completedAt: instant(row.completed_at) } : {}),
  };
}

function artifactFromJson(json: string): FileArtifact {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  return {
    generationId: generationId(String(parsed.generationId)),
    path: repoPath(String(parsed.path)),
    sourceBlobId: String(parsed.sourceBlobId),
    ...(parsed.contentHash ? { contentHash: contentHash(String(parsed.contentHash)) } : {}),
    size: Number(parsed.size),
    language: String(parsed.language),
    classification: parsed.classification as FileArtifact['classification'],
    parseState: parsed.parseState as FileArtifact['parseState'],
    parserId: adapterId(String(parsed.parserId)),
    parserVersion: String(parsed.parserVersion),
    configRevision: configRevision(String(parsed.configRevision)),
    ...(typeof parsed.lineCount === 'number' ? { lineCount: parsed.lineCount } : {}),
    ...(parsed.reusedFromGenerationId
      ? { reusedFromGenerationId: generationId(String(parsed.reusedFromGenerationId)) }
      : {}),
  };
}

export class SqliteStore
  implements
    GenerationStore,
    WorkspaceRegistry,
    ArtifactCachePort,
    EvidenceGraphStore,
    ReviewEvaluationStore
{
  readonly #database: DatabaseSync;

  public constructor(path: string) {
    const absolute = resolve(path);
    mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
    this.#database = new DatabaseSync(absolute);
    this.#database.exec('PRAGMA journal_mode = WAL;');
    this.#database.exec('PRAGMA foreign_keys = ON;');
    this.#database.exec('PRAGMA busy_timeout = 5000;');
    this.#database.exec('PRAGMA trusted_schema = OFF;');
    this.#migrate();
  }

  public close(): void {
    this.#database.close();
  }

  #migrate(): void {
    this.#database.exec(MIGRATION_001);
    this.#database
      .prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)')
      .run(1, new Date(0).toISOString());
    const second = this.#database
      .prepare('SELECT version FROM schema_migrations WHERE version = 2')
      .get();
    if (!second) {
      this.#transaction<void>(() => {
        this.#database.exec(MIGRATION_002);
        this.#database
          .prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(2, new Date(0).toISOString());
        return portSuccess(undefined);
      });
    }
    const third = this.#database
      .prepare('SELECT version FROM schema_migrations WHERE version = 3')
      .get();
    if (!third) {
      this.#transaction<void>(() => {
        this.#database.exec(MIGRATION_003);
        this.#database
          .prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(3, new Date(0).toISOString());
        return portSuccess(undefined);
      });
    }
    const fourth = this.#database
      .prepare('SELECT version FROM schema_migrations WHERE version = 4')
      .get();
    if (!fourth) {
      this.#transaction<void>(() => {
        this.#database.exec(MIGRATION_004);
        this.#database
          .prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(4, new Date(0).toISOString());
        return portSuccess(undefined);
      });
    }
    const fifth = this.#database
      .prepare('SELECT version FROM schema_migrations WHERE version = 5')
      .get();
    if (!fifth) {
      this.#transaction<void>(() => {
        this.#database.exec(MIGRATION_005);
        this.#database
          .prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(5, new Date(0).toISOString());
        return portSuccess(undefined);
      });
    }
  }

  #transaction<Value>(operation: () => PortResult<Value>): PortResult<Value> {
    this.#database.exec('BEGIN IMMEDIATE;');
    try {
      const value = operation();
      if (!value.ok) {
        this.#database.exec('ROLLBACK;');
        return value;
      }
      this.#database.exec('COMMIT;');
      return value;
    } catch (error) {
      this.#database.exec('ROLLBACK;');
      throw error;
    }
  }

  #safe<Value>(operation: () => PortResult<Value>): PortResult<Value> {
    try {
      return operation();
    } catch {
      return portFailure(infrastructureFailure('sqlite_failure', 'SQLite operation failed.', true));
    }
  }

  #generationRow(id: GenerationId): GenerationRow | undefined {
    return this.#database
      .prepare('SELECT * FROM generations WHERE generation_id = ?')
      .get(id) as unknown as GenerationRow | undefined;
  }

  #leaseRow(id: GenerationId): LeaseRow | undefined {
    return this.#database
      .prepare(
        'SELECT generation_id, lease_id, expires_at FROM generation_leases WHERE generation_id = ?',
      )
      .get(id) as unknown as LeaseRow | undefined;
  }

  public async beginGeneration(input: BeginGeneration): Promise<PortResult<GenerationLease>> {
    return this.#safe<GenerationLease>(() =>
      this.#transaction<GenerationLease>(() => {
        const existing = this.#generationRow(input.generationId);
        if (existing) {
          const sameIdentity =
            existing.workspace_id === input.workspaceId &&
            existing.repository_id === input.repositoryId &&
            existing.commit_sha === input.commitSha &&
            existing.indexer_bundle_version === input.indexerBundleVersion &&
            existing.config_revision === input.configRevision;
          if (!sameIdentity) return conflict('Generation ID was reused for a different identity.');
          const existingLease = this.#leaseRow(input.generationId);
          if (!existingLease) return conflict('Generation is no longer building.');
          return portSuccess({
            generationId: input.generationId,
            leaseId: generationLeaseId(existingLease.lease_id),
            expiresAt: instant(existingLease.expires_at),
            existing: true,
          });
        }
        this.#database
          .prepare(
            `INSERT INTO generations(
              generation_id, workspace_id, repository_id, commit_sha, tree_hash,
              indexer_bundle_version, config_revision, registry_revision, state, started_at, selectable
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'building', ?, 0)`,
          )
          .run(
            input.generationId,
            input.workspaceId,
            input.repositoryId,
            input.commitSha,
            input.treeHash,
            input.indexerBundleVersion,
            input.configRevision,
            input.registryRevision,
            input.startedAt,
          );
        this.#database
          .prepare(
            'INSERT INTO generation_leases(generation_id, workspace_id, lease_id, expires_at) VALUES (?, ?, ?, ?)',
          )
          .run(input.generationId, input.workspaceId, input.leaseId, input.leaseExpiresAt);
        return portSuccess({
          generationId: input.generationId,
          leaseId: input.leaseId,
          expiresAt: input.leaseExpiresAt,
          existing: false,
        });
      }),
    );
  }

  #activeLease(lease: GenerationLease): GenerationRow | null {
    const row = this.#generationRow(lease.generationId);
    const stored = this.#leaseRow(lease.generationId);
    return row &&
      stored &&
      row.state === 'building' &&
      stored.lease_id === lease.leaseId &&
      stored.expires_at === lease.expiresAt
      ? row
      : null;
  }

  public async putArtifacts(
    lease: GenerationLease,
    batch: ArtifactBatch,
  ): Promise<PortResult<void>> {
    return this.#safe(() =>
      this.#transaction<void>(() => {
        const generation = this.#activeLease(lease);
        if (!generation) return conflict('Artifact write requires the active building lease.');
        const insertArtifact = this.#database.prepare(
          `INSERT INTO file_artifacts(
            workspace_id, generation_id, path, source_blob_id, content_hash, size, language,
            classification, parse_state, parser_id, parser_version, config_revision,
            line_count, reused_from_generation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const artifact of batch.artifacts) {
          if (artifact.generationId !== lease.generationId) {
            return conflict('Artifact belongs to a different generation.');
          }
          insertArtifact.run(
            generation.workspace_id,
            lease.generationId,
            artifact.path,
            artifact.sourceBlobId,
            artifact.contentHash ?? null,
            artifact.size,
            artifact.language,
            artifact.classification,
            artifact.parseState,
            artifact.parserId,
            artifact.parserVersion,
            artifact.configRevision,
            artifact.lineCount ?? null,
            artifact.reusedFromGenerationId ?? null,
          );
        }
        const counts = this.#database
          .prepare(
            `SELECT
              (SELECT COUNT(*) FROM artifact_diagnostics WHERE workspace_id = ? AND generation_id = ?) AS diagnostics,
              (SELECT COUNT(*) FROM coverage_records WHERE workspace_id = ? AND generation_id = ?) AS coverage`,
          )
          .get(
            generation.workspace_id,
            lease.generationId,
            generation.workspace_id,
            lease.generationId,
          ) as unknown as { diagnostics: number; coverage: number };
        const insertDiagnostic = this.#database.prepare(
          'INSERT INTO artifact_diagnostics(workspace_id, generation_id, sequence, diagnostic_json) VALUES (?, ?, ?, ?)',
        );
        batch.diagnostics.forEach((diagnostic, index) =>
          insertDiagnostic.run(
            generation.workspace_id,
            lease.generationId,
            counts.diagnostics + index,
            JSON.stringify(diagnostic),
          ),
        );
        const insertCoverage = this.#database.prepare(
          'INSERT INTO coverage_records(workspace_id, generation_id, sequence, coverage_json) VALUES (?, ?, ?, ?)',
        );
        batch.coverage.forEach((coverage, index) =>
          insertCoverage.run(
            generation.workspace_id,
            lease.generationId,
            counts.coverage + index,
            JSON.stringify(coverage),
          ),
        );
        return portSuccess(undefined);
      }),
    );
  }

  public async completeGeneration(
    lease: GenerationLease,
    summary: GenerationSummary,
  ): Promise<PortResult<GenerationId>> {
    return this.#safe(() =>
      this.#transaction(() => {
        const generation = this.#activeLease(lease);
        if (!generation)
          return conflict('Generation completion requires the active building lease.');
        if (summary.state === 'partial' && !summary.selectable) {
          // A partial generation remains queryable by ID, but never selected.
        }
        const update = this.#database
          .prepare(
            `UPDATE generations SET
              state = ?, completed_at = ?, coverage_hash = ?, artifact_result_hash = ?, selectable = ?
             WHERE generation_id = ? AND state = 'building'`,
          )
          .run(
            summary.state,
            summary.completedAt,
            summary.coverageHash,
            summary.artifactResultHash,
            summary.selectable ? 1 : 0,
            lease.generationId,
          );
        if (update.changes !== 1) return conflict('Generation completion lost its lease.');
        this.#database
          .prepare('DELETE FROM generation_leases WHERE generation_id = ? AND lease_id = ?')
          .run(lease.generationId, lease.leaseId);
        if (summary.selectable) {
          this.#database
            .prepare(
              `INSERT INTO selected_generations(workspace_id, repository_id, generation_id, selected_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(workspace_id, repository_id) DO UPDATE SET
                 generation_id = excluded.generation_id, selected_at = excluded.selected_at`,
            )
            .run(
              generation.workspace_id,
              generation.repository_id,
              lease.generationId,
              summary.completedAt,
            );
        }
        return portSuccess(lease.generationId);
      }),
    );
  }

  public async failGeneration(
    lease: GenerationLease,
    failure: GenerationFailure,
  ): Promise<PortResult<void>> {
    return this.#finishFailedGeneration(lease, failure, 'failed');
  }

  public async expireLease(
    lease: GenerationLease,
    at: ReturnType<typeof instant>,
  ): Promise<PortResult<void>> {
    return this.#finishFailedGeneration(
      lease,
      { failedAt: at, code: 'infrastructure_failure', safeMessage: 'Generation lease expired.' },
      'expired',
    );
  }

  #finishFailedGeneration(
    lease: GenerationLease,
    failure: GenerationFailure,
    state: 'failed' | 'expired',
  ): PortResult<void> {
    return this.#safe(() =>
      this.#transaction(() => {
        if (!this.#activeLease(lease))
          return conflict('Generation failure requires the active building lease.');
        this.#database
          .prepare(
            "UPDATE generations SET state = ?, completed_at = ?, selectable = 0 WHERE generation_id = ? AND state = 'building'",
          )
          .run(state, failure.failedAt, lease.generationId);
        this.#database
          .prepare('DELETE FROM generation_leases WHERE generation_id = ? AND lease_id = ?')
          .run(lease.generationId, lease.leaseId);
        return portSuccess(undefined);
      }),
    );
  }

  public async getGeneration(id: GenerationId): Promise<PortResult<RepositoryGeneration>> {
    return this.#safe<RepositoryGeneration>(() => {
      const row = this.#generationRow(id);
      return row ? portSuccess(generationFromRow(row)) : notFound('Generation');
    });
  }

  public async selectGeneration(
    query: GenerationSelection,
  ): Promise<PortResult<GenerationSelectionResult>> {
    return this.#safe<GenerationSelectionResult>(() => {
      let row: GenerationRow | undefined;
      if (query.commitSha) {
        const clauses = ['workspace_id = ?', 'repository_id = ?', 'commit_sha = ?'];
        const parameters: (string | number)[] = [
          query.workspaceId,
          query.repositoryId,
          query.commitSha,
        ];
        if (query.indexerBundleVersion) {
          clauses.push('indexer_bundle_version = ?');
          parameters.push(query.indexerBundleVersion);
        }
        if (query.configRevision) {
          clauses.push('config_revision = ?');
          parameters.push(query.configRevision);
        }
        row = this.#database
          .prepare(
            `SELECT * FROM generations WHERE ${clauses.join(' AND ')}
             ORDER BY
               CASE state WHEN 'complete' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END,
               started_at DESC
             LIMIT 1`,
          )
          .get(...parameters) as unknown as GenerationRow | undefined;
      } else {
        row = this.#database
          .prepare(
            `SELECT g.* FROM selected_generations s
             JOIN generations g ON g.generation_id = s.generation_id
             WHERE s.workspace_id = ? AND s.repository_id = ?`,
          )
          .get(query.workspaceId, query.repositoryId) as unknown as GenerationRow | undefined;
      }
      if (!row) return portSuccess({ state: 'not_indexed' });
      const generation = generationFromRow(row);
      if (generation.state === 'failed' || generation.state === 'expired') {
        return portSuccess({ state: 'failed', generation });
      }
      if (
        generation.state === 'complete' ||
        (generation.state === 'partial' && query.allowPartial && generation.selectable)
      ) {
        return portSuccess({ state: 'selected', generation });
      }
      return portSuccess({ state: 'not_indexed' });
    });
  }

  public async listArtifacts(
    generation: GenerationId,
  ): Promise<PortResult<readonly FileArtifact[]>> {
    return this.#safe(() => {
      const row = this.#generationRow(generation);
      if (!row || (row.state !== 'complete' && row.state !== 'partial')) {
        return notFound('Completed generation artifacts');
      }
      const rows = this.#database
        .prepare(
          'SELECT * FROM file_artifacts WHERE workspace_id = ? AND generation_id = ? ORDER BY path',
        )
        .all(row.workspace_id, generation) as unknown as Record<string, unknown>[];
      return portSuccess(
        rows.map((artifact) =>
          artifactFromJson(
            JSON.stringify({
              generationId: artifact.generation_id,
              path: artifact.path,
              sourceBlobId: artifact.source_blob_id,
              contentHash: artifact.content_hash,
              size: artifact.size,
              language: artifact.language,
              classification: artifact.classification,
              parseState: artifact.parse_state,
              parserId: artifact.parser_id,
              parserVersion: artifact.parser_version,
              configRevision: artifact.config_revision,
              lineCount: artifact.line_count,
              reusedFromGenerationId: artifact.reused_from_generation_id,
            }),
          ),
        ),
      );
    });
  }

  public async getGenerationCoverage(
    generation: GenerationId,
  ): Promise<PortResult<readonly CoverageRecord[]>> {
    return this.#safe(() => {
      const row = this.#generationRow(generation);
      if (!row || (row.state !== 'complete' && row.state !== 'partial')) {
        return notFound('Completed generation coverage');
      }
      const values = this.#database
        .prepare(
          'SELECT coverage_json FROM coverage_records WHERE workspace_id = ? AND generation_id = ? ORDER BY sequence',
        )
        .all(row.workspace_id, generation) as unknown as { coverage_json: string }[];
      return portSuccess(values.map((value) => JSON.parse(value.coverage_json) as CoverageRecord));
    });
  }

  public async getGenerationDiagnostics(
    generation: GenerationId,
  ): Promise<PortResult<readonly BoundedDiagnostic[]>> {
    return this.#safe(() => {
      const row = this.#generationRow(generation);
      if (!row || (row.state !== 'complete' && row.state !== 'partial')) {
        return notFound('Completed generation diagnostics');
      }
      const values = this.#database
        .prepare(
          'SELECT diagnostic_json FROM artifact_diagnostics WHERE workspace_id = ? AND generation_id = ? ORDER BY sequence',
        )
        .all(row.workspace_id, generation) as unknown as { diagnostic_json: string }[];
      return portSuccess(
        values.map((value) => JSON.parse(value.diagnostic_json) as BoundedDiagnostic),
      );
    });
  }

  #overlayRow(id: OverlayId): OverlayRow | undefined {
    return this.#database
      .prepare('SELECT * FROM overlays WHERE overlay_id = ?')
      .get(id) as unknown as OverlayRow | undefined;
  }

  #overlayLease(id: OverlayId): (LeaseRow & { overlay_id: string }) | undefined {
    return this.#database
      .prepare(
        'SELECT overlay_id, base_generation_id AS generation_id, lease_id, expires_at FROM overlay_leases WHERE overlay_id = ?',
      )
      .get(id) as unknown as (LeaseRow & { overlay_id: string }) | undefined;
  }

  public async beginOverlay(input: BeginOverlay): Promise<PortResult<GenerationLease>> {
    return this.#safe<GenerationLease>(() =>
      this.#transaction<GenerationLease>(() => {
        const existing = this.#overlayRow(input.overlay.id);
        if (existing) {
          const lease = this.#overlayLease(input.overlay.id);
          if (!lease) return conflict('Overlay is no longer building.');
          return portSuccess({
            generationId: input.overlay.baseGenerationId,
            leaseId: generationLeaseId(lease.lease_id),
            expiresAt: instant(lease.expires_at),
            existing: true,
          });
        }
        const overlay = input.overlay;
        this.#database
          .prepare(
            `INSERT INTO overlays(
              overlay_id, workspace_id, repository_id, base_generation_id, base_sha, head_sha,
              head_tree_hash, indexer_bundle_version, config_revision, registry_revision, state,
              supersession_key, diff_hash, started_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'building', ?, ?, ?)`,
          )
          .run(
            overlay.id,
            overlay.workspaceId,
            overlay.repositoryId,
            overlay.baseGenerationId,
            overlay.baseSha,
            overlay.headSha,
            overlay.headTreeHash,
            overlay.indexerBundleVersion,
            overlay.configRevision,
            overlay.registryRevision,
            overlay.supersessionKey,
            overlay.diffHash,
            overlay.startedAt,
          );
        this.#database
          .prepare(
            'INSERT INTO overlay_leases(overlay_id, workspace_id, base_generation_id, lease_id, expires_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run(
            overlay.id,
            overlay.workspaceId,
            overlay.baseGenerationId,
            input.leaseId,
            input.leaseExpiresAt,
          );
        return portSuccess({
          generationId: overlay.baseGenerationId,
          leaseId: input.leaseId,
          expiresAt: input.leaseExpiresAt,
          existing: false,
        });
      }),
    );
  }

  #activeOverlayLease(lease: GenerationLease, id: OverlayId): OverlayRow | null {
    const overlay = this.#overlayRow(id);
    const stored = this.#overlayLease(id);
    return overlay &&
      stored &&
      overlay.state === 'building' &&
      stored.generation_id === lease.generationId &&
      stored.lease_id === lease.leaseId &&
      stored.expires_at === lease.expiresAt
      ? overlay
      : null;
  }

  public async putOverlayEntries(
    lease: GenerationLease,
    id: OverlayId,
    entries: readonly OverlayEntry[],
  ): Promise<PortResult<void>> {
    return this.#safe(() =>
      this.#transaction(() => {
        const overlay = this.#activeOverlayLease(lease, id);
        if (!overlay) return conflict('Overlay write requires the active building lease.');
        const insert = this.#database.prepare(
          'INSERT INTO overlay_entries(workspace_id, overlay_id, path, entry_json) VALUES (?, ?, ?, ?)',
        );
        for (const entry of entries) {
          insert.run(overlay.workspace_id, id, entry.path, JSON.stringify(entry));
        }
        return portSuccess(undefined);
      }),
    );
  }

  public async completeOverlay(
    lease: GenerationLease,
    id: OverlayId,
    summary: OverlaySummary,
  ): Promise<PortResult<OverlayId>> {
    return this.#safe(() =>
      this.#transaction(() => {
        if (!this.#activeOverlayLease(lease, id)) {
          return conflict('Overlay completion requires the active building lease.');
        }
        this.#database
          .prepare(
            "UPDATE overlays SET state = ?, completed_at = ?, result_hash = ? WHERE overlay_id = ? AND state = 'building'",
          )
          .run(summary.state, summary.completedAt, summary.resultHash, id);
        this.#database.prepare('DELETE FROM overlay_leases WHERE overlay_id = ?').run(id);
        return portSuccess(id);
      }),
    );
  }

  public async failOverlay(
    lease: GenerationLease,
    id: OverlayId,
    failure: GenerationFailure,
  ): Promise<PortResult<void>> {
    return this.#safe(() =>
      this.#transaction(() => {
        if (!this.#activeOverlayLease(lease, id)) {
          return conflict('Overlay failure requires the active building lease.');
        }
        this.#database
          .prepare("UPDATE overlays SET state = 'failed', completed_at = ? WHERE overlay_id = ?")
          .run(failure.failedAt, id);
        this.#database.prepare('DELETE FROM overlay_leases WHERE overlay_id = ?').run(id);
        return portSuccess(undefined);
      }),
    );
  }

  public async getOverlay(id: OverlayId): Promise<PortResult<PullRequestOverlay>> {
    return this.#safe(() => {
      const row = this.#overlayRow(id);
      return row ? portSuccess(overlayFromRow(row)) : notFound('Overlay');
    });
  }

  public async listOverlayEntries(id: OverlayId): Promise<PortResult<readonly OverlayEntry[]>> {
    return this.#safe(() => {
      const overlay = this.#overlayRow(id);
      if (!overlay || (overlay.state !== 'complete' && overlay.state !== 'partial')) {
        return notFound('Completed overlay entries');
      }
      const rows = this.#database
        .prepare(
          'SELECT entry_json FROM overlay_entries WHERE workspace_id = ? AND overlay_id = ? ORDER BY path',
        )
        .all(overlay.workspace_id, id) as unknown as { entry_json: string }[];
      return portSuccess(rows.map((row) => JSON.parse(row.entry_json) as OverlayEntry));
    });
  }

  public async putRevision(snapshot: RegistrySnapshot): Promise<PortResult<RegistryRevision>> {
    return this.#safe(() =>
      this.#transaction(() => {
        const revision = snapshot.revision;
        this.#database
          .prepare(
            `INSERT OR IGNORE INTO workspace_revisions(
              workspace_id, revision_id, sequence, config_revision, created_at, created_by,
              source, reason, config_hash, snapshot_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            revision.workspaceId,
            revision.revision,
            revision.sequence,
            revision.configRevision,
            revision.createdAt,
            revision.createdBy,
            revision.source,
            revision.reason,
            revision.configHash,
            JSON.stringify(snapshot),
          );
        const insertRepository = this.#database.prepare(
          'INSERT OR IGNORE INTO repository_memberships(workspace_id, revision_id, repository_id, membership_json) VALUES (?, ?, ?, ?)',
        );
        snapshot.repositories.forEach((repository) =>
          insertRepository.run(
            revision.workspaceId,
            revision.revision,
            repository.repositoryId,
            JSON.stringify(repository),
          ),
        );
        const insertService = this.#database.prepare(
          'INSERT OR IGNORE INTO service_identities(workspace_id, revision_id, service_id, service_json) VALUES (?, ?, ?, ?)',
        );
        snapshot.services.forEach((service) =>
          insertService.run(
            revision.workspaceId,
            revision.revision,
            service.id,
            JSON.stringify(service),
          ),
        );
        const insertAlias = this.#database.prepare(
          'INSERT OR IGNORE INTO service_aliases(workspace_id, revision_id, service_id, alias_kind, alias_value, alias_json) VALUES (?, ?, ?, ?, ?, ?)',
        );
        snapshot.aliases.forEach((alias) =>
          insertAlias.run(
            revision.workspaceId,
            revision.revision,
            alias.serviceId,
            alias.kind,
            alias.value,
            JSON.stringify(alias),
          ),
        );
        const insertConsent = this.#database.prepare(
          'INSERT OR IGNORE INTO consent_grants(workspace_id, revision_id, repository_id, action, grantee, consent_json) VALUES (?, ?, ?, ?, ?, ?)',
        );
        snapshot.consents.forEach((consent) =>
          insertConsent.run(
            revision.workspaceId,
            revision.revision,
            consent.repositoryId,
            consent.action,
            consent.grantee,
            JSON.stringify(consent),
          ),
        );
        const current = this.#database
          .prepare(
            `SELECT r.sequence FROM workspace_current_revisions c
             JOIN workspace_revisions r ON r.workspace_id = c.workspace_id AND r.revision_id = c.revision_id
             WHERE c.workspace_id = ?`,
          )
          .get(revision.workspaceId) as unknown as { sequence: number } | undefined;
        if (!current || current.sequence < revision.sequence) {
          this.#database
            .prepare(
              `INSERT INTO workspace_current_revisions(workspace_id, revision_id) VALUES (?, ?)
               ON CONFLICT(workspace_id) DO UPDATE SET revision_id = excluded.revision_id`,
            )
            .run(revision.workspaceId, revision.revision);
          const admitted = new Set(
            snapshot.repositories
              .filter((repository) => repository.selected)
              .map((repository) => repository.repositoryId),
          );
          const edgeRows = this.#database
            .prepare(
              `SELECT edge_id, edge_json FROM evidence_edges
               WHERE workspace_id = ? AND invalidated_at IS NULL`,
            )
            .all(revision.workspaceId) as unknown as EvidenceEdgeRow[];
          const invalidate = this.#database.prepare(
            `UPDATE evidence_edges SET invalidated_at = ?, edge_json = ?
             WHERE edge_id = ? AND invalidated_at IS NULL`,
          );
          edgeRows.forEach((edgeRow) => {
            const edge = JSON.parse(edgeRow.edge_json) as EvidenceEdge;
            const reason =
              !admitted.has(edge.producerRepositoryId) || !admitted.has(edge.consumerRepositoryId)
                ? ('membership_removed' as const)
                : edge.basis === 'registry_resolved' && edge.registryRevision !== revision.revision
                  ? ('registry_revision_changed' as const)
                  : undefined;
            if (reason !== undefined) {
              const updated = {
                ...edge,
                invalidatedAt: revision.createdAt,
                invalidationReason: reason,
              };
              invalidate.run(revision.createdAt, JSON.stringify(updated), edge.id);
            }
          });
        }
        return portSuccess(revision.revision);
      }),
    );
  }

  public async getRevision(
    workspace: ReturnType<typeof workspaceId>,
    revision: RegistryRevision,
  ): Promise<PortResult<RegistrySnapshot>> {
    return this.#safe(() => {
      const row = this.#database
        .prepare(
          'SELECT snapshot_json FROM workspace_revisions WHERE workspace_id = ? AND revision_id = ?',
        )
        .get(workspace, revision) as unknown as { snapshot_json: string } | undefined;
      return row
        ? portSuccess(JSON.parse(row.snapshot_json) as RegistrySnapshot)
        : notFound('Registry revision');
    });
  }

  public async getCurrentRevision(
    workspace: ReturnType<typeof workspaceId>,
  ): Promise<PortResult<RegistrySnapshot>> {
    return this.#safe(() => {
      const row = this.#database
        .prepare(
          `SELECT r.snapshot_json FROM workspace_current_revisions c
           JOIN workspace_revisions r ON r.workspace_id = c.workspace_id AND r.revision_id = c.revision_id
           WHERE c.workspace_id = ?`,
        )
        .get(workspace) as unknown as { snapshot_json: string } | undefined;
      return row
        ? portSuccess(JSON.parse(row.snapshot_json) as RegistrySnapshot)
        : notFound('Current registry revision');
    });
  }

  public async get(key: ArtifactCacheKey): Promise<PortResult<CachedArtifact | null>> {
    return this.#safe(() => {
      const row = this.#database
        .prepare(
          `SELECT artifact_json FROM artifact_cache
           WHERE workspace_id = ? AND source_blob_id = ? AND parser_id = ?
             AND parser_version = ? AND config_revision = ? AND indexer_bundle_version = ?`,
        )
        .get(
          key.workspaceId,
          key.sourceBlobId,
          key.parserId,
          key.parserVersion,
          key.configRevision,
          key.indexerBundleVersion,
        ) as unknown as { artifact_json: string } | undefined;
      return portSuccess(row ? (JSON.parse(row.artifact_json) as CachedArtifact) : null);
    });
  }

  public async put(value: CachedArtifact): Promise<PortResult<void>> {
    return this.#safe(() => {
      this.#database
        .prepare(
          `INSERT INTO artifact_cache(
            workspace_id, source_blob_id, parser_id, parser_version, config_revision,
            indexer_bundle_version, artifact_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(workspace_id, source_blob_id, parser_id, parser_version, config_revision)
          DO UPDATE SET
            indexer_bundle_version = excluded.indexer_bundle_version,
            artifact_json = excluded.artifact_json`,
        )
        .run(
          value.key.workspaceId,
          value.key.sourceBlobId,
          value.key.parserId,
          value.key.parserVersion,
          value.key.configRevision,
          value.key.indexerBundleVersion,
          JSON.stringify(value),
        );
      return portSuccess(undefined);
    });
  }

  public async putContractObservation(
    observation: ContractGenerationObservation,
  ): Promise<PortResult<void>> {
    return this.#safe(() =>
      this.#transaction(() => {
        const existing = this.#database
          .prepare(
            'SELECT generation_id, observation_json, output_hash FROM contract_observations WHERE generation_id = ?',
          )
          .get(observation.generationId) as unknown as ContractObservationRow | undefined;
        if (existing !== undefined) {
          return existing.output_hash === observation.outputHash
            ? portSuccess(undefined)
            : conflict('A generation contract observation is immutable.');
        }
        const generation = this.#generationRow(observation.generationId);
        if (
          generation === undefined ||
          (generation.state !== 'complete' && generation.state !== 'partial') ||
          generation.workspace_id !== observation.workspaceId ||
          generation.repository_id !== observation.repositoryId ||
          generation.commit_sha !== observation.commitSha
        ) {
          return conflict('Contract observation requires its completed repository generation.');
        }
        if (
          observation.definitions.some(
            (value) =>
              value.workspaceId !== observation.workspaceId ||
              value.repositoryId !== observation.repositoryId ||
              value.generationId !== observation.generationId ||
              value.commitSha !== observation.commitSha,
          ) ||
          observation.references.some(
            (value) =>
              value.workspaceId !== observation.workspaceId ||
              value.repositoryId !== observation.repositoryId ||
              value.generationId !== observation.generationId ||
              value.commitSha !== observation.commitSha,
          )
        ) {
          return conflict('Contract observation items do not match their generation.');
        }
        this.#database
          .prepare(
            `INSERT INTO contract_observations(
              generation_id, workspace_id, repository_id, commit_sha, coverage_state,
              observed_at, output_hash, observation_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            observation.generationId,
            observation.workspaceId,
            observation.repositoryId,
            observation.commitSha,
            observation.coverageState,
            observation.observedAt,
            observation.outputHash,
            JSON.stringify(observation),
          );
        const insertDefinition = this.#database.prepare(
          `INSERT INTO contract_definitions(
            workspace_id, generation_id, repository_id, contract_kind, canonical_key,
            sequence, definition_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        observation.definitions.forEach((definition, sequence) =>
          insertDefinition.run(
            observation.workspaceId,
            observation.generationId,
            observation.repositoryId,
            definition.contractKind,
            definition.canonicalKey,
            sequence,
            JSON.stringify(definition),
          ),
        );
        const insertReference = this.#database.prepare(
          `INSERT INTO contract_references(
            workspace_id, generation_id, repository_id, contract_kind, canonical_key,
            constrained_contract_key, stable_reference_id, sequence, reference_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        observation.references.forEach((reference, sequence) =>
          insertReference.run(
            observation.workspaceId,
            observation.generationId,
            observation.repositoryId,
            reference.contractKind,
            reference.canonicalKey ?? null,
            reference.constrainedContractKey ?? null,
            reference.stableReferenceId,
            sequence,
            JSON.stringify(reference),
          ),
        );
        if (observation.coverageState === 'complete') {
          const rows = this.#database
            .prepare(
              `SELECT edge_id, edge_json FROM evidence_edges
               WHERE workspace_id = ? AND consumer_repository_id = ? AND invalidated_at IS NULL`,
            )
            .all(observation.workspaceId, observation.repositoryId) as unknown as EvidenceEdgeRow[];
          const edges = rows.map((row) => JSON.parse(row.edge_json) as EvidenceEdge);
          const updated = applyCompleteReferenceObservation({
            edges,
            consumerRepositoryId: observation.repositoryId,
            currentReferenceIds: new Set(
              observation.references.map((value) => value.stableReferenceId),
            ),
            observedAt: observation.observedAt,
            complete: true,
          });
          const invalidate = this.#database.prepare(
            `UPDATE evidence_edges SET invalidated_at = ?, edge_json = ?
             WHERE edge_id = ? AND invalidated_at IS NULL`,
          );
          updated.forEach((edge) => {
            if (edge.invalidatedAt !== undefined) {
              invalidate.run(edge.invalidatedAt, JSON.stringify(edge), edge.id);
            }
          });
        }
        return portSuccess(undefined);
      }),
    );
  }

  public async getContractObservation(
    id: GenerationId,
  ): Promise<PortResult<ContractGenerationObservation | null>> {
    return this.#safe(() => {
      const row = this.#database
        .prepare(
          'SELECT generation_id, observation_json, output_hash FROM contract_observations WHERE generation_id = ?',
        )
        .get(id) as unknown as ContractObservationRow | undefined;
      return portSuccess(
        row === undefined
          ? null
          : (JSON.parse(row.observation_json) as ContractGenerationObservation),
      );
    });
  }

  public async readDefinitions(
    query: DefinitionQuery,
  ): Promise<PortResult<readonly IndexedContractDefinition[]>> {
    return this.#safe(() => {
      const rows = this.#database
        .prepare(
          `SELECT definition_json FROM contract_definitions
           WHERE workspace_id = ? ORDER BY contract_kind, canonical_key, repository_id, sequence`,
        )
        .all(query.workspaceId) as unknown as { definition_json: string }[];
      const keys = query.canonicalKeys === undefined ? undefined : new Set(query.canonicalKeys);
      return portSuccess(
        rows
          .map((row) => JSON.parse(row.definition_json) as IndexedContractDefinition)
          .filter(
            (value) =>
              (query.generationId === undefined || value.generationId === query.generationId) &&
              (query.repositoryId === undefined || value.repositoryId === query.repositoryId) &&
              (query.contractKind === undefined || value.contractKind === query.contractKind) &&
              (keys === undefined || keys.has(value.canonicalKey)),
          ),
      );
    });
  }

  public async readReferences(
    query: ReferenceQuery,
  ): Promise<PortResult<readonly IndexedContractReference[]>> {
    return this.#safe(() => {
      const rows = this.#database
        .prepare(
          `SELECT reference_json FROM contract_references
           WHERE workspace_id = ? ORDER BY stable_reference_id, repository_id, sequence`,
        )
        .all(query.workspaceId) as unknown as { reference_json: string }[];
      const generations =
        query.generationIds === undefined ? undefined : new Set(query.generationIds);
      const keys = query.canonicalKeys === undefined ? undefined : new Set(query.canonicalKeys);
      return portSuccess(
        rows
          .map((row) => JSON.parse(row.reference_json) as IndexedContractReference)
          .filter(
            (value) =>
              (generations === undefined || generations.has(value.generationId)) &&
              (query.repositoryId === undefined || value.repositoryId === query.repositoryId) &&
              (query.contractKind === undefined || value.contractKind === query.contractKind) &&
              (keys === undefined ||
                (value.canonicalKey !== undefined && keys.has(value.canonicalKey)) ||
                (value.constrainedContractKey !== undefined &&
                  keys.has(value.constrainedContractKey))),
          ),
      );
    });
  }

  public async observeEdges(edges: readonly EvidenceEdge[]): Promise<PortResult<void>> {
    return this.#safe(() =>
      this.#transaction(() => {
        const get = this.#database.prepare(
          'SELECT edge_id, edge_json FROM evidence_edges WHERE edge_id = ?',
        );
        const upsert = this.#database.prepare(
          `INSERT INTO evidence_edges(
            edge_id, workspace_id, producer_repository_id, consumer_repository_id,
            contract_kind, definition_key, stable_reference_id, first_observed_at,
            last_observed_at, invalidated_at, edge_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(edge_id) DO UPDATE SET
            producer_repository_id = excluded.producer_repository_id,
            consumer_repository_id = excluded.consumer_repository_id,
            contract_kind = excluded.contract_kind,
            definition_key = excluded.definition_key,
            stable_reference_id = excluded.stable_reference_id,
            first_observed_at = excluded.first_observed_at,
            last_observed_at = excluded.last_observed_at,
            invalidated_at = excluded.invalidated_at,
            edge_json = excluded.edge_json`,
        );
        for (const edge of edges) {
          if (
            edge.definition.workspaceId !== edge.workspaceId ||
            edge.reference.workspaceId !== edge.workspaceId ||
            edge.definition.repositoryId !== edge.producerRepositoryId ||
            edge.reference.repositoryId !== edge.consumerRepositoryId
          ) {
            return conflict('Evidence edge back-pointers do not match its repositories.');
          }
          const row = get.get(edge.id) as unknown as EvidenceEdgeRow | undefined;
          const prior = row === undefined ? undefined : (JSON.parse(row.edge_json) as EvidenceEdge);
          const merged: EvidenceEdge =
            prior === undefined
              ? edge
              : {
                  ...edge,
                  firstObservedAt:
                    prior.firstObservedAt < edge.firstObservedAt
                      ? prior.firstObservedAt
                      : edge.firstObservedAt,
                  lastObservedAt:
                    prior.lastObservedAt > edge.lastObservedAt
                      ? prior.lastObservedAt
                      : edge.lastObservedAt,
                };
          upsert.run(
            merged.id,
            merged.workspaceId,
            merged.producerRepositoryId,
            merged.consumerRepositoryId,
            merged.contractKind,
            merged.definitionKey,
            merged.stableReferenceId,
            merged.firstObservedAt,
            merged.lastObservedAt,
            merged.invalidatedAt ?? null,
            JSON.stringify(merged),
          );
        }
        return portSuccess(undefined);
      }),
    );
  }

  public async readEdges(query: EdgeQuery): Promise<PortResult<readonly EvidenceEdge[]>> {
    return this.#safe(() => {
      const rows = this.#database
        .prepare(
          'SELECT edge_id, edge_json FROM evidence_edges WHERE workspace_id = ? ORDER BY edge_id',
        )
        .all(query.workspaceId) as unknown as EvidenceEdgeRow[];
      const keys = query.canonicalKeys === undefined ? undefined : new Set(query.canonicalKeys);
      let edges = rows
        .map((row) => JSON.parse(row.edge_json) as EvidenceEdge)
        .filter(
          (edge) =>
            (query.producerRepositoryId === undefined ||
              edge.producerRepositoryId === query.producerRepositoryId) &&
            (query.consumerRepositoryId === undefined ||
              edge.consumerRepositoryId === query.consumerRepositoryId) &&
            (keys === undefined || keys.has(edge.definitionKey)),
        );
      if (query.currentAt !== undefined) {
        edges = [
          ...currentEvidenceEdges({
            edges,
            asOf: query.currentAt,
            freshnessTtlMs: query.freshnessTtlMs ?? Number.MAX_SAFE_INTEGER,
          }),
        ];
      }
      return portSuccess(edges);
    });
  }

  public async rebuildServiceEdges(workspace: WorkspaceId): Promise<PortResult<number>> {
    return this.#safe(() =>
      this.#transaction(() => {
        this.#database.prepare('DELETE FROM service_edges WHERE workspace_id = ?').run(workspace);
        const rows = this.#database
          .prepare(
            `SELECT edge_id, edge_json FROM evidence_edges
             WHERE workspace_id = ? AND invalidated_at IS NULL ORDER BY edge_id`,
          )
          .all(workspace) as unknown as EvidenceEdgeRow[];
        const insert = this.#database.prepare(
          `INSERT INTO service_edges(
            workspace_id, producer_service_id, consumer_service_id, evidence_edge_id
          ) VALUES (?, ?, ?, ?)`,
        );
        const groups = new Set<string>();
        rows.forEach((row) => {
          const edge = JSON.parse(row.edge_json) as EvidenceEdge;
          const producerService = edge.definition.serviceId;
          const consumerService = edge.reference.consumerServiceId;
          if (producerService === undefined || consumerService === undefined) return;
          insert.run(workspace, producerService, consumerService, edge.id);
          groups.add(`${producerService}\0${consumerService}`);
        });
        return portSuccess(groups.size);
      }),
    );
  }

  public async persistAnalysis(
    result: AnalysisResult,
    supersessionKey: ReturnType<typeof contentHash>,
  ): Promise<PortResult<void>> {
    return this.#safe(() =>
      this.#transaction(() => {
        const existing = this.#database
          .prepare(
            'SELECT analysis_id, result_json, output_hash FROM analysis_results WHERE analysis_id = ?',
          )
          .get(result.analysisId) as unknown as AnalysisRow | undefined;
        if (existing !== undefined) {
          return existing.output_hash === result.outputHash
            ? portSuccess(undefined)
            : conflict('An analysis result is immutable for its analysis ID.');
        }
        if (result.current) {
          const current = this.#database
            .prepare('SELECT analysis_id FROM current_analyses WHERE supersession_key = ?')
            .get(supersessionKey) as unknown as { analysis_id: string } | undefined;
          if (current !== undefined && current.analysis_id !== result.analysisId) {
            const priorRow = this.#database
              .prepare(
                'SELECT analysis_id, result_json, output_hash FROM analysis_results WHERE analysis_id = ?',
              )
              .get(current.analysis_id) as unknown as AnalysisRow | undefined;
            if (priorRow !== undefined) {
              const prior = JSON.parse(priorRow.result_json) as AnalysisResult;
              const superseded = finalizeAnalysisResult({
                ...prior,
                state: 'superseded',
                current: false,
              });
              this.#database
                .prepare(
                  `UPDATE analysis_results SET current = 0, state = 'superseded',
                   output_hash = ?, result_json = ? WHERE analysis_id = ?`,
                )
                .run(superseded.outputHash, JSON.stringify(superseded), prior.analysisId);
            }
          }
        }
        this.#database
          .prepare(
            `INSERT INTO analysis_results(
              analysis_id, workspace_id, producer_repository_id, supersession_key,
              current, state, output_hash, result_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            result.analysisId,
            result.workspaceId,
            result.producerRepositoryId,
            supersessionKey,
            result.current ? 1 : 0,
            result.state,
            result.outputHash,
            JSON.stringify(result),
          );
        if (result.current) {
          this.#database
            .prepare(
              `INSERT INTO current_analyses(supersession_key, workspace_id, analysis_id)
               VALUES (?, ?, ?)
               ON CONFLICT(supersession_key) DO UPDATE SET
                 workspace_id = excluded.workspace_id, analysis_id = excluded.analysis_id`,
            )
            .run(supersessionKey, result.workspaceId, result.analysisId);
        }
        return portSuccess(undefined);
      }),
    );
  }

  public async getAnalysis(id: AnalysisId): Promise<PortResult<AnalysisResult>> {
    return this.#safe(() => {
      const row = this.#database
        .prepare(
          'SELECT analysis_id, result_json, output_hash FROM analysis_results WHERE analysis_id = ?',
        )
        .get(id) as unknown as AnalysisRow | undefined;
      return row === undefined
        ? notFound('Analysis')
        : portSuccess(JSON.parse(row.result_json) as AnalysisResult);
    });
  }

  public async getCurrentAnalysis(
    supersessionKey: ReturnType<typeof contentHash>,
  ): Promise<PortResult<AnalysisResult | null>> {
    return this.#safe(() => {
      const row = this.#database
        .prepare(
          `SELECT r.analysis_id, r.result_json, r.output_hash
           FROM current_analyses c
           JOIN analysis_results r ON r.analysis_id = c.analysis_id
           WHERE c.supersession_key = ?`,
        )
        .get(supersessionKey) as unknown as AnalysisRow | undefined;
      return portSuccess(
        row === undefined ? null : (JSON.parse(row.result_json) as AnalysisResult),
      );
    });
  }

  public async findFinding(
    workspace: WorkspaceId,
    fingerprint: FindingFingerprint,
  ): Promise<
    PortResult<{ readonly analysis: AnalysisResult; readonly finding: FindingOccurrence }>
  > {
    return this.#safe(() => {
      const rows = this.#database
        .prepare(
          `SELECT analysis_id, result_json, output_hash FROM analysis_results
           WHERE workspace_id = ? ORDER BY current DESC, analysis_id DESC`,
        )
        .all(workspace) as unknown as AnalysisRow[];
      for (const row of rows) {
        const analysis = JSON.parse(row.result_json) as AnalysisResult;
        const finding = analysis.findings.find((value) => value.fingerprint === fingerprint);
        if (finding !== undefined) return portSuccess({ analysis, finding });
      }
      return notFound('Finding');
    });
  }

  public async appendReview(input: {
    readonly event: ReviewEvent;
    readonly suppression?: SuppressionRule;
  }): Promise<PortResult<void>> {
    return this.#safe(() =>
      this.#transaction(() => {
        const existing = this.#database
          .prepare('SELECT output_hash FROM review_events WHERE review_event_id = ?')
          .get(input.event.id) as unknown as { output_hash: string } | undefined;
        if (existing !== undefined) {
          return existing.output_hash === input.event.outputHash
            ? portSuccess(undefined)
            : conflict('A review event is immutable for its event ID.');
        }
        const latest = this.#database
          .prepare(
            `SELECT review_event_id FROM review_events
             WHERE workspace_id = ? AND finding_occurrence_id = ?
             ORDER BY occurred_at DESC, review_event_id DESC LIMIT 1`,
          )
          .get(input.event.workspaceId, input.event.findingOccurrenceId) as unknown as
          | { review_event_id: string }
          | undefined;
        if (
          (latest === undefined && input.event.supersedes !== undefined) ||
          (latest !== undefined && input.event.supersedes !== latest.review_event_id)
        ) {
          return conflict('A review must supersede the latest event for the immutable occurrence.');
        }
        if (input.suppression !== undefined) {
          const priorRule = this.#database
            .prepare('SELECT output_hash FROM suppression_rules WHERE suppression_rule_id = ?')
            .get(input.suppression.id) as unknown as { output_hash: string } | undefined;
          if (priorRule !== undefined && priorRule.output_hash !== input.suppression.outputHash) {
            return conflict('A suppression rule is immutable for its rule ID.');
          }
          if (priorRule === undefined) {
            this.#database
              .prepare(
                `INSERT INTO suppression_rules(
                  suppression_rule_id, workspace_id, scope, created_at, output_hash, rule_json
                ) VALUES (?, ?, ?, ?, ?, ?)`,
              )
              .run(
                input.suppression.id,
                input.suppression.workspaceId,
                input.suppression.matcher.scope,
                input.suppression.createdAt,
                input.suppression.outputHash,
                JSON.stringify(input.suppression),
              );
          }
        }
        this.#database
          .prepare(
            `INSERT INTO review_events(
              review_event_id, workspace_id, finding_occurrence_id, finding_fingerprint,
              occurred_at, supersedes_event_id, output_hash, event_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            input.event.id,
            input.event.workspaceId,
            input.event.findingOccurrenceId,
            input.event.findingFingerprint,
            input.event.occurredAt,
            input.event.supersedes ?? null,
            input.event.outputHash,
            JSON.stringify(input.event),
          );
        return portSuccess(undefined);
      }),
    );
  }

  public async listReviews(
    workspace: WorkspaceId,
    fingerprint: FindingFingerprint,
  ): Promise<PortResult<readonly ReviewEvent[]>> {
    return this.#safe(() => {
      const rows = this.#database
        .prepare(
          `SELECT event_json FROM review_events
           WHERE workspace_id = ? AND finding_fingerprint = ?
           ORDER BY occurred_at, review_event_id`,
        )
        .all(workspace, fingerprint) as unknown as { event_json: string }[];
      return portSuccess(rows.map((row) => JSON.parse(row.event_json) as ReviewEvent));
    });
  }

  public async appendSuppressionState(event: SuppressionStateEvent): Promise<PortResult<void>> {
    return this.#safe(() =>
      this.#transaction(() => {
        const rule = this.#database
          .prepare(
            `SELECT workspace_id FROM suppression_rules
             WHERE suppression_rule_id = ?`,
          )
          .get(event.suppressionRuleId) as unknown as { workspace_id: string } | undefined;
        if (rule === undefined) return notFound('Suppression rule');
        if (rule.workspace_id !== event.workspaceId) {
          return conflict('Suppression state event workspace does not match its rule.');
        }
        const existing = this.#database
          .prepare('SELECT event_json FROM suppression_state_events WHERE event_id = ?')
          .get(event.id) as unknown as { event_json: string } | undefined;
        if (existing !== undefined) {
          return existing.event_json === JSON.stringify(event)
            ? portSuccess(undefined)
            : conflict('A suppression state event is immutable for its event ID.');
        }
        this.#database
          .prepare(
            `INSERT INTO suppression_state_events(
              event_id, workspace_id, suppression_rule_id, occurred_at, event_json
            ) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            event.id,
            event.workspaceId,
            event.suppressionRuleId,
            event.occurredAt,
            JSON.stringify(event),
          );
        return portSuccess(undefined);
      }),
    );
  }

  public async listSuppressions(
    workspace: WorkspaceId,
  ): Promise<PortResult<readonly SuppressionRule[]>> {
    return this.#safe(() => {
      const rows = this.#database
        .prepare(
          `SELECT rule_json FROM suppression_rules
           WHERE workspace_id = ? ORDER BY created_at, suppression_rule_id`,
        )
        .all(workspace) as unknown as { rule_json: string }[];
      return portSuccess(rows.map((row) => JSON.parse(row.rule_json) as SuppressionRule));
    });
  }

  public async listSuppressionStateEvents(
    workspace: WorkspaceId,
  ): Promise<PortResult<readonly SuppressionStateEvent[]>> {
    return this.#safe(() => {
      const rows = this.#database
        .prepare(
          `SELECT event_json FROM suppression_state_events
           WHERE workspace_id = ? ORDER BY occurred_at, event_id`,
        )
        .all(workspace) as unknown as { event_json: string }[];
      return portSuccess(rows.map((row) => JSON.parse(row.event_json) as SuppressionStateEvent));
    });
  }

  public async putCorpus(
    manifest: CorpusManifest,
    cases: readonly ImpactCase[],
  ): Promise<PortResult<void>> {
    return this.#safe(() =>
      this.#transaction(() => {
        const caseIds = [...cases.map((value) => value.id)].sort();
        if (JSON.stringify(caseIds) !== JSON.stringify([...manifest.caseIds].sort())) {
          return conflict('Corpus manifest case IDs do not match the materialized cases.');
        }
        const existing = this.#database
          .prepare('SELECT output_hash FROM corpus_manifests WHERE revision = ?')
          .get(manifest.revision) as unknown as { output_hash: string } | undefined;
        if (existing !== undefined) {
          return existing.output_hash === manifest.outputHash
            ? portSuccess(undefined)
            : conflict('A corpus revision is immutable.');
        }
        this.#database
          .prepare(
            `INSERT INTO corpus_manifests(revision, created_at, output_hash, manifest_json)
             VALUES (?, ?, ?, ?)`,
          )
          .run(
            manifest.revision,
            manifest.createdAt,
            manifest.outputHash,
            JSON.stringify(manifest),
          );
        const insert = this.#database.prepare(
          `INSERT INTO corpus_cases(
            corpus_revision, case_id, subset, organization_id, stratum_key, output_hash, case_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        cases.forEach((value) =>
          insert.run(
            manifest.revision,
            value.id,
            value.subset,
            value.organizationId,
            value.stratum.key,
            value.outputHash,
            JSON.stringify(value),
          ),
        );
        return portSuccess(undefined);
      }),
    );
  }

  public async getCorpus(
    revision: ContentHash,
  ): Promise<
    PortResult<{ readonly manifest: CorpusManifest; readonly cases: readonly ImpactCase[] }>
  > {
    return this.#safe(() => {
      const manifest = this.#database
        .prepare('SELECT manifest_json FROM corpus_manifests WHERE revision = ?')
        .get(revision) as unknown as { manifest_json: string } | undefined;
      if (manifest === undefined) return notFound('Corpus');
      const rows = this.#database
        .prepare(
          `SELECT case_json FROM corpus_cases
           WHERE corpus_revision = ? ORDER BY case_id`,
        )
        .all(revision) as unknown as { case_json: string }[];
      return portSuccess({
        manifest: JSON.parse(manifest.manifest_json) as CorpusManifest,
        cases: rows.map((row) => JSON.parse(row.case_json) as ImpactCase),
      });
    });
  }

  public async putEvaluationReport(report: EvaluationReport): Promise<PortResult<void>> {
    return this.#safe(() =>
      this.#transaction(() => {
        const existing = this.#database
          .prepare('SELECT report_json FROM evaluation_reports WHERE output_hash = ?')
          .get(report.outputHash) as unknown as { report_json: string } | undefined;
        if (existing !== undefined) {
          return existing.report_json === JSON.stringify(report)
            ? portSuccess(undefined)
            : conflict('An evaluation report is immutable for its output hash.');
        }
        this.#database
          .prepare(
            `INSERT INTO evaluation_reports(output_hash, corpus_revision, generated_at, report_json)
             VALUES (?, ?, ?, ?)`,
          )
          .run(
            report.outputHash,
            report.corpusRevision,
            report.generatedAt,
            JSON.stringify(report),
          );
        return portSuccess(undefined);
      }),
    );
  }

  public async getEvaluationReport(outputHash: ContentHash): Promise<PortResult<EvaluationReport>> {
    return this.#safe(() => {
      const row = this.#database
        .prepare('SELECT report_json FROM evaluation_reports WHERE output_hash = ?')
        .get(outputHash) as unknown as { report_json: string } | undefined;
      return row === undefined
        ? notFound('Evaluation report')
        : portSuccess(JSON.parse(row.report_json) as EvaluationReport);
    });
  }

  public async appendPromotion(record: PromotionRecord): Promise<PortResult<void>> {
    return this.#safe(() =>
      this.#transaction(() => {
        const existing = this.#database
          .prepare('SELECT output_hash FROM promotion_records WHERE promotion_record_id = ?')
          .get(record.id) as unknown as { output_hash: string } | undefined;
        if (existing !== undefined) {
          return existing.output_hash === record.outputHash
            ? portSuccess(undefined)
            : conflict('A promotion record is immutable for its record ID.');
        }
        this.#database
          .prepare(
            `INSERT INTO promotion_records(
              promotion_record_id, stratum_key, state, decided_at, output_hash, record_json
            ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            record.id,
            record.stratumKey,
            record.state,
            record.decidedAt,
            record.outputHash,
            JSON.stringify(record),
          );
        return portSuccess(undefined);
      }),
    );
  }

  public async listPromotions(stratumKey: string): Promise<PortResult<readonly PromotionRecord[]>> {
    return this.#safe(() => {
      const rows = this.#database
        .prepare(
          `SELECT record_json FROM promotion_records
           WHERE stratum_key = ? ORDER BY decided_at, promotion_record_id`,
        )
        .all(stratumKey) as unknown as { record_json: string }[];
      return portSuccess(rows.map((row) => JSON.parse(row.record_json) as PromotionRecord));
    });
  }

  public migrationVersions(): readonly number[] {
    return (
      this.#database
        .prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all() as unknown as {
        version: number;
      }[]
    ).map((row) => row.version);
  }

  public pragma(name: 'journal_mode' | 'foreign_keys' | 'busy_timeout'): unknown {
    const statement: StatementSync = this.#database.prepare(`PRAGMA ${name}`);
    return statement.get();
  }
}
