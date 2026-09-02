import {
  assertScopedRepositoryRead,
  type CommitSha,
  type ContractGenerationObservation,
  type FileArtifact,
  type GenerationId,
  type RepositoryStableId,
  type ScopedReadCapability,
  type WorkspaceId,
} from '@yanib/reverb-domain';

import { portFailure } from './ports.js';
import type {
  ConsumerRefreshPort,
  ConsumerRefreshRequest,
  EvidenceGraphStore,
  GenerationSelection,
  GenerationSelectionResult,
  GenerationStore,
  PortResult,
  ReferenceQuery,
  RepositoryReader,
} from './ports.js';

function enforceScope(
  capability: ScopedReadCapability,
  workspaceId: WorkspaceId,
  repositoryId: RepositoryStableId,
): PortResult<void> {
  try {
    assertScopedRepositoryRead(capability, workspaceId, repositoryId);
    return { ok: true, value: undefined };
  } catch {
    return portFailure({
      kind: 'authorization_denied',
      code: 'repository_outside_analysis_scope',
      safeMessage: 'Repository read is outside the resolved analysis scope.',
      retryable: false,
    });
  }
}

export class ScopedRepositoryReader {
  public constructor(private readonly reader: RepositoryReader) {}

  public async resolveRepository(
    capability: ScopedReadCapability,
    workspaceId: WorkspaceId,
    repositoryId: RepositoryStableId,
  ) {
    const allowed = enforceScope(capability, workspaceId, repositoryId);
    return allowed.ok ? this.reader.resolveRepository(repositoryId) : allowed;
  }

  public async resolveCommit(
    capability: ScopedReadCapability,
    workspaceId: WorkspaceId,
    repositoryId: RepositoryStableId,
    ref: string,
  ) {
    const allowed = enforceScope(capability, workspaceId, repositoryId);
    return allowed.ok ? this.reader.resolveCommit(repositoryId, ref) : allowed;
  }

  public async listTree(
    capability: ScopedReadCapability,
    workspaceId: WorkspaceId,
    repositoryId: RepositoryStableId,
    sha: CommitSha,
  ) {
    const allowed = enforceScope(capability, workspaceId, repositoryId);
    return allowed.ok ? this.reader.listTree(repositoryId, sha) : allowed;
  }

  public async readBlob(
    capability: ScopedReadCapability,
    workspaceId: WorkspaceId,
    repositoryId: RepositoryStableId,
    sha: CommitSha,
    path: FileArtifact['path'],
    maximumBytes: number,
  ) {
    const allowed = enforceScope(capability, workspaceId, repositoryId);
    return allowed.ok ? this.reader.readBlob(repositoryId, sha, path, maximumBytes) : allowed;
  }

  public async compare(
    capability: ScopedReadCapability,
    workspaceId: WorkspaceId,
    repositoryId: RepositoryStableId,
    base: CommitSha,
    head: CommitSha,
  ) {
    const allowed = enforceScope(capability, workspaceId, repositoryId);
    return allowed.ok ? this.reader.compare(repositoryId, base, head) : allowed;
  }
}

export class ScopedConsumerEvidenceReader {
  public constructor(
    private readonly generations: GenerationStore,
    private readonly evidence: EvidenceGraphStore,
    private readonly refresh?: ConsumerRefreshPort,
  ) {}

  public async selectGeneration(
    capability: ScopedReadCapability,
    query: GenerationSelection,
  ): Promise<PortResult<GenerationSelectionResult>> {
    const allowed = enforceScope(capability, query.workspaceId, query.repositoryId);
    return allowed.ok ? this.generations.selectGeneration(query) : allowed;
  }

  public async getContractObservation(
    capability: ScopedReadCapability,
    workspaceId: WorkspaceId,
    repositoryId: RepositoryStableId,
    generationId: GenerationId,
  ): Promise<PortResult<ContractGenerationObservation | null>> {
    const allowed = enforceScope(capability, workspaceId, repositoryId);
    if (!allowed.ok) return allowed;
    const observation = await this.evidence.getContractObservation(generationId);
    if (!observation.ok || observation.value === null) return observation;
    if (
      observation.value.workspaceId !== workspaceId ||
      observation.value.repositoryId !== repositoryId ||
      observation.value.generationId !== generationId
    ) {
      return portFailure({
        kind: 'domain',
        code: 'scoped_observation_mismatch',
        safeMessage: 'Contract observation does not match the scoped repository generation.',
        retryable: false,
      });
    }
    return observation;
  }

  public async readReferences(
    capability: ScopedReadCapability,
    query: ReferenceQuery & {
      readonly repositories: readonly {
        readonly repositoryId: RepositoryStableId;
        readonly generationId: GenerationId;
      }[];
    },
  ) {
    for (const repository of query.repositories) {
      const allowed = enforceScope(capability, query.workspaceId, repository.repositoryId);
      if (!allowed.ok) return allowed;
    }
    const generationIds = query.repositories.map((repository) => repository.generationId);
    const references = await this.evidence.readReferences({
      workspaceId: query.workspaceId,
      generationIds,
      ...(query.contractKind === undefined ? {} : { contractKind: query.contractKind }),
      ...(query.canonicalKeys === undefined ? {} : { canonicalKeys: query.canonicalKeys }),
    });
    if (!references.ok) return references;
    const allowedPairs = new Set(
      query.repositories.map(
        (repository) => `${repository.repositoryId}\0${repository.generationId}`,
      ),
    );
    if (
      references.value.some(
        (reference) =>
          reference.workspaceId !== query.workspaceId ||
          !allowedPairs.has(`${reference.repositoryId}\0${reference.generationId}`),
      )
    ) {
      return portFailure({
        kind: 'domain',
        code: 'scoped_reference_mismatch',
        safeMessage: 'Evidence store returned a reference outside the resolved analysis scope.',
        retryable: false,
      });
    }
    return references;
  }

  public async refreshConsumer(capability: ScopedReadCapability, request: ConsumerRefreshRequest) {
    const allowed = enforceScope(capability, request.workspaceId, request.repositoryId);
    if (!allowed.ok) return allowed;
    if (this.refresh === undefined) {
      return portFailure({
        kind: 'incomplete_provider_data',
        code: 'consumer_refresh_unavailable',
        safeMessage: 'Consumer refresh is not available in this host.',
        retryable: false,
      });
    }
    return this.refresh.refresh(request);
  }
}
