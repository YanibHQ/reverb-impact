import type { ErrorObject } from 'ajv';

export class SchemaValidationError extends Error {
  public readonly code: 'invalid_schema' | 'unsupported_schema_major';
  public readonly validationErrors: readonly ErrorObject[];

  public constructor(
    code: 'invalid_schema' | 'unsupported_schema_major',
    message: string,
    errors: readonly ErrorObject[] = [],
  ) {
    super(message);
    this.name = 'SchemaValidationError';
    this.code = code;
    this.validationErrors = errors;
  }
}
