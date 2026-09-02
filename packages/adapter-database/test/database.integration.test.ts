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

import { databaseAdapter, databaseColumnKey, databaseTableKey } from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'7'.repeat(64)}`);
const context = {
  databaseNamespace: 'billing-primary',
  sqlDialect: 'postgresql',
  prismaModels: { account: { table: 'accounts', schema: 'public' } },
} as const;
const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000701');
const producerRepository = repositoryStableId(`local:sha256:${'3'.repeat(64)}`);
const consumerRepository = repositoryStableId(`local:sha256:${'4'.repeat(64)}`);
const baseGeneration = generationId('gen_01990f64-0000-7000-8000-000000000701');
const headGeneration = generationId('gen_01990f64-0000-7000-8000-000000000702');
const consumerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000703');
const baseSha = commitSha('d'.repeat(40));
const headSha = commitSha('e'.repeat(40));
const consumerSha = commitSha('f'.repeat(40));
const now = instant('2026-09-02T22:30:00.000Z');

const registry = createRegistrySnapshot({
  workspaceId: workspace,
  sequence: 1,
  createdAt: now,
  createdBy: 'database-fixture',
  source: 'fixture',
  reason: 'database impact',
  repositories: [producerRepository, consumerRepository].map((repositoryId, index) => ({
    repositoryId,
    alias: index === 0 ? 'producer' : 'consumer',
    defaultBranch: 'main',
    collections: ['default'],
    selected: true,
    consentRevision: '1',
  })),
});

function capability(repositoryIds: readonly (typeof producerRepository)[]) {
  const prepared = prepareAnalysisScope({
    registry,
    producerRepositoryId: producerRepository,
    consumerScope: { mode: 'allowlist', repositoryIds },
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
      authorizationDecisionHash: contentHash(`sha256:${'a'.repeat(64)}`),
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

const baseSchema = artifact(
  'migrations/001.sql',
  'CREATE TABLE public.accounts (id uuid NOT NULL, email text NULL);',
);
const dropEmail = artifact('migrations/002.sql', 'ALTER TABLE public.accounts DROP COLUMN email;');
const tableKey = databaseTableKey({
  databaseNamespace: 'billing-primary',
  schemaName: 'public',
  tableName: 'accounts',
});
const emailKey = databaseColumnKey({ tableKey, columnName: 'email' });

async function producerEvidence() {
  const base = await databaseAdapter.extract({
    artifacts: [baseSchema],
    configRevision: revision,
    context,
  });
  const head = await databaseAdapter.extract({
    artifacts: [baseSchema, dropEmail],
    configRevision: revision,
    context,
  });
  const diff = await databaseAdapter.diff({ base, head, configRevision: revision, context });
  return { base, head, diff };
}

describe('shared database backend impact identity', () => {
  it.each([
    {
      name: 'literal SQL',
      input: artifact(
        'src/account-store.ts',
        "await client.query('SELECT id, email FROM public.accounts WHERE id = $1');",
      ),
    },
    {
      name: 'Prisma schema metadata',
      input: artifact(
        'prisma/schema.prisma',
        'model Account {\n id String @id @db.Uuid\n email String\n @@map("accounts")\n @@schema("public")\n}',
      ),
    },
    {
      name: 'configured Prisma client',
      input: artifact(
        'src/accounts.ts',
        'await prisma.account.findMany({ select: { id: true, email: true } });',
      ),
    },
  ])('joins a producer migration to a $name backend consumer', async ({ input }) => {
    const producer = await producerEvidence();
    const consumer = await databaseAdapter.extract({
      artifacts: [input],
      configRevision: revision,
      context,
    });
    const change = producer.diff.changes.find((value) => value.canonicalKey === emailKey);
    expect(change).toMatchObject({ changeKind: 'column_removed', compatibility: 'breaking' });
    expect(consumer.references).toContainEqual(
      expect.objectContaining({ canonicalKey: emailKey, range: expect.any(Object) }),
    );
    const producerObservation = materializeContractObservationV2({
      workspaceId: workspace,
      repositoryId: producerRepository,
      generationId: baseGeneration,
      commitSha: baseSha,
      observedAt: now,
      extraction: producer.base,
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
      diff: producer.diff,
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
      analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000701'),
      policyMajor: 2,
      changes,
      edges,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      schemaVersion: '2.0',
      family: 'database',
      state: 'PREVIEW',
      claims: { edge: 'candidate', impact: 'breaking', action: 'coordinate' },
      edge: {
        producerRepositoryId: producerRepository,
        consumerRepositoryId: consumerRepository,
        producerGenerationId: baseGeneration,
        consumerGenerationId: consumerGeneration,
        definition: { path: baseSchema.path, contentHash: baseSchema.contentHash },
        reference: { path: input.path, contentHash: input.contentHash },
      },
    });
  });

  it('uses the exact head generation for a same-repository database consumer', async () => {
    const query = artifact(
      'src/account-store.ts',
      "await client.query('SELECT id, email FROM public.accounts');",
    );
    const base = await databaseAdapter.extract({
      artifacts: [baseSchema, query],
      configRevision: revision,
      context,
    });
    const head = await databaseAdapter.extract({
      artifacts: [baseSchema, dropEmail, query],
      configRevision: revision,
      context,
    });
    const diff = await databaseAdapter.diff({ base, head, configRevision: revision, context });
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
      definitionKey: emailKey,
    });
  });
});
