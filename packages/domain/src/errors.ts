export const DOMAIN_ERROR_CODES = [
  'invalid_id',
  'invalid_sha',
  'invalid_hash',
  'invalid_path',
  'invalid_instant',
  'invalid_enum',
  'invalid_schema',
  'unsupported_schema_major',
  'invalid_state_transition',
  'invalid_registry',
  'ambiguous_alias',
  'unknown_repository',
  'unknown_service',
  'incomplete_source',
  'authorization_denied',
  'cancelled',
  'invalid_review',
  'review_unauthorized',
  'invalid_review_supersession',
  'suppression_unauthorized',
  'invalid_suppression',
  'invalid_corpus_case',
  'future_snapshot_leakage',
  'invalid_sampling_probability',
  'invalid_sampling_weight',
  'invalid_corpus_measurement',
  'invalid_label_provenance',
  'empty_sampling_frame',
  'invalid_corpus_manifest',
  'invalid_mutation_import',
  'invalid_labeling_panel',
  'adjudication_required',
  'invalid_binomial',
  'required_case_unlabelled',
  'invalid_agreement_panel',
  'non_frozen_simulation_input',
  'promotion_requires_simulation',
  'unrecorded_promotion_policy',
  'infrastructure_failure',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export class ReverbError extends Error {
  public readonly code: DomainErrorCode;
  public readonly safeDetails: Readonly<Record<string, string | number | boolean>>;

  public constructor(
    code: DomainErrorCode,
    message: string,
    safeDetails: Readonly<Record<string, string | number | boolean>> = {},
  ) {
    super(message);
    this.name = 'ReverbError';
    this.code = code;
    this.safeDetails = Object.freeze({ ...safeDetails });
  }
}

export function invariant(
  condition: unknown,
  code: DomainErrorCode,
  message: string,
  safeDetails?: Readonly<Record<string, string | number | boolean>>,
): asserts condition {
  if (!condition) throw new ReverbError(code, message, safeDetails);
}

export function sanitizeFailure(error: unknown): string {
  if (error instanceof ReverbError) return error.code;
  return 'infrastructure_failure';
}
