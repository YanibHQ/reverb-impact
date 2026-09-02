import type {
  AdapterFamilyV2,
  AdapterId,
  AdapterSemanticPartition,
  BoundedDiagnostic,
  ConfigRevision,
  ContentHash,
  ContractKindV2,
  RepoPath,
} from '@yanib/reverb-domain';

import type {
  ActivationTiming,
  AdapterInvalidationPlan,
  AdapterPartitionDescriptor,
  AdapterPathChange,
  AdapterResourceBudget,
  ArtifactInput,
  CapabilityTier,
  CompatibilityResult,
  EvidenceStratumDeclaration,
  SourceRange,
} from './types.js';

export interface AdapterManifestV2 {
  readonly schema: 'reverb.adapter-manifest';
  readonly schemaVersion: '2.0';
  readonly id: AdapterId;
  readonly family: AdapterFamilyV2;
  readonly version: string;
  readonly extractionVersion: string;
  readonly identityVersion: number;
  readonly partitioningVersion: number;
  readonly compatibilityVersion: string;
  readonly contractKinds: readonly ContractKindV2[];
  readonly capabilityTiers: readonly {
    readonly input: string;
    readonly tier: CapabilityTier;
  }[];
  readonly evidenceStrata: readonly EvidenceStratumDeclaration[];
  readonly externalTools: readonly [];
  readonly limitations: readonly string[];
  readonly resourceBudget: AdapterResourceBudget;
  readonly maintainer: string;
}

export interface ContractDefinitionV2 {
  readonly contractKind: ContractKindV2;
  readonly canonicalKey: string;
  readonly displayName: string;
  readonly path: RepoPath;
  readonly range?: SourceRange;
  readonly contentHash: ContentHash;
  readonly shapeHash: ContentHash;
  readonly shape: Readonly<Record<string, unknown>>;
  readonly extractorId: AdapterId;
  readonly extractorVersion: string;
  readonly extractionVersion: string;
  readonly identityVersion: number;
  readonly partitioningVersion: number;
  readonly compatibilityVersion: string;
  readonly configRevision: ConfigRevision;
  readonly evidenceStratum: string;
}

export interface ContractReferenceBaseV2 {
  readonly contractKind: ContractKindV2;
  readonly semanticOwner?: string;
  readonly path: RepoPath;
  readonly range?: SourceRange;
  readonly contentHash: ContentHash;
  readonly extractorId: AdapterId;
  readonly extractorVersion: string;
  readonly extractionVersion: string;
  readonly identityVersion: number;
  readonly partitioningVersion: number;
  readonly compatibilityVersion: string;
  readonly configRevision: ConfigRevision;
  readonly evidenceStratum: string;
  readonly activation: ActivationTiming;
}

export interface ResolvedContractReferenceV2 extends ContractReferenceBaseV2 {
  readonly canonicalKey: string;
  readonly unresolvedPattern?: never;
  readonly unresolvedReason?: never;
}

export interface UnresolvedContractReferenceV2 extends ContractReferenceBaseV2 {
  readonly canonicalKey?: never;
  readonly unresolvedPattern: string;
  readonly unresolvedReason: string;
}

export type ContractReferenceV2 = ResolvedContractReferenceV2 | UnresolvedContractReferenceV2;

export interface AdapterCoverageV2 {
  readonly state: 'complete' | 'partial' | 'failed' | 'unsupported';
  readonly eligibleArtifacts: number;
  readonly processedArtifacts: number;
  readonly skippedArtifacts: number;
  readonly failedArtifacts: number;
  readonly limitations: readonly { readonly code: string; readonly scope?: RepoPath }[];
}

export interface AdapterExtractionResultV2 {
  readonly schema: 'reverb.adapter-extraction';
  readonly schemaVersion: '2.0';
  readonly family: AdapterFamilyV2;
  readonly adapterId: AdapterId;
  readonly adapterVersion: string;
  readonly extractionVersion: string;
  readonly identityVersion: number;
  readonly partitioningVersion: number;
  readonly compatibilityVersion: string;
  readonly configRevision: ConfigRevision;
  readonly definitions: readonly ContractDefinitionV2[];
  readonly references: readonly ContractReferenceV2[];
  readonly coverage: AdapterCoverageV2;
  readonly diagnostics: readonly BoundedDiagnostic[];
  readonly sourceFingerprint: ContentHash;
  readonly outputHash: ContentHash;
}

export interface ContractChangeV2 {
  readonly contractKind: ContractKindV2;
  readonly canonicalKey: string;
  readonly changeKind: string;
  readonly compatibility: CompatibilityResult;
  readonly activation: ActivationTiming;
  readonly baseShapeHash?: ContentHash;
  readonly headShapeHash?: ContentHash;
  readonly coverageDependencies: readonly string[];
  readonly remedy: { readonly kind: string; readonly text: string };
}

export interface AdapterDiffResultV2 {
  readonly schema: 'reverb.adapter-diff';
  readonly schemaVersion: '2.0';
  readonly family: AdapterFamilyV2;
  readonly adapterId: AdapterId;
  readonly adapterVersion: string;
  readonly extractionVersion: string;
  readonly identityVersion: number;
  readonly partitioningVersion: number;
  readonly compatibilityVersion: string;
  readonly changes: readonly ContractChangeV2[];
  readonly coverage: AdapterCoverageV2;
  readonly diagnostics: readonly BoundedDiagnostic[];
  readonly outputHash: ContentHash;
}

export interface ExtractRequestV2 {
  readonly artifacts: readonly ArtifactInput[];
  readonly configRevision: ConfigRevision;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface DiffRequestV2 {
  readonly base: AdapterExtractionResultV2;
  readonly head: AdapterExtractionResultV2;
  readonly configRevision: ConfigRevision;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface ContractAdapterV2 {
  readonly manifest: AdapterManifestV2;
  extract(request: ExtractRequestV2): Promise<AdapterExtractionResultV2>;
  diff(request: DiffRequestV2): Promise<AdapterDiffResultV2>;
}

export type AdapterPartitionViewV2 = Pick<
  AdapterSemanticPartition,
  'partitionKey' | 'ownedPaths' | 'dependencyKeys' | 'payload' | 'outputHash'
>;

export interface AdapterPartitionBuildV2 {
  readonly partitionKey: string;
  readonly ownedPaths: readonly RepoPath[];
  readonly dependencyKeys: readonly string[];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly extraction: AdapterExtractionResultV2;
}

export interface AdapterPartitionBuildResultV2 {
  readonly partitions: readonly AdapterPartitionBuildV2[];
  readonly coverage: AdapterCoverageV2;
  readonly diagnostics: readonly BoundedDiagnostic[];
  readonly outputHash: ContentHash;
}

export interface AdapterPartitionUpdateResultV2 {
  readonly replacements: readonly AdapterPartitionBuildV2[];
  readonly tombstones: readonly string[];
  readonly coverage: AdapterCoverageV2;
  readonly diagnostics: readonly BoundedDiagnostic[];
  readonly outputHash: ContentHash;
}

export interface IncrementalContractAdapterV2 extends ContractAdapterV2 {
  buildPartitions(request: ExtractRequestV2): Promise<AdapterPartitionBuildResultV2>;
  planInvalidation(request: {
    readonly partitions: readonly AdapterPartitionDescriptor[];
    readonly changes: readonly AdapterPathChange[];
    readonly context: Readonly<Record<string, unknown>>;
  }): AdapterInvalidationPlan;
  updatePartitions(request: {
    readonly basePartitions: readonly AdapterPartitionViewV2[];
    readonly plan: AdapterInvalidationPlan;
    readonly changes: readonly AdapterPathChange[];
    readonly changedArtifacts: readonly ArtifactInput[];
    readonly configRevision: ConfigRevision;
    readonly context: Readonly<Record<string, unknown>>;
  }): Promise<AdapterPartitionUpdateResultV2>;
  materializePartitions(request: {
    readonly partitions: readonly AdapterPartitionViewV2[];
    readonly configRevision: ConfigRevision;
    readonly context: Readonly<Record<string, unknown>>;
  }): Promise<AdapterExtractionResultV2>;
}
