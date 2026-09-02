import {
  adapterManifestSchema,
  adapterGenerationSnapshotSchema,
  adapterSemanticPartitionSchema,
  analysisResultSchema,
  assertSupportedSchemaVersion,
  evidenceEdgeSchema,
  findingDisclosureProjectionSchema,
  githubCheckProjectionSchema,
  impactCaseSchema,
  reviewEventSchema,
  suppressionRuleSchema,
  repositoryGenerationSchema,
  SCHEMA_COMPATIBILITY,
  assertReadableSchemaVersion,
  validateWithSchema,
} from '../src/index.js';
import type { SchemaValidationError } from '../src/index.js';
import { describe, expect, it } from 'vitest';

describe('canonical foundation schemas', () => {
  const validGeneration = {
    schema: 'reverb.repository-generation',
    schema_version: '1.0',
    id: 'gen_01990f64-0000-7000-8000-000000000001',
    workspace_id: 'wsp_01990f64-0000-7000-8000-000000000001',
    repository_id: 'local:sha256:1111111111111111111111111111111111111111111111111111111111111111',
    commit_sha: 'a'.repeat(40),
    tree_hash: 'b'.repeat(40),
    indexer_bundle_version: 'foundation-1.0.0',
    config_revision: 'cfg_sha256:2222222222222222222222222222222222222222222222222222222222222222',
    registry_revision:
      'reg_sha256:3333333333333333333333333333333333333333333333333333333333333333',
    state: 'complete',
    started_at: '2026-08-28T20:00:00.000Z',
    selectable: true,
  };

  it('accepts a canonical generation and rejects unknown fields', () => {
    expect(() => validateWithSchema(repositoryGenerationSchema.$id, validGeneration)).not.toThrow();
    expect(() =>
      validateWithSchema(repositoryGenerationSchema.$id, { ...validGeneration, score: 0.9 }),
    ).toThrowError(
      expect.objectContaining<Partial<SchemaValidationError>>({ code: 'invalid_schema' }),
    );
  });

  it('accepts immutable base-plus-overlay generation provenance', () => {
    expect(() =>
      validateWithSchema(repositoryGenerationSchema.$id, {
        ...validGeneration,
        selectable: false,
        derivation: {
          base_generation_id: 'gen_01990f64-0000-7000-8000-000000000002',
          overlay_id: 'ovl_01990f64-0000-7000-8000-000000000001',
          storage_mode: 'base_overlay',
        },
      }),
    ).not.toThrow();
  });

  it('rejects unsupported schema majors with a teaching code', () => {
    expect(() => assertSupportedSchemaVersion({ schema_version: '2.0' })).toThrowError(
      expect.objectContaining<Partial<SchemaValidationError>>({
        code: 'unsupported_schema_major',
      }),
    );
  });

  it('requires canonical adapter manifest versions to match the SDK SemVer policy', () => {
    const manifest = {
      schema: 'reverb.adapter-manifest',
      schema_version: '1.0',
      id: 'test.adapter',
      version: '1.2.3',
      identity_version: 1,
      contract_kinds: ['typescript_symbol'],
      capability_tiers: [{}],
      evidence_strata: [{}],
      external_tools: [],
      limitations: [],
      resource_budget: {
        timeout_ms: 1,
        memory_mib: 1,
        maximum_input_bytes: 1,
        maximum_output_bytes: 1,
        maximum_items: 1,
      },
      maintainer: 'test',
    };

    for (const version of ['1.2.3', '1.2.3-release.1']) {
      expect(() =>
        validateWithSchema(adapterManifestSchema.$id, { ...manifest, version }),
      ).not.toThrow();
    }
    for (const version of ['1.2.3not-semver', '01.2.3', '1.2']) {
      expect(() =>
        validateWithSchema(adapterManifestSchema.$id, { ...manifest, version }),
      ).toThrowError(
        expect.objectContaining<Partial<SchemaValidationError>>({ code: 'invalid_schema' }),
      );
    }
  });

  it('validates adapter partition and generation snapshot envelopes', () => {
    const common = {
      workspace_id: 'wsp_01990f64-0000-7000-8000-000000000001',
      repository_id:
        'local:sha256:1111111111111111111111111111111111111111111111111111111111111111',
      adapter_id: 'reverb.snapshot-test',
      adapter_version: '1.0.0',
      identity_version: 1,
      partitioning_version: 1,
      config_revision:
        'cfg_sha256:2222222222222222222222222222222222222222222222222222222222222222',
      registry_revision:
        'reg_sha256:3333333333333333333333333333333333333333333333333333333333333333',
    };
    expect(() =>
      validateWithSchema(adapterSemanticPartitionSchema.$id, {
        schema: 'reverb.adapter-semantic-partition',
        schema_version: '1.0',
        ...common,
        partition_key: 'package:fixture',
        owned_paths: ['src/index.ts'],
        dependency_keys: [],
        payload: {},
        output_hash: `sha256:${'4'.repeat(64)}`,
      }),
    ).not.toThrow();
    expect(() =>
      validateWithSchema(adapterGenerationSnapshotSchema.$id, {
        schema: 'reverb.adapter-generation-snapshot',
        schema_version: '1.0',
        ...common,
        generation_id: 'gen_01990f64-0000-7000-8000-000000000001',
        state: 'complete',
        entries: [
          {
            kind: 'replacement',
            partition_key: 'package:fixture',
            partition_hash: `sha256:${'4'.repeat(64)}`,
          },
        ],
        output_hash: `sha256:${'5'.repeat(64)}`,
      }),
    ).not.toThrow();
  });

  it('publishes the pre-v1 current/previous-major compatibility disposition', () => {
    expect(SCHEMA_COMPATIBILITY).toMatchObject({
      currentVersion: '1.0',
      supportedMajors: [1],
      previousSupportedMajors: [],
      oldestSupportedPackageVersion: '0.1.0',
    });
    expect(assertReadableSchemaVersion('1.0')).toEqual({ major: 1, minor: 0 });
    expect(assertReadableSchemaVersion('1.99')).toEqual({ major: 1, minor: 99 });
    expect(() => assertReadableSchemaVersion('0.9')).toThrowError(
      expect.objectContaining<Partial<SchemaValidationError>>({
        code: 'unsupported_schema_major',
      }),
    );
    expect(() => assertReadableSchemaVersion('2.0')).toThrowError(/supported majors: 1/);
  });

  it('validates canonical temporal edge and analysis-result envelopes', () => {
    const repositoryA = `local:sha256:${'1'.repeat(64)}`;
    const repositoryB = `local:sha256:${'2'.repeat(64)}`;
    const workspace = 'wsp_01990f64-0000-7000-8000-000000000001';
    const generationA = 'gen_01990f64-0000-7000-8000-000000000001';
    const generationB = 'gen_01990f64-0000-7000-8000-000000000002';
    const registry = `reg_sha256:${'3'.repeat(64)}`;
    expect(() =>
      validateWithSchema(evidenceEdgeSchema.$id, {
        schema: 'reverb.evidence-edge',
        schema_version: '1.0',
        id: `edg_sha256:${'4'.repeat(64)}`,
        workspace_id: workspace,
        producer_repository_id: repositoryA,
        consumer_repository_id: repositoryB,
        producer_generation_id: generationA,
        consumer_generation_id: generationB,
        contract_kind: 'typescript_symbol',
        definition_key: 'typescript:npm#fixture#.#value#x',
        stable_reference_id: `ref_sha256:${'5'.repeat(64)}`,
        basis: 'exact',
        primary_path: { id: 'definition.reference' },
        stratum_key: 'typescript|exact|v1',
        registry_revision: registry,
        first_observed_at: '2026-08-28T20:00:00.000Z',
        last_observed_at: '2026-08-28T20:00:00.000Z',
        definition: {},
        reference: {},
      }),
    ).not.toThrow();
    expect(() =>
      validateWithSchema(analysisResultSchema.$id, {
        schema: 'reverb.analysis-result',
        schema_version: '1.0',
        analysis_id: 'ana_01990f64-0000-7000-8000-000000000001',
        workspace_id: workspace,
        producer_repository_id: repositoryA,
        pull_request: {
          provider: 'local',
          number: 1,
          base_sha: 'a'.repeat(40),
          head_sha: 'b'.repeat(40),
        },
        registry_revision: registry,
        policy_revision: `pol_sha256:${'6'.repeat(64)}`,
        policy_major: 1,
        state: 'partial',
        current: true,
        consumers: [],
        findings: [],
        abstentions: [],
        started_at: '2026-08-28T20:00:00.000Z',
        completed_at: '2026-08-28T20:00:01.000Z',
        output_hash: `sha256:${'7'.repeat(64)}`,
      }),
    ).not.toThrow();
  });

  it('validates Phase 004 review, suppression, and sampled-corpus records', () => {
    const hash = (character: string) => `sha256:${character.repeat(64)}`;
    const workspace = 'wsp_01990f64-0000-7000-8000-000000000001';
    const repositoryA = `local:sha256:${'1'.repeat(64)}`;
    const repositoryB = `local:sha256:${'2'.repeat(64)}`;
    const registry = `reg_${hash('3')}`;
    const policy = `pol_${hash('4')}`;
    expect(() =>
      validateWithSchema(reviewEventSchema.$id, {
        schema: 'reverb.review-event',
        schema_version: '1.0',
        id: 'rev_01990f64-0000-7000-8000-000000000001',
        workspace_id: workspace,
        finding_occurrence_id: `occ_${hash('5')}`,
        finding_fingerprint: `fnd_${hash('6')}`,
        actor: {
          id: 'reviewer-a',
          role: 'reviewer',
          domain_capability: 'TypeScript',
          detector_author_conflict: false,
        },
        authorization: {
          revision: registry,
          authorized_at: '2026-08-28T20:00:00.000Z',
          permission: 'finding.review',
        },
        occurred_at: '2026-08-28T20:00:00.000Z',
        versions: {},
        labels: { edge: 'confirmed', impact: 'breaking', action: 'coordinate' },
        reason: 'coordination_required',
        note_hash: hash('7'),
        output_hash: hash('8'),
      }),
    ).not.toThrow();
    expect(() =>
      validateWithSchema(suppressionRuleSchema.$id, {
        schema: 'reverb.suppression-rule',
        schema_version: '1.0',
        id: `sup_${hash('9')}`,
        workspace_id: workspace,
        matcher: { scope: 'workspace_rule', rule_id: 'temporary' },
        owner: {
          actor_id: 'admin-a',
          role: 'workspace_admin',
          authorization_revision: registry,
        },
        justification: 'Temporary reviewed migration rule.',
        justification_hash: hash('a'),
        created_at: '2026-08-28T20:00:00.000Z',
        review_at: '2026-09-01T20:00:00.000Z',
        expires_at: '2026-10-01T20:00:00.000Z',
        invalidation_predicates: [{ kind: 'policy_revision', revision: policy }],
        initial_state: 'active',
        output_hash: hash('b'),
      }),
    ).not.toThrow();
    const impactCase = {
      schema: 'reverb.impact-case',
      schema_version: '1.0',
      id: `cas_${hash('c')}`,
      subset: 'historical',
      organization_id: 'org-opaque',
      repository_family_id: 'family-opaque',
      team_id: 'team-opaque',
      eligible_pull_request_id: 'pr-1',
      producer_repository_id: repositoryA,
      producer_base_sha: 'a'.repeat(40),
      producer_head_sha: 'b'.repeat(40),
      pull_request_opened_at: '2026-08-28T20:00:00.000Z',
      consumer_repository_id: repositoryB,
      consumer_sha_as_of_pull_request_open: 'c'.repeat(40),
      consumer_snapshot_observed_at: '2026-08-28T19:59:00.000Z',
      producer_generation_id: 'gen_01990f64-0000-7000-8000-000000000001',
      consumer_generation_id: 'gen_01990f64-0000-7000-8000-000000000002',
      stable_consumer_reference_id: `ref_${hash('e')}`,
      contract_kind: 'typescript_symbol',
      canonical_contract_key: 'typescript:npm#api#.#value#x',
      change_kind: 'removed_export',
      stratum: {},
      adapter_versions: {},
      identity_function_version: '1.0.0',
      registry_revision: registry,
      policy_revision: policy,
      evidence: [],
      coverage: [],
      detector_output: 'no_candidate',
      analysis_outcome: 'completed',
      detector_claims: {},
      policy_selected: false,
      suppressed: false,
      required_for_evaluation: true,
      sampling: {
        frame_source: 'provider_metadata',
        inclusion_probability: 0.1,
        sampling_weight: 10,
        seed: 'frozen-seed',
      },
      releaseability: 'private_aggregate_only',
      evaluation_consent: true,
      research_consent: false,
      analysis_latency_ms: 1000,
      cost_microunits: 2,
      confidentiality_defects: 0,
      removal_coverage_defect: false,
      remedy_available: true,
      output_hash: hash('d'),
    };
    expect(() => validateWithSchema(impactCaseSchema.$id, impactCase)).not.toThrow();
    expect(() =>
      validateWithSchema(impactCaseSchema.$id, {
        ...impactCase,
        sampling: { ...impactCase.sampling, frame_source: 'detector_output' },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<SchemaValidationError>>({ code: 'invalid_schema' }),
    );
  });

  it('validates disclosure-safe, permanently advisory check projections', () => {
    const hash = (character: string) => `sha256:${character.repeat(64)}`;
    const workspace = 'wsp_01990f64-0000-7000-8000-000000000001';
    const repositoryA = `local:sha256:${'1'.repeat(64)}`;
    const registry = `reg_${hash('3')}`;
    const policy = `pol_${hash('4')}`;
    const disclosure = {
      schema: 'reverb.finding-disclosure-projection',
      schema_version: '1.0',
      workspace_id: workspace,
      destination_repository_id: repositoryA,
      audience: 'static',
      registry_revision: registry,
      allowed: {},
      omitted: [
        {
          field: 'repository_identity',
          name: 'consumer_repository',
          reason: 'whole_audience_safety_unproven',
        },
      ],
      decision_hash: hash('4'),
    };
    expect(() =>
      validateWithSchema(findingDisclosureProjectionSchema.$id, disclosure),
    ).not.toThrow();
    const check = {
      schema: 'reverb.github-check-projection',
      schema_version: '1.0',
      check_key: hash('5'),
      workspace_id: workspace,
      repository_id: repositoryA,
      pull_request_number: 7,
      head_sha: 'a'.repeat(40),
      policy_revision: policy,
      conclusion: 'neutral',
      advisory: true,
      never_blocking: true,
      title: 'One advisory impact',
      summary: 'Exact current head was analyzed.',
      coverage: {},
      findings: [],
      finding_total: 0,
      truncated_finding_count: 0,
      annotations: [],
      truncated_annotation_count: 0,
      limitations: ['Advisory only.'],
      detail_url: 'https://reverb.invalid/findings/opaque',
      projection_hash: hash('6'),
    };
    expect(() => validateWithSchema(githubCheckProjectionSchema.$id, check)).not.toThrow();
    expect(() =>
      validateWithSchema(githubCheckProjectionSchema.$id, {
        ...check,
        never_blocking: false,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<SchemaValidationError>>({ code: 'invalid_schema' }),
    );
  });
});
