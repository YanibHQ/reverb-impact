import {
  SCHEMA_COMPATIBILITY,
  SCHEMA_V2_COMPATIBILITY,
  analysisCoverageV2Schema,
  analysisResultV2Schema,
  analysisScopeV2Schema,
  executionBudgetV2Schema,
  assertReadableSchemaVersion,
  assertReadableSchemaVersionV2,
} from '../src/index.js';
import type { SchemaValidationError } from '../src/index.js';
import { describe, expect, it } from 'vitest';

describe('schema-major 2 negotiation', () => {
  it('keeps the existing v1 compatibility declaration unchanged', () => {
    expect(SCHEMA_COMPATIBILITY).toMatchObject({
      currentVersion: '1.0',
      currentMajor: 1,
      supportedMajors: [1],
      previousSupportedMajors: [],
    });
    expect(() => assertReadableSchemaVersion('2.0')).toThrowError(
      expect.objectContaining<Partial<SchemaValidationError>>({
        code: 'unsupported_schema_major',
      }),
    );
  });

  it('negotiates v1 and v2 only through the additive v2 declaration', () => {
    expect(SCHEMA_V2_COMPATIBILITY.supportedMajors).toEqual([1, 2]);
    expect(assertReadableSchemaVersionV2('1.0')).toEqual({ major: 1, minor: 0 });
    expect(assertReadableSchemaVersionV2('2.0')).toEqual({ major: 2, minor: 0 });
    expect(() => assertReadableSchemaVersionV2('3.0')).toThrowError(
      expect.objectContaining<Partial<SchemaValidationError>>({
        code: 'unsupported_schema_major',
      }),
    );
  });

  it('publishes separate v2 schema IDs without widening v1', () => {
    expect(analysisScopeV2Schema.$id).toMatch(/\/analysis-scope\/v2\.json$/);
    expect(analysisCoverageV2Schema.$id).toMatch(/\/analysis-coverage\/v2\.json$/);
    expect(analysisResultV2Schema.$id).toMatch(/\/analysis-result\/v2\.json$/);
    expect(executionBudgetV2Schema.$id).toMatch(/\/execution-budget\/v2\.json$/);
  });
});
