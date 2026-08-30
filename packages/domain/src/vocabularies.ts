export const GENERATION_STATES = ['building', 'complete', 'partial', 'failed', 'expired'] as const;
export type GenerationState = (typeof GENERATION_STATES)[number];

export const OVERLAY_STATES = ['building', 'complete', 'partial', 'failed'] as const;
export type OverlayState = (typeof OVERLAY_STATES)[number];

export const FILE_CLASSIFICATIONS = [
  'source',
  'generated',
  'vendored',
  'binary',
  'oversized',
  'symlink',
  'submodule',
  'unsupported',
] as const;
export type FileClassification = (typeof FILE_CLASSIFICATIONS)[number];

export const PARSE_STATES = ['not_applicable', 'parsed', 'skipped', 'failed'] as const;
export type ParseState = (typeof PARSE_STATES)[number];

export const COVERAGE_DIMENSIONS = [
  'repository',
  'tree',
  'file',
  'language',
  'parser',
  'adapter',
] as const;
export type CoverageDimension = (typeof COVERAGE_DIMENSIONS)[number];

export const COVERAGE_STATES = [
  'complete',
  'partial',
  'failed',
  'unauthorized',
  'not_analysed',
] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];

export const DIAGNOSTIC_SEVERITIES = ['info', 'warning', 'error'] as const;
export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number];

export const DIAGNOSTIC_CODES = [
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
] as const;
export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export const REPOSITORY_ACTIONS = [
  'source.read',
  'derived.retain',
  'evidence.consume',
  'identity.disclose',
  'contract.disclose',
  'location.disclose',
  'producer_check.write',
  'consumer.write',
  'evaluation.use',
  'research.use',
] as const;
export type RepositoryAction = (typeof REPOSITORY_ACTIONS)[number];

export const SERVICE_ALIAS_KINDS = [
  'base_token',
  'host',
  'path_prefix',
  'package_coordinate',
  'schema_id',
  'broker_namespace',
  'database_instance',
] as const;
export type ServiceAliasKind = (typeof SERVICE_ALIAS_KINDS)[number];

export const CONTRACT_KINDS = [
  'typescript_symbol',
  'openapi_operation',
  'protobuf_method',
  'protobuf_field',
] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];

export const EVIDENCE_BASES = [
  'exact',
  'registry_resolved',
  'heuristic',
  'declared_context',
  'behavioural_context',
] as const;
export type EvidenceBasis = (typeof EVIDENCE_BASES)[number];

export const CONSUMER_SELECTION_STATES = [
  'current',
  'stale',
  'unauthorized',
  'unsupported',
  'failed',
  'not_indexed',
] as const;
export type ConsumerSelectionState = (typeof CONSUMER_SELECTION_STATES)[number];

export const ANALYSIS_STATES = [
  'NOT_ANALYSED',
  'NO_CANDIDATE',
  'CANDIDATE',
  'ABSTAINED',
  'PREVIEW',
  'DELIVERED',
  'ADJUDICATED',
] as const;
export type AnalysisState = (typeof ANALYSIS_STATES)[number];

export const ABSTENTION_REASONS = [
  'unsupported_language',
  'incomplete_index',
  'stale_consumer_generation',
  'ambiguous_contract_identity',
  'dynamic_or_reflective_use',
  'insufficient_change_semantics',
  'incompatible_artifact_versions',
  'below_delivery_threshold',
  'privacy_restricted',
  'execution_budget_exceeded',
] as const;
export type AbstentionReason = (typeof ABSTENTION_REASONS)[number];

export const EDGE_LABELS = ['confirmed', 'absent', 'indeterminate'] as const;
export type EdgeLabel = (typeof EDGE_LABELS)[number];

export const IMPACT_LABELS = ['breaking', 'behavior_risk', 'compatible', 'indeterminate'] as const;
export type ImpactLabel = (typeof IMPACT_LABELS)[number];

export const ACTION_LABELS = [
  'coordinate',
  'already_coordinated',
  'accepted_risk',
  'dead_or_test_only',
  'no_action',
  'indeterminate',
] as const;
export type ActionLabel = (typeof ACTION_LABELS)[number];

export const REVIEW_REASON_CODES = [
  'structural_reference_verified',
  'reference_not_present',
  'consumer_snapshot_inconclusive',
  'breaking_change_verified',
  'behavior_requires_runtime_validation',
  'compatible_change_verified',
  'coordination_required',
  'downstream_change_linked',
  'risk_explicitly_accepted',
  'dead_code',
  'test_only_use',
  'no_consumer_action_required',
  'evidence_incomplete',
] as const;
export type ReviewReasonCode = (typeof REVIEW_REASON_CODES)[number];

export const SUPPRESSION_SCOPES = [
  'occurrence',
  'stable_finding',
  'contract_consumer',
  'repository_pair_kind',
  'adapter_rule',
  'workspace_rule',
] as const;
export type SuppressionScope = (typeof SUPPRESSION_SCOPES)[number];

export const REVIEW_ROLES = ['reviewer', 'repository_owner', 'workspace_admin'] as const;
export type ReviewRole = (typeof REVIEW_ROLES)[number];
