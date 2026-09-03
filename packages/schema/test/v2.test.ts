import {
  SCHEMA_COMPATIBILITY,
  SCHEMA_V2_COMPATIBILITY,
  adapterDiffV2Schema,
  adapterExtractionV2Schema,
  adapterManifestV2Schema,
  analysisCoverageV2Schema,
  analysisResultV2Schema,
  analysisScopeV2Schema,
  executionBudgetV2Schema,
  reasoningRequestV1Schema,
  reasoningResponseV1Schema,
  reasoningRunV2Schema,
  assertReadableSchemaVersion,
  assertReadableSchemaVersionV2,
  validateWithSchema,
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
    expect(adapterManifestV2Schema.$id).toMatch(/\/adapter-manifest\/v2\.json$/);
    expect(adapterExtractionV2Schema.$id).toMatch(/\/adapter-extraction\/v2\.json$/);
    expect(adapterDiffV2Schema.$id).toMatch(/\/adapter-diff\/v2\.json$/);
    expect(analysisScopeV2Schema.$id).toMatch(/\/analysis-scope\/v2\.json$/);
    expect(analysisCoverageV2Schema.$id).toMatch(/\/analysis-coverage\/v2\.json$/);
    expect(analysisResultV2Schema.$id).toMatch(/\/analysis-result\/v2\.json$/);
    expect(executionBudgetV2Schema.$id).toMatch(/\/execution-budget\/v2\.json$/);
    expect(reasoningRequestV1Schema.$id).toMatch(/\/reasoning-request\/v1\.json$/);
    expect(reasoningResponseV1Schema.$id).toMatch(/\/reasoning-response\/v1\.json$/);
    expect(reasoningRunV2Schema.$id).toMatch(/\/reasoning-run\/v2\.json$/);
  });

  it('accepts only closed provider-neutral reasoning responses', () => {
    const response = {
      schema: 'reverb.reasoning-response',
      schema_version: '1.0',
      state: 'complete',
      candidates: [
        {
          severity: 'high',
          confidence: 'low',
          producer_citation_ids: [`cit_sha256:${'1'.repeat(64)}`],
          consumer_citation_ids: [`cit_sha256:${'2'.repeat(64)}`],
          limitations: ['weak_evidence'],
        },
      ],
      model_tokens: 20,
    };
    expect(() => validateWithSchema(reasoningResponseV1Schema.$id, response)).not.toThrow();
    expect(() =>
      validateWithSchema(reasoningResponseV1Schema.$id, {
        ...response,
        tool_call: { name: 'read_repository' },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<SchemaValidationError>>({ code: 'invalid_schema' }),
    );
    expect(() =>
      validateWithSchema(reasoningResponseV1Schema.$id, {
        ...response,
        candidates: [{ ...response.candidates[0], limitations: ['free-form provider text'] }],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<SchemaValidationError>>({ code: 'invalid_schema' }),
    );
  });

  it('validates the closed v2 adapter manifest, extraction, and diff wire protocols', () => {
    const hash = `sha256:${'1'.repeat(64)}`;
    const config = `cfg_sha256:${'2'.repeat(64)}`;
    const stamp = {
      adapter_id: 'reverb.events',
      adapter_version: '0.1.0',
      extraction_version: '1',
      identity_version: 1,
      partitioning_version: 1,
      compatibility_version: '1',
    };
    expect(() =>
      validateWithSchema(adapterManifestV2Schema.$id, {
        schema: 'reverb.adapter-manifest',
        schema_version: '2.0',
        id: 'reverb.events',
        family: 'events',
        version: '0.1.0',
        extraction_version: '1',
        identity_version: 1,
        partitioning_version: 1,
        compatibility_version: '1',
        contract_kinds: ['event.destination', 'event.payload_schema'],
        capability_tiers: [{ input: 'literal binding', tier: 'structural' }],
        evidence_strata: [
          {
            id: 'literal_source_binding',
            family: 'fallback_identity',
            required_evidence: ['literal destination'],
            promotion_state: 'UNMEASURED',
          },
        ],
        external_tools: [],
        limitations: [],
        resource_budget: {
          timeout_ms: 1,
          memory_mib: 1,
          maximum_input_bytes: 1,
          maximum_output_bytes: 1,
          maximum_items: 1,
        },
        maintainer: 'Reverb maintainers',
      }),
    ).not.toThrow();

    const evidenceStamp = {
      extractor_id: stamp.adapter_id,
      extractor_version: stamp.adapter_version,
      extraction_version: stamp.extraction_version,
      identity_version: stamp.identity_version,
      partitioning_version: stamp.partitioning_version,
      compatibility_version: stamp.compatibility_version,
      config_revision: config,
      evidence_stratum: 'literal_source_binding',
    };
    const extraction = {
      schema: 'reverb.adapter-extraction',
      schema_version: '2.0',
      family: 'events',
      ...stamp,
      config_revision: config,
      definitions: [
        {
          contract_kind: 'event.destination',
          canonical_key: 'event-destination-v1|7:kafka',
          display_name: 'orders',
          path: 'src/events.ts',
          content_hash: hash,
          shape_hash: hash,
          shape: { provider: 'kafka' },
          ...evidenceStamp,
        },
      ],
      references: [
        {
          contract_kind: 'event.destination',
          canonical_key: 'event-destination-v1|7:kafka',
          path: 'src/consumer.ts',
          content_hash: hash,
          ...evidenceStamp,
          activation: 'on_deploy',
        },
      ],
      coverage: {
        state: 'complete',
        eligible_artifacts: 1,
        processed_artifacts: 1,
        skipped_artifacts: 0,
        failed_artifacts: 0,
        limitations: [],
      },
      diagnostics: [],
      source_fingerprint: hash,
      output_hash: hash,
    };
    expect(() => validateWithSchema(adapterExtractionV2Schema.$id, extraction)).not.toThrow();
    expect(() =>
      validateWithSchema(adapterExtractionV2Schema.$id, {
        ...extraction,
        references: [
          {
            ...extraction.references[0],
            unresolved_pattern: 'dynamic',
            unresolved_reason: 'dynamic_destination',
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<SchemaValidationError>>({ code: 'invalid_schema' }),
    );

    expect(() =>
      validateWithSchema(adapterDiffV2Schema.$id, {
        schema: 'reverb.adapter-diff',
        schema_version: '2.0',
        family: 'events',
        ...stamp,
        changes: [
          {
            contract_kind: 'event.destination',
            canonical_key: 'event-destination-v1|7:kafka',
            change_kind: 'destination_removed',
            compatibility: 'breaking',
            activation: 'on_deploy',
            base_shape_hash: hash,
            coverage_dependencies: ['events.base.complete', 'events.head.complete'],
            remedy: { kind: 'coordinate_contract_rollout', text: 'Coordinate consumers.' },
          },
        ],
        coverage: extraction.coverage,
        diagnostics: [],
        output_hash: hash,
      }),
    ).not.toThrow();
  });
});
