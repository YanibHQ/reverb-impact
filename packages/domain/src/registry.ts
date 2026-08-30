import { canonicalJson, hashCanonical } from './canonical.js';
import { ReverbError, invariant } from './errors.js';
import type {
  ConfigRevision,
  ContentHash,
  Instant,
  RegistryRevision,
  RepoPath,
  RepositoryStableId,
  WorkspaceId,
} from './values.js';
import { configRevision, contentHash, registryRevision } from './values.js';
import type { RepositoryAction, ServiceAliasKind } from './vocabularies.js';

export interface RepositoryMembership {
  readonly repositoryId: RepositoryStableId;
  readonly alias: string;
  readonly rootPath?: string;
  readonly defaultBranch: string;
  readonly collections: readonly string[];
  readonly selected: boolean;
  readonly consentRevision: string;
}

export interface ServiceIdentity {
  readonly id: string;
  readonly repositoryId: RepositoryStableId;
  readonly rootPath: RepoPath;
  readonly environment: string;
  readonly owner: string;
  readonly validFrom: Instant;
  readonly validUntil?: Instant;
}

export interface ServiceAlias {
  readonly serviceId: string;
  readonly kind: ServiceAliasKind;
  readonly value: string;
  readonly pathPrefix?: RepoPath;
  readonly environment: string;
  readonly provenance: 'operator' | 'provider' | 'imported';
  readonly source: string;
  readonly owner: string;
  readonly validFrom: Instant;
  readonly validUntil?: Instant;
}

export interface ConsentGrant {
  readonly repositoryId: RepositoryStableId;
  readonly action: RepositoryAction;
  readonly grantee: string;
  readonly decision: 'allow' | 'deny';
  readonly actor: string;
  readonly reason: string;
  readonly revision: string;
}

export interface WorkspaceRevision {
  readonly workspaceId: WorkspaceId;
  readonly revision: RegistryRevision;
  readonly configRevision: ConfigRevision;
  readonly sequence: number;
  readonly createdAt: Instant;
  readonly createdBy: string;
  readonly source: string;
  readonly reason: string;
  readonly configHash: ContentHash;
}

export interface RegistrySnapshot {
  readonly schema: 'reverb.workspace-registry';
  readonly schemaVersion: '1.0';
  readonly revision: WorkspaceRevision;
  readonly repositories: readonly RepositoryMembership[];
  readonly services: readonly ServiceIdentity[];
  readonly aliases: readonly ServiceAlias[];
  readonly consents: readonly ConsentGrant[];
  readonly extensions: Readonly<Record<string, unknown>>;
}

function intervalsOverlap(
  left: Pick<ServiceIdentity | ServiceAlias, 'validFrom' | 'validUntil'>,
  right: Pick<ServiceIdentity | ServiceAlias, 'validFrom' | 'validUntil'>,
): boolean {
  const leftEnd = left.validUntil ?? ('9999-12-31T23:59:59.999Z' as Instant);
  const rightEnd = right.validUntil ?? ('9999-12-31T23:59:59.999Z' as Instant);
  return left.validFrom < rightEnd && right.validFrom < leftEnd;
}

function validateInterval(
  value: Pick<ServiceIdentity | ServiceAlias, 'validFrom' | 'validUntil'>,
  subject: string,
): void {
  if (value.validUntil) {
    invariant(
      value.validFrom < value.validUntil,
      'invalid_registry',
      `${subject} validity interval must end after it begins.`,
    );
  }
}

function nonEmpty(value: string, subject: string): void {
  invariant(value.trim().length > 0, 'invalid_registry', `${subject} cannot be empty.`);
}

export function validateRegistrySnapshot(snapshot: RegistrySnapshot): RegistrySnapshot {
  invariant(
    snapshot.schema === 'reverb.workspace-registry',
    'invalid_schema',
    'Registry schema is invalid.',
  );
  invariant(
    snapshot.schemaVersion === '1.0',
    'unsupported_schema_major',
    'Registry schema major is unsupported.',
  );
  invariant(
    Number.isSafeInteger(snapshot.revision.sequence) && snapshot.revision.sequence > 0,
    'invalid_registry',
    'Registry sequence must be positive.',
  );

  const repositoryIds = new Set<string>();
  const repositoryAliases = new Set<string>();
  for (const repository of snapshot.repositories) {
    nonEmpty(repository.alias, 'Repository alias');
    nonEmpty(repository.defaultBranch, 'Repository default branch');
    nonEmpty(repository.consentRevision, 'Repository consent revision');
    invariant(
      !repositoryIds.has(repository.repositoryId),
      'invalid_registry',
      'Repository membership is duplicated.',
    );
    invariant(
      !repositoryAliases.has(repository.alias),
      'invalid_registry',
      'Repository alias is duplicated.',
    );
    repositoryIds.add(repository.repositoryId);
    repositoryAliases.add(repository.alias);
  }

  const services = new Map<string, ServiceIdentity>();
  for (const service of snapshot.services) {
    nonEmpty(service.id, 'Service ID');
    nonEmpty(service.environment, 'Service environment');
    nonEmpty(service.owner, 'Service owner');
    validateInterval(service, 'Service');
    if (!repositoryIds.has(service.repositoryId)) {
      throw new ReverbError('unknown_repository', 'Service references an unknown repository.');
    }
    const existing = services.get(service.id);
    if (existing && intervalsOverlap(existing, service)) {
      throw new ReverbError('invalid_registry', 'Service validity overlaps.', {
        serviceId: service.id,
      });
    }
    services.set(service.id, service);
  }

  for (const alias of snapshot.aliases) {
    nonEmpty(alias.serviceId, 'Alias service ID');
    nonEmpty(alias.value, 'Alias value');
    nonEmpty(alias.environment, 'Alias environment');
    nonEmpty(alias.source, 'Alias source');
    nonEmpty(alias.owner, 'Alias owner');
    validateInterval(alias, 'Alias');
    if (!services.has(alias.serviceId)) {
      throw new ReverbError('unknown_service', 'Alias references an unknown service.');
    }
  }
  for (let leftIndex = 0; leftIndex < snapshot.aliases.length; leftIndex += 1) {
    const left = snapshot.aliases[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < snapshot.aliases.length; rightIndex += 1) {
      const right = snapshot.aliases[rightIndex];
      if (
        right &&
        left.kind === right.kind &&
        left.value === right.value &&
        left.environment === right.environment &&
        left.serviceId !== right.serviceId &&
        intervalsOverlap(left, right)
      ) {
        throw new ReverbError('ambiguous_alias', 'Service aliases overlap ambiguously.', {
          kind: left.kind,
          environment: left.environment,
        });
      }
    }
  }
  for (const consent of snapshot.consents) {
    nonEmpty(consent.grantee, 'Consent grantee');
    nonEmpty(consent.actor, 'Consent actor');
    nonEmpty(consent.reason, 'Consent reason');
    nonEmpty(consent.revision, 'Consent revision');
    if (!repositoryIds.has(consent.repositoryId)) {
      throw new ReverbError('unknown_repository', 'Consent references an unknown repository.');
    }
  }

  return snapshot;
}

export interface CreateRegistrySnapshotInput {
  readonly workspaceId: WorkspaceId;
  readonly sequence: number;
  readonly createdAt: Instant;
  readonly createdBy: string;
  readonly source: string;
  readonly reason: string;
  readonly repositories: readonly RepositoryMembership[];
  readonly services?: readonly ServiceIdentity[];
  readonly aliases?: readonly ServiceAlias[];
  readonly consents?: readonly ConsentGrant[];
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export function createRegistrySnapshot(input: CreateRegistrySnapshotInput): RegistrySnapshot {
  const content = {
    workspaceId: input.workspaceId,
    sequence: input.sequence,
    repositories: [...input.repositories].sort((left, right) =>
      left.repositoryId.localeCompare(right.repositoryId),
    ),
    services: [...(input.services ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    aliases: [...(input.aliases ?? [])].sort((left, right) =>
      `${left.kind}:${left.value}:${left.serviceId}`.localeCompare(
        `${right.kind}:${right.value}:${right.serviceId}`,
      ),
    ),
    consents: [...(input.consents ?? [])].sort((left, right) =>
      `${left.repositoryId}:${left.action}:${left.grantee}`.localeCompare(
        `${right.repositoryId}:${right.action}:${right.grantee}`,
      ),
    ),
    extensions: input.extensions ?? {},
  };
  const configHash = contentHash(hashCanonical(content));
  const revision = registryRevision(`reg_${hashCanonical({ ...content, configHash })}`);
  const config = configRevision(`cfg_${hashCanonical({ schemaVersion: '1.0', ...content })}`);
  return validateRegistrySnapshot({
    schema: 'reverb.workspace-registry',
    schemaVersion: '1.0',
    revision: {
      workspaceId: input.workspaceId,
      revision,
      configRevision: config,
      sequence: input.sequence,
      createdAt: input.createdAt,
      createdBy: input.createdBy,
      source: input.source,
      reason: input.reason,
      configHash,
    },
    repositories: content.repositories,
    services: content.services,
    aliases: content.aliases,
    consents: content.consents,
    extensions: content.extensions,
  });
}

export function registryCanonicalJson(snapshot: RegistrySnapshot): string {
  return canonicalJson(snapshot);
}

export interface AliasResolutionRequest {
  readonly kind: ServiceAliasKind;
  readonly value: string;
  readonly environment: string;
  readonly asOf: Instant;
  readonly path?: string;
}

export type AliasResolution =
  | { readonly state: 'not_found' }
  | {
      readonly state: 'ambiguous';
      readonly candidateServiceIds: readonly string[];
      readonly registryRevision: RegistryRevision;
    }
  | {
      readonly state: 'resolved';
      readonly service: ServiceIdentity;
      readonly alias: ServiceAlias;
      readonly registryRevision: RegistryRevision;
      readonly rewrittenPath?: string;
    };

function normalizedAliasValue(kind: ServiceAliasKind, value: string): string {
  const trimmed = value.normalize('NFC').trim();
  if (kind === 'host') return trimmed.toLowerCase().replace(/\.$/, '');
  if (kind === 'package_coordinate') return trimmed.toLowerCase();
  if (kind === 'path_prefix') return trimmed.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  return trimmed;
}

function activeAt(
  value: Pick<ServiceIdentity | ServiceAlias, 'validFrom' | 'validUntil'>,
  at: Instant,
): boolean {
  return value.validFrom <= at && (value.validUntil === undefined || at < value.validUntil);
}

function rewriteGatewayPath(
  path: string | undefined,
  prefix: RepoPath | undefined,
): string | undefined {
  if (path === undefined) return undefined;
  const normalizedPath = path.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  if (prefix === undefined) return normalizedPath;
  const normalizedPrefix = String(prefix).replace(/^\/+|\/+$/g, '');
  if (normalizedPath === normalizedPrefix) return '';
  return normalizedPath.startsWith(`${normalizedPrefix}/`)
    ? normalizedPath.slice(normalizedPrefix.length + 1)
    : undefined;
}

export function resolveServiceAlias(
  snapshot: RegistrySnapshot,
  request: AliasResolutionRequest,
): AliasResolution {
  validateRegistrySnapshot(snapshot);
  const services = new Map(
    snapshot.services
      .filter((service) => activeAt(service, request.asOf))
      .map((service) => [service.id, service]),
  );
  const requestedValue = normalizedAliasValue(request.kind, request.value);
  const candidates = snapshot.aliases
    .filter(
      (alias) =>
        alias.kind === request.kind &&
        alias.environment === request.environment &&
        activeAt(alias, request.asOf) &&
        services.has(alias.serviceId) &&
        normalizedAliasValue(alias.kind, alias.value) === requestedValue &&
        (request.path === undefined ||
          rewriteGatewayPath(request.path, alias.pathPrefix) !== undefined),
    )
    .sort((left, right) => {
      const prefixDifference = (right.pathPrefix?.length ?? 0) - (left.pathPrefix?.length ?? 0);
      return (
        prefixDifference ||
        `${left.serviceId}\0${left.value}`.localeCompare(`${right.serviceId}\0${right.value}`)
      );
    });
  const serviceIds = [...new Set(candidates.map((alias) => alias.serviceId))].sort();
  if (serviceIds.length === 0) return { state: 'not_found' };
  if (serviceIds.length > 1) {
    return {
      state: 'ambiguous',
      candidateServiceIds: serviceIds,
      registryRevision: snapshot.revision.revision,
    };
  }
  const alias = candidates[0]!;
  const rewrittenPath = rewriteGatewayPath(request.path, alias.pathPrefix);
  return {
    state: 'resolved',
    service: services.get(alias.serviceId)!,
    alias,
    registryRevision: snapshot.revision.revision,
    ...(rewrittenPath === undefined ? {} : { rewrittenPath }),
  };
}

export interface ServiceAliasSuggestion {
  readonly id: ContentHash;
  readonly alias: ServiceAlias;
  readonly evidence: string;
  readonly active: false;
}

export function createServiceAliasSuggestion(
  alias: ServiceAlias,
  evidence: string,
): ServiceAliasSuggestion {
  nonEmpty(evidence, 'Alias suggestion evidence');
  return {
    id: contentHash(hashCanonical({ alias, evidence })),
    alias,
    evidence,
    active: false,
  };
}

export function activateServiceAliasSuggestion(input: {
  readonly snapshot: RegistrySnapshot;
  readonly suggestion: ServiceAliasSuggestion;
  readonly approvedBy: string;
  readonly createdAt: Instant;
}): RegistrySnapshot {
  nonEmpty(input.approvedBy, 'Alias suggestion approver');
  return createRegistrySnapshot({
    workspaceId: input.snapshot.revision.workspaceId,
    sequence: input.snapshot.revision.sequence + 1,
    createdAt: input.createdAt,
    createdBy: input.approvedBy,
    source: 'operator alias approval',
    reason: `activate alias suggestion ${input.suggestion.id}`,
    repositories: input.snapshot.repositories,
    services: input.snapshot.services,
    aliases: [...input.snapshot.aliases, { ...input.suggestion.alias, provenance: 'operator' }],
    consents: input.snapshot.consents,
    extensions: input.snapshot.extensions,
  });
}
