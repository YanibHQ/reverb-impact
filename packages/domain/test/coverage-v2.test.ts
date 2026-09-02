import {
  adapterId,
  commitSha,
  configRevision,
  contentHash,
  finalizeAdapterFamilyCoverageV2,
  finalizeAnalysisCoverageV2,
  finalizeRepositoryAnalysisCoverageV2,
  generationId,
  instant,
  registryRevision,
  repositoryStableId,
  workspaceId,
  type AnalysisScopeProvenanceV2,
  type RepositoryAnalysisCoverageV2,
} from '../src/index.js';
import { describe, expect, it } from 'vitest';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000510');
const producer = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
const consumer = repositoryStableId(`local:sha256:${'2'.repeat(64)}`);
const revision = registryRevision(`reg_sha256:${'3'.repeat(64)}`);
const scopeHash = contentHash(`sha256:${'4'.repeat(64)}`);
const observedAt = instant('2026-09-02T21:00:00.000Z');

function scope(gaps: AnalysisScopeProvenanceV2['gaps'] = []): AnalysisScopeProvenanceV2 {
  const consumerUnavailable = gaps.some((gap) => gap.repositoryId === consumer);
  return {
    schema: 'reverb.analysis-scope',
    schemaVersion: '2.0',
    workspaceId: workspace,
    registryRevision: revision,
    producerRepositoryId: producer,
    mode: 'allowlist',
    requestedRepositoryIds: [consumer],
    repositories: [
      {
        repositoryId: producer,
        producer: true,
        requested: false,
        consentRevision: 'producer-consent',
        authorizationRevision: revision,
        authorizationDecisionHash: contentHash(`sha256:${'5'.repeat(64)}`),
      },
      ...(consumerUnavailable
        ? []
        : [
            {
              repositoryId: consumer,
              producer: false,
              requested: true,
              consentRevision: 'consumer-consent',
              authorizationRevision: revision,
              authorizationDecisionHash: contentHash(`sha256:${'6'.repeat(64)}`),
            },
          ]),
    ],
    gaps,
    scopeHash,
  };
}

function family(state: 'complete' | 'partial' = 'complete') {
  return finalizeAdapterFamilyCoverageV2({
    family: 'events',
    state,
    eligibleArtifacts: 2,
    processedArtifacts: state === 'complete' ? 2 : 1,
    skippedArtifacts: 0,
    failedArtifacts: state === 'complete' ? 0 : 1,
    adapters: [
      {
        adapterId: adapterId('adapter.events'),
        adapterVersion: '0.5.0',
        extractionVersion: '1',
        identityVersion: 1,
        partitioningVersion: 1,
        compatibilityVersion: '1',
        configRevision: configRevision(`cfg_sha256:${'7'.repeat(64)}`),
        outputHash: contentHash(`sha256:${'8'.repeat(64)}`),
      },
    ],
    limitations: state === 'complete' ? [] : [{ code: 'dynamic_destination', source: 'adapter' }],
  });
}

function repository(
  repositoryId: typeof producer | typeof consumer,
  role: RepositoryAnalysisCoverageV2['role'],
  state: 'complete' | 'partial' = 'complete',
) {
  return finalizeRepositoryAnalysisCoverageV2({
    workspaceId: workspace,
    registryRevision: revision,
    repositoryId,
    role,
    selectionState: 'current',
    generationId: generationId(
      repositoryId === producer
        ? 'gen_01990f64-0000-7000-8000-000000000510'
        : 'gen_01990f64-0000-7000-8000-000000000511',
    ),
    commitSha: commitSha(repositoryId === producer ? 'a'.repeat(40) : 'b'.repeat(40)),
    selectedAt: observedAt,
    freshnessAgeMs: 0,
    families: [family(state)],
  });
}

describe('analysis coverage v2', () => {
  it('canonicalizes repository order and records complete bounded coverage', () => {
    const first = finalizeAnalysisCoverageV2({
      scope: scope(),
      enabledFamilies: ['events'],
      repositories: [repository(consumer, 'consumer'), repository(producer, 'producer_consumer')],
    });
    const second = finalizeAnalysisCoverageV2({
      scope: scope(),
      enabledFamilies: ['events', 'events'],
      repositories: [...first.repositories].reverse(),
    });
    expect(first.state).toBe('complete');
    expect(first.repositories.map((value) => value.repositoryId)).toEqual([producer, consumer]);
    expect(second.outputHash).toBe(first.outputHash);
  });

  it('makes partial family evidence and scope gaps explicitly partial', () => {
    const partialFamily = finalizeAnalysisCoverageV2({
      scope: scope(),
      enabledFamilies: ['events'],
      repositories: [
        repository(producer, 'producer_consumer'),
        repository(consumer, 'consumer', 'partial'),
      ],
    });
    expect(partialFamily.state).toBe('partial');

    const gap = finalizeAnalysisCoverageV2({
      scope: scope([{ repositoryId: consumer, reason: 'authorization_denied' }]),
      enabledFamilies: [],
      repositories: [
        finalizeRepositoryAnalysisCoverageV2({
          workspaceId: workspace,
          registryRevision: revision,
          repositoryId: producer,
          role: 'producer_consumer',
          selectionState: 'current',
          generationId: generationId('gen_01990f64-0000-7000-8000-000000000510'),
          commitSha: commitSha('a'.repeat(40)),
          selectedAt: observedAt,
          freshnessAgeMs: 0,
          families: [],
        }),
      ],
    });
    expect(gap.state).toBe('partial');
  });

  it('rejects missing family coverage and repositories outside the authorized scope', () => {
    const producerCoverage = repository(producer, 'producer_consumer');
    expect(() =>
      finalizeAnalysisCoverageV2({
        scope: scope(),
        enabledFamilies: ['events'],
        repositories: [producerCoverage],
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_schema' }));

    expect(() =>
      finalizeAnalysisCoverageV2({
        scope: scope(),
        enabledFamilies: [],
        repositories: [
          { ...producerCoverage, families: [] },
          {
            ...repository(consumer, 'consumer'),
            repositoryId: repositoryStableId(`local:sha256:${'9'.repeat(64)}`),
            families: [],
          },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_schema' }));
  });

  it('rejects a clean claim when artifacts or limitations are unaccounted for', () => {
    expect(() =>
      finalizeAdapterFamilyCoverageV2({
        family: 'events',
        state: 'complete',
        eligibleArtifacts: 2,
        processedArtifacts: 1,
        skippedArtifacts: 0,
        failedArtifacts: 0,
        adapters: family().adapters,
        limitations: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_schema' }));
  });
});
