import {
  adapterId,
  commitSha,
  contentHash,
  createCorpusManifest,
  createImpactCase,
  createReviewEvent,
  createSuppressionRule,
  decidePromotion,
  evaluateCorpus,
  findingFingerprint,
  findingOccurrenceId,
  generationId,
  instant,
  policyRevision,
  registryRevision,
  repositoryStableId,
  reviewEventId,
  workspaceId,
  simulateFrozenPolicy,
  stableReferenceId,
  type ReviewEvent,
} from '@yanibhq/reverb-domain';
import type { ReviewEvaluationStore } from '@yanibhq/reverb-application';

export interface ReviewStoreHarness {
  readonly store: ReviewEvaluationStore;
  close(): void | Promise<void>;
}

function eventInput(id: string, supersedes?: ReviewEvent['id']) {
  const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000071');
  const registry = registryRevision(`reg_sha256:${'7'.repeat(64)}`);
  return {
    id: reviewEventId(id),
    workspaceId: workspace,
    findingOccurrenceId: findingOccurrenceId(`occ_sha256:${'1'.repeat(64)}`),
    findingFingerprint: findingFingerprint(`fnd_sha256:${'2'.repeat(64)}`),
    actor: {
      id: 'reviewer-a',
      role: 'workspace_admin' as const,
      domainCapability: 'TypeScript package ownership',
      detectorAuthorConflict: false,
    },
    authorization: {
      revision: registry,
      authorizedAt: instant('2026-08-28T20:00:00.000Z'),
      permission: 'finding.review' as const,
    },
    occurredAt: supersedes
      ? instant('2026-08-28T20:01:00.000Z')
      : instant('2026-08-28T20:00:00.000Z'),
    versions: {
      producerGenerationId: generationId('gen_01990f64-0000-7000-8000-000000000071'),
      consumerGenerationId: generationId('gen_01990f64-0000-7000-8000-000000000072'),
      adapters: [{ id: adapterId('reverb.typescript'), version: '0.1.0', identityVersion: 1 }],
      evidenceStratum: 'typescript|typescript|exact|v1',
      policyRevision: policyRevision(`pol_sha256:${'8'.repeat(64)}`),
      registryRevision: registry,
    },
    labels: {
      edge: 'confirmed' as const,
      impact: 'breaking' as const,
      action: 'coordinate' as const,
    },
    reason: 'coordination_required' as const,
    noteHash: contentHash(`sha256:${'9'.repeat(64)}`),
    ...(supersedes === undefined ? {} : { supersedes }),
  };
}

export async function runReviewStoreConformance(
  createHarness: () => ReviewStoreHarness | Promise<ReviewStoreHarness>,
): Promise<void> {
  const harness = await createHarness();
  try {
    const firstDraft = eventInput('rev_01990f64-0000-7000-8000-000000000071');
    const suppression = createSuppressionRule({
      workspaceId: firstDraft.workspaceId,
      matcher: { scope: 'stable_finding', fingerprint: firstDraft.findingFingerprint },
      owner: {
        actorId: 'reviewer-a',
        role: 'workspace_admin',
        authorizationRevision: firstDraft.authorization.revision,
      },
      justification: 'Downstream coordination is already tracked.',
      createdAt: instant('2026-08-28T20:00:00.000Z'),
      reviewAt: instant('2026-09-01T20:00:00.000Z'),
      expiresAt: instant('2026-10-01T20:00:00.000Z'),
      invalidationPredicates: [
        { kind: 'policy_revision', revision: firstDraft.versions.policyRevision },
      ],
    });
    const first = createReviewEvent({ ...firstDraft, suppressionRuleId: suppression.id });
    const appended = await harness.store.appendReview({ event: first, suppression });
    if (!appended.ok) throw new Error(appended.failure.safeMessage);
    const duplicate = await harness.store.appendReview({ event: first, suppression });
    if (!duplicate.ok) throw new Error('Idempotent review append failed.');
    const reviews = await harness.store.listReviews(first.workspaceId, first.findingFingerprint);
    if (!reviews.ok || reviews.value.length !== 1) throw new Error('Review was not retained.');
    const rules = await harness.store.listSuppressions(first.workspaceId);
    if (!rules.ok || rules.value[0]?.id !== suppression.id) {
      throw new Error('Atomic review suppression was not retained.');
    }
    const second = createReviewEvent(
      eventInput('rev_01990f64-0000-7000-8000-000000000072', first.id),
      first,
    );
    const secondAppend = await harness.store.appendReview({ event: second });
    if (!secondAppend.ok) throw new Error(secondAppend.failure.safeMessage);
    const stale = createReviewEvent(
      eventInput('rev_01990f64-0000-7000-8000-000000000073', first.id),
      first,
    );
    const staleAppend = await harness.store.appendReview({ event: stale });
    if (staleAppend.ok || staleAppend.failure.kind !== 'conflict') {
      throw new Error('Stale review supersession was accepted.');
    }
    const state = {
      id: contentHash(`sha256:${'a'.repeat(64)}`),
      workspaceId: first.workspaceId,
      suppressionRuleId: suppression.id,
      occurredAt: instant('2026-08-28T20:02:00.000Z'),
      actorId: 'reviewer-a',
      state: 'revoked' as const,
      reason: 'Evidence changed during review.',
    };
    const stateAppend = await harness.store.appendSuppressionState(state);
    if (!stateAppend.ok) throw new Error(stateAppend.failure.safeMessage);
    const states = await harness.store.listSuppressionStateEvents(first.workspaceId);
    if (!states.ok || states.value[0]?.id !== state.id) {
      throw new Error('Suppression audit event was not retained.');
    }
    const producer = repositoryStableId(`local:sha256:${'b'.repeat(64)}`);
    const consumer = repositoryStableId(`local:sha256:${'c'.repeat(64)}`);
    const caseValue = createImpactCase({
      subset: 'historical',
      organizationId: 'org-opaque',
      repositoryFamilyId: 'family-opaque',
      teamId: 'team-opaque',
      eligiblePullRequestId: 'pr-1',
      producerRepositoryId: producer,
      producerBaseSha: commitSha('a'.repeat(40)),
      producerHeadSha: commitSha('b'.repeat(40)),
      pullRequestOpenedAt: instant('2026-08-28T20:00:00.000Z'),
      consumerRepositoryId: consumer,
      consumerShaAsOfPullRequestOpen: commitSha('c'.repeat(40)),
      consumerSnapshotObservedAt: instant('2026-08-28T19:59:00.000Z'),
      producerGenerationId: first.versions.producerGenerationId,
      consumerGenerationId: first.versions.consumerGenerationId,
      stableConsumerReferenceId: stableReferenceId(`ref_sha256:${'f'.repeat(64)}`),
      contractKind: 'typescript_symbol',
      canonicalContractKey: 'typescript:npm#api#.#value#x',
      changeKind: 'removed_export',
      stratum: {
        key: first.versions.evidenceStratum,
        contractKind: 'typescript_symbol',
        producerLanguageTier: 'typescript',
        consumerLanguageTier: 'typescript',
        producerExtractor: { id: adapterId('reverb.typescript'), version: '0.1.0' },
        consumerExtractor: { id: adapterId('reverb.typescript'), version: '0.1.0' },
        identityVersion: 1,
        joinStrategy: 'exact',
        evidenceComposition: ['definition', 'reference'],
        coverageCompletenessClass: 'complete',
      },
      adapterVersions: { 'reverb.typescript': '0.1.0' },
      identityFunctionVersion: '1.0.0',
      registryRevision: first.versions.registryRevision,
      policyRevision: first.versions.policyRevision,
      evidence: [],
      coverage: [],
      detectorOutput: 'candidate',
      analysisOutcome: 'completed',
      detectorClaims: { impact: 'breaking', action: 'coordinate' },
      policySelected: true,
      suppressed: false,
      requiredForEvaluation: true,
      labels: first.labels,
      labelerProvenance: {
        reviewerIds: ['reviewer-a', 'reviewer-b'],
        independentlyLabeled: true,
        blindedToMethod: true,
        blindedToBand: true,
        handbookVersion: '1.0.0',
        detectorAuthorConflicts: [],
        adjudicatedAt: first.occurredAt,
      },
      sampling: {
        frameSource: 'provider_metadata',
        inclusionProbability: 1,
        samplingWeight: 1,
        seed: 'conformance',
      },
      releaseability: 'private_aggregate_only',
      evaluationConsent: true,
      researchConsent: false,
      analysisLatencyMs: 1_000,
      costMicrounits: 1,
      confidentialityDefects: 0,
      removalCoverageDefect: false,
      remedyAvailable: true,
    });
    const manifest = createCorpusManifest({
      createdAt: first.occurredAt,
      handbookVersion: '1.0.0',
      frameSource: 'provider_metadata',
      populationHash: contentHash(`sha256:${'d'.repeat(64)}`),
      eligiblePopulationCount: 1,
      cases: [caseValue],
    });
    const corpusWrite = await harness.store.putCorpus(manifest, [caseValue]);
    if (!corpusWrite.ok) throw new Error(corpusWrite.failure.safeMessage);
    const corpusRead = await harness.store.getCorpus(manifest.revision);
    if (!corpusRead.ok || corpusRead.value.cases[0]?.outputHash !== caseValue.outputHash) {
      throw new Error('Frozen corpus was not retained.');
    }
    const report = evaluateCorpus({
      corpusRevision: manifest.revision,
      generatedAt: first.occurredAt,
      cases: [caseValue],
    });
    const reportWrite = await harness.store.putEvaluationReport(report);
    if (!reportWrite.ok) throw new Error(reportWrite.failure.safeMessage);
    const reportRead = await harness.store.getEvaluationReport(report.outputHash);
    if (!reportRead.ok || reportRead.value.outputHash !== report.outputHash) {
      throw new Error('Evaluation report was not retained.');
    }
    const baseline = {
      revision: policyRevision(`pol_sha256:${'e'.repeat(64)}`),
      allowedStrata: [] as string[],
      allowedImpactClaims: ['breaking'] as const,
      respectFrozenSuppressions: true,
      maximumAlertsPerThousand: 50,
    };
    const simulation = simulateFrozenPolicy({
      corpusRevision: manifest.revision,
      cases: [caseValue],
      baseline,
      candidate: {
        ...baseline,
        revision: first.versions.policyRevision,
        allowedStrata: [first.versions.evidenceStratum],
      },
    });
    const promotion = decidePromotion({
      evidence: {
        stratumKey: first.versions.evidenceStratum,
        corpusRevision: manifest.revision,
        evaluationReportHash: report.outputHash,
        simulatorResultHash: simulation.resultHash,
        metrics: simulation.candidate.metrics,
        confidentialityDefects: 0,
        removalCoverageDefects: 0,
        deliveriesWithoutRemedy: 0,
        versions: {
          producerExtractorId: 'reverb.typescript',
          producerExtractorVersion: '0.1.0',
          consumerExtractorId: 'reverb.typescript',
          consumerExtractorVersion: '0.1.0',
          identityVersion: 1,
          joinStrategy: 'exact',
          evidenceComposition: ['definition', 'reference'],
          policyRevision: first.versions.policyRevision,
        },
        evaluationWindow: { startedAt: first.occurredAt, endedAt: first.occurredAt },
      },
      decidedAt: first.occurredAt,
      decidedBy: 'workspace-admin',
    });
    const promotionWrite = await harness.store.appendPromotion(promotion);
    if (!promotionWrite.ok) throw new Error(promotionWrite.failure.safeMessage);
    const promotions = await harness.store.listPromotions(promotion.stratumKey);
    if (!promotions.ok || promotions.value[0]?.state !== 'PREVIEW') {
      throw new Error('Promotion audit record was not retained.');
    }
  } finally {
    await harness.close();
  }
}
