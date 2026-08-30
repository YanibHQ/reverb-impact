import { SchemaValidationError } from './schema-error.js';

export const SCHEMA_COMPATIBILITY = Object.freeze({
  currentVersion: '1.0',
  currentMajor: 1,
  supportedMajors: [1] as const,
  previousSupportedMajors: [] as const,
  oldestSupportedPackageVersion: '0.0.0',
  previousMajorDisposition:
    'No previous public schema major exists before the first release; v0 is intentionally unsupported.',
});

export interface ParsedSchemaVersion {
  readonly major: number;
  readonly minor: number;
}

export function parseSchemaVersion(value: unknown): ParsedSchemaVersion {
  if (typeof value !== 'string' || !/^\d+\.\d+$/.test(value)) {
    throw new SchemaValidationError('invalid_schema', 'schema_version is malformed.');
  }
  const [major, minor] = value.split('.').map(Number);
  return { major: major!, minor: minor! };
}

export function assertReadableSchemaVersion(value: unknown): ParsedSchemaVersion {
  const parsed = parseSchemaVersion(value);
  if (!(SCHEMA_COMPATIBILITY.supportedMajors as readonly number[]).includes(parsed.major)) {
    throw new SchemaValidationError(
      'unsupported_schema_major',
      `Schema major ${parsed.major} is unsupported; supported majors: ${SCHEMA_COMPATIBILITY.supportedMajors.join(', ')}.`,
    );
  }
  return parsed;
}
