import { invariant, ReverbError } from './errors.js';

declare const brand: unique symbol;
export type Brand<Value, Name extends string> = Value & { readonly [brand]: Name };

export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type RepositoryStableId = Brand<string, 'RepositoryStableId'>;
export type CommitSha = Brand<string, 'CommitSha'>;
export type ContentHash = Brand<string, 'ContentHash'>;
export type TreeHash = Brand<string, 'TreeHash'>;
export type GenerationId = Brand<string, 'GenerationId'>;
export type GenerationLeaseId = Brand<string, 'GenerationLeaseId'>;
export type OverlayId = Brand<string, 'OverlayId'>;
export type RegistryRevision = Brand<string, 'RegistryRevision'>;
export type ConfigRevision = Brand<string, 'ConfigRevision'>;
export type AdapterId = Brand<string, 'AdapterId'>;
export type EvidenceId = Brand<string, 'EvidenceId'>;
export type JobId = Brand<string, 'JobId'>;
export type AnalysisId = Brand<string, 'AnalysisId'>;
export type ReviewEventId = Brand<string, 'ReviewEventId'>;
export type SuppressionRuleId = Brand<string, 'SuppressionRuleId'>;
export type CorpusCaseId = Brand<string, 'CorpusCaseId'>;
export type PromotionRecordId = Brand<string, 'PromotionRecordId'>;
export type PolicyRevision = Brand<string, 'PolicyRevision'>;
export type EvidenceEdgeId = Brand<string, 'EvidenceEdgeId'>;
export type FindingFingerprint = Brand<string, 'FindingFingerprint'>;
export type FindingOccurrenceId = Brand<string, 'FindingOccurrenceId'>;
export type StableReferenceId = Brand<string, 'StableReferenceId'>;
export type ReasoningRunId = Brand<string, 'ReasoningRunId'>;
export type RepoPath = Brand<string, 'RepoPath'>;
export type Instant = Brand<string, 'Instant'>;

const PREFIXES = {
  workspace: 'wsp',
  generation: 'gen',
  lease: 'lea',
  overlay: 'ovl',
  registry: 'reg',
  config: 'cfg',
  evidence: 'evd',
  job: 'job',
  analysis: 'ana',
  review: 'rev',
} as const;

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const GIT_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const REPOSITORY_ID = /^(?:github:[1-9][0-9]*|local:sha256:[0-9a-f]{64})$/;
const ADAPTER_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const PREFIXED_HASH = /^(?:pol|edg|fnd|occ|ref|sup|cas|pro|rrn)_sha256:[0-9a-f]{64}$/;

function prefixedUuid<Name extends string>(
  value: string,
  prefix: string,
  name: Name,
): Brand<string, Name> {
  invariant(
    value.startsWith(`${prefix}_`) && UUID_V7.test(value.slice(prefix.length + 1)),
    'invalid_id',
    `${name} must be a prefixed UUIDv7.`,
    { value },
  );
  return value as Brand<string, Name>;
}

export function workspaceId(value: string): WorkspaceId {
  return prefixedUuid(value, PREFIXES.workspace, 'WorkspaceId');
}

export function generationId(value: string): GenerationId {
  return prefixedUuid(value, PREFIXES.generation, 'GenerationId');
}

export function generationLeaseId(value: string): GenerationLeaseId {
  return prefixedUuid(value, PREFIXES.lease, 'GenerationLeaseId');
}

export function overlayId(value: string): OverlayId {
  return prefixedUuid(value, PREFIXES.overlay, 'OverlayId');
}

export function evidenceId(value: string): EvidenceId {
  return prefixedUuid(value, PREFIXES.evidence, 'EvidenceId');
}

export function jobId(value: string): JobId {
  return prefixedUuid(value, PREFIXES.job, 'JobId');
}

export function analysisId(value: string): AnalysisId {
  return prefixedUuid(value, PREFIXES.analysis, 'AnalysisId');
}

export function reviewEventId(value: string): ReviewEventId {
  return prefixedUuid(value, PREFIXES.review, 'ReviewEventId');
}

function prefixedHash<Name extends string>(
  value: string,
  prefix: string,
  name: Name,
): Brand<string, Name> {
  invariant(
    value.startsWith(`${prefix}_`) && PREFIXED_HASH.test(value),
    'invalid_id',
    `${name} must contain a prefixed SHA-256 digest.`,
    { value },
  );
  return value as Brand<string, Name>;
}

export function policyRevision(value: string): PolicyRevision {
  return prefixedHash(value, 'pol', 'PolicyRevision');
}

export function evidenceEdgeId(value: string): EvidenceEdgeId {
  return prefixedHash(value, 'edg', 'EvidenceEdgeId');
}

export function findingFingerprint(value: string): FindingFingerprint {
  return prefixedHash(value, 'fnd', 'FindingFingerprint');
}

export function findingOccurrenceId(value: string): FindingOccurrenceId {
  return prefixedHash(value, 'occ', 'FindingOccurrenceId');
}

export function stableReferenceId(value: string): StableReferenceId {
  return prefixedHash(value, 'ref', 'StableReferenceId');
}

export function reasoningRunId(value: string): ReasoningRunId {
  return prefixedHash(value, 'rrn', 'ReasoningRunId');
}

export function suppressionRuleId(value: string): SuppressionRuleId {
  return prefixedHash(value, 'sup', 'SuppressionRuleId');
}

export function corpusCaseId(value: string): CorpusCaseId {
  return prefixedHash(value, 'cas', 'CorpusCaseId');
}

export function promotionRecordId(value: string): PromotionRecordId {
  return prefixedHash(value, 'pro', 'PromotionRecordId');
}

export function registryRevision(value: string): RegistryRevision {
  invariant(
    value.startsWith(`${PREFIXES.registry}_`) && HASH.test(value.slice(4)),
    'invalid_id',
    'RegistryRevision must contain a SHA-256 digest.',
    { value },
  );
  return value as RegistryRevision;
}

export function configRevision(value: string): ConfigRevision {
  invariant(
    value.startsWith(`${PREFIXES.config}_`) && HASH.test(value.slice(4)),
    'invalid_id',
    'ConfigRevision must contain a SHA-256 digest.',
    { value },
  );
  return value as ConfigRevision;
}

export function repositoryStableId(value: string): RepositoryStableId {
  invariant(REPOSITORY_ID.test(value), 'invalid_id', 'RepositoryStableId is not canonical.', {
    value,
  });
  return value as RepositoryStableId;
}

export function commitSha(value: string): CommitSha {
  const canonical = value.toLowerCase();
  invariant(
    GIT_SHA.test(canonical),
    'invalid_sha',
    'Commit SHA must be 40 or 64 hexadecimal bytes.',
    {
      value,
    },
  );
  return canonical as CommitSha;
}

export function contentHash(value: string): ContentHash {
  invariant(HASH.test(value), 'invalid_hash', 'Content hash must be canonical SHA-256.', { value });
  return value as ContentHash;
}

export function treeHash(value: string): TreeHash {
  const canonical = value.toLowerCase();
  invariant(GIT_SHA.test(canonical), 'invalid_hash', 'Tree hash must be a Git SHA.', { value });
  return canonical as TreeHash;
}

export function adapterId(value: string): AdapterId {
  invariant(ADAPTER_ID.test(value), 'invalid_id', 'Adapter ID must be namespaced and canonical.', {
    value,
  });
  return value as AdapterId;
}

export function instant(value: string): Instant {
  const parsed = new Date(value);
  invariant(
    value.endsWith('Z') && !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value,
    'invalid_instant',
    'Instant must be a canonical UTC ISO-8601 timestamp.',
    { value },
  );
  return value as Instant;
}

export function repoPath(value: string): RepoPath {
  invariant(value.length > 0, 'invalid_path', 'Repository path cannot be empty.');
  invariant(!value.includes('\0'), 'invalid_path', 'Repository path cannot contain NUL.');
  invariant(!value.includes('\\'), 'invalid_path', 'Repository paths use forward slashes.');
  invariant(
    !value.startsWith('/') && !/^[A-Za-z]:/.test(value),
    'invalid_path',
    'Absolute paths are rejected.',
    {
      value,
    },
  );
  invariant(
    !value.endsWith('/') && !value.includes('//'),
    'invalid_path',
    'Path is not canonical.',
    {
      value,
    },
  );
  const segments = value.split('/');
  invariant(
    segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    'invalid_path',
    'Repository path cannot contain traversal segments.',
    { value },
  );
  invariant(
    value.normalize('NFC') === value,
    'invalid_path',
    'Repository path must use NFC Unicode.',
    {
      value,
    },
  );
  return value as RepoPath;
}

export function enumValue<const Values extends readonly string[]>(
  values: Values,
  value: string,
  name: string,
): Values[number] {
  if (!values.includes(value)) {
    throw new ReverbError('invalid_enum', `${name} is not a supported value.`, { value });
  }
  return value;
}

export const ID_PREFIXES = Object.freeze(PREFIXES);
