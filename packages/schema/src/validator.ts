import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';

import { FOUNDATION_SCHEMAS, type JsonSchema } from './foundation.js';
import { assertReadableSchemaVersion, parseSchemaVersion } from './compatibility.js';
import { SchemaValidationError } from './schema-error.js';

export { SchemaValidationError } from './schema-error.js';

const ajv = new Ajv2020.default({ allErrors: true, strict: true });
const validators = new Map<string, ValidateFunction>();
for (const entry of FOUNDATION_SCHEMAS) {
  validators.set(entry.schema.$id, ajv.compile(entry.schema as JsonSchema));
}

export function assertSupportedSchemaVersion(
  value: unknown,
): asserts value is { schema_version: string } {
  if (!value || typeof value !== 'object' || !('schema_version' in value)) {
    throw new SchemaValidationError('invalid_schema', 'Payload does not declare schema_version.');
  }
  const version = (value as { schema_version?: unknown }).schema_version;
  parseSchemaVersion(version);
  assertReadableSchemaVersion(version);
}

export function validateWithSchema(schemaId: string, value: unknown): void {
  const validator = validators.get(schemaId);
  if (!validator)
    throw new SchemaValidationError('unsupported_schema_major', 'Schema ID is unsupported.');
  if (!validator(value)) {
    throw new SchemaValidationError(
      'invalid_schema',
      'Payload does not satisfy its canonical schema.',
      validator.errors ?? [],
    );
  }
}
