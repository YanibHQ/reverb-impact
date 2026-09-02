import {
  finalizeAnalysisResultV2,
  type AnalysisResultV2,
  type ConsumerScopeV2,
  type RegistryRevision,
  type RegistrySnapshot,
  type WorkspaceId,
} from '@yanib/reverb-domain';

import { ResolveAnalysisScope } from './analysis-scope.js';
import {
  AnalyzePullRequest,
  type AnalyzePullRequestDependencies,
  type AnalyzePullRequestInput,
} from './analyze-pr.js';
import { portFailure, portSuccess } from './ports.js';
import type {
  AuthorizationPort,
  DisclosureRequest,
  PortResult,
  Subject,
  WorkspaceRegistry,
} from './ports.js';

export interface AnalyzePullRequestV2Input extends AnalyzePullRequestInput {
  readonly schemaMajor: 2;
  readonly subject: Subject;
  readonly consumerScope?: ConsumerScopeV2;
}

export interface AnalyzePullRequestV2Dependencies extends AnalyzePullRequestDependencies {
  readonly authorization: AuthorizationPort;
}

function scopedRegistry(
  snapshot: RegistrySnapshot,
  repositoryIds: readonly string[],
): RegistrySnapshot {
  const included = new Set(repositoryIds);
  const repositories = snapshot.repositories.filter((value) => included.has(value.repositoryId));
  const services = snapshot.services.filter((value) => included.has(value.repositoryId));
  const serviceIds = new Set(services.map((value) => value.id));
  return Object.freeze({
    ...snapshot,
    repositories,
    services,
    aliases: snapshot.aliases.filter((value) => serviceIds.has(value.serviceId)),
    consents: snapshot.consents.filter((value) => included.has(value.repositoryId)),
  });
}

class FixedRegistry implements WorkspaceRegistry {
  public constructor(private readonly snapshot: RegistrySnapshot) {}

  public async getRevision(
    _workspace: WorkspaceId,
    _revision: RegistryRevision,
  ): Promise<PortResult<RegistrySnapshot>> {
    return portSuccess(this.snapshot);
  }

  public async getCurrentRevision(_workspace: WorkspaceId): Promise<PortResult<RegistrySnapshot>> {
    return portSuccess(this.snapshot);
  }

  public async putRevision(): Promise<PortResult<RegistryRevision>> {
    return portFailure({
      kind: 'domain',
      code: 'immutable_scope_registry',
      safeMessage: 'A resolved analysis scope cannot mutate its registry revision.',
      retryable: false,
    });
  }
}

class FixedScopeAuthorization implements AuthorizationPort {
  readonly #repositoryIds: ReadonlySet<string>;

  public constructor(
    repositoryIds: readonly string[],
    private readonly original: AuthorizationPort,
    private readonly revision: RegistryRevision,
  ) {
    this.#repositoryIds = new Set(repositoryIds);
  }

  public async authorizeRepositoryUse(
    _subject: Subject,
    action: Parameters<AuthorizationPort['authorizeRepositoryUse']>[1],
    repository: Parameters<AuthorizationPort['authorizeRepositoryUse']>[2],
  ) {
    return portSuccess({
      allowed: action === 'evidence.consume' && this.#repositoryIds.has(repository),
      reason: this.#repositoryIds.has(repository) ? 'resolved_scope' : 'outside_resolved_scope',
      revision: this.revision,
    });
  }

  public async projectDisclosure(input: DisclosureRequest) {
    return this.original.projectDisclosure(input);
  }
}

export class AnalyzePullRequestV2 {
  public constructor(private readonly dependencies: AnalyzePullRequestV2Dependencies) {}

  public async execute(input: AnalyzePullRequestV2Input): Promise<PortResult<AnalysisResultV2>> {
    if (input.schemaMajor !== 2) {
      return portFailure({
        kind: 'domain',
        code: 'unsupported_schema_major',
        safeMessage: 'AnalyzePullRequestV2 requires schema major 2.',
        retryable: false,
      });
    }
    const registry = await this.dependencies.registry.getRevision(
      input.workspaceId,
      input.registryRevision,
    );
    if (!registry.ok) return registry;
    const resolved = await new ResolveAnalysisScope(this.dependencies.authorization).execute({
      workspaceId: input.workspaceId,
      registry: registry.value,
      producerRepositoryId: input.producerRepositoryId,
      ...(input.consumerScope === undefined ? {} : { consumerScope: input.consumerScope }),
      subject: input.subject,
    });
    if (!resolved.ok) return resolved;

    const repositoryIds = resolved.value.capability.repositoryIds;
    const legacyInput: AnalyzePullRequestInput = input;
    const legacy = await new AnalyzePullRequest({
      ...this.dependencies,
      registry: new FixedRegistry(scopedRegistry(registry.value, repositoryIds)),
      authorization: new FixedScopeAuthorization(
        repositoryIds,
        this.dependencies.authorization,
        input.registryRevision,
      ),
    }).execute(legacyInput);
    if (!legacy.ok) return legacy;
    const state =
      legacy.value.state === 'superseded'
        ? 'superseded'
        : legacy.value.state === 'partial' || resolved.value.provenance.gaps.length > 0
          ? 'partial'
          : 'complete';
    return portSuccess(
      finalizeAnalysisResultV2({
        schema: 'reverb.analysis-result',
        schemaVersion: '2.0',
        legacyResult: legacy.value,
        scope: resolved.value.provenance,
        state,
        deterministicFindings: legacy.value.findings,
        reasoningHypotheses: [],
      }),
    );
  }
}
