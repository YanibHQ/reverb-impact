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

import { httpAdapter, httpRouteKey } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'5'.repeat(64)}`);
const context = {
  httpServiceId: 'billing-api',
  httpServiceAliases: { 'billing.internal': 'billing-api' },
  httpClients: { billingClient: 'billing-api' },
} as const;
const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000801');
const producerRepository = repositoryStableId(`local:sha256:${'5'.repeat(64)}`);
const consumerRepository = repositoryStableId(`local:sha256:${'6'.repeat(64)}`);
const baseGeneration = generationId('gen_01990f64-0000-7000-8000-000000000801');
const headGeneration = generationId('gen_01990f64-0000-7000-8000-000000000802');
const consumerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000803');
const baseSha = commitSha('1'.repeat(40));
const headSha = commitSha('2'.repeat(40));
const consumerSha = commitSha('3'.repeat(40));
const now = instant('2026-09-02T23:00:00.000Z');
const registry = createRegistrySnapshot({
  workspaceId: workspace,
  sequence: 1,
  createdAt: now,
  createdBy: 'http-fixture',
  source: 'fixture',
  reason: 'http impact',
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
      authorizationDecisionHash: contentHash(`sha256:${'b'.repeat(64)}`),
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

const baseRoute = artifact(
  'src/routes.ts',
  "app.get('/accounts/:id', account); app.get('/health', health);",
);
const headRoute = artifact('src/routes.ts', "app.get('/health', health);");
const key = httpRouteKey({
  serviceId: 'billing-api',
  method: 'GET',
  routeTemplate: '/accounts/{param}',
});

async function producer() {
  const base = await httpAdapter.extract({
    artifacts: [baseRoute],
    configRevision: revision,
    context,
  });
  const head = await httpAdapter.extract({
    artifacts: [headRoute],
    configRevision: revision,
    context,
  });
  const diff = await httpAdapter.diff({ base, head, configRevision: revision, context });
  return { base, head, diff };
}

describe('implicit HTTP backend impact identity', () => {
  it.each([
    ['fetch', artifact('src/fetch.ts', 'fetch(`https://billing.internal/accounts/${id}`);')],
    [
      'axios',
      artifact('src/axios.ts', 'axios.get(`https://billing.internal/accounts/${account.id}`);'),
    ],
    ['configured client', artifact('src/client.ts', 'billingClient.get(`/accounts/${id}`);')],
  ])('joins a removed framework route to a %s consumer', async (_name, consumerArtifact) => {
    const source = await producer();
    const consumer = await httpAdapter.extract({
      artifacts: [consumerArtifact],
      configRevision: revision,
      context,
    });
    expect(source.diff.changes).toContainEqual(
      expect.objectContaining({
        canonicalKey: key,
        changeKind: 'route_removed',
        compatibility: 'breaking',
      }),
    );
    expect(consumer.references).toContainEqual(expect.objectContaining({ canonicalKey: key }));
    const producerObservation = materializeContractObservationV2({
      workspaceId: workspace,
      repositoryId: producerRepository,
      generationId: baseGeneration,
      commitSha: baseSha,
      observedAt: now,
      extraction: source.base,
    });
    const consumerObservation = materializeContractObservationV2({
      workspaceId: workspace,
      repositoryId: consumerRepository,
      generationId: consumerGeneration,
      commitSha: consumerSha,
      observedAt: now,
      extraction: consumer,
    });
    const changes = materializeContractChangesV2({
      workspaceId: workspace,
      producerRepositoryId: producerRepository,
      baseGenerationId: baseGeneration,
      headGenerationId: headGeneration,
      baseSha,
      headSha,
      diff: source.diff,
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
    const findings = createDeterministicFindingsV2({
      analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000801'),
      policyMajor: 2,
      changes,
      edges,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      family: 'implicit_http',
      claims: { edge: 'candidate', impact: 'breaking', action: 'coordinate' },
      edge: {
        producerRepositoryId: producerRepository,
        consumerRepositoryId: consumerRepository,
        definition: { path: baseRoute.path },
        reference: { path: consumerArtifact.path },
      },
    });
  });

  it('uses the exact head observation for a same-repository client', async () => {
    const call = artifact('src/client.ts', 'billingClient.get(`/accounts/${id}`);');
    const base = await httpAdapter.extract({
      artifacts: [baseRoute, call],
      configRevision: revision,
      context,
    });
    const head = await httpAdapter.extract({
      artifacts: [headRoute, call],
      configRevision: revision,
      context,
    });
    const diff = await httpAdapter.diff({ base, head, configRevision: revision, context });
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
    const changes = materializeContractChangesV2({
      workspaceId: workspace,
      producerRepositoryId: producerRepository,
      baseGenerationId: baseGeneration,
      headGenerationId: headGeneration,
      baseSha,
      headSha,
      diff,
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
    expect(edges).toContainEqual(
      expect.objectContaining({
        definitionKey: key,
        consumerRepositoryId: producerRepository,
        consumerGenerationId: headGeneration,
      }),
    );
  });
});
