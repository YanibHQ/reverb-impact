import { hashCanonical } from './canonical.js';
import type { AdapterFamilyV2 } from './coverage-v2.js';
import type { ContractKindV2 } from './contracts-v2.js';
import { invariant } from './errors.js';
import { assertScopedRepositoryRead, type ScopedReadCapability } from './analysis-scope.js';
import {
  evidenceEdgeId,
  findingFingerprint,
  findingOccurrenceId,
  stableReferenceId,
  type AdapterId,
  type AnalysisId,
  type CommitSha,
  type ConfigRevision,
  type ContentHash,
  type EvidenceEdgeId,
  type FindingFingerprint,
  type FindingOccurrenceId,
  type GenerationId,
  type Instant,
  type RegistryRevision,
  type RepoPath,
  type RepositoryStableId,
  type StableReferenceId,
  type WorkspaceId,
} from './values.js';

export interface EvidenceRangeV2 {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface AdapterEvidenceVersionV2 {
  readonly adapterId: AdapterId;
  readonly adapterVersion: string;
  readonly extractionVersion: string;
  readonly identityVersion: number;
  readonly partitioningVersion: number;
  readonly compatibilityVersion: string;
  readonly configRevision: ConfigRevision;
  readonly evidenceStratum: string;
}

export interface IndexedContractDefinitionV2 extends AdapterEvidenceVersionV2 {
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly generationId: GenerationId;
  readonly commitSha: CommitSha;
  readonly family: AdapterFamilyV2;
  readonly contractKind: ContractKindV2;
  readonly canonicalKey: string;
  readonly path: RepoPath;
  readonly range?: EvidenceRangeV2;
  readonly contentHash: ContentHash;
  readonly shapeHash: ContentHash;
}

export interface IndexedContractReferenceV2 extends AdapterEvidenceVersionV2 {
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly generationId: GenerationId;
  readonly commitSha: CommitSha;
  readonly family: AdapterFamilyV2;
  readonly contractKind: ContractKindV2;
  readonly canonicalKey?: string;
  readonly unresolvedPattern?: string;
  readonly unresolvedReason?: string;
  readonly semanticOwner?: string;
  readonly stableReferenceId: StableReferenceId;
  readonly path: RepoPath;
  readonly range?: EvidenceRangeV2;
  readonly contentHash: ContentHash;
  readonly activation: 'current_runtime' | 'on_upgrade' | 'on_deploy' | 'unknown';
}

export interface IndexedContractChangeV2 {
  readonly workspaceId: WorkspaceId;
  readonly producerRepositoryId: RepositoryStableId;
  readonly baseGenerationId: GenerationId;
  readonly headGenerationId: GenerationId;
  readonly baseSha: CommitSha;
  readonly headSha: CommitSha;
  readonly family: AdapterFamilyV2;
  readonly contractKind: ContractKindV2;
  readonly canonicalKey: string;
  readonly changeKind: string;
  readonly compatibility: 'breaking' | 'potentially_breaking' | 'compatible' | 'unknown';
  readonly activation: 'current_runtime' | 'on_upgrade' | 'on_deploy' | 'unknown';
  readonly adapterId: AdapterId;
  readonly adapterVersion: string;
  readonly extractionVersion: string;
  readonly identityVersion: number;
  readonly partitioningVersion: number;
  readonly compatibilityVersion: string;
  readonly coverageState: 'complete' | 'partial' | 'failed' | 'unsupported';
  readonly coverageDependencies: readonly string[];
  readonly remedy: { readonly kind: string; readonly text: string };
}

export interface ContractGenerationObservationV2 {
  readonly schema: 'reverb.contract-observation';
  readonly schemaVersion: '2.0';
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly generationId: GenerationId;
  readonly commitSha: CommitSha;
  readonly family: AdapterFamilyV2;
  readonly coverageState: 'complete' | 'partial' | 'unsupported' | 'failed';
  readonly definitions: readonly IndexedContractDefinitionV2[];
  readonly references: readonly IndexedContractReferenceV2[];
  readonly observedAt: Instant;
  readonly outputHash: ContentHash;
}

export interface EvidenceEdgeV2 {
  readonly id: EvidenceEdgeId;
  readonly workspaceId: WorkspaceId;
  readonly family: AdapterFamilyV2;
  readonly producerRepositoryId: RepositoryStableId;
  readonly consumerRepositoryId: RepositoryStableId;
  readonly producerGenerationId: GenerationId;
  readonly consumerGenerationId: GenerationId;
  readonly definitionKey: string;
  readonly stableReferenceId: StableReferenceId;
  readonly contractKind: ContractKindV2;
  readonly basis: 'exact';
  readonly registryRevision: RegistryRevision;
  readonly observedAt: Instant;
  readonly definition: IndexedContractDefinitionV2;
  readonly reference: IndexedContractReferenceV2;
}

export interface DeterministicFindingV2 {
  readonly schema: 'reverb.deterministic-finding';
  readonly schemaVersion: '2.0';
  readonly id: FindingOccurrenceId;
  readonly analysisId: AnalysisId;
  readonly fingerprint: FindingFingerprint;
  readonly family: AdapterFamilyV2;
  readonly state: 'PREVIEW' | 'ABSTAINED';
  readonly change: IndexedContractChangeV2;
  readonly edge: EvidenceEdgeV2;
  readonly claims: {
    readonly edge: 'candidate' | 'abstained';
    readonly impact: IndexedContractChangeV2['compatibility'];
    readonly action: 'coordinate' | 'review' | 'none';
  };
  readonly coverageDependencies: readonly string[];
  readonly remedy: IndexedContractChangeV2['remedy'];
  readonly delivery: { readonly decision: 'preview_only'; readonly reason: 'stratum_unmeasured' };
}

export function deriveStableReferenceIdV2(input: {
  readonly family: AdapterFamilyV2;
  readonly contractKind: ContractKindV2;
  readonly canonicalKey?: string;
  readonly unresolvedPattern?: string;
  readonly semanticOwner?: string;
  readonly evidenceStratum: string;
}): StableReferenceId {
  invariant(
    (input.canonicalKey === undefined) !== (input.unresolvedPattern === undefined),
    'invalid_schema',
    'A v2 reference must be exactly resolved or unresolved.',
  );
  return stableReferenceId(`ref_${hashCanonical({ ...input, protocol: 2 })}`);
}

export function joinChangedContractsV2(input: {
  readonly capability: ScopedReadCapability;
  readonly workspaceId: WorkspaceId;
  readonly registryRevision: RegistryRevision;
  readonly observedAt: Instant;
  readonly changes: readonly IndexedContractChangeV2[];
  readonly definitions: readonly IndexedContractDefinitionV2[];
  readonly references: readonly IndexedContractReferenceV2[];
  readonly selectedGenerations: ReadonlyMap<
    RepositoryStableId,
    { readonly generationId: GenerationId; readonly commitSha: CommitSha }
  >;
}): readonly EvidenceEdgeV2[] {
  invariant(
    input.capability.registryRevision === input.registryRevision,
    'invalid_schema',
    'V2 evidence join must use the registry revision bound to its scoped capability.',
  );
  for (const repositoryId of input.selectedGenerations.keys()) {
    assertScopedRepositoryRead(input.capability, input.workspaceId, repositoryId);
  }
  const definitions = new Map(
    input.definitions.map((value) => [
      `${value.repositoryId}\0${value.generationId}\0${value.contractKind}\0${value.canonicalKey}`,
      value,
    ]),
  );
  const edges = new Map<string, EvidenceEdgeV2>();
  for (const change of input.changes) {
    assertScopedRepositoryRead(input.capability, input.workspaceId, change.producerRepositoryId);
    invariant(
      change.workspaceId === input.workspaceId,
      'invalid_schema',
      'V2 change belongs to another workspace.',
    );
    const definition =
      definitions.get(
        `${change.producerRepositoryId}\0${change.headGenerationId}\0${change.contractKind}\0${change.canonicalKey}`,
      ) ??
      definitions.get(
        `${change.producerRepositoryId}\0${change.baseGenerationId}\0${change.contractKind}\0${change.canonicalKey}`,
      );
    if (definition === undefined) continue;
    invariant(
      definition.workspaceId === input.workspaceId &&
        definition.repositoryId === change.producerRepositoryId &&
        definition.family === change.family &&
        definition.contractKind === change.contractKind &&
        ((definition.generationId === change.headGenerationId &&
          definition.commitSha === change.headSha) ||
          (definition.generationId === change.baseGenerationId &&
            definition.commitSha === change.baseSha)) &&
        definition.adapterId === change.adapterId &&
        definition.adapterVersion === change.adapterVersion &&
        definition.extractionVersion === change.extractionVersion &&
        definition.identityVersion === change.identityVersion &&
        definition.partitioningVersion === change.partitioningVersion &&
        definition.compatibilityVersion === change.compatibilityVersion,
      'invalid_schema',
      'V2 producer evidence does not match the exact change provenance and adapter protocol.',
    );
    for (const reference of input.references) {
      const selected = input.selectedGenerations.get(reference.repositoryId);
      if (
        reference.workspaceId !== input.workspaceId ||
        reference.family !== change.family ||
        reference.contractKind !== change.contractKind ||
        reference.canonicalKey !== change.canonicalKey ||
        selected?.generationId !== reference.generationId ||
        selected.commitSha !== reference.commitSha
      ) {
        continue;
      }
      assertScopedRepositoryRead(input.capability, input.workspaceId, reference.repositoryId);
      invariant(
        reference.adapterId === change.adapterId &&
          reference.identityVersion === change.identityVersion,
        'invalid_schema',
        'V2 consumer evidence uses an incompatible adapter identity protocol.',
      );
      invariant(
        reference.stableReferenceId ===
          deriveStableReferenceIdV2({
            family: reference.family,
            contractKind: reference.contractKind,
            canonicalKey: change.canonicalKey,
            ...(reference.semanticOwner === undefined
              ? {}
              : { semanticOwner: reference.semanticOwner }),
            evidenceStratum: reference.evidenceStratum,
          }),
        'invalid_schema',
        'V2 consumer evidence has a non-canonical stable reference identity.',
      );
      const identity = {
        workspaceId: input.workspaceId,
        producerRepositoryId: definition.repositoryId,
        consumerRepositoryId: reference.repositoryId,
        producerGenerationId: definition.generationId,
        consumerGenerationId: reference.generationId,
        definitionKey: definition.canonicalKey,
        stableReferenceId: reference.stableReferenceId,
        family: change.family,
        registryRevision: input.registryRevision,
        protocol: 2,
      };
      const edge: EvidenceEdgeV2 = {
        id: evidenceEdgeId(`edg_${hashCanonical(identity)}`),
        workspaceId: input.workspaceId,
        family: change.family,
        producerRepositoryId: definition.repositoryId,
        consumerRepositoryId: reference.repositoryId,
        producerGenerationId: definition.generationId,
        consumerGenerationId: reference.generationId,
        definitionKey: definition.canonicalKey,
        stableReferenceId: reference.stableReferenceId,
        contractKind: change.contractKind,
        basis: 'exact',
        registryRevision: input.registryRevision,
        observedAt: input.observedAt,
        definition,
        reference,
      };
      edges.set(
        `${change.canonicalKey}\0${reference.repositoryId}\0${reference.stableReferenceId}`,
        edge,
      );
    }
  }
  return [...edges.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function createDeterministicFindingsV2(input: {
  readonly analysisId: AnalysisId;
  readonly policyMajor: number;
  readonly changes: readonly IndexedContractChangeV2[];
  readonly edges: readonly EvidenceEdgeV2[];
}): readonly DeterministicFindingV2[] {
  const changes = new Map(
    input.changes.map((value) => [
      `${value.family}\0${value.contractKind}\0${value.canonicalKey}`,
      value,
    ]),
  );
  return input.edges
    .flatMap((edge): DeterministicFindingV2[] => {
      const change = changes.get(`${edge.family}\0${edge.contractKind}\0${edge.definitionKey}`);
      if (change === undefined) return [];
      const fingerprint = findingFingerprint(
        `fnd_${hashCanonical({
          workspaceId: change.workspaceId,
          producerRepositoryId: change.producerRepositoryId,
          consumerRepositoryId: edge.consumerRepositoryId,
          contractKind: change.contractKind,
          canonicalKey: change.canonicalKey,
          changeKind: change.changeKind,
          stableReferenceId: edge.stableReferenceId,
          policyMajor: input.policyMajor,
          protocol: 2,
        })}`,
      );
      const incomplete = change.coverageState !== 'complete' || change.compatibility === 'unknown';
      return [
        {
          schema: 'reverb.deterministic-finding',
          schemaVersion: '2.0',
          id: findingOccurrenceId(
            `occ_${hashCanonical({
              analysisId: input.analysisId,
              fingerprint,
              baseSha: change.baseSha,
              headSha: change.headSha,
            })}`,
          ),
          analysisId: input.analysisId,
          fingerprint,
          family: change.family,
          state: incomplete ? 'ABSTAINED' : 'PREVIEW',
          change,
          edge,
          claims: {
            edge: incomplete ? 'abstained' : 'candidate',
            impact: change.compatibility,
            action:
              change.compatibility === 'breaking' || change.compatibility === 'potentially_breaking'
                ? 'coordinate'
                : change.compatibility === 'unknown'
                  ? 'review'
                  : 'none',
          },
          coverageDependencies: [...new Set(change.coverageDependencies)].sort(),
          remedy: change.remedy,
          delivery: { decision: 'preview_only', reason: 'stratum_unmeasured' },
        },
      ];
    })
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
}
