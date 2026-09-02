import type { JsonSchema } from './foundation.js';

const uuidV7Pattern = '[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const repoPattern = '^(?:github:[1-9][0-9]*|local:sha256:[0-9a-f]{64})$';
const hashPattern = '^sha256:[0-9a-f]{64}$';
const registryPattern = '^reg_sha256:[0-9a-f]{64}$';

const authorizedRepository = {
  type: 'object',
  additionalProperties: false,
  required: [
    'repository_id',
    'producer',
    'requested',
    'consent_revision',
    'authorization_revision',
    'authorization_decision_hash',
  ],
  properties: {
    repository_id: { type: 'string', pattern: repoPattern },
    producer: { type: 'boolean' },
    requested: { type: 'boolean' },
    consent_revision: { type: 'string', minLength: 1 },
    authorization_revision: { type: 'string', pattern: registryPattern },
    authorization_decision_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

const scopeGap = {
  type: 'object',
  additionalProperties: false,
  required: ['repository_id', 'reason'],
  properties: {
    repository_id: { type: 'string', pattern: repoPattern },
    reason: {
      enum: [
        'unknown_repository',
        'repository_not_selected',
        'consent_denied',
        'authorization_denied',
        'authorization_unavailable',
      ],
    },
  },
} as const satisfies JsonSchema;

export const analysisScopeV2Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.yanibhq.dev/reverb/analysis-scope/v2.json',
  title: 'Reverb bounded analysis scope provenance',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'schema_version',
    'workspace_id',
    'registry_revision',
    'producer_repository_id',
    'mode',
    'requested_repository_ids',
    'repositories',
    'gaps',
    'scope_hash',
  ],
  properties: {
    schema: { const: 'reverb.analysis-scope' },
    schema_version: { const: '2.0' },
    workspace_id: { type: 'string', pattern: `^wsp_${uuidV7Pattern}$` },
    registry_revision: { type: 'string', pattern: registryPattern },
    producer_repository_id: { type: 'string', pattern: repoPattern },
    mode: { enum: ['legacy', 'allowlist'] },
    requested_repository_ids: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', pattern: repoPattern },
    },
    repositories: { type: 'array', items: authorizedRepository },
    gaps: { type: 'array', items: scopeGap },
    scope_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

const reasoningHypothesis = {
  type: 'object',
  additionalProperties: false,
  required: [
    'evidence_basis',
    'disposition',
    'producer_citation_ids',
    'consumer_citation_ids',
    'limitations',
  ],
  properties: {
    evidence_basis: { const: 'ai_inferred' },
    disposition: { enum: ['needs_investigation', 'withheld'] },
    producer_citation_ids: { type: 'array', items: { type: 'string', minLength: 1 } },
    consumer_citation_ids: { type: 'array', items: { type: 'string', minLength: 1 } },
    limitations: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
} as const satisfies JsonSchema;

const budgetCounters = {
  type: 'object',
  additionalProperties: false,
  required: [
    'provider_requests',
    'source_bytes',
    'storage_queries',
    'artifacts',
    'model_tokens',
    'latency_ms',
  ],
  properties: {
    provider_requests: { type: 'integer', minimum: 0 },
    source_bytes: { type: 'integer', minimum: 0 },
    storage_queries: { type: 'integer', minimum: 0 },
    artifacts: { type: 'integer', minimum: 0 },
    model_tokens: { type: 'integer', minimum: 0 },
    latency_ms: { type: 'integer', minimum: 0 },
  },
} as const satisfies JsonSchema;

export const executionBudgetV2Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.yanibhq.dev/reverb/execution-budget/v2.json',
  title: 'Reverb bounded execution budget report',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'schema_version',
    'lane',
    'limits',
    'usage',
    'exhausted_dimensions',
    'started_at',
    'completed_at',
    'output_hash',
  ],
  properties: {
    schema: { const: 'reverb.execution-budget' },
    schema_version: { const: '2.0' },
    lane: { enum: ['bootstrap_index', 'incremental_index', 'pull_request', 'reasoning'] },
    limits: budgetCounters,
    usage: budgetCounters,
    exhausted_dimensions: {
      type: 'array',
      uniqueItems: true,
      items: {
        enum: [
          'provider_requests',
          'source_bytes',
          'storage_queries',
          'artifacts',
          'model_tokens',
          'latency_ms',
        ],
      },
    },
    started_at: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T.*Z$' },
    completed_at: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T.*Z$' },
    output_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

export const analysisResultV2Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.yanibhq.dev/reverb/analysis-result/v2.json',
  title: 'Reverb canonical analysis result v2',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'schema_version',
    'legacy_result',
    'scope',
    'state',
    'execution_budgets',
    'deterministic_findings',
    'reasoning_hypotheses',
    'output_hash',
  ],
  properties: {
    schema: { const: 'reverb.analysis-result' },
    schema_version: { const: '2.0' },
    legacy_result: { type: 'object' },
    scope: analysisScopeV2Schema,
    state: { enum: ['complete', 'partial', 'superseded'] },
    execution_budgets: { type: 'array', items: executionBudgetV2Schema },
    deterministic_findings: { type: 'array', items: { type: 'object' } },
    reasoning_hypotheses: { type: 'array', items: reasoningHypothesis },
    output_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

export const V2_SCHEMAS = Object.freeze([
  { file: 'reverb-analysis-scope-v2.schema.json', schema: analysisScopeV2Schema },
  { file: 'reverb-execution-budget-v2.schema.json', schema: executionBudgetV2Schema },
  { file: 'reverb-analysis-result-v2.schema.json', schema: analysisResultV2Schema },
]);
