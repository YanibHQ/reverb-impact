import {
  adapterId,
  analysisId,
  analysisSupersessionKey,
  commitSha,
  configRevision,
  contentHash,
  createRegistrySnapshot,
  createReviewEvent,
  createSuppressionRule,
  deriveStableReferenceId,
  generationId,
  generationLeaseId,
  instant,
  overlayId,
  policyRevision,
  repoPath,
  repositoryStableId,
  reviewEventId,
  treeHash,
  workspaceId,
  type CommitSha,
  type ContractGenerationObservation,
  type GenerationId,
  type IndexedContractChange,
  type IndexedContractDefinition,
  type IndexedContractReference,
  type OverlayId,
  type RepositoryStableId,
} from '@yanibhq/reverb-domain';
import { AnalyzePullRequest } from '@yanibhq/reverb-application';
import { describe, expect, it } from 'vitest';

import {
  FakeClock,
  InMemoryEvidenceGraphStore,
  InMemoryGenerationStore,
  InMemoryAuthorization,
  InMemoryRegistry,
} from '../src/index.js';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000120');
const producer = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
const consumerA = repositoryStableId(`local:sha256:${'2'.repeat(64)}`);
const consumerB = repositoryStableId(`local:sha256:${'3'.repeat(64)}`);
const missingConsumer = repositoryStableId(`local:sha256:${'4'.repeat(64)}`);
const baseGeneration = generationId('gen_01990f64-0000-7000-8000-000000000120');
const consumerGenerationA = generationId('gen_01990f64-0000-7000-8000-000000000121');
const consumerGenerationB = generationId('gen_01990f64-0000-7000-8000-000000000122');
const baseSha = commitSha('a'.repeat(40));
const firstHead = commitSha('b'.repeat(40));
const secondHead = commitSha('c'.repeat(40));
const now = instant('2026-08-28T20:00:00.000Z');
const later = instant('2026-08-28T20:01:00.000Z');
const config = configRevision(`cfg_sha256:${'d'.repeat(64)}`);
const hash = contentHash(`sha256:${'e'.repeat(64)}`);
const policy = policyRevision(`pol_sha256:${'f'.repeat(64)}`);

async function completeGeneration(
  store: InMemoryGenerationStore,
  id: GenerationId,
  repositoryId: RepositoryStableId,
  sha: CommitSha,
  sequence: number,
): Promise<void> {
  const lease = await store.beginGeneration({
    generationId: id,
    workspaceId: workspace,
    repositoryId,
    commitSha: sha,
    treeHash: treeHash(sequence.toString(16).repeat(40).slice(0, 40)),
    indexerBundleVersion: 'phase-003',
    configRevision: config,
    registryRevision: registrySnapshot.revision.revision,
    startedAt: now,
    leaseId: generationLeaseId(
      `lea_01990f64-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`,
    ),
    leaseExpiresAt: later,
  });
  expect(lease.ok).toBe(true);
  if (!lease.ok) return;
  expect(
    (
      await store.completeGeneration(lease.value, {
        state: 'complete',
        completedAt: now,
        selectable: true,
        coverage: [],
        diagnostics: [],
        coverageHash: hash,
        artifactResultHash: hash,
      })
    ).ok,
  ).toBe(true);
}

async function completeOverlay(
  store: InMemoryGenerationStore,
  id: OverlayId,
  headSha: CommitSha,
  sequence: number,
): Promise<void> {
  const lease = await store.beginOverlay({
    overlay: {
      id,
      workspaceId: workspace,
      repositoryId: producer,
      baseGenerationId: baseGeneration,
      baseSha,
      headSha,
      headTreeHash: treeHash(headSha),
      indexerBundleVersion: 'phase-003',
      configRevision: config,
      registryRevision: registrySnapshot.revision.revision,
      state: 'building',
      supersessionKey: contentHash(`sha256:${sequence.toString(16).repeat(64).slice(0, 64)}`),
      diffHash: hash,
      startedAt: now,
    },
    leaseId: generationLeaseId(
      `lea_01990f64-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`,
    ),
    leaseExpiresAt: later,
  });
  expect(lease.ok).toBe(true);
  if (!lease.ok) return;
  expect(
    (
      await store.completeOverlay(lease.value, id, {
        state: 'complete',
        completedAt: later,
        resultHash: hash,
      })
    ).ok,
  ).toBe(true);
}

const registrySnapshot = createRegistrySnapshot({
  workspaceId: workspace,
  sequence: 1,
  createdAt: now,
  createdBy: 'integration-test',
  source: 'fixture',
  reason: 'multi-repository PR analysis',
  repositories: [
    [producer, 'producer'],
    [consumerA, 'consumer-a'],
    [consumerB, 'consumer-b'],
    [missingConsumer, 'missing-consumer'],
  ].map(([repositoryId, alias]) => ({
    repositoryId: repositoryId as RepositoryStableId,
    alias: alias as string,
    defaultBranch: 'main',
    collections: ['default'],
    selected: true,
    consentRevision: '1',
  })),
  services: [],
  aliases: [],
});

const definition: IndexedContractDefinition = {
  workspaceId: workspace,
  repositoryId: producer,
  generationId: baseGeneration,
  commitSha: baseSha,
  contractKind: 'typescript_symbol',
  canonicalKey: 'typescript:@fixture/api#Pet',
  path: repoPath('src/pet.ts'),
  range: { startLine: 2, startColumn: 1, endLine: 6, endColumn: 2 },
  contentHash: hash,
  shapeHash: hash,
  adapterId: adapterId('reverb.typescript'),
  adapterVersion: '0.1.0',
  identityVersion: 1,
  configRevision: config,
  evidenceStratum: 'export_symbol',
};

function reference(
  repositoryId: RepositoryStableId,
  generation: GenerationId,
  sha: CommitSha,
  owner: string,
): IndexedContractReference {
  return {
    workspaceId: workspace,
    repositoryId,
    generationId: generation,
    commitSha: sha,
    contractKind: 'typescript_symbol',
    canonicalKey: definition.canonicalKey,
    stableReferenceId: deriveStableReferenceId({
      contractKind: 'typescript_symbol',
      canonicalKey: definition.canonicalKey,
      semanticOwner: owner,
      evidenceStratum: 'import_symbol',
    }),
    path: repoPath(`src/${owner}.ts`),
    range: { startLine: 8, startColumn: 1, endLine: 8, endColumn: 12 },
    contentHash: hash,
    adapterId: adapterId('reverb.typescript'),
    adapterVersion: '0.1.0',
    identityVersion: 1,
    configRevision: config,
    evidenceStratum: 'import_symbol',
    activation: 'on_deploy',
  };
}

function change(headSha: CommitSha): IndexedContractChange {
  return {
    workspaceId: workspace,
    producerRepositoryId: producer,
    baseGenerationId: baseGeneration,
    baseSha,
    headSha,
    contractKind: definition.contractKind,
    canonicalKey: definition.canonicalKey,
    changeKind: 'export_removed',
    compatibility: 'breaking',
    activation: 'on_deploy',
    adapterId: definition.adapterId,
    adapterVersion: definition.adapterVersion,
    identityVersion: 1,
    coverageState: 'complete',
    coverageDependencies: ['producer.typescript.complete'],
    remedy: { kind: 'coordinate_contract_rollout', text: 'Keep or coordinate this export.' },
  };
}

async function observation(
  evidence: InMemoryEvidenceGraphStore,
  repositoryId: RepositoryStableId,
  generation: GenerationId,
  sha: CommitSha,
  references: readonly IndexedContractReference[],
  coverageState: ContractGenerationObservation['coverageState'],
): Promise<void> {
  expect(
    (
      await evidence.putContractObservation({
        workspaceId: workspace,
        repositoryId,
        generationId: generation,
        commitSha: sha,
        coverageState,
        definitions: [],
        references,
        observedAt: now,
        outputHash: contentHash(`sha256:${repositoryId.slice(-1).repeat(64)}`),
      })
    ).ok,
  ).toBe(true);
}

describe('exact multi-repository PR analysis', () => {
  it('records exact SHAs, preserves consumer-specific findings, and supersedes a force-pushed run', async () => {
    const generations = new InMemoryGenerationStore();
    const evidence = new InMemoryEvidenceGraphStore();
    const registry = new InMemoryRegistry();
    const clock = new FakeClock(now);
    await registry.putRevision(registrySnapshot);
    await completeGeneration(generations, baseGeneration, producer, baseSha, 120);
    await completeGeneration(
      generations,
      consumerGenerationA,
      consumerA,
      commitSha('1'.repeat(40)),
      121,
    );
    await completeGeneration(
      generations,
      consumerGenerationB,
      consumerB,
      commitSha('2'.repeat(40)),
      122,
    );
    await observation(
      evidence,
      consumerA,
      consumerGenerationA,
      commitSha('1'.repeat(40)),
      [reference(consumerA, consumerGenerationA, commitSha('1'.repeat(40)), 'web-client')],
      'partial',
    );
    await observation(
      evidence,
      consumerB,
      consumerGenerationB,
      commitSha('2'.repeat(40)),
      [reference(consumerB, consumerGenerationB, commitSha('2'.repeat(40)), 'worker-client')],
      'complete',
    );
    const firstOverlay = overlayId('ovl_01990f64-0000-7000-8000-000000000120');
    await completeOverlay(generations, firstOverlay, firstHead, 123);
    const analyzer = new AnalyzePullRequest({ generations, evidence, registry, clock });
    const first = await analyzer.execute({
      analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000120'),
      workspaceId: workspace,
      registryRevision: registrySnapshot.revision.revision,
      policyRevision: policy,
      policyMajor: 1,
      producerRepositoryId: producer,
      baseGenerationId: baseGeneration,
      overlayId: firstOverlay,
      pullRequest: { provider: 'local', number: 42, baseSha, headSha: firstHead },
      changes: [change(firstHead)],
      producerDefinitions: [definition],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.pullRequest).toMatchObject({ baseSha, headSha: firstHead });
    expect(first.value.findings).toHaveLength(2);
    expect(new Set(first.value.findings.map((value) => value.fingerprint)).size).toBe(2);
    expect(first.value.findings.every((value) => value.state === 'PREVIEW')).toBe(true);
    expect(first.value.consumers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repositoryId: consumerA,
          state: 'current',
          coverageState: 'partial',
        }),
        expect.objectContaining({
          repositoryId: consumerB,
          state: 'current',
          coverageState: 'complete',
        }),
        expect.objectContaining({ repositoryId: missingConsumer, state: 'not_indexed' }),
      ]),
    );
    expect(first.value.abstentions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          consumerRepositoryId: missingConsumer,
          reason: 'incomplete_index',
        }),
      ]),
    );

    clock.set(later);
    const secondOverlay = overlayId('ovl_01990f64-0000-7000-8000-000000000121');
    await completeOverlay(generations, secondOverlay, secondHead, 124);
    const second = await analyzer.execute({
      analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000121'),
      workspaceId: workspace,
      registryRevision: registrySnapshot.revision.revision,
      policyRevision: policy,
      policyMajor: 1,
      producerRepositoryId: producer,
      baseGenerationId: baseGeneration,
      overlayId: secondOverlay,
      pullRequest: { provider: 'local', number: 42, baseSha, headSha: secondHead },
      changes: [change(secondHead)],
      producerDefinitions: [definition],
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const old = await evidence.getAnalysis(first.value.analysisId);
    expect(old).toMatchObject({ ok: true, value: { state: 'superseded', current: false } });
    const key = analysisSupersessionKey({
      workspaceId: workspace,
      producerRepositoryId: producer,
      provider: 'local',
      pullRequestNumber: 42,
      policyMajor: 1,
    });
    expect(await evidence.getCurrentAnalysis(key)).toMatchObject({
      ok: true,
      value: { analysisId: second.value.analysisId, pullRequest: { headSha: secondHead } },
    });
  });

  it('bounds an unavailable on-demand refresh without turning missing evidence into assurance', async () => {
    const generations = new InMemoryGenerationStore();
    const evidence = new InMemoryEvidenceGraphStore();
    const registry = new InMemoryRegistry();
    await registry.putRevision(registrySnapshot);
    await completeGeneration(generations, baseGeneration, producer, baseSha, 130);
    const overlay = overlayId('ovl_01990f64-0000-7000-8000-000000000130');
    await completeOverlay(generations, overlay, firstHead, 131);
    const analyzer = new AnalyzePullRequest({
      generations,
      evidence,
      registry,
      clock: new FakeClock(now),
      refresh: { refresh: () => new Promise(() => undefined) },
    });
    const started = performance.now();
    const result = await analyzer.execute({
      analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000130'),
      workspaceId: workspace,
      registryRevision: registrySnapshot.revision.revision,
      policyRevision: policy,
      policyMajor: 1,
      producerRepositoryId: producer,
      baseGenerationId: baseGeneration,
      overlayId: overlay,
      pullRequest: { provider: 'local', baseSha, headSha: firstHead },
      changes: [change(firstHead)],
      producerDefinitions: [definition],
      refreshBudgetMs: 10,
    });
    expect(performance.now() - started).toBeLessThan(200);
    expect(result).toMatchObject({ ok: true, value: { state: 'partial' } });
    if (result.ok) {
      expect(result.value.consumers.every((value) => value.state === 'not_indexed')).toBe(true);
      expect(result.value.abstentions).toHaveLength(3);
    }
  });

  it('records unauthorized consumers as privacy abstentions rather than negative assurance', async () => {
    const generations = new InMemoryGenerationStore();
    const evidence = new InMemoryEvidenceGraphStore();
    const registry = new InMemoryRegistry();
    await registry.putRevision(registrySnapshot);
    await completeGeneration(generations, baseGeneration, producer, baseSha, 140);
    const overlay = overlayId('ovl_01990f64-0000-7000-8000-000000000140');
    await completeOverlay(generations, overlay, firstHead, 141);
    const result = await new AnalyzePullRequest({
      generations,
      evidence,
      registry,
      clock: new FakeClock(now),
      authorization: new InMemoryAuthorization(),
    }).execute({
      analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000140'),
      workspaceId: workspace,
      registryRevision: registrySnapshot.revision.revision,
      policyRevision: policy,
      policyMajor: 1,
      producerRepositoryId: producer,
      baseGenerationId: baseGeneration,
      overlayId: overlay,
      pullRequest: { provider: 'local', baseSha, headSha: firstHead },
      changes: [change(firstHead)],
      producerDefinitions: [definition],
    });
    expect(result).toMatchObject({ ok: true, value: { state: 'partial', findings: [] } });
    if (result.ok) {
      expect(result.value.consumers.every((value) => value.state === 'unauthorized')).toBe(true);
      expect(result.value.abstentions.every((value) => value.reason === 'privacy_restricted')).toBe(
        true,
      );
    }
  });

  it('applies active suppressions after candidate creation without deleting evaluation evidence', async () => {
    const generations = new InMemoryGenerationStore();
    const evidence = new InMemoryEvidenceGraphStore();
    const registryStore = new InMemoryRegistry();
    await registryStore.putRevision(registrySnapshot);
    await completeGeneration(generations, baseGeneration, producer, baseSha, 150);
    await completeGeneration(
      generations,
      consumerGenerationA,
      consumerA,
      commitSha('1'.repeat(40)),
      151,
    );
    await observation(
      evidence,
      consumerA,
      consumerGenerationA,
      commitSha('1'.repeat(40)),
      [reference(consumerA, consumerGenerationA, commitSha('1'.repeat(40)), 'web-client')],
      'complete',
    );
    const overlay = overlayId('ovl_01990f64-0000-7000-8000-000000000150');
    await completeOverlay(generations, overlay, firstHead, 152);
    const analyzer = new AnalyzePullRequest({
      generations,
      evidence,
      reviews: evidence,
      registry: registryStore,
      clock: new FakeClock(now),
    });
    const first = await analyzer.execute({
      analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000150'),
      workspaceId: workspace,
      registryRevision: registrySnapshot.revision.revision,
      policyRevision: policy,
      policyMajor: 1,
      producerRepositoryId: producer,
      baseGenerationId: baseGeneration,
      overlayId: overlay,
      pullRequest: { provider: 'local', number: 55, baseSha, headSha: firstHead },
      changes: [change(firstHead)],
      producerDefinitions: [definition],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const finding = first.value.findings[0]!;
    expect(finding.delivery.decision).toBe('preview_only');
    const suppression = createSuppressionRule({
      workspaceId: workspace,
      matcher: { scope: 'stable_finding', fingerprint: finding.fingerprint },
      owner: {
        actorId: 'reviewer-a',
        role: 'reviewer',
        authorizationRevision: registrySnapshot.revision.revision,
      },
      justification: 'The downstream rollout is already coordinated.',
      createdAt: instant('2026-08-28T19:59:00.000Z'),
      reviewAt: instant('2026-09-01T00:00:00.000Z'),
      expiresAt: instant('2026-10-01T00:00:00.000Z'),
      invalidationPredicates: [{ kind: 'policy_revision', revision: policy }],
    });
    const review = createReviewEvent({
      id: reviewEventId('rev_01990f64-0000-7000-8000-000000000150'),
      workspaceId: workspace,
      findingOccurrenceId: finding.id,
      findingFingerprint: finding.fingerprint,
      actor: {
        id: 'reviewer-a',
        role: 'reviewer',
        domainCapability: 'TypeScript package ownership',
        detectorAuthorConflict: false,
      },
      authorization: {
        revision: registrySnapshot.revision.revision,
        authorizedAt: now,
        permission: 'finding.review',
      },
      occurredAt: now,
      versions: {
        producerGenerationId: finding.edge.producerGenerationId,
        consumerGenerationId: finding.edge.consumerGenerationId,
        adapters: [
          {
            id: finding.change.adapterId,
            version: finding.change.adapterVersion,
            identityVersion: finding.change.identityVersion,
          },
        ],
        evidenceStratum: finding.edge.stratumKey,
        policyRevision: policy,
        registryRevision: registrySnapshot.revision.revision,
      },
      labels: { edge: 'confirmed', impact: 'breaking', action: 'already_coordinated' },
      reason: 'downstream_change_linked',
      noteHash: hash,
      suppressionRuleId: suppression.id,
    });
    expect((await evidence.appendReview({ event: review, suppression })).ok).toBe(true);
    const second = await analyzer.execute({
      analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000151'),
      workspaceId: workspace,
      registryRevision: registrySnapshot.revision.revision,
      policyRevision: policy,
      policyMajor: 1,
      producerRepositoryId: producer,
      baseGenerationId: baseGeneration,
      overlayId: overlay,
      pullRequest: { provider: 'local', number: 55, baseSha, headSha: firstHead },
      changes: [change(firstHead)],
      producerDefinitions: [definition],
    });
    expect(second).toMatchObject({
      ok: true,
      value: {
        findings: [
          {
            fingerprint: finding.fingerprint,
            delivery: { decision: 'suppressed', suppressionRuleId: suppression.id },
          },
        ],
      },
    });
    expect(first.value.findings[0]!.delivery.decision).toBe('preview_only');
  });
});
