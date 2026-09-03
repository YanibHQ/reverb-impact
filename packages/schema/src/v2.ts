import type { JsonSchema } from './foundation.js';

const uuidV7Pattern = '[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const repoPattern = '^(?:github:[1-9][0-9]*|local:sha256:[0-9a-f]{64})$';
const hashPattern = '^sha256:[0-9a-f]{64}$';
const registryPattern = '^reg_sha256:[0-9a-f]{64}$';
const configPattern = '^cfg_sha256:[0-9a-f]{64}$';
const adapterPattern = '^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$';
const semanticVersionPattern =
  '^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-[0-9A-Za-z.-]+)?$';
const protocolVersionPattern = '^[0-9A-Za-z][0-9A-Za-z._-]{0,127}$';
const pathPattern =
  '^(?!/)(?![A-Za-z]:)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*//)(?!.*\\\\)(?!.*\\u0000).+(?<!/)$';
const contractKindsV2 = [
  'event.destination',
  'event.payload_schema',
  'database.table',
  'database.column',
  'database.enum',
  'http.route',
  'configuration.key',
  'configuration.feature_flag',
  'infrastructure.service',
  'infrastructure.endpoint',
  'infrastructure.output',
] as const;
const adapterFamiliesV2 = [
  'events',
  'database',
  'implicit_http',
  'configuration',
  'infrastructure',
] as const;
const reasoningHypothesisLimitationsV2 = [
  'ambiguous_dependency',
  'dynamic_resolution',
  'insufficient_context',
  'weak_evidence',
] as const;
const reasoningRunLimitationsV2 = [
  'reasoning_budget_exhausted',
  'reasoning_circuit_open',
  'reasoning_citation_invalid',
  'reasoning_consent_denied',
  'reasoning_consent_failed',
  'reasoning_consent_timeout',
  'reasoning_data_deleted',
  'reasoning_provider_failed',
  'reasoning_provider_refused',
  'reasoning_provider_timeout',
  'reasoning_response_malformed',
  'reasoning_retrieval_failed',
  'reasoning_retrieval_invalid',
  'reasoning_retrieval_timeout',
  'reasoning_seed_evidence_missing',
  'reasoning_two_sided_context_missing',
] as const;

const sourceRangeV2 = {
  type: 'object',
  additionalProperties: false,
  required: ['start_line', 'start_column', 'end_line', 'end_column'],
  properties: {
    start_line: { type: 'integer', minimum: 1 },
    start_column: { type: 'integer', minimum: 1 },
    end_line: { type: 'integer', minimum: 1 },
    end_column: { type: 'integer', minimum: 1 },
  },
} as const satisfies JsonSchema;

const adapterCoverageProtocolV2 = {
  type: 'object',
  additionalProperties: false,
  required: [
    'state',
    'eligible_artifacts',
    'processed_artifacts',
    'skipped_artifacts',
    'failed_artifacts',
    'limitations',
  ],
  properties: {
    state: { enum: ['complete', 'partial', 'failed', 'unsupported'] },
    eligible_artifacts: { type: 'integer', minimum: 0 },
    processed_artifacts: { type: 'integer', minimum: 0 },
    skipped_artifacts: { type: 'integer', minimum: 0 },
    failed_artifacts: { type: 'integer', minimum: 0 },
    limitations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 1, maxLength: 192 },
          scope: { type: 'string', pattern: pathPattern },
        },
      },
    },
  },
} as const satisfies JsonSchema;

const boundedDiagnosticV2 = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'severity', 'safe_message'],
  properties: {
    code: {
      enum: [
        'binary_file',
        'oversized_file',
        'generated_path',
        'vendored_path',
        'symlink_entry',
        'submodule_entry',
        'unsupported_language',
        'unreadable_blob',
        'parse_failure',
        'source_truncated',
        'missing_blob',
        'incomplete_tree',
        'ambiguous_alias',
        'overlapping_validity',
        'incremental_divergence',
        'cache_corrupt',
        'cancelled',
      ],
    },
    severity: { enum: ['info', 'warning', 'error'] },
    scope: { type: 'string', pattern: pathPattern },
    detail_hash: { type: 'string', pattern: hashPattern },
    safe_message: { type: 'string', minLength: 1, maxLength: 256 },
  },
} as const satisfies JsonSchema;

const adapterProtocolStampV2 = {
  adapter_id: { type: 'string', pattern: adapterPattern },
  adapter_version: { type: 'string', pattern: semanticVersionPattern },
  extraction_version: { type: 'string', pattern: protocolVersionPattern },
  identity_version: { type: 'integer', minimum: 1 },
  partitioning_version: { type: 'integer', minimum: 1 },
  compatibility_version: { type: 'string', pattern: protocolVersionPattern },
} as const;

const evidenceProtocolStampV2 = {
  extractor_id: { type: 'string', pattern: adapterPattern },
  extractor_version: { type: 'string', pattern: semanticVersionPattern },
  extraction_version: { type: 'string', pattern: protocolVersionPattern },
  identity_version: { type: 'integer', minimum: 1 },
  partitioning_version: { type: 'integer', minimum: 1 },
  compatibility_version: { type: 'string', pattern: protocolVersionPattern },
  config_revision: { type: 'string', pattern: configPattern },
  evidence_stratum: { type: 'string', minLength: 1, maxLength: 128 },
} as const;

const contractDefinitionV2 = {
  type: 'object',
  additionalProperties: false,
  required: [
    'contract_kind',
    'canonical_key',
    'display_name',
    'path',
    'content_hash',
    'shape_hash',
    'shape',
    'extractor_id',
    'extractor_version',
    'extraction_version',
    'identity_version',
    'partitioning_version',
    'compatibility_version',
    'config_revision',
    'evidence_stratum',
  ],
  properties: {
    contract_kind: { enum: contractKindsV2 },
    canonical_key: { type: 'string', minLength: 1, maxLength: 2048 },
    display_name: { type: 'string', minLength: 1, maxLength: 512 },
    path: { type: 'string', pattern: pathPattern },
    range: sourceRangeV2,
    content_hash: { type: 'string', pattern: hashPattern },
    shape_hash: { type: 'string', pattern: hashPattern },
    shape: { type: 'object' },
    ...evidenceProtocolStampV2,
  },
} as const satisfies JsonSchema;

const contractReferenceV2 = {
  type: 'object',
  additionalProperties: false,
  required: [
    'contract_kind',
    'path',
    'content_hash',
    'extractor_id',
    'extractor_version',
    'extraction_version',
    'identity_version',
    'partitioning_version',
    'compatibility_version',
    'config_revision',
    'evidence_stratum',
    'activation',
  ],
  properties: {
    contract_kind: { enum: contractKindsV2 },
    canonical_key: { type: 'string', minLength: 1, maxLength: 2048 },
    unresolved_pattern: { type: 'string', minLength: 1, maxLength: 2048 },
    unresolved_reason: { type: 'string', minLength: 1, maxLength: 256 },
    semantic_owner: { type: 'string', minLength: 1 },
    path: { type: 'string', pattern: pathPattern },
    range: sourceRangeV2,
    content_hash: { type: 'string', pattern: hashPattern },
    ...evidenceProtocolStampV2,
    activation: { enum: ['current_runtime', 'on_upgrade', 'on_deploy', 'unknown'] },
  },
  oneOf: [
    {
      required: ['canonical_key'],
      properties: {
        canonical_key: { type: 'string' },
        unresolved_pattern: false,
        unresolved_reason: false,
      },
    },
    {
      required: ['unresolved_pattern', 'unresolved_reason'],
      properties: {
        canonical_key: false,
        unresolved_pattern: { type: 'string' },
        unresolved_reason: { type: 'string' },
      },
    },
  ],
} as const satisfies JsonSchema;

const contractChangeV2 = {
  type: 'object',
  additionalProperties: false,
  required: [
    'contract_kind',
    'canonical_key',
    'change_kind',
    'compatibility',
    'activation',
    'coverage_dependencies',
    'remedy',
  ],
  properties: {
    contract_kind: { enum: contractKindsV2 },
    canonical_key: { type: 'string', minLength: 1, maxLength: 2048 },
    change_kind: { type: 'string', minLength: 1, maxLength: 128 },
    compatibility: { enum: ['breaking', 'potentially_breaking', 'compatible', 'unknown'] },
    activation: { enum: ['current_runtime', 'on_upgrade', 'on_deploy', 'unknown'] },
    base_shape_hash: { type: 'string', pattern: hashPattern },
    head_shape_hash: { type: 'string', pattern: hashPattern },
    coverage_dependencies: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 256 },
    },
    remedy: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'text'],
      properties: {
        kind: { type: 'string', minLength: 1, maxLength: 128 },
        text: { type: 'string', minLength: 1, maxLength: 1024 },
      },
    },
  },
} as const satisfies JsonSchema;

export const adapterManifestV2Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.yanibhq.dev/reverb/adapter-manifest/v2.json',
  title: 'Reverb deterministic adapter manifest v2',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'schema_version',
    'id',
    'family',
    'version',
    'extraction_version',
    'identity_version',
    'partitioning_version',
    'compatibility_version',
    'contract_kinds',
    'capability_tiers',
    'evidence_strata',
    'external_tools',
    'limitations',
    'resource_budget',
    'maintainer',
  ],
  properties: {
    schema: { const: 'reverb.adapter-manifest' },
    schema_version: { const: '2.0' },
    id: { type: 'string', pattern: adapterPattern },
    family: { enum: adapterFamiliesV2 },
    version: { type: 'string', pattern: semanticVersionPattern },
    extraction_version: { type: 'string', pattern: protocolVersionPattern },
    identity_version: { type: 'integer', minimum: 1 },
    partitioning_version: { type: 'integer', minimum: 1 },
    compatibility_version: { type: 'string', pattern: protocolVersionPattern },
    contract_kinds: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { enum: contractKindsV2 },
    },
    capability_tiers: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['input', 'tier'],
        properties: {
          input: { type: 'string', minLength: 1 },
          tier: { enum: ['contract_grade', 'structural', 'preview'] },
        },
      },
    },
    evidence_strata: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'family', 'required_evidence', 'promotion_state'],
        properties: {
          id: { type: 'string', pattern: '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$' },
          family: { enum: ['exact_schema', 'exact_symbol', 'fallback_identity'] },
          required_evidence: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 },
          },
          promotion_state: { const: 'UNMEASURED' },
        },
      },
    },
    external_tools: { type: 'array', maxItems: 0 },
    limitations: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 512 },
    },
    resource_budget: {
      type: 'object',
      additionalProperties: false,
      required: [
        'timeout_ms',
        'memory_mib',
        'maximum_input_bytes',
        'maximum_output_bytes',
        'maximum_items',
      ],
      properties: {
        timeout_ms: { type: 'integer', minimum: 1 },
        memory_mib: { type: 'integer', minimum: 1 },
        maximum_input_bytes: { type: 'integer', minimum: 1 },
        maximum_output_bytes: { type: 'integer', minimum: 1 },
        maximum_items: { type: 'integer', minimum: 1 },
      },
    },
    maintainer: { type: 'string', minLength: 1, maxLength: 256 },
  },
} as const satisfies JsonSchema;

export const adapterExtractionV2Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.yanibhq.dev/reverb/adapter-extraction/v2.json',
  title: 'Reverb deterministic adapter extraction v2',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'schema_version',
    'family',
    'adapter_id',
    'adapter_version',
    'extraction_version',
    'identity_version',
    'partitioning_version',
    'compatibility_version',
    'config_revision',
    'definitions',
    'references',
    'coverage',
    'diagnostics',
    'source_fingerprint',
    'output_hash',
  ],
  properties: {
    schema: { const: 'reverb.adapter-extraction' },
    schema_version: { const: '2.0' },
    family: { enum: adapterFamiliesV2 },
    ...adapterProtocolStampV2,
    config_revision: { type: 'string', pattern: configPattern },
    definitions: { type: 'array', items: contractDefinitionV2 },
    references: { type: 'array', items: contractReferenceV2 },
    coverage: adapterCoverageProtocolV2,
    diagnostics: { type: 'array', items: boundedDiagnosticV2 },
    source_fingerprint: { type: 'string', pattern: hashPattern },
    output_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

export const adapterDiffV2Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.yanibhq.dev/reverb/adapter-diff/v2.json',
  title: 'Reverb deterministic adapter diff v2',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'schema_version',
    'family',
    'adapter_id',
    'adapter_version',
    'extraction_version',
    'identity_version',
    'partitioning_version',
    'compatibility_version',
    'changes',
    'coverage',
    'diagnostics',
    'output_hash',
  ],
  properties: {
    schema: { const: 'reverb.adapter-diff' },
    schema_version: { const: '2.0' },
    family: { enum: adapterFamiliesV2 },
    ...adapterProtocolStampV2,
    changes: { type: 'array', items: contractChangeV2 },
    coverage: adapterCoverageProtocolV2,
    diagnostics: { type: 'array', items: boundedDiagnosticV2 },
    output_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

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
    'severity',
    'confidence',
    'producer_citation_ids',
    'consumer_citation_ids',
    'limitations',
  ],
  properties: {
    evidence_basis: { const: 'ai_inferred' },
    disposition: { enum: ['needs_investigation', 'withheld'] },
    severity: { enum: ['low', 'medium', 'high', 'critical'] },
    confidence: { enum: ['low', 'medium', 'high'] },
    producer_citation_ids: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', pattern: '^cit_sha256:[0-9a-f]{64}$' },
    },
    consumer_citation_ids: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', pattern: '^cit_sha256:[0-9a-f]{64}$' },
    },
    limitations: {
      type: 'array',
      uniqueItems: true,
      items: { enum: reasoningHypothesisLimitationsV2 },
    },
  },
} as const satisfies JsonSchema;

const reasoningCitationV1 = {
  type: 'object',
  additionalProperties: false,
  required: [
    'citation_id',
    'origin',
    'side',
    'workspace_id',
    'repository_id',
    'generation_id',
    'commit_sha',
    'path',
    'range',
    'content_hash',
    'excerpt',
    'excerpt_hash',
  ],
  properties: {
    citation_id: { type: 'string', pattern: '^cit_sha256:[0-9a-f]{64}$' },
    origin: { enum: ['changed_definition', 'deterministic_neighbor'] },
    side: { enum: ['producer', 'consumer'] },
    workspace_id: { type: 'string', pattern: `^wsp_${uuidV7Pattern}$` },
    repository_id: { type: 'string', pattern: repoPattern },
    generation_id: { type: 'string', pattern: `^gen_${uuidV7Pattern}$` },
    commit_sha: { type: 'string', pattern: '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' },
    path: { type: 'string', minLength: 1, maxLength: 4096 },
    range: {
      type: 'object',
      additionalProperties: false,
      required: ['start_line', 'start_column', 'end_line', 'end_column'],
      properties: {
        start_line: { type: 'integer', minimum: 1 },
        start_column: { type: 'integer', minimum: 1 },
        end_line: { type: 'integer', minimum: 1 },
        end_column: { type: 'integer', minimum: 1 },
      },
    },
    content_hash: { type: 'string', pattern: hashPattern },
    excerpt: { type: 'string', maxLength: 65536 },
    excerpt_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

export const reasoningRequestV1Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.yanibhq.dev/reverb/reasoning-request/v1.json',
  title: 'Reverb provider-neutral structured reasoning request',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'schema_version',
    'template_version',
    'reasoning_policy_version',
    'retrieval_version',
    'evidence',
    'maximum_candidates',
    'maximum_output_tokens',
    'input_hash',
  ],
  properties: {
    schema: { const: 'reverb.reasoning-request' },
    schema_version: { const: '1.0' },
    template_version: { type: 'string', minLength: 1, maxLength: 256 },
    reasoning_policy_version: { type: 'string', minLength: 1, maxLength: 256 },
    retrieval_version: { type: 'string', minLength: 1, maxLength: 256 },
    evidence: { type: 'array', maxItems: 1000, items: reasoningCitationV1 },
    maximum_candidates: { type: 'integer', minimum: 0, maximum: 1000 },
    maximum_output_tokens: { type: 'integer', minimum: 0 },
    input_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

const reasoningCandidateV1 = {
  type: 'object',
  additionalProperties: false,
  required: [
    'severity',
    'confidence',
    'producer_citation_ids',
    'consumer_citation_ids',
    'limitations',
  ],
  properties: {
    severity: { enum: ['low', 'medium', 'high', 'critical'] },
    confidence: { enum: ['low', 'medium', 'high'] },
    producer_citation_ids: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', pattern: '^cit_sha256:[0-9a-f]{64}$' },
    },
    consumer_citation_ids: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', pattern: '^cit_sha256:[0-9a-f]{64}$' },
    },
    limitations: {
      type: 'array',
      uniqueItems: true,
      items: { enum: reasoningHypothesisLimitationsV2 },
    },
  },
} as const satisfies JsonSchema;

export const reasoningResponseV1Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.yanibhq.dev/reverb/reasoning-response/v1.json',
  title: 'Reverb provider-neutral structured reasoning response',
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'schema_version', 'state', 'candidates', 'model_tokens'],
  properties: {
    schema: { const: 'reverb.reasoning-response' },
    schema_version: { const: '1.0' },
    state: { enum: ['complete', 'refused'] },
    candidates: { type: 'array', maxItems: 1000, items: reasoningCandidateV1 },
    model_tokens: { type: 'integer', minimum: 0 },
  },
} as const satisfies JsonSchema;

const coverageLimitationV2 = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'source'],
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 192 },
    source: { enum: ['source', 'adapter', 'selection', 'budget'] },
    detail_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

const adapterExecutionProvenanceV2 = {
  type: 'object',
  additionalProperties: false,
  required: [
    'adapter_id',
    'adapter_version',
    'extraction_version',
    'identity_version',
    'partitioning_version',
    'compatibility_version',
    'config_revision',
    'output_hash',
  ],
  properties: {
    adapter_id: { type: 'string', pattern: '^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$' },
    adapter_version: { type: 'string', minLength: 1, maxLength: 128 },
    extraction_version: { type: 'string', minLength: 1, maxLength: 128 },
    identity_version: { type: 'integer', minimum: 1 },
    partitioning_version: { type: 'integer', minimum: 1 },
    compatibility_version: { type: 'string', minLength: 1, maxLength: 128 },
    config_revision: { type: 'string', pattern: '^cfg_sha256:[0-9a-f]{64}$' },
    output_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

const adapterFamilyCoverageV2 = {
  type: 'object',
  additionalProperties: false,
  required: [
    'family',
    'state',
    'eligible_artifacts',
    'processed_artifacts',
    'skipped_artifacts',
    'failed_artifacts',
    'adapters',
    'limitations',
    'output_hash',
  ],
  properties: {
    family: { enum: ['events', 'database', 'implicit_http', 'configuration', 'infrastructure'] },
    state: { enum: ['complete', 'partial', 'failed', 'unsupported', 'not_analysed'] },
    eligible_artifacts: { type: 'integer', minimum: 0 },
    processed_artifacts: { type: 'integer', minimum: 0 },
    skipped_artifacts: { type: 'integer', minimum: 0 },
    failed_artifacts: { type: 'integer', minimum: 0 },
    adapters: { type: 'array', items: adapterExecutionProvenanceV2 },
    limitations: { type: 'array', items: coverageLimitationV2 },
    output_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

const repositoryAnalysisCoverageV2 = {
  type: 'object',
  additionalProperties: false,
  required: [
    'workspace_id',
    'registry_revision',
    'repository_id',
    'role',
    'selection_state',
    'families',
    'output_hash',
  ],
  properties: {
    workspace_id: { type: 'string', pattern: `^wsp_${uuidV7Pattern}$` },
    registry_revision: { type: 'string', pattern: registryPattern },
    repository_id: { type: 'string', pattern: repoPattern },
    role: { enum: ['producer_consumer', 'consumer'] },
    selection_state: {
      enum: ['current', 'stale', 'unauthorized', 'unsupported', 'failed', 'not_indexed'],
    },
    generation_id: { type: 'string', pattern: `^gen_${uuidV7Pattern}$` },
    commit_sha: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    selected_at: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T.*Z$' },
    freshness_age_ms: { type: 'integer', minimum: 0 },
    selection_reason: { type: 'string', minLength: 1, maxLength: 192 },
    families: { type: 'array', items: adapterFamilyCoverageV2 },
    output_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

export const analysisCoverageV2Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.yanibhq.dev/reverb/analysis-coverage/v2.json',
  title: 'Reverb per-family and per-repository analysis coverage',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'schema_version',
    'workspace_id',
    'registry_revision',
    'scope_hash',
    'enabled_families',
    'repositories',
    'scope_gaps',
    'state',
    'output_hash',
  ],
  properties: {
    schema: { const: 'reverb.analysis-coverage' },
    schema_version: { const: '2.0' },
    workspace_id: { type: 'string', pattern: `^wsp_${uuidV7Pattern}$` },
    registry_revision: { type: 'string', pattern: registryPattern },
    scope_hash: { type: 'string', pattern: hashPattern },
    enabled_families: {
      type: 'array',
      uniqueItems: true,
      items: {
        enum: ['events', 'database', 'implicit_http', 'configuration', 'infrastructure'],
      },
    },
    repositories: { type: 'array', items: repositoryAnalysisCoverageV2 },
    scope_gaps: { type: 'array', items: scopeGap },
    state: { enum: ['complete', 'partial'] },
    output_hash: { type: 'string', pattern: hashPattern },
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

const reasoningStoredCitationV2 = {
  type: 'object',
  additionalProperties: false,
  required: [
    'citation_id',
    'origin',
    'side',
    'workspace_id',
    'repository_id',
    'generation_id',
    'commit_sha',
    'path',
    'range',
    'content_hash',
    'excerpt_hash',
  ],
  properties: {
    citation_id: { type: 'string', pattern: '^cit_sha256:[0-9a-f]{64}$' },
    origin: { enum: ['changed_definition', 'deterministic_neighbor'] },
    side: { enum: ['producer', 'consumer'] },
    workspace_id: { type: 'string', pattern: `^wsp_${uuidV7Pattern}$` },
    repository_id: { type: 'string', pattern: repoPattern },
    generation_id: { type: 'string', pattern: `^gen_${uuidV7Pattern}$` },
    commit_sha: { type: 'string', pattern: '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' },
    path: { type: 'string', minLength: 1, maxLength: 4096 },
    range: {
      type: 'object',
      additionalProperties: false,
      required: ['start_line', 'start_column', 'end_line', 'end_column'],
      properties: {
        start_line: { type: 'integer', minimum: 1 },
        start_column: { type: 'integer', minimum: 1 },
        end_line: { type: 'integer', minimum: 1 },
        end_column: { type: 'integer', minimum: 1 },
      },
    },
    content_hash: { type: 'string', pattern: hashPattern },
    excerpt_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

const reasoningConsentDecisionV2 = {
  type: 'object',
  additionalProperties: false,
  required: ['repository_id', 'allowed', 'revision', 'decision_hash'],
  properties: {
    repository_id: { type: 'string', pattern: repoPattern },
    allowed: { type: 'boolean' },
    revision: { type: 'string', minLength: 1, maxLength: 256 },
    decision_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

export const reasoningRunV2Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.yanibhq.dev/reverb/reasoning-run/v2.json',
  title: 'Reverb redacted reasoning run provenance',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'schema_version',
    'id',
    'workspace_id',
    'analysis_id',
    'scope_hash',
    'state',
    'provider',
    'template_version',
    'reasoning_policy_version',
    'retrieval_version',
    'input_hash',
    'execution_budget',
    'consent_decisions',
    'citations',
    'hypotheses',
    'limitations',
    'created_at',
    'output_hash',
  ],
  properties: {
    schema: { const: 'reverb.reasoning-run' },
    schema_version: { const: '2.0' },
    id: { type: 'string', pattern: '^rrn_sha256:[0-9a-f]{64}$' },
    workspace_id: { type: 'string', pattern: `^wsp_${uuidV7Pattern}$` },
    analysis_id: { type: 'string', pattern: `^ana_${uuidV7Pattern}$` },
    scope_hash: { type: 'string', pattern: hashPattern },
    state: { enum: ['complete', 'partial', 'failed', 'deleted'] },
    provider: {
      type: 'object',
      additionalProperties: false,
      required: [
        'provider_id',
        'provider_version',
        'model_id',
        'model_version',
        'data_region',
        'retention_mode',
      ],
      properties: {
        provider_id: { type: 'string', minLength: 1, maxLength: 256 },
        provider_version: { type: 'string', minLength: 1, maxLength: 256 },
        model_id: { type: 'string', minLength: 1, maxLength: 256 },
        model_version: { type: 'string', minLength: 1, maxLength: 256 },
        data_region: { type: 'string', minLength: 1, maxLength: 256 },
        retention_mode: { enum: ['none', 'provider_managed', 'host_managed'] },
      },
    },
    template_version: { type: 'string', minLength: 1, maxLength: 256 },
    reasoning_policy_version: { type: 'string', minLength: 1, maxLength: 256 },
    retrieval_version: { type: 'string', minLength: 1, maxLength: 256 },
    input_hash: { type: 'string', pattern: hashPattern },
    provider_output_hash: { type: 'string', pattern: hashPattern },
    execution_budget: executionBudgetV2Schema,
    consent_decisions: {
      type: 'array',
      maxItems: 1000,
      items: reasoningConsentDecisionV2,
    },
    citations: { type: 'array', maxItems: 1000, items: reasoningStoredCitationV2 },
    hypotheses: { type: 'array', maxItems: 1000, items: reasoningHypothesis },
    limitations: { type: 'array', uniqueItems: true, items: { enum: reasoningRunLimitationsV2 } },
    created_at: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T.*Z$' },
    deleted_at: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T.*Z$' },
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
    'coverage',
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
    coverage: analysisCoverageV2Schema,
    state: { enum: ['complete', 'partial', 'superseded'] },
    execution_budgets: { type: 'array', items: executionBudgetV2Schema },
    deterministic_findings: { type: 'array', items: { type: 'object' } },
    reasoning_hypotheses: { type: 'array', items: reasoningHypothesis },
    output_hash: { type: 'string', pattern: hashPattern },
  },
} as const satisfies JsonSchema;

export const V2_SCHEMAS = Object.freeze([
  { file: 'reverb-adapter-manifest-v2.schema.json', schema: adapterManifestV2Schema },
  { file: 'reverb-adapter-extraction-v2.schema.json', schema: adapterExtractionV2Schema },
  { file: 'reverb-adapter-diff-v2.schema.json', schema: adapterDiffV2Schema },
  { file: 'reverb-analysis-scope-v2.schema.json', schema: analysisScopeV2Schema },
  { file: 'reverb-analysis-coverage-v2.schema.json', schema: analysisCoverageV2Schema },
  { file: 'reverb-execution-budget-v2.schema.json', schema: executionBudgetV2Schema },
  { file: 'reverb-reasoning-request-v1.schema.json', schema: reasoningRequestV1Schema },
  { file: 'reverb-reasoning-response-v1.schema.json', schema: reasoningResponseV1Schema },
  { file: 'reverb-reasoning-run-v2.schema.json', schema: reasoningRunV2Schema },
  { file: 'reverb-analysis-result-v2.schema.json', schema: analysisResultV2Schema },
]);
