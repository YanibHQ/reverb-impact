import {
  contentHash,
  deriveStableReferenceId,
  hashCanonical,
  type CommitSha,
  type ContractGenerationObservation,
  type GenerationId,
  type IndexedContractChange,
  type IndexedContractDefinition,
  type IndexedContractReference,
  type Instant,
  type RepositoryStableId,
  type WorkspaceId,
} from '@yanibhq/reverb-domain';

import type { AdapterDiffResult, AdapterExtractionResult } from './types.js';

function observationCoverage(
  extractions: readonly AdapterExtractionResult[],
): ContractGenerationObservation['coverageState'] {
  const itemCount = extractions.reduce(
    (count, extraction) => count + extraction.definitions.length + extraction.references.length,
    0,
  );
  if (extractions.length === 0) return 'unsupported';
  if (extractions.every((value) => value.coverage.state === 'unsupported') && itemCount === 0) {
    return 'unsupported';
  }
  if (
    extractions.every(
      (value) => value.coverage.state === 'failed' || value.coverage.state === 'unsupported',
    ) &&
    itemCount === 0
  ) {
    return 'failed';
  }
  return extractions.every((value) => value.coverage.state === 'complete') ? 'complete' : 'partial';
}

export function materializeContractObservation(input: {
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly generationId: GenerationId;
  readonly commitSha: CommitSha;
  readonly observedAt: Instant;
  readonly extractions: readonly AdapterExtractionResult[];
  readonly serviceId?: string;
}): ContractGenerationObservation {
  const definitions: IndexedContractDefinition[] = input.extractions.flatMap((extraction) =>
    extraction.definitions.map((definition) => ({
      workspaceId: input.workspaceId,
      repositoryId: input.repositoryId,
      generationId: input.generationId,
      commitSha: input.commitSha,
      ...(input.serviceId === undefined ? {} : { serviceId: input.serviceId }),
      contractKind: definition.contractKind,
      canonicalKey: definition.canonicalKey,
      path: definition.path,
      ...(definition.range === undefined ? {} : { range: definition.range }),
      contentHash: definition.contentHash,
      shapeHash: definition.shapeHash,
      adapterId: definition.extractorId,
      adapterVersion: definition.extractorVersion,
      identityVersion: definition.identityVersion,
      configRevision: definition.configRevision,
      evidenceStratum: definition.evidenceStratum,
    })),
  );
  const referencesById = new Map<string, IndexedContractReference>();
  for (const extraction of input.extractions) {
    for (const reference of extraction.references) {
      const stableId = deriveStableReferenceId({
        contractKind: reference.contractKind,
        ...(reference.canonicalKey === undefined
          ? { unresolvedPattern: reference.unresolvedPattern ?? 'unknown' }
          : { canonicalKey: reference.canonicalKey }),
        ...(reference.semanticOwner === undefined
          ? {}
          : { semanticOwner: reference.semanticOwner }),
        evidenceStratum: reference.evidenceStratum,
      });
      const indexed: IndexedContractReference = {
        workspaceId: input.workspaceId,
        repositoryId: input.repositoryId,
        generationId: input.generationId,
        commitSha: input.commitSha,
        ...(input.serviceId === undefined ? {} : { consumerServiceId: input.serviceId }),
        contractKind: reference.contractKind,
        ...(reference.canonicalKey === undefined ? {} : { canonicalKey: reference.canonicalKey }),
        ...(reference.unresolvedPattern === undefined
          ? {}
          : { unresolvedPattern: reference.unresolvedPattern }),
        stableReferenceId: stableId,
        path: reference.path,
        ...(reference.range === undefined ? {} : { range: reference.range }),
        contentHash: reference.contentHash,
        adapterId: reference.extractorId,
        adapterVersion: reference.extractorVersion,
        identityVersion: reference.identityVersion,
        configRevision: reference.configRevision,
        evidenceStratum: reference.evidenceStratum,
        activation: reference.activation,
      };
      const prior = referencesById.get(stableId);
      if (prior === undefined || indexed.path < prior.path) referencesById.set(stableId, indexed);
    }
  }
  const canonicalDefinitions = definitions.sort((left, right) =>
    `${left.contractKind}\0${left.canonicalKey}\0${left.path}`.localeCompare(
      `${right.contractKind}\0${right.canonicalKey}\0${right.path}`,
    ),
  );
  const references = [...referencesById.values()].sort((left, right) =>
    left.stableReferenceId.localeCompare(right.stableReferenceId),
  );
  const canonical = {
    workspaceId: input.workspaceId,
    repositoryId: input.repositoryId,
    generationId: input.generationId,
    commitSha: input.commitSha,
    coverageState: observationCoverage(input.extractions),
    definitions: canonicalDefinitions,
    references,
    observedAt: input.observedAt,
  } as const;
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

export function materializeContractChanges(input: {
  readonly workspaceId: WorkspaceId;
  readonly producerRepositoryId: RepositoryStableId;
  readonly baseGenerationId: GenerationId;
  readonly headGenerationId?: GenerationId;
  readonly baseSha: CommitSha;
  readonly headSha: CommitSha;
  readonly diffs: readonly AdapterDiffResult[];
}): readonly IndexedContractChange[] {
  return input.diffs
    .flatMap((diff) =>
      diff.changes.map(
        (change): IndexedContractChange => ({
          workspaceId: input.workspaceId,
          producerRepositoryId: input.producerRepositoryId,
          baseGenerationId: input.baseGenerationId,
          ...(input.headGenerationId === undefined
            ? {}
            : { headGenerationId: input.headGenerationId }),
          baseSha: input.baseSha,
          headSha: input.headSha,
          contractKind: change.contractKind,
          canonicalKey: change.canonicalKey,
          changeKind: change.changeKind,
          compatibility: change.compatibility,
          activation: change.activation,
          adapterId: diff.adapterId,
          adapterVersion: diff.adapterVersion,
          identityVersion: diff.identityVersion,
          coverageState: diff.coverage.state,
          coverageDependencies: change.coverageDependencies,
          remedy: change.remedy,
        }),
      ),
    )
    .sort((left, right) =>
      `${left.contractKind}\0${left.canonicalKey}`.localeCompare(
        `${right.contractKind}\0${right.canonicalKey}`,
      ),
    );
}
