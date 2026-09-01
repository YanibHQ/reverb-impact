import type {
  AdapterId,
  CommitSha,
  ConfigRevision,
  ContentHash,
  GenerationId,
  GenerationLeaseId,
  Instant,
  OverlayId,
  RegistryRevision,
  RepoPath,
  RepositoryStableId,
  TreeHash,
  WorkspaceId,
} from './values.js';
import type {
  CoverageDimension,
  CoverageState,
  DiagnosticCode,
  DiagnosticSeverity,
  FileClassification,
  GenerationState,
  OverlayState,
  ParseState,
} from './vocabularies.js';

export interface BoundedDiagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly scope?: RepoPath;
  readonly detailHash?: ContentHash;
  readonly safeMessage: string;
}

export interface CoverageRecord {
  readonly dimension: CoverageDimension;
  readonly state: CoverageState;
  readonly eligible: number;
  readonly processed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly reason?: DiagnosticCode;
  readonly scope?: RepoPath;
}

export interface RepositoryGeneration {
  readonly id: GenerationId;
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly commitSha: CommitSha;
  readonly treeHash: TreeHash;
  readonly indexerBundleVersion: string;
  readonly configRevision: ConfigRevision;
  readonly registryRevision: RegistryRevision;
  readonly state: GenerationState;
  readonly startedAt: Instant;
  readonly completedAt?: Instant;
  readonly coverageHash?: ContentHash;
  readonly artifactResultHash?: ContentHash;
  readonly selectable: boolean;
  readonly derivation?: GenerationDerivation;
}

export interface GenerationDerivation {
  readonly baseGenerationId: GenerationId;
  readonly overlayId: OverlayId;
  readonly storageMode: 'base_overlay';
}

export interface BeginGeneration {
  readonly generationId: GenerationId;
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly commitSha: CommitSha;
  readonly treeHash: TreeHash;
  readonly indexerBundleVersion: string;
  readonly configRevision: ConfigRevision;
  readonly registryRevision: RegistryRevision;
  readonly startedAt: Instant;
  readonly leaseId: GenerationLeaseId;
  readonly leaseExpiresAt: Instant;
}

export interface GenerationLease {
  readonly generationId: GenerationId;
  readonly leaseId: GenerationLeaseId;
  readonly expiresAt: Instant;
  readonly existing: boolean;
}

export interface FileArtifact {
  readonly generationId: GenerationId;
  readonly path: RepoPath;
  readonly sourceBlobId: string;
  readonly contentHash?: ContentHash;
  readonly size: number;
  readonly language: string;
  readonly classification: FileClassification;
  readonly parseState: ParseState;
  readonly parserId: AdapterId;
  readonly parserVersion: string;
  readonly configRevision: ConfigRevision;
  readonly lineCount?: number;
  readonly reusedFromGenerationId?: GenerationId;
}

export interface ArtifactBatch {
  readonly artifacts: readonly FileArtifact[];
  readonly diagnostics: readonly BoundedDiagnostic[];
  readonly coverage: readonly CoverageRecord[];
}

export interface GenerationSummary {
  readonly state: Extract<GenerationState, 'complete' | 'partial'>;
  readonly completedAt: Instant;
  readonly selectable: boolean;
  readonly coverage: readonly CoverageRecord[];
  readonly diagnostics: readonly BoundedDiagnostic[];
  readonly coverageHash: ContentHash;
  readonly artifactResultHash: ContentHash;
}

export interface GenerationFailure {
  readonly failedAt: Instant;
  readonly code: DiagnosticCode | 'infrastructure_failure';
  readonly safeMessage: string;
}

export type TreeEntryKind = 'blob' | 'symlink' | 'submodule';

export interface TreeEntry {
  readonly path: RepoPath;
  readonly mode: string;
  readonly kind: TreeEntryKind;
  readonly objectId: string;
  readonly size?: number;
}

export interface SourceLimitation {
  readonly code: DiagnosticCode;
  readonly scope?: RepoPath;
}

export interface TreeManifest {
  readonly repositoryId: RepositoryStableId;
  readonly commitSha: CommitSha;
  readonly treeHash: TreeHash;
  readonly entries: readonly TreeEntry[];
  readonly complete: boolean;
  readonly limitations: readonly SourceLimitation[];
}

export interface BlobResult {
  readonly path: RepoPath;
  readonly bytes: Uint8Array;
  readonly complete: boolean;
  readonly truncated: boolean;
  readonly sourceBlobId: string;
  readonly limitations: readonly SourceLimitation[];
}

export type DiffEntryKind =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'type_changed';

export interface DiffEntry {
  readonly kind: DiffEntryKind;
  readonly path: RepoPath;
  readonly previousPath?: RepoPath;
  readonly similarity?: number;
  readonly binary: boolean | 'unknown';
  readonly submodule: boolean;
}

export interface DiffManifest {
  readonly repositoryId: RepositoryStableId;
  readonly baseSha: CommitSha;
  readonly headSha: CommitSha;
  readonly entries: readonly DiffEntry[];
  readonly complete: boolean;
  readonly renameBasis: 'git_similarity' | 'none' | 'provider_limited';
  readonly limitations: readonly SourceLimitation[];
  readonly manifestHash: ContentHash;
}

export interface PullRequestOverlay {
  readonly id: OverlayId;
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly baseGenerationId: GenerationId;
  readonly baseSha: CommitSha;
  readonly headSha: CommitSha;
  readonly headTreeHash: TreeHash;
  readonly indexerBundleVersion: string;
  readonly configRevision: ConfigRevision;
  readonly registryRevision: RegistryRevision;
  readonly state: OverlayState;
  readonly supersessionKey: ContentHash;
  readonly diffHash: ContentHash;
  readonly resultHash?: ContentHash;
  readonly startedAt: Instant;
  readonly completedAt?: Instant;
}

export interface OverlayEntry {
  readonly overlayId: OverlayId;
  readonly path: RepoPath;
  readonly kind: 'replacement' | 'tombstone';
  readonly artifact?: Omit<FileArtifact, 'generationId'>;
  readonly previousPath?: RepoPath;
}

export interface RepositoryDescriptor {
  readonly id: RepositoryStableId;
  readonly displayName: string;
  readonly defaultBranch?: string;
}

export interface CommitDescriptor {
  readonly repositoryId: RepositoryStableId;
  readonly sha: CommitSha;
  readonly treeHash: TreeHash;
}
