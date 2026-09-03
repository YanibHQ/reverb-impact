import {
  REPOSITORY_ACTIONS,
  createRegistrySnapshot,
  repositoryStableId,
} from '@yanib/reverb-domain';
import type {
  ConsentGrant,
  Instant,
  RegistrySnapshot,
  RepositoryAction,
  WorkspaceId,
} from '@yanib/reverb-domain';

export interface GitHubSelectedRepository {
  readonly id: number;
  readonly name: string;
  readonly defaultBranch: string;
  readonly selected: boolean;
  readonly visibility: 'public' | 'private' | 'internal';
  readonly collections: readonly string[];
  readonly grants?: Partial<Readonly<Record<RepositoryAction, 'allow' | 'deny'>>>;
}

export function syncGitHubRepositorySelection(input: {
  readonly workspaceId: WorkspaceId;
  readonly previous?: RegistrySnapshot;
  readonly repositories: readonly GitHubSelectedRepository[];
  readonly repositorySelection: 'selected' | 'all';
  readonly organizationWideOptIn: boolean;
  readonly installationId: number;
  readonly createdAt: Instant;
  readonly actor: string;
  readonly consentRevision: string;
}): RegistrySnapshot {
  if (input.repositorySelection === 'all' && !input.organizationWideOptIn) {
    throw new Error('Organization-wide repository selection requires a separate explicit opt-in.');
  }
  const repositories = input.repositories
    .filter((repository) => input.repositorySelection === 'all' || repository.selected)
    .map((repository) => ({
      repositoryId: repositoryStableId(`github:${repository.id}`),
      alias: repository.name,
      defaultBranch: repository.defaultBranch,
      collections: [...repository.collections].sort(),
      selected: repository.selected || input.repositorySelection === 'all',
      consentRevision: input.consentRevision,
    }));
  const consents: ConsentGrant[] = [];
  for (const repository of input.repositories) {
    if (!repositories.some((value) => value.repositoryId === `github:${repository.id}`)) continue;
    for (const action of REPOSITORY_ACTIONS) {
      const requested = repository.grants?.[action] ?? 'deny';
      const decision = action === 'consumer.write' ? 'deny' : requested;
      consents.push({
        repositoryId: repositoryStableId(`github:${repository.id}`),
        action,
        grantee: input.actor,
        decision,
        actor: input.actor,
        reason: decision === 'allow' ? 'explicit_provider_collection_consent' : 'default_deny',
        revision: input.consentRevision,
      });
    }
  }
  const retainedRepositoryIds = new Set(repositories.map((repository) => repository.repositoryId));
  const services = (input.previous?.services ?? []).filter((service) =>
    retainedRepositoryIds.has(service.repositoryId),
  );
  const retainedServiceIds = new Set(services.map((service) => service.id));
  const aliases = (input.previous?.aliases ?? []).filter((alias) =>
    retainedServiceIds.has(alias.serviceId),
  );
  return createRegistrySnapshot({
    workspaceId: input.workspaceId,
    sequence: (input.previous?.revision.sequence ?? 0) + 1,
    createdAt: input.createdAt,
    createdBy: input.actor,
    source: 'github-installation-reconciliation',
    reason: 'selected_repository_scope_sync',
    repositories,
    services,
    aliases,
    consents,
    extensions: {
      provider: 'github',
      installationId: input.installationId,
      repositorySelection: input.repositorySelection,
      organizationWideOptIn: input.organizationWideOptIn,
      repositoryVisibility: Object.fromEntries(
        input.repositories
          .filter((repository) => input.repositorySelection === 'all' || repository.selected)
          .map((repository) => [`github:${repository.id}`, repository.visibility]),
      ),
    },
  });
}
