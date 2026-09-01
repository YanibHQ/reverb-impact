import { canonicalJson, hashCanonical } from './canonical.js';
import { invariant } from './errors.js';
import { contentHash } from './values.js';
import type {
  AdapterId,
  ConfigRevision,
  ContentHash,
  GenerationId,
  RegistryRevision,
  RepoPath,
  RepositoryStableId,
  WorkspaceId,
} from './values.js';

export type AdapterSnapshotState = 'complete' | 'partial' | 'failed' | 'unsupported';

export interface AdapterSemanticPartition {
  readonly schema: 'reverb.adapter-semantic-partition';
  readonly schemaVersion: '1.0';
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly adapterId: AdapterId;
  readonly adapterVersion: string;
  readonly identityVersion: number;
  readonly partitioningVersion: number;
  readonly configRevision: ConfigRevision;
  readonly registryRevision: RegistryRevision;
  readonly partitionKey: string;
  readonly ownedPaths: readonly RepoPath[];
  readonly dependencyKeys: readonly string[];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly outputHash: ContentHash;
}

export type AdapterSnapshotEntry =
  | {
      readonly kind: 'replacement';
      readonly partitionKey: string;
      readonly partitionHash: ContentHash;
    }
  | { readonly kind: 'tombstone'; readonly partitionKey: string };

export interface AdapterGenerationSnapshot {
  readonly schema: 'reverb.adapter-generation-snapshot';
  readonly schemaVersion: '1.0';
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly generationId: GenerationId;
  readonly adapterId: AdapterId;
  readonly adapterVersion: string;
  readonly identityVersion: number;
  readonly partitioningVersion: number;
  readonly configRevision: ConfigRevision;
  readonly registryRevision: RegistryRevision;
  readonly state: AdapterSnapshotState;
  readonly baseSnapshotHash?: ContentHash;
  readonly entries: readonly AdapterSnapshotEntry[];
  readonly outputHash: ContentHash;
}

export type AdapterSemanticPartitionInput = Omit<
  AdapterSemanticPartition,
  'schema' | 'schemaVersion' | 'outputHash'
>;

export type AdapterGenerationSnapshotInput = Omit<
  AdapterGenerationSnapshot,
  'schema' | 'schemaVersion' | 'outputHash'
>;

function validateKey(value: string, name: string): void {
  const printable = [...value].every((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint >= 0x20 && codePoint !== 0x7f;
  });
  invariant(
    value.length > 0 && value.length <= 512 && printable,
    'invalid_schema',
    `${name} must be a bounded printable key.`,
  );
}

function uniqueSorted(values: readonly string[], name: string): readonly string[] {
  values.forEach((value) => validateKey(value, name));
  invariant(new Set(values).size === values.length, 'invalid_schema', `${name} is duplicated.`);
  return [...values].sort((left, right) => left.localeCompare(right));
}

function validateVersions(input: {
  readonly adapterVersion: string;
  readonly identityVersion: number;
  readonly partitioningVersion: number;
}): void {
  invariant(
    input.adapterVersion.length > 0 && input.adapterVersion.length <= 128,
    'invalid_schema',
    'Adapter version is invalid.',
  );
  invariant(
    Number.isSafeInteger(input.identityVersion) && input.identityVersion > 0,
    'invalid_schema',
    'Adapter identity version is invalid.',
  );
  invariant(
    Number.isSafeInteger(input.partitioningVersion) && input.partitioningVersion > 0,
    'invalid_schema',
    'Adapter partitioning version is invalid.',
  );
}

export function finalizeAdapterSemanticPartition(
  input: AdapterSemanticPartitionInput,
): AdapterSemanticPartition {
  validateVersions(input);
  validateKey(input.partitionKey, 'Partition key');
  const ownedPaths = uniqueSorted(input.ownedPaths, 'Owned path') as readonly RepoPath[];
  const dependencyKeys = uniqueSorted(input.dependencyKeys, 'Dependency key');
  const canonical = {
    schema: 'reverb.adapter-semantic-partition' as const,
    schemaVersion: '1.0' as const,
    workspaceId: input.workspaceId,
    repositoryId: input.repositoryId,
    adapterId: input.adapterId,
    adapterVersion: input.adapterVersion,
    identityVersion: input.identityVersion,
    partitioningVersion: input.partitioningVersion,
    configRevision: input.configRevision,
    registryRevision: input.registryRevision,
    partitionKey: input.partitionKey,
    ownedPaths,
    dependencyKeys,
    payload: input.payload,
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

export function assertCanonicalAdapterSemanticPartition(
  value: AdapterSemanticPartition,
): AdapterSemanticPartition {
  const {
    schema: _schema,
    schemaVersion: _schemaVersion,
    outputHash: _outputHash,
    ...input
  } = value;
  void _schema;
  void _schemaVersion;
  void _outputHash;
  const canonical = finalizeAdapterSemanticPartition(input);
  invariant(
    canonicalJson(canonical) === canonicalJson(value),
    'invalid_schema',
    'Adapter semantic partition is not canonical.',
  );
  return value;
}

export function finalizeAdapterGenerationSnapshot(
  input: AdapterGenerationSnapshotInput,
): AdapterGenerationSnapshot {
  validateVersions(input);
  const keys = input.entries.map((entry) => entry.partitionKey);
  keys.forEach((key) => validateKey(key, 'Snapshot partition key'));
  invariant(
    new Set(keys).size === keys.length,
    'invalid_schema',
    'Snapshot partition key is duplicated.',
  );
  if (!input.baseSnapshotHash) {
    invariant(
      input.entries.every((entry) => entry.kind === 'replacement'),
      'invalid_schema',
      'A root adapter snapshot cannot contain tombstones.',
    );
  }
  const entries = [...input.entries].sort((left, right) =>
    left.partitionKey.localeCompare(right.partitionKey),
  );
  const canonical = {
    schema: 'reverb.adapter-generation-snapshot' as const,
    schemaVersion: '1.0' as const,
    workspaceId: input.workspaceId,
    repositoryId: input.repositoryId,
    generationId: input.generationId,
    adapterId: input.adapterId,
    adapterVersion: input.adapterVersion,
    identityVersion: input.identityVersion,
    partitioningVersion: input.partitioningVersion,
    configRevision: input.configRevision,
    registryRevision: input.registryRevision,
    state: input.state,
    ...(input.baseSnapshotHash ? { baseSnapshotHash: input.baseSnapshotHash } : {}),
    entries,
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

export function assertCanonicalAdapterGenerationSnapshot(
  value: AdapterGenerationSnapshot,
): AdapterGenerationSnapshot {
  const {
    schema: _schema,
    schemaVersion: _schemaVersion,
    outputHash: _outputHash,
    ...input
  } = value;
  void _schema;
  void _schemaVersion;
  void _outputHash;
  const canonical = finalizeAdapterGenerationSnapshot(input);
  invariant(
    canonicalJson(canonical) === canonicalJson(value),
    'invalid_schema',
    'Adapter generation snapshot is not canonical.',
  );
  return value;
}
