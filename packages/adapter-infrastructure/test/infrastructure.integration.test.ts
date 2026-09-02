import {
  analysisId,
  commitSha,
  configRevision,
  contentHash,
  createDeterministicFindingsV2,
  createRegistrySnapshot,
  finalizeAnalysisScope,
  generationId,
  instant,
  joinChangedContractsV2,
  prepareAnalysisScope,
  repoPath,
  repositoryStableId,
  sha256Bytes,
  workspaceId,
} from '@yanib/reverb-domain';
import {
  materializeContractChangesV2,
  materializeContractObservationV2,
  type ArtifactInput,
} from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';
import { infrastructureAdapter } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'5'.repeat(64)}`);
const context = {
  infrastructureEnvironment: 'production',
  infrastructureServiceScope: 'payments',
} as const;
const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000911');
const producerRepository = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
const consumerRepository = repositoryStableId(`local:sha256:${'2'.repeat(64)}`);
const baseGeneration = generationId('gen_01990f64-0000-7000-8000-000000000911');
const headGeneration = generationId('gen_01990f64-0000-7000-8000-000000000912');
const consumerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000913');
const baseSha = commitSha('1'.repeat(40));
const headSha = commitSha('2'.repeat(40));
const consumerSha = commitSha('3'.repeat(40));
const now = instant('2026-09-02T23:45:00.000Z');
const registry = createRegistrySnapshot({
  workspaceId: workspace,
  sequence: 1,
  createdAt: now,
  createdBy: 'infrastructure-fixture',
  source: 'fixture',
  reason: 'infrastructure impact',
  repositories: [producerRepository, consumerRepository].map((repositoryId, index) => ({
    repositoryId,
    alias: index === 0 ? 'producer' : 'consumer',
    defaultBranch: 'main',
    collections: ['default'],
    selected: true,
    consentRevision: '1',
  })),
});
function capability(ids: readonly (typeof producerRepository)[]) {
  const prepared = prepareAnalysisScope({
    registry,
    producerRepositoryId: producerRepository,
    consumerScope: { mode: 'allowlist', repositoryIds: ids },
    consentGrantee: 'reverb',
  });
  return finalizeAnalysisScope({
    prepared,
    repositories: prepared.candidates.map((candidate) => ({
      repositoryId: candidate.membership.repositoryId,
      producer: candidate.producer,
      requested: candidate.requested,
      consentRevision: candidate.membership.consentRevision,
      authorizationRevision: registry.revision.revision,
      authorizationDecisionHash: contentHash(`sha256:${'d'.repeat(64)}`),
    })),
  }).capability;
}
function artifact(path: string, text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}
async function fixture(
  baseInput: ArtifactInput,
  headInput: ArtifactInput,
  consumerInput: ArtifactInput,
) {
  const base = await infrastructureAdapter.extract({
    artifacts: [baseInput],
    configRevision: revision,
    context,
  });
  const head = await infrastructureAdapter.extract({
    artifacts: [headInput],
    configRevision: revision,
    context,
  });
  const consumer = await infrastructureAdapter.extract({
    artifacts: [consumerInput],
    configRevision: revision,
    context,
  });
  const diff = await infrastructureAdapter.diff({ base, head, configRevision: revision, context });
  const changes = materializeContractChangesV2({
    workspaceId: workspace,
    producerRepositoryId: producerRepository,
    baseGenerationId: baseGeneration,
    headGenerationId: headGeneration,
    baseSha,
    headSha,
    diff,
  });
  const producerObservation = materializeContractObservationV2({
    workspaceId: workspace,
    repositoryId: producerRepository,
    generationId: baseGeneration,
    commitSha: baseSha,
    observedAt: now,
    extraction: base,
  });
  const consumerObservation = materializeContractObservationV2({
    workspaceId: workspace,
    repositoryId: consumerRepository,
    generationId: consumerGeneration,
    commitSha: consumerSha,
    observedAt: now,
    extraction: consumer,
  });
  const edges = joinChangedContractsV2({
    capability: capability([consumerRepository]),
    workspaceId: workspace,
    registryRevision: registry.revision.revision,
    observedAt: now,
    changes,
    definitions: producerObservation.definitions,
    references: consumerObservation.references,
    selectedGenerations: new Map([
      [consumerRepository, { generationId: consumerGeneration, commitSha: consumerSha }],
    ]),
  });
  return createDeterministicFindingsV2({
    analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000911'),
    policyMajor: 2,
    changes,
    edges,
  });
}

describe('infrastructure backend impact identity', () => {
  it('joins a removed Kubernetes Service to an exact downstream Ingress', async () => {
    const service = artifact(
      'k8s/service.yaml',
      'apiVersion: v1\nkind: Service\nmetadata:\n  name: billing\nspec:\n  ports:\n    - port: 8080\n',
    );
    const retained = artifact(
      'k8s/service.yaml',
      'apiVersion: v1\nkind: Service\nmetadata:\n  name: ledger\n',
    );
    const ingress = artifact(
      'k8s/ingress.yaml',
      'apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: public\nspec:\n  rules:\n    - http:\n        paths:\n          - backend:\n              service:\n                name: billing\n                port:\n                  number: 8080\n',
    );
    const findings = await fixture(service, retained, ingress);
    expect(findings).toHaveLength(2);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: 'infrastructure',
          claims: { edge: 'candidate', impact: 'breaking', action: 'coordinate' },
          edge: expect.objectContaining({
            producerRepositoryId: producerRepository,
            consumerRepositoryId: consumerRepository,
            consumerGenerationId: consumerGeneration,
            definition: expect.objectContaining({ path: service.path }),
            reference: expect.objectContaining({ path: ingress.path }),
          }),
        }),
      ]),
    );
  });

  it('uses the exact head generation for a same-repository Ingress reference', async () => {
    const baseInput = artifact(
      'k8s/service.yaml',
      'apiVersion: v1\nkind: Service\nmetadata:\n  name: billing\n',
    );
    const headInput = artifact(
      'k8s/service.yaml',
      'apiVersion: v1\nkind: Service\nmetadata:\n  name: ledger\n',
    );
    const reader = artifact(
      'k8s/ingress.yaml',
      'apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: public\nspec:\n  rules:\n    - http:\n        paths:\n          - backend:\n              service:\n                name: billing\n',
    );
    const base = await infrastructureAdapter.extract({
      artifacts: [baseInput, reader],
      configRevision: revision,
      context,
    });
    const head = await infrastructureAdapter.extract({
      artifacts: [headInput, reader],
      configRevision: revision,
      context,
    });
    const diff = await infrastructureAdapter.diff({
      base,
      head,
      configRevision: revision,
      context,
    });
    const changes = materializeContractChangesV2({
      workspaceId: workspace,
      producerRepositoryId: producerRepository,
      baseGenerationId: baseGeneration,
      headGenerationId: headGeneration,
      baseSha,
      headSha,
      diff,
    });
    const baseObservation = materializeContractObservationV2({
      workspaceId: workspace,
      repositoryId: producerRepository,
      generationId: baseGeneration,
      commitSha: baseSha,
      observedAt: now,
      extraction: base,
    });
    const headObservation = materializeContractObservationV2({
      workspaceId: workspace,
      repositoryId: producerRepository,
      generationId: headGeneration,
      commitSha: headSha,
      observedAt: now,
      extraction: head,
    });
    const edges = joinChangedContractsV2({
      capability: capability([]),
      workspaceId: workspace,
      registryRevision: registry.revision.revision,
      observedAt: now,
      changes,
      definitions: baseObservation.definitions,
      references: headObservation.references,
      selectedGenerations: new Map([
        [producerRepository, { generationId: headGeneration, commitSha: headSha }],
      ]),
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      consumerRepositoryId: producerRepository,
      consumerGenerationId: headGeneration,
    });
  });
});
