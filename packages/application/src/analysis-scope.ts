import {
  contentHash,
  finalizeAnalysisScope,
  hashCanonical,
  prepareAnalysisScope,
  type AnalysisScopeGap,
  type AnalysisScopeProvenanceV2,
  type ConsumerScopeV2,
  type RegistrySnapshot,
  type RepositoryStableId,
  type ScopedReadCapability,
  type WorkspaceId,
} from '@yanib/reverb-domain';

import { portFailure, portSuccess } from './ports.js';
import type { AuthorizationPort, PortResult, Subject } from './ports.js';

export interface ResolveAnalysisScopeInput {
  readonly workspaceId: WorkspaceId;
  readonly registry: RegistrySnapshot;
  readonly producerRepositoryId: RepositoryStableId;
  readonly consumerScope?: ConsumerScopeV2;
  readonly subject: Subject;
}

export interface ResolvedAnalysisScope {
  readonly provenance: AnalysisScopeProvenanceV2;
  readonly capability: ScopedReadCapability;
}

export class ResolveAnalysisScope {
  public constructor(private readonly authorization: AuthorizationPort) {}

  public async execute(
    input: ResolveAnalysisScopeInput,
  ): Promise<PortResult<ResolvedAnalysisScope>> {
    if (
      input.registry.revision.workspaceId !== input.workspaceId ||
      input.registry.schemaVersion !== '1.0'
    ) {
      return portFailure({
        kind: 'domain',
        code: 'registry_scope_mismatch',
        safeMessage: 'Analysis scope requires the requested immutable workspace registry revision.',
        retryable: false,
      });
    }
    const prepared = prepareAnalysisScope({
      registry: input.registry,
      producerRepositoryId: input.producerRepositoryId,
      ...(input.consumerScope === undefined ? {} : { consumerScope: input.consumerScope }),
      consentGrantee: input.subject.id,
    });
    const repositories = [];
    const gaps: AnalysisScopeGap[] = [];
    for (const candidate of prepared.candidates) {
      const decision = await this.authorization.authorizeRepositoryUse(
        input.subject,
        'evidence.consume',
        candidate.membership.repositoryId,
      );
      if (!decision.ok) {
        gaps.push({
          repositoryId: candidate.membership.repositoryId,
          reason: 'authorization_unavailable',
        });
        continue;
      }
      if (!decision.value.allowed || decision.value.revision !== input.registry.revision.revision) {
        gaps.push({
          repositoryId: candidate.membership.repositoryId,
          reason: 'authorization_denied',
        });
        continue;
      }
      repositories.push({
        repositoryId: candidate.membership.repositoryId,
        producer: candidate.producer,
        requested: candidate.requested,
        consentRevision: candidate.membership.consentRevision,
        authorizationRevision: decision.value.revision,
        authorizationDecisionHash: contentHash(
          hashCanonical({
            subject: input.subject,
            action: 'evidence.consume',
            repositoryId: candidate.membership.repositoryId,
            decision: decision.value,
          }),
        ),
      });
    }
    try {
      return portSuccess(finalizeAnalysisScope({ prepared, repositories, gaps }));
    } catch (error) {
      return portFailure({
        kind: 'authorization_denied',
        code:
          error instanceof Error && 'code' in error ? String(error.code) : 'authorization_denied',
        safeMessage: 'Producer authorization is required for scoped analysis.',
        retryable: false,
      });
    }
  }
}
