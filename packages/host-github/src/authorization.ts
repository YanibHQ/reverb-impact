import { contentHash, hashCanonical } from '@yanib/reverb-domain';
import type {
  AuthorizationDecision,
  AuthorizationPort,
  DisclosureProjection,
  DisclosureRequest,
  PortResult,
  Subject,
} from '@yanib/reverb-application';
import { portFailure, portSuccess } from '@yanib/reverb-application';
import { registryRevision } from '@yanib/reverb-domain';
import type {
  RegistrySnapshot,
  RepositoryAction,
  RepositoryStableId,
  WorkspaceId,
} from '@yanib/reverb-domain';

export interface CurrentRegistryProvider {
  current(workspaceId: WorkspaceId): Promise<RegistrySnapshot | null>;
}

export interface GitHubAccessFacts {
  readonly appCanRead: boolean;
  readonly appCanWriteChecks: boolean;
  readonly wholeAudienceSafeFields: readonly DisclosureRequest['requestedFields'][number][];
  readonly viewerCanRead: boolean;
  readonly authorizationRevision: string;
}

export interface GitHubAccessProvider {
  current(input: {
    readonly workspaceId: WorkspaceId;
    readonly repositoryId: RepositoryStableId;
    readonly viewer?: Subject;
  }): Promise<GitHubAccessFacts>;
}

function consentFor(
  registry: RegistrySnapshot,
  subject: Subject,
  action: RepositoryAction,
  repositoryId: RepositoryStableId,
): 'allow' | 'deny' {
  return (
    [...registry.consents]
      .reverse()
      .find(
        (value) =>
          value.repositoryId === repositoryId &&
          value.action === action &&
          (value.grantee === subject.id || value.grantee === '*'),
      )?.decision ?? 'deny'
  );
}

export class GitHubAuthorization implements AuthorizationPort {
  readonly #registries: CurrentRegistryProvider;
  readonly #access: GitHubAccessProvider;

  public constructor(registries: CurrentRegistryProvider, access: GitHubAccessProvider) {
    this.#registries = registries;
    this.#access = access;
  }

  public async authorizeRepositoryUse(
    subject: Subject,
    action: RepositoryAction,
    repository: RepositoryStableId,
  ): Promise<PortResult<AuthorizationDecision>> {
    const registry = await this.#findRegistry(repository);
    if (!registry) {
      return portSuccess({
        allowed: false,
        reason: 'not_in_current_workspace_scope',
        revision: registryRevision(
          'reg_sha256:0000000000000000000000000000000000000000000000000000000000000000',
        ),
      });
    }
    const membership = registry.repositories.find((value) => value.repositoryId === repository);
    const provider = await this.#access.current({
      workspaceId: registry.revision.workspaceId,
      repositoryId: repository,
      ...(subject.kind === 'user' ? { viewer: subject } : {}),
    });
    const consent = consentFor(registry, subject, action, repository);
    const providerAllows =
      action === 'producer_check.write'
        ? provider.appCanWriteChecks
        : action === 'consumer.write'
          ? false
          : provider.appCanRead;
    const allowed = Boolean(membership?.selected) && consent === 'allow' && providerAllows;
    return portSuccess({
      allowed,
      reason: allowed
        ? 'current_consent_and_provider_grant'
        : !membership?.selected
          ? 'repository_not_selected'
          : consent !== 'allow'
            ? 'current_consent_denied'
            : 'current_provider_grant_denied',
      revision: registry.revision.revision,
    });
  }

  public async projectDisclosure(
    input: DisclosureRequest,
  ): Promise<PortResult<DisclosureProjection>> {
    const registry = await this.#registries.current(input.workspaceId);
    if (!registry) {
      return portFailure({
        kind: 'not_found',
        code: 'not_found',
        safeMessage: 'Resource not found.',
        retryable: false,
      });
    }
    const provider = await this.#access.current({
      workspaceId: input.workspaceId,
      repositoryId: input.destinationRepositoryId,
      ...(input.viewer === undefined ? {} : { viewer: input.viewer }),
    });
    const actionByField = {
      repository_identity: 'identity.disclose',
      contract_identity: 'contract.disclose',
      location: 'location.disclose',
      snippet: 'location.disclose',
    } as const satisfies Readonly<Record<string, RepositoryAction>>;
    const allowedFields = input.requestedFields.filter((field) => {
      const consent = consentFor(
        registry,
        input.viewer ?? { kind: 'workspace', id: '*' },
        actionByField[field],
        input.destinationRepositoryId,
      );
      if (consent !== 'allow' || !provider.appCanRead) return false;
      return input.audience === 'static'
        ? provider.wholeAudienceSafeFields.includes(field)
        : provider.viewerCanRead;
    });
    const omittedFields = input.requestedFields.filter((field) => !allowedFields.includes(field));
    return portSuccess({
      allowedFields,
      omittedFields,
      decisionHash: contentHash(
        hashCanonical({
          workspaceId: input.workspaceId,
          destinationRepositoryId: input.destinationRepositoryId,
          audience: input.audience,
          allowedFields,
          authorizationRevision: provider.authorizationRevision,
        }),
      ),
      registryRevision: registry.revision.revision,
    });
  }

  async #findRegistry(repository: RepositoryStableId): Promise<RegistrySnapshot | null> {
    const workspaceId = this.#workspaceFromRepository.get(repository);
    if (!workspaceId) return null;
    return this.#registries.current(workspaceId);
  }

  readonly #workspaceFromRepository = new Map<RepositoryStableId, WorkspaceId>();

  public bindRepository(workspaceId: WorkspaceId, repositoryId: RepositoryStableId): void {
    this.#workspaceFromRepository.set(repositoryId, workspaceId);
  }
}
