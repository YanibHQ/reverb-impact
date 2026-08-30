import {
  adapterId,
  adjudicateLabels,
  applySuppressions,
  auditSuppressions,
  clopperPearsonOneSidedLower95,
  commitSha,
  contentHash,
  createImpactCase,
  createReviewEvent,
  createSuppressionRule,
  decidePromotion,
  evaluateCorpus,
  executableReplayImpactLabel,
  findingFingerprint,
  findingOccurrenceId,
  generationId,
  importMutationCases,
  instant,
  policyRevision,
  registryRevision,
  reportLabelAgreement,
  repositoryStableId,
  reviewEventId,
  sampleImpactPopulation,
  simulateFrozenPolicy,
  stableReferenceId,
  summarizeBinomial,
  workspaceId,
  type ImpactCase,
  type ImpactCaseDraft,
  type IndependentLabelSubmission,
  type PromotionEvidence,
  type ReviewEvent,
  type SuppressionCandidateContext,
  type SuppressionVersionContext,
} from '../src/index.js';
import { describe, expect, it } from 'vitest';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000001');
const producer = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
const consumer = repositoryStableId(`local:sha256:${'2'.repeat(64)}`);
const producerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000001');
const consumerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000002');
const registry = registryRevision(`reg_sha256:${'3'.repeat(64)}`);
const policy = policyRevision(`pol_sha256:${'4'.repeat(64)}`);
const occurrence = findingOccurrenceId(`occ_sha256:${'5'.repeat(64)}`);
const fingerprint = findingFingerprint(`fnd_sha256:${'6'.repeat(64)}`);
const reference = stableReferenceId(`ref_sha256:${'7'.repeat(64)}`);
const typescript = adapterId('reverb.typescript');
const now = instant('2026-08-28T20:00:00.000Z');

const labels = {
  edge: 'confirmed' as const,
  impact: 'breaking' as const,
  action: 'coordinate' as const,
};

function submission(
  reviewerId: string,
  submittedLabels = labels,
  caseId = `cas_sha256:${'8'.repeat(64)}` as IndependentLabelSubmission['caseId'],
): IndependentLabelSubmission {
  return {
    caseId,
    reviewerId,
    domainCapability: 'TypeScript package ownership',
    submittedAt: now,
    labels: submittedLabels,
    blindedToMethod: true,
    blindedToBand: true,
    detectorAuthorConflict: false,
    reviewerKind: 'human',
  };
}

function caseDraft(overrides: Partial<ImpactCaseDraft> = {}): ImpactCaseDraft {
  return {
    subset: 'historical',
    organizationId: 'org-opaque-1',
    repositoryFamilyId: 'family-1',
    teamId: 'team-1',
    eligiblePullRequestId: 'pr-1',
    producerRepositoryId: producer,
    producerBaseSha: commitSha('a'.repeat(40)),
    producerHeadSha: commitSha('b'.repeat(40)),
    pullRequestOpenedAt: instant('2026-08-28T20:00:00.000Z'),
    consumerRepositoryId: consumer,
    consumerShaAsOfPullRequestOpen: commitSha('c'.repeat(40)),
    consumerSnapshotObservedAt: instant('2026-08-28T19:59:00.000Z'),
    producerGenerationId: producerGeneration,
    consumerGenerationId: consumerGeneration,
    stableConsumerReferenceId: reference,
    contractKind: 'typescript_symbol',
    canonicalContractKey: 'typescript:npm#api#.#value#x',
    changeKind: 'removed_export',
    stratum: {
      key: 'typescript|typescript|exact|v1',
      contractKind: 'typescript_symbol',
      producerLanguageTier: 'typescript-compiler-api',
      consumerLanguageTier: 'typescript-compiler-api',
      producerExtractor: { id: typescript, version: '0.1.0' },
      consumerExtractor: { id: typescript, version: '0.1.0' },
      identityVersion: 1,
      joinStrategy: 'exact',
      evidenceComposition: ['producer_definition', 'consumer_reference'],
      coverageCompletenessClass: 'complete',
    },
    adapterVersions: { 'reverb.typescript': '0.1.0' },
    identityFunctionVersion: '1.0.0',
    registryRevision: registry,
    policyRevision: policy,
    evidence: [{ kind: 'structural' }],
    coverage: [{ state: 'complete' }],
    detectorOutput: 'candidate',
    analysisOutcome: 'completed',
    detectorClaims: { impact: 'breaking', action: 'coordinate' },
    policySelected: true,
    suppressed: false,
    requiredForEvaluation: true,
    labels,
    labelerProvenance: {
      reviewerIds: ['reviewer-a', 'reviewer-b'],
      independentlyLabeled: true,
      blindedToMethod: true,
      blindedToBand: true,
      handbookVersion: '1.0.0',
      detectorAuthorConflicts: [],
      adjudicatedAt: now,
    },
    releaseability: 'private_aggregate_only',
    evaluationConsent: true,
    researchConsent: false,
    analysisLatencyMs: 12_000,
    costMicrounits: 3,
    confidentialityDefects: 0,
    removalCoverageDefect: false,
    remedyAvailable: true,
    ...overrides,
  };
}

function materialize(draft = caseDraft(), probability = 1): ImpactCase {
  return createImpactCase({
    ...draft,
    sampling: {
      frameSource: 'provider_metadata',
      inclusionProbability: probability,
      samplingWeight: 1 / probability,
      seed: 'phase-004-test',
    },
  });
}

describe('Phase 004 review ontology', () => {
  function reviewInput(id: string, supersedes?: ReviewEvent['id']) {
    return {
      id: reviewEventId(id),
      workspaceId: workspace,
      findingOccurrenceId: occurrence,
      findingFingerprint: fingerprint,
      actor: {
        id: 'reviewer-a',
        role: 'reviewer' as const,
        domainCapability: 'TypeScript package ownership',
        detectorAuthorConflict: false,
      },
      authorization: {
        revision: registry,
        authorizedAt: now,
        permission: 'finding.review' as const,
      },
      occurredAt: now,
      versions: {
        producerGenerationId: producerGeneration,
        consumerGenerationId: consumerGeneration,
        adapters: [{ id: typescript, version: '0.1.0', identityVersion: 1 }],
        evidenceStratum: 'typescript|typescript|exact|v1',
        policyRevision: policy,
        registryRevision: registry,
      },
      labels,
      reason: 'coordination_required' as const,
      noteHash: contentHash(`sha256:${'9'.repeat(64)}`),
      ...(supersedes === undefined ? {} : { supersedes }),
    };
  }

  it('appends multi-axis versioned events and supersedes only the same occurrence', () => {
    const first = createReviewEvent(reviewInput('rev_01990f64-0000-7000-8000-000000000001'));
    const second = createReviewEvent(
      reviewInput('rev_01990f64-0000-7000-8000-000000000002', first.id),
      first,
    );
    expect(second.supersedes).toBe(first.id);
    expect(second.outputHash).not.toBe(first.outputHash);
    expect(() =>
      createReviewEvent(
        {
          ...reviewInput('rev_01990f64-0000-7000-8000-000000000003', first.id),
          findingFingerprint: findingFingerprint(`fnd_sha256:${'a'.repeat(64)}`),
        },
        first,
      ),
    ).toThrowError(/same immutable occurrence/);
  });
});

describe('Phase 004 suppression model', () => {
  const candidate: SuppressionCandidateContext = {
    workspaceId: workspace,
    occurrenceId: occurrence,
    fingerprint,
    producerRepositoryId: producer,
    consumerRepositoryId: consumer,
    contractKind: 'typescript_symbol',
    canonicalContractKey: 'typescript:npm#api#.#value#x',
    adapterId: typescript,
    adapterRuleIds: ['no-test-only'],
  };
  const shape = contentHash(`sha256:${'b'.repeat(64)}`);
  const versions: SuppressionVersionContext = {
    now,
    producerGenerations: { [producer]: producerGeneration },
    consumerGenerations: { [consumer]: consumerGeneration },
    referenceHashes: { [reference]: contentHash(`sha256:${'c'.repeat(64)}`) },
    contractShapeHashes: { 'typescript_symbol\0typescript:npm#api#.#value#x': shape },
    identityVersions: { [typescript]: 1 },
    adapterVersions: { [typescript]: '0.1.0' },
    evidenceStrata: ['typescript|typescript|exact|v1'],
    policyRevision: policy,
    registryRevision: registry,
  };

  it('authorizes increasing scopes and retains suppressed candidates for evaluation', () => {
    expect(() =>
      createSuppressionRule({
        workspaceId: workspace,
        matcher: { scope: 'workspace_rule', ruleId: 'no-test-only' },
        owner: { actorId: 'reviewer-a', role: 'reviewer', authorizationRevision: registry },
        justification: 'Reviewed test-only policy exception.',
        createdAt: instant('2026-08-27T20:00:00.000Z'),
        reviewAt: instant('2026-09-01T20:00:00.000Z'),
        expiresAt: instant('2026-10-01T20:00:00.000Z'),
        invalidationPredicates: [{ kind: 'policy_revision', revision: policy }],
      }),
    ).toThrowError(/workspace_admin/);

    const rule = createSuppressionRule({
      workspaceId: workspace,
      matcher: { scope: 'stable_finding', fingerprint },
      owner: { actorId: 'reviewer-a', role: 'reviewer', authorizationRevision: registry },
      justification: 'The downstream change is already coordinated.',
      createdAt: instant('2026-08-27T20:00:00.000Z'),
      reviewAt: instant('2026-09-01T20:00:00.000Z'),
      expiresAt: instant('2026-10-01T20:00:00.000Z'),
      invalidationPredicates: [
        { kind: 'producer_code', repositoryId: producer, generationId: producerGeneration },
        { kind: 'consumer_code', repositoryId: consumer, generationId: consumerGeneration },
        {
          kind: 'consumer_reference',
          stableReferenceId: reference,
          contentHash: versions.referenceHashes[reference]!,
        },
        {
          kind: 'contract_shape',
          contractKind: 'typescript_symbol',
          canonicalContractKey: candidate.canonicalContractKey,
          shapeHash: shape,
        },
        { kind: 'identity_version', adapterId: typescript, identityVersion: 1 },
        { kind: 'adapter_version', adapterId: typescript, adapterVersion: '0.1.0' },
        { kind: 'evidence_stratum', stratumKey: 'typescript|typescript|exact|v1' },
        { kind: 'policy_revision', revision: policy },
        { kind: 'registry_revision', revision: registry },
      ],
    });
    const applied = applySuppressions({ candidates: [candidate], versions, rules: [rule] });
    expect(applied).toHaveLength(1);
    expect(applied[0]!.decision).toMatchObject({ suppressed: true, ruleId: rule.id });
    expect(
      applySuppressions({
        candidates: [candidate],
        versions: { ...versions, referenceHashes: {} },
        rules: [rule],
      })[0]!.decision.suppressed,
    ).toBe(false);
    const invalidatedVersions: SuppressionVersionContext[] = [
      { ...versions, producerGenerations: {} },
      { ...versions, consumerGenerations: {} },
      { ...versions, referenceHashes: {} },
      { ...versions, contractShapeHashes: {} },
      { ...versions, identityVersions: { [typescript]: 2 } },
      { ...versions, adapterVersions: { [typescript]: '0.2.0' } },
      { ...versions, evidenceStrata: [] },
      { ...versions, policyRevision: policyRevision(`pol_sha256:${'d'.repeat(64)}`) },
      {
        ...versions,
        registryRevision: registryRevision(`reg_sha256:${'e'.repeat(64)}`),
      },
    ];
    expect(
      invalidatedVersions.every(
        (changed) =>
          applySuppressions({ candidates: [candidate], versions: changed, rules: [rule] })[0]!
            .decision.suppressed === false,
      ),
    ).toBe(true);
  });

  it('matches each of the six authorized scopes exactly', () => {
    const matchers = [
      { scope: 'occurrence' as const, occurrenceId: occurrence },
      { scope: 'stable_finding' as const, fingerprint },
      {
        scope: 'contract_consumer' as const,
        contractKind: 'typescript_symbol' as const,
        canonicalContractKey: candidate.canonicalContractKey,
        consumerRepositoryId: consumer,
      },
      {
        scope: 'repository_pair_kind' as const,
        producerRepositoryId: producer,
        consumerRepositoryId: consumer,
        contractKind: 'typescript_symbol' as const,
      },
      { scope: 'adapter_rule' as const, adapterId: typescript, ruleId: 'no-test-only' },
      { scope: 'workspace_rule' as const, ruleId: 'no-test-only' },
    ];
    matchers.forEach((matcher, index) => {
      const rule = createSuppressionRule({
        workspaceId: workspace,
        matcher,
        owner: { actorId: 'admin', role: 'workspace_admin', authorizationRevision: registry },
        justification: `Authorized exact scope fixture ${index}.`,
        createdAt: instant(`2026-08-27T20:00:0${index}.000Z`),
        reviewAt: instant('2026-09-01T20:00:00.000Z'),
        expiresAt: instant('2026-10-01T20:00:00.000Z'),
        invalidationPredicates: [{ kind: 'policy_revision', revision: policy }],
      });
      expect(
        applySuppressions({ candidates: [candidate], versions, rules: [rule] })[0]!.decision
          .suppressed,
      ).toBe(true);
    });
  });

  it('audits broad rules without cross-workspace poisoning', () => {
    const broad = createSuppressionRule({
      workspaceId: workspace,
      matcher: { scope: 'workspace_rule', ruleId: 'no-test-only' },
      owner: { actorId: 'admin', role: 'workspace_admin', authorizationRevision: registry },
      justification: 'Temporary workspace-wide migration exception.',
      createdAt: instant('2026-08-27T20:00:00.000Z'),
      reviewAt: instant('2026-09-01T20:00:00.000Z'),
      expiresAt: instant('2026-10-01T20:00:00.000Z'),
      invalidationPredicates: [{ kind: 'registry_revision', revision: registry }],
    });
    expect(auditSuppressions([broad], versions).anomalies[0]?.code).toBe('workspace_rule_active');
    expect(
      applySuppressions({
        candidates: [
          {
            ...candidate,
            workspaceId: workspaceId('wsp_01990f64-0000-7000-8000-000000000099'),
          },
        ],
        versions,
        rules: [broad],
      })[0]!.decision.suppressed,
    ).toBe(false);
  });
});

describe('Phase 004 corpus and labels', () => {
  it('samples all findings plus deterministic no-findings with inverse weights', () => {
    const population = [
      caseDraft(),
      caseDraft({
        eligiblePullRequestId: 'pr-2',
        detectorOutput: 'no_candidate',
        policySelected: false,
      }),
      caseDraft({
        eligiblePullRequestId: 'pr-3',
        detectorOutput: 'no_candidate',
        policySelected: false,
      }),
    ];
    const first = sampleImpactPopulation({
      population,
      noFindingProbability: 0.5,
      seed: 'fixed',
      frameSource: 'provider_metadata',
    });
    const second = sampleImpactPopulation({
      population,
      noFindingProbability: 0.5,
      seed: 'fixed',
      frameSource: 'provider_metadata',
    });
    expect(first.map((value) => value.outputHash)).toEqual(second.map((value) => value.outputHash));
    expect(first.some((value) => value.detectorOutput === 'candidate')).toBe(true);
    expect(
      first
        .filter((value) => value.detectorOutput === 'no_candidate')
        .every((value) => value.sampling.samplingWeight === 2),
    ).toBe(true);
  });

  it('rejects future consumer leakage and preserves mutation/executable semantics', () => {
    expect(() =>
      materialize(caseDraft({ consumerSnapshotObservedAt: instant('2026-08-28T20:01:00.000Z') })),
    ).toThrowError(/future downstream fix/);
    const mutation = materialize(caseDraft({ subset: 'mutation' }));
    expect(importMutationCases([mutation])).toEqual([mutation]);
    expect(
      executableReplayImpactLabel({
        caseId: mutation.id,
        commandHash: contentHash(`sha256:${'d'.repeat(64)}`),
        containerHash: contentHash(`sha256:${'e'.repeat(64)}`),
        toolchainHash: contentHash(`sha256:${'f'.repeat(64)}`),
        substitution: 'workspace package override',
        phase: 'setup',
        outcome: 'unrelated_failure',
        exercisedScope: '',
      }),
    ).toBe('indeterminate');
  });

  it('requires two independent humans and a third adjudicator on conflict', () => {
    const caseId = materialize().id;
    const first = submission('reviewer-a', labels, caseId);
    const conflicting = submission(
      'reviewer-b',
      { edge: 'absent', impact: 'compatible', action: 'no_action' },
      caseId,
    );
    expect(() =>
      adjudicateLabels({ caseId, primary: [first, conflicting], handbookVersion: '1.0.0' }),
    ).toThrowError(/third human adjudicator/);
    const result = adjudicateLabels({
      caseId,
      primary: [first, conflicting],
      adjudicator: submission('reviewer-c', labels, caseId),
      handbookVersion: '1.0.0',
    });
    expect(result.labels).toEqual(labels);
    expect(result.provenance.adjudicatorId).toBe('reviewer-c');
  });

  it('rejects detector authors as the sole final labeling authority', () => {
    const caseId = materialize().id;
    const conflicted = (reviewerId: string): IndependentLabelSubmission => ({
      ...submission(reviewerId, labels, caseId),
      detectorAuthorConflict: true,
    });
    expect(() =>
      adjudicateLabels({
        caseId,
        primary: [conflicted('detector-a'), conflicted('detector-b')],
        handbookVersion: '1.0.0',
      }),
    ).toThrowError(/sole final labeling authority/);
  });
});

describe('Phase 004 evaluation and policy', () => {
  it('computes the preregistered one-sided bounds and excludes mutation from precision', () => {
    const summary = summarizeBinomial(95, 100);
    expect(summary.wilsonOneSidedLower95).toBeCloseTo(0.9008, 4);
    expect(summary.clopperPearsonOneSidedLower95).toBeCloseTo(0.8977, 4);
    expect(clopperPearsonOneSidedLower95(29, 29)).toBeCloseTo(0.9019, 4);
    const real = materialize();
    const mutation = materialize(
      caseDraft({
        subset: 'mutation',
        labels: { edge: 'absent', impact: 'compatible', action: 'no_action' },
      }),
    );
    const report = evaluateCorpus({
      corpusRevision: contentHash(`sha256:${'0'.repeat(64)}`),
      generatedAt: now,
      cases: [real, mutation],
    });
    expect(report.realWorld.edgePrecision).toMatchObject({ successes: 1, total: 1 });
    expect(report.mutationCapability.edgePrecision).toMatchObject({ successes: 0, total: 1 });
  });

  it('fails rather than silently skipping a required unlabelled case', () => {
    const unlabelledDraft = { ...caseDraft() };
    Reflect.deleteProperty(unlabelledDraft, 'labels');
    Reflect.deleteProperty(unlabelledDraft, 'labelerProvenance');
    const unlabelled = materialize(unlabelledDraft);
    expect(() =>
      evaluateCorpus({
        corpusRevision: contentHash(`sha256:${'0'.repeat(64)}`),
        generatedAt: now,
        cases: [unlabelled],
      }),
    ).toThrowError(/required unlabelled/);
  });

  it('reports three-axis agreement and retains indeterminate disagreements', () => {
    const caseId = materialize().id;
    const report = reportLabelAgreement([
      submission('a', labels, caseId),
      submission('b', { ...labels, impact: 'indeterminate' }, caseId),
    ]);
    expect(report.edge.rawAgreement.estimate).toBe(1);
    expect(report.impact.confusion.breaking?.indeterminate).toBe(1);
  });

  it('replays frozen policies deterministically and promotes only a passing measured stratum', () => {
    const positives = Array.from({ length: 100 }, (_, index) =>
      materialize(caseDraft({ eligiblePullRequestId: `positive-${index}` })),
    );
    const negatives = Array.from({ length: 1900 }, (_, index) =>
      materialize(
        caseDraft({
          eligiblePullRequestId: `negative-${index}`,
          detectorOutput: 'no_candidate',
          detectorClaims: { impact: 'compatible', action: 'none' },
          policySelected: false,
          labels: { edge: 'absent', impact: 'compatible', action: 'no_action' },
        }),
      ),
    );
    const cases = [...positives, ...negatives];
    const corpusRevision = contentHash(`sha256:${'1'.repeat(64)}`);
    const baselinePolicy = {
      revision: policyRevision(`pol_sha256:${'2'.repeat(64)}`),
      allowedStrata: [] as string[],
      allowedImpactClaims: ['breaking'] as const,
      respectFrozenSuppressions: true,
      maximumAlertsPerThousand: 50,
    };
    const candidatePolicy = {
      ...baselinePolicy,
      revision: policy,
      allowedStrata: [caseDraft().stratum.key],
    };
    const first = simulateFrozenPolicy({
      corpusRevision,
      cases,
      baseline: baselinePolicy,
      candidate: candidatePolicy,
    });
    const second = simulateFrozenPolicy({
      corpusRevision,
      cases,
      baseline: baselinePolicy,
      candidate: candidatePolicy,
    });
    expect(first.resultHash).toBe(second.resultHash);
    expect(first.candidate.metrics.alertedPullRequestsPerThousand).toBe(50);
    const evidence: PromotionEvidence = {
      stratumKey: caseDraft().stratum.key,
      corpusRevision,
      evaluationReportHash: contentHash(`sha256:${'3'.repeat(64)}`),
      simulatorResultHash: first.resultHash,
      metrics: first.candidate.metrics,
      confidentialityDefects: 0,
      removalCoverageDefects: 0,
      deliveriesWithoutRemedy: 0,
      versions: {
        producerExtractorId: typescript,
        producerExtractorVersion: '0.1.0',
        consumerExtractorId: typescript,
        consumerExtractorVersion: '0.1.0',
        identityVersion: 1,
        joinStrategy: 'exact',
        evidenceComposition: ['producer_definition', 'consumer_reference'],
        policyRevision: policy,
      },
      evaluationWindow: { startedAt: instant('2026-08-01T00:00:00.000Z'), endedAt: now },
    };
    const promotion = decidePromotion({ evidence, decidedAt: now, decidedBy: 'workspace-admin' });
    expect(promotion.state).toBe('PROMOTED');
    const reset = decidePromotion({
      previous: promotion,
      evidence: { ...evidence, versions: { ...evidence.versions, identityVersion: 2 } },
      decidedAt: instant('2026-08-28T21:00:00.000Z'),
      decidedBy: 'workspace-admin',
    });
    expect(reset).toMatchObject({ state: 'UNMEASURED', decision: 'reset_unmeasured' });
    const demotion = decidePromotion({
      previous: promotion,
      evidence: {
        ...evidence,
        metrics: { ...evidence.metrics, alertedPullRequestsPerThousand: 51 },
      },
      decidedAt: instant('2026-08-28T22:00:00.000Z'),
      decidedBy: 'automatic-drift-monitor',
    });
    expect(demotion).toMatchObject({ state: 'DEMOTED', decision: 'demote' });
  });
});
