import { hashCanonical } from './canonical.js';
import { invariant } from './errors.js';
import { resolveServiceAlias, type AliasResolutionRequest } from './registry.js';
import type { RegistrySnapshot } from './registry.js';
import {
  contentHash,
  evidenceEdgeId,
  findingFingerprint,
  stableReferenceId,
  type AdapterId,
  type CommitSha,
  type ConfigRevision,
  type ContentHash,
  type EvidenceEdgeId,
  type GenerationId,
  type FindingFingerprint,
  type Instant,
  type RegistryRevision,
  type RepoPath,
  type RepositoryStableId,
  type StableReferenceId,
  type WorkspaceId,
} from './values.js';
import type {
  ConsumerSelectionState,
  ContractKind,
  EvidenceBasis,
  ServiceAliasKind,
} from './vocabularies.js';

export interface EvidenceRange {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface IndexedContractDefinition {
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly generationId: GenerationId;
  readonly commitSha: CommitSha;
  readonly serviceId?: string;
  readonly contractKind: ContractKind;
  readonly canonicalKey: string;
  readonly path: RepoPath;
  readonly range?: EvidenceRange;
  readonly contentHash: ContentHash;
  readonly shapeHash: ContentHash;
  readonly adapterId: AdapterId;
  readonly adapterVersion: string;
  readonly identityVersion: number;
  readonly configRevision: ConfigRevision;
  readonly evidenceStratum: string;
}

export interface RegistryReferenceTarget {
  readonly kind: ServiceAliasKind;
  readonly value: string;
  readonly environment: string;
  readonly path?: string;
}

export interface IndexedContractReference {
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly generationId: GenerationId;
  readonly commitSha: CommitSha;
  readonly consumerServiceId?: string;
  readonly contractKind: ContractKind;
  readonly canonicalKey?: string;
  readonly constrainedContractKey?: string;
  readonly unresolvedPattern?: string;
  readonly registryTarget?: RegistryReferenceTarget;
  readonly stableReferenceId: StableReferenceId;
  readonly path: RepoPath;
  readonly range?: EvidenceRange;
  readonly contentHash: ContentHash;
  readonly adapterId: AdapterId;
  readonly adapterVersion: string;
  readonly identityVersion: number;
  readonly configRevision: ConfigRevision;
  readonly evidenceStratum: string;
  readonly activation: 'current_runtime' | 'on_upgrade' | 'on_deploy' | 'unknown';
  readonly contextBasis?: Extract<
    EvidenceBasis,
    'heuristic' | 'declared_context' | 'behavioural_context'
  >;
}

export interface IndexedContractChange {
  readonly workspaceId: WorkspaceId;
  readonly producerRepositoryId: RepositoryStableId;
  readonly baseGenerationId: GenerationId;
  readonly headGenerationId?: GenerationId;
  readonly baseSha: CommitSha;
  readonly headSha: CommitSha;
  readonly contractKind: ContractKind;
  readonly canonicalKey: string;
  readonly changeKind: string;
  readonly compatibility: 'breaking' | 'potentially_breaking' | 'compatible' | 'unknown';
  readonly activation: 'current_runtime' | 'on_upgrade' | 'on_deploy' | 'unknown';
  readonly adapterId: AdapterId;
  readonly adapterVersion: string;
  readonly identityVersion: number;
  readonly coverageState: 'complete' | 'partial' | 'failed' | 'unsupported';
  readonly coverageDependencies: readonly string[];
  readonly remedy: { readonly kind: string; readonly text: string };
}

export interface ContractGenerationObservation {
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly generationId: GenerationId;
  readonly commitSha: CommitSha;
  readonly coverageState: 'complete' | 'partial' | 'unsupported' | 'failed';
  readonly definitions: readonly IndexedContractDefinition[];
  readonly references: readonly IndexedContractReference[];
  readonly observedAt: Instant;
  readonly outputHash: ContentHash;
}

export interface EvidencePathStep {
  readonly id: string;
  readonly required: boolean;
  readonly basis: EvidenceBasis;
  readonly sourceKey: string;
}

export interface EvidencePath {
  readonly id: string;
  readonly steps: readonly EvidencePathStep[];
}

export interface EvidenceEdge {
  readonly id: EvidenceEdgeId;
  readonly workspaceId: WorkspaceId;
  readonly producerRepositoryId: RepositoryStableId;
  readonly consumerRepositoryId: RepositoryStableId;
  readonly producerGenerationId: GenerationId;
  readonly consumerGenerationId: GenerationId;
  readonly definitionKey: string;
  readonly stableReferenceId: StableReferenceId;
  readonly contractKind: ContractKind;
  readonly basis: EvidenceBasis;
  readonly primaryPath: EvidencePath;
  readonly stratumKey: string;
  readonly registryRevision: RegistryRevision;
  readonly firstObservedAt: Instant;
  readonly lastObservedAt: Instant;
  readonly invalidatedAt?: Instant;
  readonly invalidationReason?:
    | 'complete_reference_absence'
    | 'registry_revision_changed'
    | 'membership_removed';
  readonly definition: IndexedContractDefinition;
  readonly reference: IndexedContractReference;
}

export interface ConsumerGenerationSelection {
  readonly repositoryId: RepositoryStableId;
  readonly state: ConsumerSelectionState;
  readonly generationId?: GenerationId;
  readonly commitSha?: CommitSha;
  readonly selectedAt?: Instant;
  readonly freshnessAgeMs?: number;
  readonly coverageState?: 'complete' | 'partial';
  readonly reason?: string;
}

export interface JoinDiagnostic {
  readonly code: 'registry_ambiguity' | 'registry_contradiction' | 'unresolved_reference';
  readonly consumerRepositoryId: RepositoryStableId;
  readonly stableReferenceId: StableReferenceId;
  readonly safeMessage: string;
}

export interface JoinResult {
  readonly edges: readonly EvidenceEdge[];
  readonly diagnostics: readonly JoinDiagnostic[];
  readonly touchedKeys: readonly string[];
  readonly outputHash: ContentHash;
}

export interface TransitiveImpactCandidate {
  readonly claim: 'transitive_candidate';
  readonly fingerprint: FindingFingerprint;
  readonly workspaceId: WorkspaceId;
  readonly producerRepositoryId: RepositoryStableId;
  readonly downstreamRepositoryId: RepositoryStableId;
  readonly definitionKey: string;
  readonly depth: number;
  readonly repositoryPath: readonly RepositoryStableId[];
  readonly evidenceEdgeIds: readonly EvidenceEdgeId[];
  readonly display: 'context_only_not_direct_impact';
}

function validAt(
  value: { readonly validFrom: Instant; readonly validUntil?: Instant },
  at: Instant,
): boolean {
  return value.validFrom <= at && (value.validUntil === undefined || at < value.validUntil);
}

export function deriveStableReferenceId(input: {
  readonly contractKind: ContractKind;
  readonly canonicalKey?: string;
  readonly unresolvedPattern?: string;
  readonly semanticOwner?: string;
  readonly evidenceStratum: string;
}): StableReferenceId {
  invariant(
    input.canonicalKey !== undefined || input.unresolvedPattern !== undefined,
    'invalid_schema',
    'Stable reference identity requires a target or constrained pattern.',
  );
  return stableReferenceId(
    `ref_${hashCanonical({
      contractKind: input.contractKind,
      target: input.canonicalKey ?? input.unresolvedPattern,
      semanticOwner: input.semanticOwner ?? 'module',
      evidenceStratum: input.evidenceStratum,
    })}`,
  );
}

export function evidenceStratumKey(input: {
  readonly contractKind: ContractKind;
  readonly definition: Pick<
    IndexedContractDefinition,
    'adapterId' | 'adapterVersion' | 'identityVersion' | 'evidenceStratum'
  >;
  readonly reference: Pick<
    IndexedContractReference,
    'adapterId' | 'adapterVersion' | 'identityVersion' | 'evidenceStratum'
  >;
  readonly basis: EvidenceBasis;
  readonly primaryPath: EvidencePath;
}): string {
  const required = input.primaryPath.steps.filter((step) => step.required);
  invariant(
    required.length > 0,
    'invalid_schema',
    'Evidence path requires at least one required step.',
  );
  const path = required.map((step) => `${step.id}:${step.basis}`).join('+');
  return [
    input.contractKind,
    `${input.definition.adapterId}@${input.definition.adapterVersion}#${input.definition.identityVersion}.${input.definition.evidenceStratum}`,
    `${input.reference.adapterId}@${input.reference.adapterVersion}#${input.reference.identityVersion}.${input.reference.evidenceStratum}`,
    input.basis,
    path,
    'v1',
  ].join('|');
}

function edgeIdentity(input: {
  readonly definition: IndexedContractDefinition;
  readonly reference: IndexedContractReference;
  readonly basis: EvidenceBasis;
  readonly registryRevision: RegistryRevision;
}): EvidenceEdgeId {
  return evidenceEdgeId(
    `edg_${hashCanonical({
      workspaceId: input.definition.workspaceId,
      producerRepositoryId: input.definition.repositoryId,
      consumerRepositoryId: input.reference.repositoryId,
      definitionKey: input.definition.canonicalKey,
      stableReferenceId: input.reference.stableReferenceId,
      basis: input.basis,
      registryRevision: input.registryRevision,
    })}`,
  );
}

function pathFor(
  basis: EvidenceBasis,
  definition: IndexedContractDefinition,
  reference: IndexedContractReference,
): EvidencePath {
  const steps: EvidencePathStep[] = [
    {
      id: 'producer_definition',
      required: true,
      basis: 'exact',
      sourceKey: definition.canonicalKey,
    },
    ...(basis === 'registry_resolved'
      ? [
          {
            id: 'registry_alias',
            required: true,
            basis: 'registry_resolved' as const,
            sourceKey: reference.registryTarget?.value ?? 'missing',
          },
        ]
      : []),
    { id: 'consumer_reference', required: true, basis, sourceKey: reference.stableReferenceId },
  ];
  return { id: steps.map((step) => step.id).join('.'), steps };
}

function definitionForChange(
  change: IndexedContractChange,
  definitions: readonly IndexedContractDefinition[],
): IndexedContractDefinition | undefined {
  return definitions.find(
    (value) =>
      value.repositoryId === change.producerRepositoryId &&
      value.contractKind === change.contractKind &&
      value.canonicalKey === change.canonicalKey,
  );
}

function registryRequest(
  reference: IndexedContractReference,
  at: Instant,
): AliasResolutionRequest | undefined {
  const target = reference.registryTarget;
  return target === undefined
    ? undefined
    : {
        kind: target.kind,
        value: target.value,
        environment: target.environment,
        asOf: at,
        ...(target.path === undefined ? {} : { path: target.path }),
      };
}

export function joinChangedContracts(input: {
  readonly changes: readonly IndexedContractChange[];
  readonly definitions: readonly IndexedContractDefinition[];
  readonly references: readonly IndexedContractReference[];
  readonly selections: readonly ConsumerGenerationSelection[];
  readonly registry: RegistrySnapshot;
  readonly observedAt: Instant;
  readonly changedRegistryAliasKeys?: readonly string[];
}): JoinResult {
  const edges = new Map<string, EvidenceEdge>();
  const diagnostics: JoinDiagnostic[] = [];
  const selectedGenerations = new Map(
    input.selections
      .filter((selection) => selection.generationId !== undefined)
      .map((selection) => [selection.repositoryId, selection.generationId!]),
  );
  const touchedKeys = new Set<string>([
    ...input.changes.map((change) => `${change.contractKind}:${change.canonicalKey}`),
    ...(input.changedRegistryAliasKeys ?? []).map((key) => `registry:${key}`),
  ]);

  for (const change of input.changes) {
    const definition = definitionForChange(change, input.definitions);
    if (definition === undefined) continue;
    for (const reference of input.references) {
      if (
        reference.workspaceId !== change.workspaceId ||
        reference.contractKind !== change.contractKind ||
        selectedGenerations.get(reference.repositoryId) !== reference.generationId
      ) {
        continue;
      }
      if (
        reference.contextBasis === 'declared_context' ||
        reference.contextBasis === 'behavioural_context'
      ) {
        if (reference.unresolvedPattern !== undefined) {
          diagnostics.push({
            code: 'unresolved_reference',
            consumerRepositoryId: reference.repositoryId,
            stableReferenceId: reference.stableReferenceId,
            safeMessage: 'Context-only evidence cannot establish a structural consumer reference.',
          });
        }
        continue;
      }
      let basis: EvidenceBasis | undefined;
      if (reference.contextBasis === undefined && reference.canonicalKey === change.canonicalKey) {
        basis = 'exact';
      }
      const request = registryRequest(reference, input.observedAt);
      if (request !== undefined) {
        const resolution = resolveServiceAlias(input.registry, request);
        if (resolution.state === 'ambiguous') {
          diagnostics.push({
            code: 'registry_ambiguity',
            consumerRepositoryId: reference.repositoryId,
            stableReferenceId: reference.stableReferenceId,
            safeMessage: 'Registry alias resolved to multiple services.',
          });
          continue;
        }
        if (resolution.state === 'resolved') {
          if (
            definition.serviceId !== undefined &&
            resolution.service.id !== definition.serviceId &&
            basis === 'exact'
          ) {
            diagnostics.push({
              code: 'registry_contradiction',
              consumerRepositoryId: reference.repositoryId,
              stableReferenceId: reference.stableReferenceId,
              safeMessage: 'Exact contract identity contradicts the registry service mapping.',
            });
            continue;
          }
          if (
            basis === undefined &&
            definition.serviceId === resolution.service.id &&
            reference.constrainedContractKey === change.canonicalKey
          ) {
            basis = 'registry_resolved';
          }
        }
      }
      if (
        basis === undefined &&
        reference.contextBasis === 'heuristic' &&
        reference.constrainedContractKey === change.canonicalKey
      ) {
        basis = 'heuristic';
      }
      if (basis === undefined || basis === 'declared_context' || basis === 'behavioural_context') {
        if (reference.unresolvedPattern !== undefined) {
          diagnostics.push({
            code: 'unresolved_reference',
            consumerRepositoryId: reference.repositoryId,
            stableReferenceId: reference.stableReferenceId,
            safeMessage: 'Consumer reference could not be resolved structurally.',
          });
        }
        continue;
      }
      const primaryPath = pathFor(basis, definition, reference);
      const stratumKey = evidenceStratumKey({
        contractKind: change.contractKind,
        definition,
        reference,
        basis,
        primaryPath,
      });
      const id = edgeIdentity({
        definition,
        reference,
        basis,
        registryRevision: input.registry.revision.revision,
      });
      const edge: EvidenceEdge = {
        id,
        workspaceId: change.workspaceId,
        producerRepositoryId: definition.repositoryId,
        consumerRepositoryId: reference.repositoryId,
        producerGenerationId: definition.generationId,
        consumerGenerationId: reference.generationId,
        definitionKey: definition.canonicalKey,
        stableReferenceId: reference.stableReferenceId,
        contractKind: change.contractKind,
        basis,
        primaryPath,
        stratumKey,
        registryRevision: input.registry.revision.revision,
        firstObservedAt: input.observedAt,
        lastObservedAt: input.observedAt,
        definition,
        reference,
      };
      const dedupe = `${change.canonicalKey}\0${reference.repositoryId}\0${reference.stableReferenceId}`;
      const prior = edges.get(dedupe);
      if (prior === undefined || (prior.basis !== 'exact' && basis === 'exact'))
        edges.set(dedupe, edge);
    }
  }
  const resultEdges = [...edges.values()].sort((left, right) => left.id.localeCompare(right.id));
  const resultDiagnostics = diagnostics.sort((left, right) =>
    `${left.consumerRepositoryId}\0${left.stableReferenceId}\0${left.code}`.localeCompare(
      `${right.consumerRepositoryId}\0${right.stableReferenceId}\0${right.code}`,
    ),
  );
  const resultTouchedKeys = [...touchedKeys].sort();
  return {
    edges: resultEdges,
    diagnostics: resultDiagnostics,
    touchedKeys: resultTouchedKeys,
    outputHash: contentHash(
      hashCanonical({
        edges: resultEdges,
        diagnostics: resultDiagnostics,
        touchedKeys: resultTouchedKeys,
      }),
    ),
  };
}

export function applyCompleteReferenceObservation(input: {
  readonly edges: readonly EvidenceEdge[];
  readonly consumerRepositoryId: RepositoryStableId;
  readonly currentReferenceIds: ReadonlySet<StableReferenceId>;
  readonly observedAt: Instant;
  readonly complete: boolean;
}): readonly EvidenceEdge[] {
  return input.edges.map((edge) => {
    if (
      !input.complete ||
      edge.consumerRepositoryId !== input.consumerRepositoryId ||
      edge.invalidatedAt !== undefined ||
      input.currentReferenceIds.has(edge.stableReferenceId)
    ) {
      return edge;
    }
    return {
      ...edge,
      invalidatedAt: input.observedAt,
      invalidationReason: 'complete_reference_absence' as const,
    };
  });
}

export function currentEvidenceEdges(input: {
  readonly edges: readonly EvidenceEdge[];
  readonly asOf: Instant;
  readonly freshnessTtlMs: number;
}): readonly EvidenceEdge[] {
  return input.edges.filter(
    (edge) =>
      edge.invalidatedAt === undefined &&
      validAt({ validFrom: edge.lastObservedAt }, input.asOf) &&
      new Date(input.asOf).valueOf() - new Date(edge.lastObservedAt).valueOf() <=
        input.freshnessTtlMs,
  );
}

export function deriveBoundedTransitiveCandidates(input: {
  readonly workspaceId: WorkspaceId;
  readonly producerRepositoryId: RepositoryStableId;
  readonly definitionKey: string;
  readonly currentEdges: readonly EvidenceEdge[];
  readonly maximumDepth?: number;
}): readonly TransitiveImpactCandidate[] {
  const maximumDepth = Math.min(3, Math.max(2, input.maximumDepth ?? 2));
  const adjacency = new Map<RepositoryStableId, EvidenceEdge[]>();
  for (const edge of input.currentEdges) {
    if (edge.workspaceId !== input.workspaceId || edge.invalidatedAt !== undefined) continue;
    const values = adjacency.get(edge.producerRepositoryId) ?? [];
    values.push(edge);
    adjacency.set(edge.producerRepositoryId, values);
  }
  adjacency.forEach((values) => values.sort((left, right) => left.id.localeCompare(right.id)));
  const queue: {
    readonly repositoryId: RepositoryStableId;
    readonly repositoryPath: readonly RepositoryStableId[];
    readonly edges: readonly EvidenceEdge[];
  }[] = [
    {
      repositoryId: input.producerRepositoryId,
      repositoryPath: [input.producerRepositoryId],
      edges: [],
    },
  ];
  const candidates = new Map<string, TransitiveImpactCandidate>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.edges.length >= maximumDepth) continue;
    for (const edge of adjacency.get(current.repositoryId) ?? []) {
      if (current.repositoryPath.includes(edge.consumerRepositoryId)) continue;
      const path = [...current.repositoryPath, edge.consumerRepositoryId];
      const edges = [...current.edges, edge];
      if (edges.length >= 2) {
        const fingerprint = findingFingerprint(
          `fnd_${hashCanonical({
            claim: 'transitive_candidate',
            workspaceId: input.workspaceId,
            producerRepositoryId: input.producerRepositoryId,
            downstreamRepositoryId: edge.consumerRepositoryId,
            definitionKey: input.definitionKey,
            repositoryPath: path,
          })}`,
        );
        const key = `${edge.consumerRepositoryId}\0${edges.length}`;
        if (!candidates.has(key)) {
          candidates.set(key, {
            claim: 'transitive_candidate',
            fingerprint,
            workspaceId: input.workspaceId,
            producerRepositoryId: input.producerRepositoryId,
            downstreamRepositoryId: edge.consumerRepositoryId,
            definitionKey: input.definitionKey,
            depth: edges.length,
            repositoryPath: path,
            evidenceEdgeIds: edges.map((value) => value.id),
            display: 'context_only_not_direct_impact',
          });
        }
      }
      queue.push({ repositoryId: edge.consumerRepositoryId, repositoryPath: path, edges });
    }
  }
  return [...candidates.values()].sort((left, right) =>
    `${left.depth}\0${left.downstreamRepositoryId}`.localeCompare(
      `${right.depth}\0${right.downstreamRepositoryId}`,
    ),
  );
}
