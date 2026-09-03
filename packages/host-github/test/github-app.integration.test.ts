import { createHmac } from 'node:crypto';

import {
  DEFAULT_ADVISORY_PROMOTION_GATE,
  adapterId,
  analysisId,
  commitSha,
  configRevision,
  contentHash,
  evidenceEdgeId,
  finalizeAnalysisResult,
  findingFingerprint,
  findingOccurrenceId,
  generationId,
  instant,
  policyRevision,
  planGitHubCheck,
  projectFindingDisclosure,
  promotionRecordId,
  registryRevision,
  repoPath,
  repositoryStableId,
  reviewEventId,
  stableReferenceId,
  treeHash,
  workspaceId,
} from '@yanib/reverb-domain';
import type {
  AnalysisResult,
  FindingOccurrence,
  PromotionRecord,
  RepositoryStableId,
} from '@yanib/reverb-domain';
import { describe, expect, it, vi } from 'vitest';

import {
  AllowlistedHostedTelemetry,
  AuthorizedReviewService,
  AuthenticatedFindingDetailService,
  DeliveryOwnershipRegistry,
  GITHUB_APP_MANIFEST,
  GitHubCheckWriter,
  GitHubExactRepositoryReader,
  GitHubAuthorization,
  GitHubWebhookReceiver,
  HostedOperationalControls,
  reconcileGitHubState,
  renderFindingDetailHtml,
  renderSafeCheckText,
  syncGitHubRepositorySelection,
  validateGitHubAppManifest,
  type ExactGitBackend,
  type GitHubChecksClient,
  type HostedTelemetryEvent,
  type WebhookReceiptStore,
} from '../src/index.js';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000201');
const producer = repositoryStableId('github:101');
const consumer = repositoryStableId('github:202');
const now = instant('2026-08-28T20:00:00.000Z');
const deadline = instant('2026-08-28T20:15:00.000Z');
const baseSha = commitSha('a'.repeat(40));
const headSha = commitSha('b'.repeat(40));
const consumerSha = commitSha('c'.repeat(40));
const policy = policyRevision(`pol_sha256:${'d'.repeat(64)}`);
const registry = registryRevision(`reg_sha256:${'e'.repeat(64)}`);
const fingerprint = findingFingerprint(`fnd_sha256:${'f'.repeat(64)}`);
const stratum = 'openapi|typescript|operation-id|v1';

function finding(): FindingOccurrence {
  const adapter = adapterId('reverb.openapi');
  const producerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000201');
  const consumerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000202');
  const cfg = configRevision(`cfg_sha256:${'1'.repeat(64)}`);
  const hash = contentHash(`sha256:${'2'.repeat(64)}`);
  return {
    id: findingOccurrenceId(`occ_sha256:${'3'.repeat(64)}`),
    analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000201'),
    fingerprint,
    state: 'PREVIEW',
    change: {
      workspaceId: workspace,
      producerRepositoryId: producer,
      baseGenerationId: producerGeneration,
      baseSha,
      headSha,
      contractKind: 'openapi_operation',
      canonicalKey: 'openapi:payments#POST /v1/refunds',
      changeKind: 'operation_removed',
      compatibility: 'breaking',
      activation: 'on_deploy',
      adapterId: adapter,
      adapterVersion: '0.1.0',
      identityVersion: 1,
      coverageState: 'complete',
      coverageDependencies: ['producer:openapi'],
      remedy: { kind: 'coordinate', text: 'Coordinate the consumer migration before deployment.' },
    },
    edge: {
      id: evidenceEdgeId(`edg_sha256:${'4'.repeat(64)}`),
      workspaceId: workspace,
      producerRepositoryId: producer,
      consumerRepositoryId: consumer,
      producerGenerationId: producerGeneration,
      consumerGenerationId: consumerGeneration,
      definitionKey: 'openapi:payments#POST /v1/refunds',
      stableReferenceId: stableReferenceId(`ref_sha256:${'5'.repeat(64)}`),
      contractKind: 'openapi_operation',
      basis: 'exact',
      primaryPath: {
        id: 'producer_definition.consumer_reference',
        steps: [
          { id: 'producer', required: true, basis: 'exact', sourceKey: 'definition' },
          { id: 'consumer', required: true, basis: 'exact', sourceKey: 'reference' },
        ],
      },
      stratumKey: stratum,
      registryRevision: registry,
      firstObservedAt: now,
      lastObservedAt: now,
      definition: {
        workspaceId: workspace,
        repositoryId: producer,
        generationId: producerGeneration,
        commitSha: baseSha,
        contractKind: 'openapi_operation',
        canonicalKey: 'openapi:payments#POST /v1/refunds',
        path: repoPath('openapi.yaml'),
        range: { startLine: 20, startColumn: 1, endLine: 20, endColumn: 20 },
        contentHash: hash,
        shapeHash: hash,
        adapterId: adapter,
        adapterVersion: '0.1.0',
        identityVersion: 1,
        configRevision: cfg,
        evidenceStratum: stratum,
      },
      reference: {
        workspaceId: workspace,
        repositoryId: consumer,
        generationId: consumerGeneration,
        commitSha: consumerSha,
        contractKind: 'openapi_operation',
        canonicalKey: 'openapi:payments#POST /v1/refunds',
        stableReferenceId: stableReferenceId(`ref_sha256:${'5'.repeat(64)}`),
        path: repoPath('src/client.ts'),
        range: { startLine: 9, startColumn: 1, endLine: 9, endColumn: 20 },
        contentHash: hash,
        adapterId: adapter,
        adapterVersion: '0.1.0',
        identityVersion: 1,
        configRevision: cfg,
        evidenceStratum: stratum,
        activation: 'on_deploy',
      },
    },
    consumer: {
      repositoryId: consumer,
      state: 'current',
      generationId: consumerGeneration,
      commitSha: consumerSha,
      selectedAt: now,
      freshnessAgeMs: 0,
      coverageState: 'complete',
    },
    claims: { edge: 'candidate', impact: 'breaking', action: 'coordinate' },
    coverageDependencies: ['producer:openapi', 'consumer:current'],
    remedy: { kind: 'coordinate', text: 'Coordinate the consumer migration before deployment.' },
    delivery: { decision: 'preview_only', reason: 'stratum_unmeasured' },
  };
}

function analysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  const value = finding();
  return finalizeAnalysisResult({
    schema: 'reverb.analysis-result',
    schemaVersion: '1.0',
    analysisId: value.analysisId,
    workspaceId: workspace,
    producerRepositoryId: producer,
    pullRequest: { provider: 'github', number: 7, baseSha, headSha },
    registryRevision: registry,
    policyRevision: policy,
    policyMajor: 1,
    state: 'complete',
    current: true,
    consumers: [value.consumer],
    findings: [value],
    abstentions: [],
    startedAt: now,
    completedAt: now,
    ...overrides,
  });
}

function promoted(): PromotionRecord {
  return {
    schema: 'reverb.promotion-record',
    schemaVersion: '1.0',
    id: promotionRecordId(`pro_sha256:${'6'.repeat(64)}`),
    stratumKey: stratum,
    state: 'PROMOTED',
    previousState: 'PREVIEW',
    decision: 'promote',
    reasons: [],
    gate: DEFAULT_ADVISORY_PROMOTION_GATE,
    evidence: {
      stratumKey: stratum,
      corpusRevision: contentHash(`sha256:${'7'.repeat(64)}`),
      evaluationReportHash: contentHash(`sha256:${'8'.repeat(64)}`),
      simulatorResultHash: contentHash(`sha256:${'9'.repeat(64)}`),
      metrics: {
        actionablePrecision: { wilsonOneSidedLower95: 0.91 },
        edgePrecision: { wilsonOneSidedLower95: 0.96 },
      },
      versions: {
        producerExtractorId: 'reverb.openapi',
        producerExtractorVersion: '0.1.0',
        consumerExtractorId: 'reverb.openapi',
        consumerExtractorVersion: '0.1.0',
        identityVersion: 1,
        joinStrategy: 'exact',
        evidenceComposition: ['producer_definition', 'consumer_reference'],
        policyRevision: policy,
      },
    },
    decidedAt: now,
    decidedBy: 'test-admin',
    outputHash: contentHash(`sha256:${'0'.repeat(64)}`),
  } as unknown as PromotionRecord;
}

function staticDisclosure(wholeAudience: boolean) {
  return projectFindingDisclosure({
    workspaceId: workspace,
    destinationRepositoryId: producer,
    audience: 'static',
    registryRevision: registry,
    facts: [
      {
        field: 'repository_identity',
        name: 'consumer_repository',
        value: 'private-consumer-canary',
        subjectRepositoryId: consumer,
        explicitGrant: true,
        appCanRead: true,
        wholeProducerAudienceCanRead: wholeAudience,
      },
    ],
  });
}

describe('GitHub reference host integration', () => {
  it('uses only the minimum app permissions', () => {
    expect(() => validateGitHubAppManifest()).not.toThrow();
    expect(GITHUB_APP_MANIFEST.default_permissions).toEqual({
      metadata: 'read',
      contents: 'read',
      pull_requests: 'read',
      checks: 'write',
    });
  });

  it('allows exactly one owner for an installation/repository/check key', () => {
    const ownership = new DeliveryOwnershipRegistry();
    const key = {
      installationId: 44,
      repositoryExternalId: 101,
      checkName: 'Reverb Impact',
    };
    ownership.claim({ ...key, owner: 'reverb-reference-host' });
    ownership.claim({ ...key, owner: 'reverb-reference-host' });
    expect(ownership.owner(key)).toBe('reverb-reference-host');
    expect(() => ownership.claim({ ...key, owner: 'another-host' })).toThrow(
      /duplicate writers are forbidden/,
    );
  });

  it('validates the exact raw webhook before parsing and deduplicates delivery IDs', async () => {
    const stored = new Set<string>();
    const entries: unknown[] = [];
    const store: WebhookReceiptStore = {
      async receiveWebhook(entry) {
        entries.push(entry);
        const key = `${entry.workspaceId}:${entry.installationId}:${entry.deliveryId}`;
        if (stored.has(key)) return false;
        stored.add(key);
        return true;
      },
    };
    const secret = 'webhook-secret';
    const raw = Buffer.from(
      JSON.stringify({
        action: 'synchronize',
        installation: { id: 44 },
        repository: { id: 101 },
        number: 7,
        pull_request: {
          base: { sha: baseSha },
          head: { sha: headSha, repo: { fork: true } },
        },
      }),
    );
    const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    const receiver = new GitHubWebhookReceiver({ store, secret });
    const request = {
      workspaceId: workspace,
      rawBody: raw,
      signatureHeader: signature,
      deliveryId: 'delivery-7',
      eventType: 'pull_request',
      receivedAt: now,
    } as const;
    await expect(receiver.receive(request)).resolves.toMatchObject({
      status: 202,
      accepted: true,
      duplicate: false,
    });
    await expect(receiver.receive(request)).resolves.toMatchObject({
      accepted: false,
      duplicate: true,
    });
    await expect(
      receiver.receive({ ...request, signatureHeader: `sha256:${'0'.repeat(64)}` }),
    ).rejects.toThrow(/signature/);
    expect(JSON.stringify(entries)).not.toContain(secret);
    expect(entries).toEqual([
      expect.objectContaining({ pointer: expect.objectContaining({ fork: true, headSha }) }),
      expect.anything(),
    ]);
  });

  it('requires separate org-wide opt-in and materializes every distinct permission action', () => {
    const repository = {
      id: 101,
      name: 'producer',
      defaultBranch: 'main',
      selected: true,
      visibility: 'private' as const,
      collections: ['payments'],
      grants: { 'source.read': 'allow' as const, 'consumer.write': 'allow' as const },
    };
    expect(() =>
      syncGitHubRepositorySelection({
        workspaceId: workspace,
        repositories: [repository],
        repositorySelection: 'all',
        organizationWideOptIn: false,
        installationId: 44,
        createdAt: now,
        actor: 'admin',
        consentRevision: 'consent-1',
      }),
    ).toThrow(/separate explicit opt-in/);
    const snapshot = syncGitHubRepositorySelection({
      workspaceId: workspace,
      repositories: [repository],
      repositorySelection: 'selected',
      organizationWideOptIn: false,
      installationId: 44,
      createdAt: now,
      actor: 'admin',
      consentRevision: 'consent-1',
    });
    expect(snapshot.consents).toHaveLength(10);
    expect(snapshot.consents.find((value) => value.action === 'consumer.write')?.decision).toBe(
      'deny',
    );
    const previousWithService = {
      ...snapshot,
      services: [
        {
          id: 'payments',
          repositoryId: producer,
          rootPath: repoPath('services/payments'),
          environment: 'production',
          owner: 'payments',
          validFrom: now,
        },
      ],
      aliases: [
        {
          serviceId: 'payments',
          kind: 'base_token' as const,
          value: 'payments',
          environment: 'production',
          provenance: 'operator' as const,
          source: 'test',
          owner: 'payments',
          validFrom: now,
        },
      ],
    };
    const removed = syncGitHubRepositorySelection({
      workspaceId: workspace,
      previous: previousWithService,
      repositories: [{ ...repository, selected: false }],
      repositorySelection: 'selected',
      organizationWideOptIn: false,
      installationId: 44,
      createdAt: now,
      actor: 'admin',
      consentRevision: 'consent-2',
    });
    expect(removed.repositories).toEqual([]);
    expect(removed.services).toEqual([]);
    expect(removed.aliases).toEqual([]);
    expect(removed.extensions.repositoryVisibility).toEqual({});
    const reinstalled = syncGitHubRepositorySelection({
      workspaceId: workspace,
      previous: removed,
      repositories: [repository],
      repositorySelection: 'selected',
      organizationWideOptIn: false,
      installationId: 55,
      createdAt: now,
      actor: 'admin',
      consentRevision: 'consent-3',
    });
    expect(reinstalled.repositories[0]?.repositoryId).toBe(snapshot.repositories[0]?.repositoryId);
    expect(reinstalled.revision.sequence).toBe(3);
  });

  it('denies evidence use when the current provider read grant is gone', async () => {
    const snapshot = syncGitHubRepositorySelection({
      workspaceId: workspace,
      repositories: [
        {
          id: 101,
          name: 'producer',
          defaultBranch: 'main',
          selected: true,
          visibility: 'private',
          collections: ['payments'],
          grants: { 'evidence.consume': 'allow' },
        },
      ],
      repositorySelection: 'selected',
      organizationWideOptIn: false,
      installationId: 44,
      createdAt: now,
      actor: 'admin',
      consentRevision: 'consent-provider-revoked',
    });
    const authorization = new GitHubAuthorization(
      {
        async current() {
          return snapshot;
        },
      },
      {
        async current() {
          return {
            appCanRead: false,
            appCanWriteChecks: false,
            wholeAudienceSafeFields: [],
            viewerCanRead: false,
            authorizationRevision: 'provider-revoked',
          };
        },
      },
    );
    authorization.bindRepository(workspace, producer);

    await expect(
      authorization.authorizeRepositoryUse(
        { kind: 'user', id: 'admin' },
        'evidence.consume',
        producer,
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: { allowed: false, reason: 'current_provider_grant_denied' },
    });
  });

  it('omits private consumer canaries from static output but permits viewer-authorized detail', () => {
    const staticProjection = staticDisclosure(false);
    expect(staticProjection.allowed).toEqual({});
    expect(JSON.stringify(staticProjection)).not.toContain('private-consumer-canary');
    const personalized = projectFindingDisclosure({
      workspaceId: workspace,
      destinationRepositoryId: producer,
      audience: 'personalized',
      registryRevision: registry,
      facts: [
        {
          field: 'repository_identity',
          name: 'consumer_repository',
          value: 'private-consumer-canary',
          subjectRepositoryId: consumer,
          explicitGrant: true,
          appCanRead: true,
          wholeProducerAudienceCanRead: false,
          viewerCanRead: true,
        },
      ],
    });
    expect(personalized.allowed.consumer_repository).toBe('private-consumer-canary');
  });

  it.each([
    ['public producer/private consumer', false, false],
    ['private repositories with unequal ACLs', false, false],
    ['private repositories with proven equal audience', true, true],
  ])('applies the whole-audience matrix for %s', (_name, wholeAudience, expected) => {
    const projection = staticDisclosure(wholeAudience);
    expect('consumer_repository' in projection.allowed).toBe(expected);
  });

  it('uses exact Git operations with ephemeral read tokens and reconciles missed heads', async () => {
    const observedTokens: string[] = [];
    const backend: ExactGitBackend = {
      comparisonBasis: 'git_exact',
      async resolveRepository(_token, id) {
        return { id, displayName: 'producer', defaultBranch: 'main' };
      },
      async fetchExactCommit(token, repositoryId, ref) {
        observedTokens.push(token);
        return { repositoryId, sha: commitSha(ref), treeHash: treeHash(ref) };
      },
      async listExactTree(_token, repositoryId, sha) {
        return {
          repositoryId,
          commitSha: sha,
          treeHash: treeHash(sha),
          entries: [],
          complete: true,
          limitations: [],
        };
      },
      async readExactBlob() {
        throw new Error('unused');
      },
      async diffExactCommits(token, repositoryId, base, head) {
        observedTokens.push(token);
        return {
          repositoryId,
          baseSha: base,
          headSha: head,
          entries: [],
          complete: true,
          renameBasis: 'git_similarity',
          limitations: [],
          manifestHash: contentHash(`sha256:${'a'.repeat(64)}`),
        };
      },
    };
    const reader = new GitHubExactRepositoryReader({
      tokens: {
        async withReadToken(_input, operation) {
          return operation('read-token-canary');
        },
      },
      backend,
      installations: new Map<RepositoryStableId, number>([[producer, 44]]),
    });
    expect((await reader.resolveCommit(producer, headSha)).ok).toBe(true);
    expect((await reader.compare(producer, baseSha, headSha)).ok).toBe(true);
    expect(observedTokens).toEqual(['read-token-canary', 'read-token-canary']);
    expect(JSON.stringify(reader)).not.toContain('read-token-canary');
    expect(
      reconcileGitHubState(
        [
          {
            repositoryId: producer,
            selected: true,
            defaultBranchHead: headSha,
            openPullRequests: [{ number: 7, baseSha, headSha }],
          },
        ],
        [
          {
            repositoryId: producer,
            selected: true,
            defaultBranchHead: baseSha,
            pullRequestHeads: { 7: baseSha },
          },
        ],
      ).map((value) => value.kind),
    ).toEqual(['analyze_pull_request', 'index_default_branch']);
    expect(
      reconcileGitHubState(
        [],
        [
          {
            repositoryId: producer,
            selected: true,
            defaultBranchHead: headSha,
            pullRequestHeads: { 7: headSha },
          },
        ],
      ),
    ).toEqual([{ kind: 'purge_repository', repositoryId: producer }]);
  });

  it('stays shadow/no-write without a promotion and writes only the current advisory head', async () => {
    const controls = new HostedOperationalControls();
    const noPromotion = planGitHubCheck({
      analysis: analysis(),
      pullRequestNumber: 7,
      currentHeadSha: headSha,
      now,
      hardDeadlineAt: deadline,
      repositoryInScope: true,
      writeAuthorized: true,
      advisoryEnabled: false,
      writeKillSwitch: controls.snapshot().writeDisabled,
      enabledStrata: [stratum],
      currentStrata: [
        {
          stratumKey: stratum,
          versions: promoted().evidence.versions,
        },
      ],
      promotions: [],
      disclosures: { [fingerprint]: staticDisclosure(true) },
      producerChangedLocations: [],
      detailUrl: 'https://reverb.invalid/findings/opaque',
    });
    expect(noPromotion).toMatchObject({ mode: 'no_write', reason: 'write_kill_switch' });

    const promotion = promoted();
    controls.setDisabled('write', false);
    controls.enableAdvisory({
      workspaceId: workspace,
      repositoryId: producer,
      stratumKey: stratum,
      promotion,
    });
    const plan = planGitHubCheck({
      analysis: analysis(),
      pullRequestNumber: 7,
      currentHeadSha: headSha,
      now,
      hardDeadlineAt: deadline,
      repositoryInScope: true,
      writeAuthorized: true,
      advisoryEnabled: controls.isAdvisoryEnabled({
        workspaceId: workspace,
        repositoryId: producer,
        promotion,
      }),
      writeKillSwitch: controls.snapshot().writeDisabled,
      enabledStrata: [stratum],
      currentStrata: [{ stratumKey: stratum, versions: promotion.evidence.versions }],
      promotions: [promotion],
      disclosures: { [fingerprint]: staticDisclosure(true) },
      producerChangedLocations: [
        { fingerprint, path: 'openapi.yaml', startLine: 20, endLine: 20, exactChangedLines: [20] },
      ],
      detailUrl: 'https://reverb.invalid/findings/opaque',
    });
    expect(plan).toMatchObject({
      mode: 'write',
      projection: { conclusion: 'neutral', neverBlocking: true },
    });
    expect(renderSafeCheckText(plan)).toContain('never blocks merge');
    const calls: Parameters<GitHubChecksClient['upsertCheck']>[0][] = [];
    const client: GitHubChecksClient = {
      async upsertCheck(input) {
        calls.push(input);
        return { externalId: 'check-1' };
      },
    };
    const writer = new GitHubCheckWriter({
      controls,
      client,
      tokens: {
        async withWriteToken(_input, operation) {
          return operation('write-token-canary');
        },
      },
    });
    await expect(
      writer.write({
        installationId: 44,
        repositoryExternalId: 101,
        plan,
        reauthorize: async () => true,
        currentHead: async () => headSha,
      }),
    ).resolves.toMatchObject({ state: 'delivered', externalId: 'check-1', requests: 1 });
    expect(calls[0]?.annotations).toHaveLength(1);
    expect(calls[0]?.conclusion).toBe('neutral');
    expect(JSON.stringify(plan.projection)).not.toContain('read-token-canary');
    await expect(
      writer.write({
        installationId: 44,
        repositoryExternalId: 101,
        plan,
        reauthorize: async () => true,
        currentHead: async () => baseSha,
      }),
    ).resolves.toEqual({ state: 'superseded', requests: 0 });
    expect(calls).toHaveLength(1);
    controls.setDisabled('write', true);
    await expect(
      writer.write({
        installationId: 44,
        repositoryExternalId: 101,
        plan,
        reauthorize: async () => true,
        currentHead: async () => headSha,
      }),
    ).resolves.toEqual({ state: 'disabled', requests: 0 });
    controls.setDisabled('write', false);
    controls.applyPromotionDecision({
      workspaceId: workspace,
      repositoryId: producer,
      promotion: { ...promotion, state: 'DEMOTED', decision: 'demote' },
    });
    expect(
      controls.isAdvisoryEnabled({ workspaceId: workspace, repositoryId: producer, promotion }),
    ).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('completes neutral at the hard deadline and batches annotations under the provider limit', async () => {
    const promotion = promoted();
    const controls = new HostedOperationalControls();
    controls.setDisabled('write', false);
    controls.enableAdvisory({
      workspaceId: workspace,
      repositoryId: producer,
      stratumKey: stratum,
      promotion,
    });
    const findings = Array.from({ length: 55 }, (_, index) => {
      const digest = index.toString(16).padStart(64, '0');
      return {
        ...finding(),
        id: findingOccurrenceId(`occ_sha256:${digest}`),
        fingerprint: findingFingerprint(`fnd_sha256:${digest}`),
      };
    });
    const disclosures = Object.fromEntries(
      findings.map((value) => [value.fingerprint, staticDisclosure(true)]),
    );
    const plan = planGitHubCheck({
      analysis: analysis({ state: 'partial', findings }),
      pullRequestNumber: 7,
      currentHeadSha: headSha,
      now: deadline,
      hardDeadlineAt: deadline,
      repositoryInScope: true,
      writeAuthorized: true,
      advisoryEnabled: true,
      writeKillSwitch: false,
      enabledStrata: [stratum],
      currentStrata: [{ stratumKey: stratum, versions: promotion.evidence.versions }],
      promotions: [promotion],
      disclosures,
      producerChangedLocations: findings.map((value, index) => ({
        fingerprint: value.fingerprint,
        path: 'openapi.yaml',
        startLine: index + 1,
        endLine: index + 1,
        exactChangedLines: [index + 1],
      })),
      detailUrl: 'https://reverb.invalid/findings/opaque',
      maximumFindings: 100,
      maximumAnnotations: 100,
    });
    expect(plan.projection).toMatchObject({
      conclusion: 'neutral',
      findingTotal: 55,
      truncatedFindingCount: 0,
    });
    const batches: number[] = [];
    const writer = new GitHubCheckWriter({
      controls,
      tokens: {
        async withWriteToken(_input, operation) {
          return operation('write-token');
        },
      },
      client: {
        async upsertCheck(input) {
          batches.push(input.annotations.length);
          return { externalId: 'check-batched' };
        },
      },
    });
    await expect(
      writer.write({
        installationId: 44,
        repositoryExternalId: 101,
        plan,
        reauthorize: async () => true,
        currentHead: async () => headSha,
      }),
    ).resolves.toMatchObject({ state: 'delivered', requests: 2 });
    expect(batches).toEqual([50, 5]);
  });

  it('returns the same non-leaking response for missing and unauthorized finding detail', async () => {
    const evidence = {
      async findFinding() {
        return { ok: true as const, value: { analysis: analysis(), finding: finding() } };
      },
    };
    const authorization = {
      async authorizeRepositoryUse() {
        return {
          ok: true as const,
          value: { allowed: false, reason: 'denied', revision: registry },
        };
      },
      async projectDisclosure() {
        throw new Error('must not render after denied producer access');
      },
    };
    const service = new AuthenticatedFindingDetailService(
      evidence as never,
      authorization as never,
    );
    await expect(
      service.get({
        workspaceId: workspace,
        producerRepositoryId: producer,
        fingerprint,
        viewer: { kind: 'user', id: 'viewer' },
      }),
    ).resolves.toEqual({
      ok: false,
      failure: {
        kind: 'not_found',
        code: 'not_found',
        safeMessage: 'Resource not found.',
        retryable: false,
      },
    });
  });

  it('renders freshly authorized detail as keyboard-native, color-independent, escaped HTML', async () => {
    const authorization = {
      async authorizeRepositoryUse() {
        return {
          ok: true as const,
          value: { allowed: true, reason: 'current', revision: registry },
        };
      },
      async projectDisclosure() {
        return {
          ok: true as const,
          value: {
            allowedFields: ['repository_identity', 'contract_identity', 'location'],
            omittedFields: [],
            decisionHash: contentHash(`sha256:${'b'.repeat(64)}`),
            registryRevision: registry,
          },
        };
      },
    };
    const service = new AuthenticatedFindingDetailService(
      {
        async findFinding() {
          return { ok: true as const, value: { analysis: analysis(), finding: finding() } };
        },
      } as never,
      authorization as never,
    );
    const result = await service.get({
      workspaceId: workspace,
      producerRepositoryId: producer,
      fingerprint,
      viewer: { kind: 'user', id: 'viewer' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const html = renderFindingDetailHtml(
      {
        ...result.value,
        remedy: { ...result.value.remedy, text: '<script>source-canary</script>' },
      },
      '/v1/findings/opaque/reviews',
    );
    expect(html).toContain('<button type="submit">');
    expect(html).toContain('role="status"');
    expect(html).toContain('&lt;script&gt;source-canary&lt;/script&gt;');
    expect(html).not.toContain('<script>source-canary</script>');
  });

  it('reauthorizes before atomically appending a review', async () => {
    const currentFinding = finding();
    const appended = vi.fn(async () => ({ ok: true as const, value: undefined }));
    const evidence = {
      async findFinding() {
        return { ok: true as const, value: { analysis: analysis(), finding: currentFinding } };
      },
    };
    const reviews = {
      async listReviews() {
        return { ok: true as const, value: [] };
      },
      appendReview: appended,
    };
    const allowedAuthorization = {
      async authorizeRepositoryUse() {
        return {
          ok: true as const,
          value: { allowed: true, reason: 'current', revision: registry },
        };
      },
    };
    const review = {
      id: reviewEventId('rev_01990f64-0000-7000-8000-000000000201'),
      workspaceId: workspace,
      findingOccurrenceId: currentFinding.id,
      findingFingerprint: currentFinding.fingerprint,
      actor: {
        id: 'reviewer-a',
        role: 'reviewer' as const,
        domainCapability: 'OpenAPI ownership',
        detectorAuthorConflict: false,
      },
      authorization: {
        revision: registry,
        authorizedAt: now,
        permission: 'finding.review',
      },
      occurredAt: now,
      versions: {
        producerGenerationId: currentFinding.edge.producerGenerationId,
        consumerGenerationId: currentFinding.edge.consumerGenerationId,
        adapters: [
          {
            id: currentFinding.change.adapterId,
            version: currentFinding.change.adapterVersion,
            identityVersion: currentFinding.change.identityVersion,
          },
        ],
        evidenceStratum: currentFinding.edge.stratumKey,
        policyRevision: policy,
        registryRevision: registry,
      },
      labels: {
        edge: 'confirmed' as const,
        impact: 'breaking' as const,
        action: 'coordinate' as const,
      },
      reason: 'coordination_required' as const,
      noteHash: contentHash(`sha256:${'c'.repeat(64)}`),
    };
    const service = new AuthorizedReviewService(
      evidence as never,
      reviews as never,
      allowedAuthorization as never,
    );
    await expect(
      service.record({
        subject: { kind: 'user', id: 'reviewer-a' },
        producerRepositoryId: producer,
        review,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(appended).toHaveBeenCalledTimes(1);

    const denied = new AuthorizedReviewService(
      evidence as never,
      reviews as never,
      {
        async authorizeRepositoryUse() {
          return {
            ok: true as const,
            value: { allowed: false, reason: 'revoked', revision: registry },
          };
        },
      } as never,
    );
    await expect(
      denied.record({
        subject: { kind: 'user', id: 'reviewer-a' },
        producerRepositoryId: producer,
        review,
      }),
    ).resolves.toMatchObject({ ok: false, failure: { code: 'review_unauthorized' } });
    expect(appended).toHaveBeenCalledTimes(1);
  });

  it('rejects telemetry properties that could carry source canaries', () => {
    const sink = vi.fn();
    const telemetry = new AllowlistedHostedTelemetry(sink);
    telemetry.emit({
      type: 'delivery_projection',
      mode: 'shadow',
      conclusion: 'neutral',
      findingCount: 1,
      redactionCount: 1,
      durationMs: 10,
    });
    expect(() =>
      telemetry.emit({
        type: 'delivery_projection',
        mode: 'shadow',
        conclusion: 'neutral',
        findingCount: 1,
        redactionCount: 1,
        durationMs: 10,
        sourcePath: 'private/path/canary',
      } as unknown as HostedTelemetryEvent),
    ).toThrow(/forbidden property/);
    expect(sink).toHaveBeenCalledTimes(1);
  });
});
