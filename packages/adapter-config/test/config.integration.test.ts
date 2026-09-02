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
import { configAdapter } from '../src/index.js';
const revision = configRevision(`cfg_sha256:${'a'.repeat(64)}`);
const context = {
  configurationNamespace: 'production/billing',
  secretIdentitySalt: 'fixture-only-secret-salt',
} as const;
const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000901');
const producerRepository = repositoryStableId(`local:sha256:${'7'.repeat(64)}`);
const consumerRepository = repositoryStableId(`local:sha256:${'8'.repeat(64)}`);
const baseGeneration = generationId('gen_01990f64-0000-7000-8000-000000000901');
const headGeneration = generationId('gen_01990f64-0000-7000-8000-000000000902');
const consumerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000903');
const baseSha = commitSha('4'.repeat(40));
const headSha = commitSha('5'.repeat(40));
const consumerSha = commitSha('6'.repeat(40));
const now = instant('2026-09-02T23:30:00.000Z');
const registry = createRegistrySnapshot({
  workspaceId: workspace,
  sequence: 1,
  createdAt: now,
  createdBy: 'config-fixture',
  source: 'fixture',
  reason: 'configuration impact',
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
      authorizationDecisionHash: contentHash(`sha256:${'c'.repeat(64)}`),
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
const cases = [
  {
    name: 'environment key',
    definition: "defineConfigKey('BILLING_ORIGIN');",
    reference: 'const url = process.env.BILLING_ORIGIN;',
  },
  {
    name: 'feature flag',
    definition: "defineFeatureFlag('new-checkout');",
    reference: "flags.isEnabled('new-checkout');",
  },
  {
    name: 'secret reference',
    definition: "defineSecretReference('vault', 'billing/api-token');",
    reference: "secrets.get('vault', 'billing/api-token');",
  },
] as const;
describe('configuration backend impact identity', () => {
  it.each(cases)(
    'joins a removed $name declaration to an exact consumer',
    async ({ definition, reference }) => {
      const baseArtifact = artifact(
        'src/definitions.ts',
        `${definition} defineConfigKey('RETAINED');`,
      );
      const headArtifact = artifact('src/definitions.ts', "defineConfigKey('RETAINED');");
      const consumerArtifact = artifact('src/consumer.ts', reference);
      const base = await configAdapter.extract({
        artifacts: [baseArtifact],
        configRevision: revision,
        context,
      });
      const head = await configAdapter.extract({
        artifacts: [headArtifact],
        configRevision: revision,
        context,
      });
      const consumer = await configAdapter.extract({
        artifacts: [consumerArtifact],
        configRevision: revision,
        context,
      });
      const diff = await configAdapter.diff({ base, head, configRevision: revision, context });
      const removed = diff.changes.find((item) => item.compatibility === 'breaking');
      expect(removed).toBeDefined();
      expect(consumer.references).toContainEqual(
        expect.objectContaining({ canonicalKey: removed?.canonicalKey }),
      );
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
        analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000901'),
        policyMajor: 2,
        changes,
        edges,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        family: 'configuration',
        claims: { edge: 'candidate', impact: 'breaking', action: 'coordinate' },
        edge: {
          consumerRepositoryId: consumerRepository,
          consumerGenerationId: consumerGeneration,
          definition: { path: baseArtifact.path },
          reference: { path: consumerArtifact.path },
        },
      });
    },
  );
  it('uses the exact head generation for a same-repository configuration read', async () => {
    const baseArtifact = artifact(
      'src/definitions.ts',
      "defineConfigKey('A'); defineConfigKey('B');",
    );
    const headArtifact = artifact('src/definitions.ts', "defineConfigKey('B');");
    const reader = artifact('src/read.ts', 'const value = process.env.A;');
    const base = await configAdapter.extract({
      artifacts: [baseArtifact, reader],
      configRevision: revision,
      context,
    });
    const head = await configAdapter.extract({
      artifacts: [headArtifact, reader],
      configRevision: revision,
      context,
    });
    const diff = await configAdapter.diff({ base, head, configRevision: revision, context });
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
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      consumerRepositoryId: producerRepository,
      consumerGenerationId: headGeneration,
    });
  });
});
