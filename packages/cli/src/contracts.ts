import {
  contentHash,
  hashCanonical,
  sha256Bytes,
  type CommitSha,
  type ContractGenerationObservation,
  type GenerationId,
  type Instant,
  type RegistrySnapshot,
  type RepositoryStableId,
  type WorkspaceId,
} from '@yanib/reverb-domain';
import type {
  EvidenceGraphStore,
  GenerationStore,
  RepositoryReader,
} from '@yanib/reverb-application';
import { openApiAdapter } from '@yanib/reverb-adapter-openapi';
import { protobufAdapter } from '@yanib/reverb-adapter-protobuf';
import {
  materializeContractObservation,
  type AdapterExtractionResult,
  type ArtifactInput,
} from '@yanib/reverb-adapter-sdk';
import { typeScriptAdapter } from '@yanib/reverb-adapter-typescript';

const MAXIMUM_CONTRACT_FILE_BYTES = 4 * 1024 * 1024;
const MAXIMUM_CONTRACT_FILES = 10_000;

function activeService(
  registry: RegistrySnapshot,
  repositoryId: RepositoryStableId,
  at: Instant,
): string | undefined {
  const candidates = registry.services
    .filter(
      (service) =>
        service.repositoryId === repositoryId &&
        service.validFrom <= at &&
        (service.validUntil === undefined || at < service.validUntil),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  return candidates.length === 1 ? candidates[0]?.id : undefined;
}

export async function extractContractsAtCommit(input: {
  readonly reader: RepositoryReader;
  readonly generations: GenerationStore;
  readonly registry: RegistrySnapshot;
  readonly repositoryId: RepositoryStableId;
  readonly generationId: GenerationId;
  readonly commitSha: CommitSha;
  readonly observedAt: Instant;
}): Promise<{
  readonly extractions: readonly AdapterExtractionResult[];
  readonly incompleteInput: boolean;
  readonly serviceId?: string;
}> {
  const artifacts = await input.generations.listArtifacts(input.generationId);
  if (!artifacts.ok) throw new Error(artifacts.failure.safeMessage);
  let incompleteInput = artifacts.value.length > MAXIMUM_CONTRACT_FILES;
  const adapterInputs: ArtifactInput[] = [];
  for (const artifact of artifacts.value.slice(0, MAXIMUM_CONTRACT_FILES)) {
    if (
      artifact.classification !== 'source' &&
      artifact.classification !== 'generated' &&
      artifact.classification !== 'vendored'
    ) {
      continue;
    }
    if (artifact.size > MAXIMUM_CONTRACT_FILE_BYTES || artifact.parseState === 'failed') {
      incompleteInput = true;
      continue;
    }
    const blob = await input.reader.readBlob(
      input.repositoryId,
      input.commitSha,
      artifact.path,
      MAXIMUM_CONTRACT_FILE_BYTES,
    );
    if (!blob.ok || !blob.value.complete) {
      incompleteInput = true;
      continue;
    }
    adapterInputs.push({
      path: artifact.path,
      contentHash: artifact.contentHash ?? contentHash(sha256Bytes(blob.value.bytes)),
      bytes: blob.value.bytes,
      classification: artifact.classification,
    });
  }
  const serviceId = activeService(input.registry, input.repositoryId, input.observedAt);
  const [typeScript, openApi, protobuf] = await Promise.all([
    typeScriptAdapter.extract({
      artifacts: adapterInputs,
      configRevision: input.registry.revision.configRevision,
      context: { packageRegistry: 'npm' },
    }),
    openApiAdapter.extract({
      artifacts: adapterInputs,
      configRevision: input.registry.revision.configRevision,
      context: serviceId === undefined ? {} : { serviceId },
    }),
    protobufAdapter.extract({
      artifacts: adapterInputs,
      configRevision: input.registry.revision.configRevision,
      context: {},
    }),
  ]);
  return {
    extractions: [typeScript, openApi, protobuf],
    incompleteInput,
    ...(serviceId === undefined ? {} : { serviceId }),
  };
}

export async function ensureContractObservation(input: {
  readonly reader: RepositoryReader;
  readonly generations: GenerationStore;
  readonly evidence: EvidenceGraphStore;
  readonly registry: RegistrySnapshot;
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly generationId: GenerationId;
  readonly commitSha: CommitSha;
  readonly observedAt: Instant;
}): Promise<ContractGenerationObservation> {
  const existing = await input.evidence.getContractObservation(input.generationId);
  if (!existing.ok) throw new Error(existing.failure.safeMessage);
  if (existing.value !== null) return existing.value;
  const generation = await input.generations.getGeneration(input.generationId);
  if (!generation.ok) throw new Error(generation.failure.safeMessage);
  const extracted = await extractContractsAtCommit(input);
  const materialized = materializeContractObservation({
    workspaceId: input.workspaceId,
    repositoryId: input.repositoryId,
    generationId: input.generationId,
    commitSha: input.commitSha,
    observedAt: input.observedAt,
    extractions: extracted.extractions,
    ...(extracted.serviceId === undefined ? {} : { serviceId: extracted.serviceId }),
  });
  const incomplete =
    extracted.incompleteInput ||
    generation.value.state === 'partial' ||
    materialized.coverageState !== 'complete';
  const coverageState =
    incomplete &&
    materialized.coverageState !== 'failed' &&
    materialized.coverageState !== 'unsupported'
      ? ('partial' as const)
      : materialized.coverageState;
  const payload = {
    workspaceId: materialized.workspaceId,
    repositoryId: materialized.repositoryId,
    generationId: materialized.generationId,
    commitSha: materialized.commitSha,
    coverageState,
    definitions: materialized.definitions,
    references: materialized.references,
    observedAt: materialized.observedAt,
  };
  const observation = {
    ...payload,
    outputHash: contentHash(hashCanonical(payload)),
  };
  const written = await input.evidence.putContractObservation(observation);
  if (!written.ok) throw new Error(written.failure.safeMessage);
  return observation;
}

export const INITIAL_ADAPTERS = Object.freeze([typeScriptAdapter, openApiAdapter, protobufAdapter]);
