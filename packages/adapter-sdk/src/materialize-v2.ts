import {
  contentHash,
  deriveStableReferenceIdV2,
  hashCanonical,
  type CommitSha,
  type ContractGenerationObservationV2,
  type GenerationId,
  type IndexedContractChangeV2,
  type IndexedContractDefinitionV2,
  type IndexedContractReferenceV2,
  type Instant,
  type RepositoryStableId,
  type WorkspaceId,
} from '@yanib/reverb-domain';

import type { AdapterDiffResultV2, AdapterExtractionResultV2 } from './types-v2.js';

export function materializeContractObservationV2(input: {
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly generationId: GenerationId;
  readonly commitSha: CommitSha;
  readonly observedAt: Instant;
  readonly extraction: AdapterExtractionResultV2;
}): ContractGenerationObservationV2 {
  const definitions: IndexedContractDefinitionV2[] = input.extraction.definitions.map((value) => ({
    workspaceId: input.workspaceId,
    repositoryId: input.repositoryId,
    generationId: input.generationId,
    commitSha: input.commitSha,
    family: input.extraction.family,
    contractKind: value.contractKind,
    canonicalKey: value.canonicalKey,
    path: value.path,
    ...(value.range === undefined ? {} : { range: value.range }),
    contentHash: value.contentHash,
    shapeHash: value.shapeHash,
    adapterId: value.extractorId,
    adapterVersion: value.extractorVersion,
    extractionVersion: value.extractionVersion,
    identityVersion: value.identityVersion,
    partitioningVersion: value.partitioningVersion,
    compatibilityVersion: value.compatibilityVersion,
    configRevision: value.configRevision,
    evidenceStratum: value.evidenceStratum,
  }));
  const references: IndexedContractReferenceV2[] = input.extraction.references.map((value) => ({
    workspaceId: input.workspaceId,
    repositoryId: input.repositoryId,
    generationId: input.generationId,
    commitSha: input.commitSha,
    family: input.extraction.family,
    contractKind: value.contractKind,
    ...(value.canonicalKey === undefined ? {} : { canonicalKey: value.canonicalKey }),
    ...(value.unresolvedPattern === undefined
      ? {}
      : {
          unresolvedPattern: value.unresolvedPattern,
          unresolvedReason: value.unresolvedReason,
        }),
    ...(value.semanticOwner === undefined ? {} : { semanticOwner: value.semanticOwner }),
    stableReferenceId: deriveStableReferenceIdV2({
      family: input.extraction.family,
      contractKind: value.contractKind,
      ...(value.canonicalKey === undefined
        ? { unresolvedPattern: value.unresolvedPattern }
        : { canonicalKey: value.canonicalKey }),
      ...(value.semanticOwner === undefined ? {} : { semanticOwner: value.semanticOwner }),
      evidenceStratum: value.evidenceStratum,
    }),
    path: value.path,
    ...(value.range === undefined ? {} : { range: value.range }),
    contentHash: value.contentHash,
    adapterId: value.extractorId,
    adapterVersion: value.extractorVersion,
    extractionVersion: value.extractionVersion,
    identityVersion: value.identityVersion,
    partitioningVersion: value.partitioningVersion,
    compatibilityVersion: value.compatibilityVersion,
    configRevision: value.configRevision,
    evidenceStratum: value.evidenceStratum,
    activation: value.activation,
  }));
  const canonical = {
    schema: 'reverb.contract-observation' as const,
    schemaVersion: '2.0' as const,
    workspaceId: input.workspaceId,
    repositoryId: input.repositoryId,
    generationId: input.generationId,
    commitSha: input.commitSha,
    family: input.extraction.family,
    coverageState: input.extraction.coverage.state,
    definitions: definitions.sort((left, right) =>
      `${left.contractKind}\0${left.canonicalKey}\0${left.path}`.localeCompare(
        `${right.contractKind}\0${right.canonicalKey}\0${right.path}`,
      ),
    ),
    references: references.sort((left, right) =>
      left.stableReferenceId.localeCompare(right.stableReferenceId),
    ),
    observedAt: input.observedAt,
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

export function materializeContractChangesV2(input: {
  readonly workspaceId: WorkspaceId;
  readonly producerRepositoryId: RepositoryStableId;
  readonly baseGenerationId: GenerationId;
  readonly headGenerationId: GenerationId;
  readonly baseSha: CommitSha;
  readonly headSha: CommitSha;
  readonly diff: AdapterDiffResultV2;
}): readonly IndexedContractChangeV2[] {
  return input.diff.changes
    .map((value): IndexedContractChangeV2 => ({
      workspaceId: input.workspaceId,
      producerRepositoryId: input.producerRepositoryId,
      baseGenerationId: input.baseGenerationId,
      headGenerationId: input.headGenerationId,
      baseSha: input.baseSha,
      headSha: input.headSha,
      family: input.diff.family,
      contractKind: value.contractKind,
      canonicalKey: value.canonicalKey,
      changeKind: value.changeKind,
      compatibility: value.compatibility,
      activation: value.activation,
      adapterId: input.diff.adapterId,
      adapterVersion: input.diff.adapterVersion,
      extractionVersion: input.diff.extractionVersion,
      identityVersion: input.diff.identityVersion,
      partitioningVersion: input.diff.partitioningVersion,
      compatibilityVersion: input.diff.compatibilityVersion,
      coverageState: input.diff.coverage.state,
      coverageDependencies: value.coverageDependencies,
      remedy: value.remedy,
    }))
    .sort((left, right) =>
      `${left.contractKind}\0${left.canonicalKey}\0${left.changeKind}`.localeCompare(
        `${right.contractKind}\0${right.canonicalKey}\0${right.changeKind}`,
      ),
    );
}
