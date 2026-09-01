import {
  activateServiceAliasSuggestion,
  adapterId,
  analysisId,
  applyCompleteReferenceObservation,
  commitSha,
  configRevision,
  contentHash,
  createFindingOccurrences,
  createRegistrySnapshot,
  createServiceAliasSuggestion,
  currentEvidenceEdges,
  declaredContextActiveAt,
  deriveStableReferenceId,
  deriveBoundedTransitiveCandidates,
  fingerprintFinding,
  generationId,
  instant,
  importDeclaredContext,
  joinChangedContracts,
  policyRevision,
  repoPath,
  repositoryStableId,
  resolveServiceAlias,
  workspaceId,
  type ConsumerGenerationSelection,
  type IndexedContractChange,
  type IndexedContractDefinition,
  type IndexedContractReference,
  type RegistrySnapshot,
} from '../src/index.js';
import { describe, expect, it } from 'vitest';

const now = instant('2026-08-28T20:00:00.000Z');
const later = instant('2026-08-28T21:00:00.000Z');
const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000010');
const producer = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
const consumerA = repositoryStableId(`local:sha256:${'2'.repeat(64)}`);
const consumerB = repositoryStableId(`local:sha256:${'3'.repeat(64)}`);
const producerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000010');
const consumerGenerationA = generationId('gen_01990f64-0000-7000-8000-000000000011');
const consumerGenerationB = generationId('gen_01990f64-0000-7000-8000-000000000012');
const baseSha = commitSha('a'.repeat(40));
const headSha = commitSha('b'.repeat(40));
const consumerSha = commitSha('c'.repeat(40));
const hash = contentHash(`sha256:${'d'.repeat(64)}`);
const config = configRevision(`cfg_sha256:${'e'.repeat(64)}`);

function registry(): RegistrySnapshot {
  return createRegistrySnapshot({
    workspaceId: workspace,
    sequence: 1,
    createdAt: now,
    createdBy: 'fixture',
    source: 'test',
    reason: 'graph fixture',
    repositories: [
      {
        repositoryId: producer,
        alias: 'api',
        defaultBranch: 'main',
        collections: ['default'],
        selected: true,
        consentRevision: '1',
      },
      {
        repositoryId: consumerA,
        alias: 'web',
        defaultBranch: 'main',
        collections: ['default'],
        selected: true,
        consentRevision: '1',
      },
      {
        repositoryId: consumerB,
        alias: 'jobs',
        defaultBranch: 'main',
        collections: ['default'],
        selected: true,
        consentRevision: '1',
      },
    ],
    services: [
      {
        id: 'svc.pets',
        repositoryId: producer,
        rootPath: repoPath('src'),
        environment: 'production',
        owner: 'api-team',
        validFrom: now,
      },
      {
        id: 'svc.web',
        repositoryId: consumerA,
        rootPath: repoPath('src'),
        environment: 'production',
        owner: 'web-team',
        validFrom: now,
      },
      {
        id: 'svc.jobs',
        repositoryId: consumerB,
        rootPath: repoPath('src'),
        environment: 'production',
        owner: 'jobs-team',
        validFrom: now,
      },
    ],
    aliases: [
      {
        serviceId: 'svc.pets',
        kind: 'host',
        value: 'pets.example.test',
        pathPrefix: repoPath('api/pets'),
        environment: 'production',
        provenance: 'operator',
        source: 'fixture',
        owner: 'api-team',
        validFrom: now,
      },
      {
        serviceId: 'svc.pets',
        kind: 'package_coordinate',
        value: '@acme/pets',
        environment: 'production',
        provenance: 'operator',
        source: 'fixture',
        owner: 'api-team',
        validFrom: now,
      },
    ],
  });
}

const definition: IndexedContractDefinition = {
  workspaceId: workspace,
  repositoryId: producer,
  generationId: producerGeneration,
  commitSha: baseSha,
  serviceId: 'svc.pets',
  contractKind: 'openapi_operation',
  canonicalKey: 'openapi:svc.pets#getPet',
  path: repoPath('openapi.yaml'),
  range: { startLine: 2, startColumn: 1, endLine: 8, endColumn: 1 },
  contentHash: hash,
  shapeHash: hash,
  adapterId: adapterId('reverb.openapi'),
  adapterVersion: '0.1.0',
  identityVersion: 1,
  configRevision: config,
  evidenceStratum: 'operation_id',
};

const change: IndexedContractChange = {
  workspaceId: workspace,
  producerRepositoryId: producer,
  baseGenerationId: producerGeneration,
  baseSha,
  headSha,
  contractKind: 'openapi_operation',
  canonicalKey: definition.canonicalKey,
  changeKind: 'operation_removed',
  compatibility: 'breaking',
  activation: 'on_deploy',
  adapterId: definition.adapterId,
  adapterVersion: definition.adapterVersion,
  identityVersion: 1,
  coverageState: 'complete',
  coverageDependencies: ['producer.openapi.complete'],
  remedy: {
    kind: 'coordinate_contract_rollout',
    text: 'Keep the operation or coordinate consumers.',
  },
};

function reference(
  repositoryId: typeof consumerA | typeof consumerB,
  generation: typeof consumerGenerationA | typeof consumerGenerationB,
  owner: string,
): IndexedContractReference {
  return {
    workspaceId: workspace,
    repositoryId,
    generationId: generation,
    commitSha: consumerSha,
    contractKind: 'openapi_operation',
    canonicalKey: definition.canonicalKey,
    stableReferenceId: deriveStableReferenceId({
      contractKind: 'openapi_operation',
      canonicalKey: definition.canonicalKey,
      semanticOwner: owner,
      evidenceStratum: 'operation_id',
    }),
    path: repoPath(`src/${owner}.ts`),
    range: { startLine: 20, startColumn: 1, endLine: 20, endColumn: 10 },
    contentHash: hash,
    adapterId: adapterId('reverb.openapi'),
    adapterVersion: '0.1.0',
    identityVersion: 1,
    configRevision: config,
    evidenceStratum: 'operation_id',
    activation: 'on_deploy',
  };
}

function selection(
  repositoryId: typeof consumerA | typeof consumerB,
  generation: typeof consumerGenerationA | typeof consumerGenerationB,
  state: Extract<ConsumerGenerationSelection['state'], 'current' | 'stale'> = 'current',
): ConsumerGenerationSelection {
  return {
    repositoryId,
    state,
    generationId: generation,
    commitSha: consumerSha,
    selectedAt: now,
    freshnessAgeMs: state === 'stale' ? 3_600_000 : 0,
    coverageState: 'complete',
  };
}

describe('registry resolution', () => {
  it('resolves valid-time aliases and explicit gateway prefixes deterministically', () => {
    const result = resolveServiceAlias(registry(), {
      kind: 'host',
      value: 'PETS.EXAMPLE.TEST.',
      environment: 'production',
      asOf: now,
      path: '/api/pets/v1/42',
    });
    expect(result).toMatchObject({
      state: 'resolved',
      service: { id: 'svc.pets' },
      rewrittenPath: 'v1/42',
    });
  });

  it('returns normalized ambiguity evidence rather than selecting an owner', () => {
    const base = registry();
    const ambiguous = createRegistrySnapshot({
      workspaceId: workspace,
      sequence: 2,
      createdAt: later,
      createdBy: 'fixture',
      source: 'test',
      reason: 'normalized ambiguity',
      repositories: base.repositories,
      services: base.services,
      aliases: [
        ...base.aliases,
        {
          serviceId: 'svc.web',
          kind: 'host',
          value: 'PETS.EXAMPLE.TEST.',
          environment: 'production',
          provenance: 'operator',
          source: 'fixture',
          owner: 'web-team',
          validFrom: now,
        },
      ],
    });
    expect(
      resolveServiceAlias(ambiguous, {
        kind: 'host',
        value: 'pets.example.test',
        environment: 'production',
        asOf: later,
      }),
    ).toMatchObject({
      state: 'ambiguous',
      candidateServiceIds: ['svc.pets', 'svc.web'],
    });
  });

  it('keeps suggestions inactive until an explicit operator revision', () => {
    const snapshot = registry();
    const suggestion = createServiceAliasSuggestion(
      {
        serviceId: 'svc.pets',
        kind: 'schema_id',
        value: 'pets.v1',
        environment: 'production',
        provenance: 'imported',
        source: 'descriptor',
        owner: 'api-team',
        validFrom: now,
      },
      'descriptor package',
    );
    expect(suggestion.active).toBe(false);
    expect(
      resolveServiceAlias(snapshot, {
        kind: 'schema_id',
        value: 'pets.v1',
        environment: 'production',
        asOf: now,
      }).state,
    ).toBe('not_found');
    const activated = activateServiceAliasSuggestion({
      snapshot,
      suggestion,
      approvedBy: 'operator',
      createdAt: later,
    });
    expect(activated.revision.sequence).toBe(2);
    expect(
      resolveServiceAlias(activated, {
        kind: 'schema_id',
        value: 'pets.v1',
        environment: 'production',
        asOf: later,
      }).state,
    ).toBe('resolved');
  });

  it('resolves an explicit valid-time remap without rewriting the prior answer', () => {
    const base = registry();
    const remapped = createRegistrySnapshot({
      workspaceId: workspace,
      sequence: 2,
      createdAt: later,
      createdBy: 'operator',
      source: 'test',
      reason: 'move package ownership',
      repositories: base.repositories,
      services: base.services,
      aliases: [
        ...base.aliases
          .filter((alias) => alias.kind !== 'package_coordinate')
          .map((alias) => ({ ...alias, validUntil: later })),
        {
          serviceId: 'svc.pets',
          kind: 'package_coordinate',
          value: '@acme/pets',
          environment: 'production',
          provenance: 'operator',
          source: 'fixture',
          owner: 'api-team',
          validFrom: now,
          validUntil: later,
        },
        {
          serviceId: 'svc.web',
          kind: 'package_coordinate',
          value: '@acme/pets',
          environment: 'production',
          provenance: 'operator',
          source: 'fixture',
          owner: 'web-team',
          validFrom: later,
        },
      ],
    });
    expect(
      resolveServiceAlias(remapped, {
        kind: 'package_coordinate',
        value: '@acme/pets',
        environment: 'production',
        asOf: now,
      }),
    ).toMatchObject({ state: 'resolved', service: { id: 'svc.pets' } });
    expect(
      resolveServiceAlias(remapped, {
        kind: 'package_coordinate',
        value: '@acme/pets',
        environment: 'production',
        asOf: later,
      }),
    ).toMatchObject({ state: 'resolved', service: { id: 'svc.web' } });
  });
});

describe('temporal joins and findings', () => {
  it('creates a registry-resolved edge only when the explicit target and contract constraint agree', () => {
    const { canonicalKey: _canonicalKey, ...unresolvedReference } = reference(
      consumerA,
      consumerGenerationA,
      'gatewayClient',
    );
    void _canonicalKey;
    const registryReference: IndexedContractReference = {
      ...unresolvedReference,
      constrainedContractKey: definition.canonicalKey,
      registryTarget: {
        kind: 'host',
        value: 'pets.example.test',
        environment: 'production',
        path: '/api/pets/v1/42',
      },
    };
    const joined = joinChangedContracts({
      changes: [change],
      definitions: [definition],
      references: [registryReference],
      selections: [selection(consumerA, consumerGenerationA)],
      registry: registry(),
      observedAt: now,
    });
    expect(joined.edges).toEqual([
      expect.objectContaining({
        basis: 'registry_resolved',
        primaryPath: expect.objectContaining({
          id: 'producer_definition.registry_alias.consumer_reference',
        }),
      }),
    ]);
  });

  it('joins exact references, keeps consumers distinct, and ignores line/path in fingerprints', () => {
    const referenceA = reference(consumerA, consumerGenerationA, 'submitPet');
    const referenceB = reference(consumerB, consumerGenerationB, 'refreshPet');
    const joined = joinChangedContracts({
      changes: [change],
      definitions: [definition],
      references: [referenceA, referenceB],
      selections: [
        selection(consumerA, consumerGenerationA),
        selection(consumerB, consumerGenerationB),
      ],
      registry: registry(),
      observedAt: now,
    });
    expect(joined.edges).toHaveLength(2);
    expect(joined.touchedKeys).toEqual([`openapi_operation:${definition.canonicalKey}`]);
    const occurrences = createFindingOccurrences({
      analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000010'),
      workspaceId: workspace,
      producerRepositoryId: producer,
      baseSha,
      headSha,
      policyMajor: 1,
      changes: [change],
      edges: joined.edges,
      consumers: [
        selection(consumerA, consumerGenerationA),
        selection(consumerB, consumerGenerationB),
      ],
    });
    expect(new Set(occurrences.findings.map((value) => value.fingerprint)).size).toBe(2);
    const movedEdge = {
      ...joined.edges.find((edge) => edge.consumerRepositoryId === consumerA)!,
      reference: {
        ...referenceA,
        path: repoPath('src/moved.ts'),
        range: { startLine: 200, startColumn: 1, endLine: 200, endColumn: 10 },
      },
    };
    expect(
      fingerprintFinding({
        workspaceId: workspace,
        producerRepositoryId: producer,
        change,
        edge: movedEdge,
        policyMajor: 1,
      }),
    ).toBe(
      occurrences.findings.find((finding) => finding.edge.consumerRepositoryId === consumerA)
        ?.fingerprint,
    );
  });

  it('makes touched-key incremental rejoin equivalent to the same slice of a clean join', () => {
    const secondDefinition = {
      ...definition,
      canonicalKey: 'openapi:svc.pets#listPets',
    };
    const secondChange = {
      ...change,
      canonicalKey: secondDefinition.canonicalKey,
      changeKind: 'operation_changed',
    };
    const secondReference = {
      ...reference(consumerA, consumerGenerationA, 'listPets'),
      canonicalKey: secondDefinition.canonicalKey,
      stableReferenceId: deriveStableReferenceId({
        contractKind: 'openapi_operation',
        canonicalKey: secondDefinition.canonicalKey,
        semanticOwner: 'listPets',
        evidenceStratum: 'operation_id',
      }),
    };
    const firstReference = reference(consumerA, consumerGenerationA, 'submitPet');
    const clean = joinChangedContracts({
      changes: [change, secondChange],
      definitions: [definition, secondDefinition],
      references: [firstReference, firstReference, secondReference],
      selections: [selection(consumerA, consumerGenerationA)],
      registry: registry(),
      observedAt: now,
    });
    const incremental = joinChangedContracts({
      changes: [change],
      definitions: [definition, secondDefinition],
      references: [firstReference, firstReference, secondReference],
      selections: [selection(consumerA, consumerGenerationA)],
      registry: registry(),
      observedAt: now,
    });
    expect(clean.edges).toHaveLength(2);
    expect(incremental.edges).toHaveLength(1);
    expect(incremental.edges[0]).toEqual(
      clean.edges.find((edge) => edge.definitionKey === definition.canonicalKey),
    );
  });

  it('invalidates absence only after a complete new observation and applies freshness TTL', () => {
    const joined = joinChangedContracts({
      changes: [change],
      definitions: [definition],
      references: [reference(consumerA, consumerGenerationA, 'submitPet')],
      selections: [selection(consumerA, consumerGenerationA)],
      registry: registry(),
      observedAt: now,
    });
    const partial = applyCompleteReferenceObservation({
      edges: joined.edges,
      consumerRepositoryId: consumerA,
      currentReferenceIds: new Set(),
      observedAt: later,
      complete: false,
    });
    expect(partial[0]?.invalidatedAt).toBeUndefined();
    const complete = applyCompleteReferenceObservation({
      edges: joined.edges,
      consumerRepositoryId: consumerA,
      currentReferenceIds: new Set(),
      observedAt: later,
      complete: true,
    });
    expect(complete[0]).toMatchObject({
      invalidatedAt: later,
      invalidationReason: 'complete_reference_absence',
    });
    expect(
      currentEvidenceEdges({ edges: joined.edges, asOf: later, freshnessTtlMs: 3_599_999 }),
    ).toEqual([]);
    expect(
      currentEvidenceEdges({ edges: joined.edges, asOf: later, freshnessTtlMs: 3_600_000 }),
    ).toHaveLength(1);
  });

  it('keeps exact positives under unrelated partial coverage and abstains stale/removal-sensitive claims', () => {
    const joined = joinChangedContracts({
      changes: [change],
      definitions: [definition],
      references: [reference(consumerA, consumerGenerationA, 'submitPet')],
      selections: [{ ...selection(consumerA, consumerGenerationA), coverageState: 'partial' }],
      registry: registry(),
      observedAt: now,
    });
    const exact = createFindingOccurrences({
      analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000020'),
      workspaceId: workspace,
      producerRepositoryId: producer,
      baseSha,
      headSha,
      policyMajor: 1,
      changes: [change],
      edges: joined.edges,
      consumers: [{ ...selection(consumerA, consumerGenerationA), coverageState: 'partial' }],
    });
    expect(exact.findings[0]?.state).toBe('PREVIEW');
    const unsafe = createFindingOccurrences({
      analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000021'),
      workspaceId: workspace,
      producerRepositoryId: producer,
      baseSha,
      headSha,
      policyMajor: 1,
      changes: [{ ...change, coverageState: 'partial' }],
      edges: joined.edges,
      consumers: [selection(consumerA, consumerGenerationA, 'stale')],
    });
    expect(unsafe.findings[0]?.state).toBe('ABSTAINED');
    expect(unsafe.abstentions[0]?.reason).toBe('incomplete_index');
  });

  it('does not let unconstrained heuristics or context-only signals satisfy structural evidence', () => {
    const unresolved = {
      ...reference(consumerA, consumerGenerationA, 'submitPet'),
      canonicalKey: undefined,
      unresolvedPattern: 'anything',
      contextBasis: 'heuristic' as const,
    };
    const contextOnly = {
      ...unresolved,
      stableReferenceId: deriveStableReferenceId({
        contractKind: 'openapi_operation',
        unresolvedPattern: 'declared dependency',
        semanticOwner: 'package',
        evidenceStratum: 'manifest',
      }),
      unresolvedPattern: 'declared dependency',
      contextBasis: 'declared_context' as const,
    };
    const joined = joinChangedContracts({
      changes: [change],
      definitions: [definition],
      references: [unresolved, contextOnly],
      selections: [selection(consumerA, consumerGenerationA)],
      registry: registry(),
      observedAt: now,
    });
    expect(joined.edges).toEqual([]);
    expect(joined.diagnostics.map((value) => value.code)).toEqual([
      'unresolved_reference',
      'unresolved_reference',
    ]);
  });

  it('keeps consented declared context temporal and non-structural even with a contract hint', () => {
    const baseRegistry = registry();
    const consentedRegistry = createRegistrySnapshot({
      workspaceId: workspace,
      sequence: 2,
      createdAt: now,
      createdBy: 'fixture',
      source: 'declared-context-test',
      reason: 'explicit context import consent',
      repositories: baseRegistry.repositories,
      services: baseRegistry.services,
      aliases: baseRegistry.aliases,
      consents: [producer, consumerA].map((repositoryId) => ({
        repositoryId,
        action: 'evidence.consume' as const,
        grantee: 'importer',
        decision: 'allow' as const,
        actor: 'owner',
        reason: 'explicit test consent',
        revision: 'consent-2',
      })),
    });
    const declared = importDeclaredContext({
      registry: consentedRegistry,
      producerRepositoryId: producer,
      consumerRepositoryId: consumerA,
      serviceIdentity: 'svc.pets',
      contractHint: definition.canonicalKey,
      source: 'consumer-declaration',
      author: 'api-owner',
      declarationRevision: 'decl-1',
      observedAt: now,
      validUntil: later,
      consentGrantee: 'importer',
    });
    expect(declared.provenance).toBe('declared_context');
    expect(declaredContextActiveAt(declared, now)).toBe(true);
    expect(declaredContextActiveAt(declared, later)).toBe(false);
    expect(() =>
      importDeclaredContext({
        registry: baseRegistry,
        producerRepositoryId: producer,
        consumerRepositoryId: consumerA,
        source: 'consumer-declaration',
        author: 'api-owner',
        declarationRevision: 'decl-1',
        observedAt: now,
        consentGrantee: 'importer',
      }),
    ).toThrowError(/explicit evidence-consumption consent/);

    const joined = joinChangedContracts({
      changes: [change],
      definitions: [definition],
      references: [
        {
          ...reference(consumerA, consumerGenerationA, 'declaredPet'),
          canonicalKey: definition.canonicalKey,
          contextBasis: 'declared_context',
        },
      ],
      selections: [selection(consumerA, consumerGenerationA)],
      registry: consentedRegistry,
      observedAt: now,
    });
    expect(joined.edges).toEqual([]);
  });

  it('keeps bounded transitive context in a separate claim and fingerprint', () => {
    const direct = joinChangedContracts({
      changes: [change],
      definitions: [definition],
      references: [reference(consumerA, consumerGenerationA, 'submitPet')],
      selections: [selection(consumerA, consumerGenerationA)],
      registry: registry(),
      observedAt: now,
    }).edges[0]!;
    const downstream = {
      ...direct,
      id: joinChangedContracts({
        changes: [change],
        definitions: [definition],
        references: [reference(consumerB, consumerGenerationB, 'refreshPet')],
        selections: [selection(consumerB, consumerGenerationB)],
        registry: registry(),
        observedAt: now,
      }).edges[0]!.id,
      producerRepositoryId: consumerA,
      consumerRepositoryId: consumerB,
      definition: { ...direct.definition, repositoryId: consumerA },
      reference: {
        ...reference(consumerB, consumerGenerationB, 'refreshPet'),
      },
    };
    const candidates = deriveBoundedTransitiveCandidates({
      workspaceId: workspace,
      producerRepositoryId: producer,
      definitionKey: definition.canonicalKey,
      currentEdges: [direct, downstream],
    });
    expect(candidates).toEqual([
      expect.objectContaining({
        claim: 'transitive_candidate',
        downstreamRepositoryId: consumerB,
        depth: 2,
        display: 'context_only_not_direct_impact',
        repositoryPath: [producer, consumerA, consumerB],
      }),
    ]);
    const directFinding = fingerprintFinding({
      workspaceId: workspace,
      producerRepositoryId: producer,
      change,
      edge: direct,
      policyMajor: 1,
    });
    expect(candidates[0]?.fingerprint).not.toBe(directFinding);
  });

  it('uses a policy revision value independent from policy major fingerprints', () => {
    expect(policyRevision(`pol_sha256:${'f'.repeat(64)}`)).toBe(`pol_sha256:${'f'.repeat(64)}`);
  });
});
