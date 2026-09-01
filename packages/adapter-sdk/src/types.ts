import type {
  AdapterId,
  BoundedDiagnostic,
  ConfigRevision,
  ContractKind,
  ContentHash,
  RepoPath,
} from '@yanib/reverb-domain';
export { CONTRACT_KINDS } from '@yanib/reverb-domain';
export type { ContractKind } from '@yanib/reverb-domain';

export const CAPABILITY_TIERS = ['contract_grade', 'structural', 'preview'] as const;
export type CapabilityTier = (typeof CAPABILITY_TIERS)[number];

export const COMPATIBILITY_RESULTS = [
  'breaking',
  'potentially_breaking',
  'compatible',
  'unknown',
] as const;
export type CompatibilityResult = (typeof COMPATIBILITY_RESULTS)[number];

export const ACTIVATION_TIMINGS = [
  'current_runtime',
  'on_upgrade',
  'on_deploy',
  'unknown',
] as const;
export type ActivationTiming = (typeof ACTIVATION_TIMINGS)[number];

export interface EvidenceStratumDeclaration {
  readonly id: string;
  readonly family: 'exact_schema' | 'exact_symbol' | 'fallback_identity';
  readonly requiredEvidence: readonly string[];
  readonly promotionState: 'UNMEASURED';
}

export interface ExternalToolDeclaration {
  readonly id: string;
  readonly version: string;
  readonly digest: ContentHash;
  readonly license: string;
  readonly network: false;
}

export interface AdapterResourceBudget {
  readonly timeoutMs: number;
  readonly memoryMiB: number;
  readonly maximumInputBytes: number;
  readonly maximumOutputBytes: number;
  readonly maximumItems: number;
}

export interface AdapterManifest {
  readonly schema: 'reverb.adapter-manifest';
  readonly schemaVersion: '1.0';
  readonly id: AdapterId;
  readonly version: string;
  readonly identityVersion: number;
  readonly contractKinds: readonly ContractKind[];
  readonly capabilityTiers: readonly {
    readonly input: string;
    readonly tier: CapabilityTier;
  }[];
  readonly evidenceStrata: readonly EvidenceStratumDeclaration[];
  readonly externalTools: readonly ExternalToolDeclaration[];
  readonly limitations: readonly string[];
  readonly resourceBudget: AdapterResourceBudget;
  readonly maintainer: string;
  readonly deprecated?: { readonly replacement?: AdapterId; readonly removeAfter?: string };
}

export interface ArtifactInput {
  readonly path: RepoPath;
  readonly contentHash: ContentHash;
  readonly bytes: Uint8Array;
  readonly classification: 'source' | 'generated' | 'vendored' | 'test' | 'example';
}

export interface SourceRange {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface ContractDefinition {
  readonly contractKind: ContractKind;
  readonly canonicalKey: string;
  readonly displayName: string;
  readonly path: RepoPath;
  readonly range?: SourceRange;
  readonly contentHash: ContentHash;
  readonly shapeHash: ContentHash;
  readonly shape: Readonly<Record<string, unknown>>;
  readonly extractorId: AdapterId;
  readonly extractorVersion: string;
  readonly identityVersion: number;
  readonly configRevision: ConfigRevision;
  readonly evidenceStratum: string;
}

export interface ContractReferenceBase {
  readonly contractKind: ContractKind;
  readonly semanticOwner?: string;
  readonly path: RepoPath;
  readonly range?: SourceRange;
  readonly contentHash: ContentHash;
  readonly extractorId: AdapterId;
  readonly extractorVersion: string;
  readonly identityVersion: number;
  readonly configRevision: ConfigRevision;
  readonly evidenceStratum: string;
  readonly activation: ActivationTiming;
}

export interface ResolvedContractReference extends ContractReferenceBase {
  readonly canonicalKey: string;
  readonly unresolvedPattern?: never;
  readonly unresolvedReason?: never;
}

export interface UnresolvedContractReference extends ContractReferenceBase {
  readonly canonicalKey?: never;
  readonly unresolvedPattern: string;
  readonly unresolvedReason: string;
}

export type ContractReference = ResolvedContractReference | UnresolvedContractReference;

export interface AdapterLimitation {
  readonly code: string;
  readonly scope?: RepoPath;
}

export interface AdapterCoverage {
  readonly state: 'complete' | 'partial' | 'failed' | 'unsupported';
  readonly eligibleArtifacts: number;
  readonly processedArtifacts: number;
  readonly skippedArtifacts: number;
  readonly failedArtifacts: number;
  readonly limitations: readonly AdapterLimitation[];
}

export interface AdapterExtractionResult {
  readonly schema: 'reverb.adapter-extraction';
  readonly schemaVersion: '1.0';
  readonly adapterId: AdapterId;
  readonly adapterVersion: string;
  readonly identityVersion: number;
  readonly configRevision: ConfigRevision;
  readonly definitions: readonly ContractDefinition[];
  readonly references: readonly ContractReference[];
  readonly coverage: AdapterCoverage;
  readonly diagnostics: readonly BoundedDiagnostic[];
  readonly sourceFingerprint: ContentHash;
  readonly outputHash: ContentHash;
}

export interface DifferMetadata {
  readonly toolId: string;
  readonly toolVersion: string;
  readonly toolDigest: ContentHash;
  readonly toolLicense: string;
  readonly category: string;
}

export interface ContractChange {
  readonly contractKind: ContractKind;
  readonly canonicalKey: string;
  readonly changeKind: string;
  readonly compatibility: CompatibilityResult;
  readonly activation: ActivationTiming;
  readonly baseShapeHash?: ContentHash;
  readonly headShapeHash?: ContentHash;
  readonly coverageDependencies: readonly string[];
  readonly remedy: { readonly kind: string; readonly text: string };
  readonly differ: DifferMetadata;
}

export interface AdapterDiffResult {
  readonly schema: 'reverb.adapter-diff';
  readonly schemaVersion: '1.0';
  readonly adapterId: AdapterId;
  readonly adapterVersion: string;
  readonly identityVersion: number;
  readonly changes: readonly ContractChange[];
  readonly coverage: AdapterCoverage;
  readonly diagnostics: readonly BoundedDiagnostic[];
  readonly outputHash: ContentHash;
}

export interface ExtractRequest {
  readonly artifacts: readonly ArtifactInput[];
  readonly configRevision: ConfigRevision;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface DiffRequest {
  readonly base: AdapterExtractionResult;
  readonly head: AdapterExtractionResult;
  readonly configRevision: ConfigRevision;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface ContractAdapter {
  readonly manifest: AdapterManifest;
  extract(request: ExtractRequest): Promise<AdapterExtractionResult>;
  diff(request: DiffRequest): Promise<AdapterDiffResult>;
}

export interface AdmissionCheck {
  readonly id: string;
  readonly state: 'pass' | 'fail' | 'not_measured';
  readonly evidence: string;
}

export interface AdapterAdmissionReport {
  readonly schema: 'reverb.adapter-admission';
  readonly schemaVersion: '1.0';
  readonly adapterId: AdapterId;
  readonly adapterVersion: string;
  readonly identityVersion: number;
  readonly demand: string;
  readonly designPartner: string;
  readonly identitySummary: string;
  readonly compatibilitySummary: string;
  readonly evidenceRendering: string;
  readonly latencyResourceSummary: string;
  readonly dependenciesAndLicenses: readonly string[];
  readonly limitations: readonly string[];
  readonly maintainer: string;
  readonly checks: readonly AdmissionCheck[];
  readonly realLabelledCorpusState: 'absent' | 'available';
  readonly promotionState: 'UNMEASURED';
  readonly deliveryReady: false;
  readonly outputHash: ContentHash;
}
