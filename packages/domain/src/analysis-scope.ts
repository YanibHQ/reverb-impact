import { hashCanonical } from './canonical.js';
import { invariant } from './errors.js';
import type { RegistrySnapshot, RepositoryMembership } from './registry.js';
import { contentHash } from './values.js';
import type { ContentHash, RegistryRevision, RepositoryStableId, WorkspaceId } from './values.js';

export interface ConsumerScopeV2 {
  readonly mode: 'allowlist';
  readonly repositoryIds: readonly RepositoryStableId[];
}

export type AnalysisScopeMode = 'legacy' | 'allowlist';

export type AnalysisScopeGapReason =
  | 'unknown_repository'
  | 'repository_not_selected'
  | 'consent_denied'
  | 'authorization_denied'
  | 'authorization_unavailable';

export interface AnalysisScopeGap {
  readonly repositoryId: RepositoryStableId;
  readonly reason: AnalysisScopeGapReason;
}

export interface AnalysisScopeCandidate {
  readonly membership: RepositoryMembership;
  readonly producer: boolean;
  readonly requested: boolean;
}

export interface PreparedAnalysisScope {
  readonly workspaceId: WorkspaceId;
  readonly registryRevision: RegistryRevision;
  readonly producerRepositoryId: RepositoryStableId;
  readonly mode: AnalysisScopeMode;
  readonly requestedRepositoryIds: readonly RepositoryStableId[];
  readonly candidates: readonly AnalysisScopeCandidate[];
  readonly gaps: readonly AnalysisScopeGap[];
}

export interface AuthorizedScopeRepository {
  readonly repositoryId: RepositoryStableId;
  readonly producer: boolean;
  readonly requested: boolean;
  readonly consentRevision: string;
  readonly authorizationRevision: RegistryRevision;
  readonly authorizationDecisionHash: ContentHash;
}

export interface AnalysisScopeProvenanceV2 {
  readonly schema: 'reverb.analysis-scope';
  readonly schemaVersion: '2.0';
  readonly workspaceId: WorkspaceId;
  readonly registryRevision: RegistryRevision;
  readonly producerRepositoryId: RepositoryStableId;
  readonly mode: AnalysisScopeMode;
  readonly requestedRepositoryIds: readonly RepositoryStableId[];
  readonly repositories: readonly AuthorizedScopeRepository[];
  readonly gaps: readonly AnalysisScopeGap[];
  readonly scopeHash: ContentHash;
}

const scopedReadCapabilityBrand: unique symbol = Symbol('reverb.scoped-read-capability');

export interface ScopedReadCapability {
  readonly [scopedReadCapabilityBrand]: true;
  readonly workspaceId: WorkspaceId;
  readonly registryRevision: RegistryRevision;
  readonly scopeHash: ContentHash;
  readonly repositoryIds: readonly RepositoryStableId[];
}

function normalizedIds(ids: readonly RepositoryStableId[]): readonly RepositoryStableId[] {
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}

function applicableConsentDenied(
  registry: RegistrySnapshot,
  repositoryId: RepositoryStableId,
  consentGrantee: string,
): boolean {
  return registry.consents.some(
    (grant) =>
      grant.repositoryId === repositoryId &&
      grant.action === 'evidence.consume' &&
      (grant.grantee === consentGrantee || grant.grantee === '*') &&
      grant.decision === 'deny',
  );
}

export function prepareAnalysisScope(input: {
  readonly registry: RegistrySnapshot;
  readonly producerRepositoryId: RepositoryStableId;
  readonly consumerScope?: ConsumerScopeV2;
  readonly consentGrantee: string;
}): PreparedAnalysisScope {
  const memberships = new Map(
    input.registry.repositories.map((membership) => [membership.repositoryId, membership]),
  );
  const producer = memberships.get(input.producerRepositoryId);
  invariant(
    producer !== undefined && producer.selected,
    'unknown_repository',
    'The producer must be a selected member of the immutable registry revision.',
  );
  const mode: AnalysisScopeMode = input.consumerScope === undefined ? 'legacy' : 'allowlist';
  const explicitlyRequested = normalizedIds(input.consumerScope?.repositoryIds ?? []);
  const requestedRepositoryIds =
    mode === 'legacy'
      ? normalizedIds(
          input.registry.repositories
            .filter((membership) => membership.selected)
            .map((membership) => membership.repositoryId),
        )
      : explicitlyRequested;
  const considered = normalizedIds([...requestedRepositoryIds, input.producerRepositoryId]);
  const candidates: AnalysisScopeCandidate[] = [];
  const gaps: AnalysisScopeGap[] = [];
  for (const repositoryId of considered) {
    const membership = memberships.get(repositoryId);
    if (membership === undefined) {
      gaps.push({ repositoryId, reason: 'unknown_repository' });
      continue;
    }
    if (!membership.selected) {
      gaps.push({ repositoryId, reason: 'repository_not_selected' });
      continue;
    }
    if (applicableConsentDenied(input.registry, repositoryId, input.consentGrantee)) {
      gaps.push({ repositoryId, reason: 'consent_denied' });
      continue;
    }
    candidates.push({
      membership,
      producer: repositoryId === input.producerRepositoryId,
      requested: explicitlyRequested.includes(repositoryId),
    });
  }
  return {
    workspaceId: input.registry.revision.workspaceId,
    registryRevision: input.registry.revision.revision,
    producerRepositoryId: input.producerRepositoryId,
    mode,
    requestedRepositoryIds,
    candidates,
    gaps,
  };
}

export function finalizeAnalysisScope(input: {
  readonly prepared: PreparedAnalysisScope;
  readonly repositories: readonly AuthorizedScopeRepository[];
  readonly gaps?: readonly AnalysisScopeGap[];
}): { readonly provenance: AnalysisScopeProvenanceV2; readonly capability: ScopedReadCapability } {
  const repositories = [...input.repositories].sort((left, right) =>
    left.repositoryId.localeCompare(right.repositoryId),
  );
  invariant(
    repositories.some(
      (repository) =>
        repository.repositoryId === input.prepared.producerRepositoryId && repository.producer,
    ),
    'authorization_denied',
    'The producer must be authorized before scoped analysis can read evidence.',
  );
  invariant(
    repositories.every((repository, index) =>
      index === 0 ? true : repository.repositoryId !== repositories[index - 1]?.repositoryId,
    ),
    'invalid_schema',
    'Authorized scope repositories must be unique.',
  );
  const candidateIds = new Set(
    input.prepared.candidates.map((candidate) => candidate.membership.repositoryId),
  );
  invariant(
    repositories.every((repository) => candidateIds.has(repository.repositoryId)),
    'authorization_denied',
    'Authorized scope contains a repository outside the prepared membership and consent boundary.',
  );
  invariant(
    repositories.every(
      (repository) => repository.authorizationRevision === input.prepared.registryRevision,
    ),
    'authorization_denied',
    'Authorized scope decisions must match the immutable registry revision.',
  );
  const gaps = [...input.prepared.gaps, ...(input.gaps ?? [])].sort((left, right) =>
    `${left.repositoryId}\0${left.reason}`.localeCompare(`${right.repositoryId}\0${right.reason}`),
  );
  const canonical = {
    schema: 'reverb.analysis-scope' as const,
    schemaVersion: '2.0' as const,
    workspaceId: input.prepared.workspaceId,
    registryRevision: input.prepared.registryRevision,
    producerRepositoryId: input.prepared.producerRepositoryId,
    mode: input.prepared.mode,
    requestedRepositoryIds: input.prepared.requestedRepositoryIds,
    repositories,
    gaps,
  };
  const scopeHash = contentHash(hashCanonical(canonical));
  const provenance: AnalysisScopeProvenanceV2 = Object.freeze({ ...canonical, scopeHash });
  const capability: ScopedReadCapability = Object.freeze({
    [scopedReadCapabilityBrand]: true as const,
    workspaceId: provenance.workspaceId,
    registryRevision: provenance.registryRevision,
    scopeHash,
    repositoryIds: Object.freeze(repositories.map((repository) => repository.repositoryId)),
  });
  return { provenance, capability };
}

export function assertScopedRepositoryRead(
  capability: ScopedReadCapability,
  workspaceId: WorkspaceId,
  repositoryId: RepositoryStableId,
): void {
  invariant(
    capability.workspaceId === workspaceId && capability.repositoryIds.includes(repositoryId),
    'authorization_denied',
    'Repository read is outside the resolved analysis scope.',
  );
}

export function isRepositoryInAnalysisScope(
  capability: ScopedReadCapability,
  repositoryId: RepositoryStableId,
): boolean {
  return capability.repositoryIds.includes(repositoryId);
}
