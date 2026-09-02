import type { AnalysisScopeGap, AnalysisScopeProvenanceV2 } from './analysis-scope.js';
import { canonicalJson, hashCanonical } from './canonical.js';
import { invariant } from './errors.js';
import { contentHash } from './values.js';
import type {
  AdapterId,
  CommitSha,
  ConfigRevision,
  ContentHash,
  GenerationId,
  Instant,
  RegistryRevision,
  RepositoryStableId,
  WorkspaceId,
} from './values.js';
import { CONSUMER_SELECTION_STATES, type ConsumerSelectionState } from './vocabularies.js';

export const ADAPTER_FAMILIES_V2 = [
  'events',
  'database',
  'implicit_http',
  'configuration',
  'infrastructure',
] as const;
export type AdapterFamilyV2 = (typeof ADAPTER_FAMILIES_V2)[number];

export const FAMILY_COVERAGE_STATES_V2 = [
  'complete',
  'partial',
  'failed',
  'unsupported',
  'not_analysed',
] as const;
export type FamilyCoverageStateV2 = (typeof FAMILY_COVERAGE_STATES_V2)[number];

export interface CoverageLimitationV2 {
  readonly code: string;
  readonly source: 'source' | 'adapter' | 'selection' | 'budget';
  readonly detailHash?: ContentHash;
}

export interface AdapterExecutionProvenanceV2 {
  readonly adapterId: AdapterId;
  readonly adapterVersion: string;
  readonly extractionVersion: string;
  readonly identityVersion: number;
  readonly partitioningVersion: number;
  readonly compatibilityVersion: string;
  readonly configRevision: ConfigRevision;
  readonly outputHash: ContentHash;
}

export interface AdapterFamilyCoverageV2 {
  readonly family: AdapterFamilyV2;
  readonly state: FamilyCoverageStateV2;
  readonly eligibleArtifacts: number;
  readonly processedArtifacts: number;
  readonly skippedArtifacts: number;
  readonly failedArtifacts: number;
  readonly adapters: readonly AdapterExecutionProvenanceV2[];
  readonly limitations: readonly CoverageLimitationV2[];
  readonly outputHash: ContentHash;
}

export interface RepositoryAnalysisCoverageV2 {
  readonly workspaceId: WorkspaceId;
  readonly registryRevision: RegistryRevision;
  readonly repositoryId: RepositoryStableId;
  readonly role: 'producer_consumer' | 'consumer';
  readonly selectionState: ConsumerSelectionState;
  readonly generationId?: GenerationId;
  readonly commitSha?: CommitSha;
  readonly selectedAt?: Instant;
  readonly freshnessAgeMs?: number;
  readonly selectionReason?: string;
  readonly families: readonly AdapterFamilyCoverageV2[];
  readonly outputHash: ContentHash;
}

export interface AnalysisCoverageV2 {
  readonly schema: 'reverb.analysis-coverage';
  readonly schemaVersion: '2.0';
  readonly workspaceId: WorkspaceId;
  readonly registryRevision: RegistryRevision;
  readonly scopeHash: ContentHash;
  readonly enabledFamilies: readonly AdapterFamilyV2[];
  readonly repositories: readonly RepositoryAnalysisCoverageV2[];
  readonly scopeGaps: readonly AnalysisScopeGap[];
  readonly state: 'complete' | 'partial';
  readonly outputHash: ContentHash;
}

function boundedText(value: string, label: string, maximum = 128): void {
  const printable = [...value].every((character) => {
    const point = character.codePointAt(0)!;
    return point >= 0x20 && point !== 0x7f;
  });
  invariant(
    value.length > 0 && value.length <= maximum && printable,
    'invalid_schema',
    `${label} must be bounded printable text.`,
  );
}

function nonNegativeInteger(value: number, label: string): void {
  invariant(
    Number.isSafeInteger(value) && value >= 0,
    'invalid_schema',
    `${label} must be a non-negative safe integer.`,
  );
}

function adapterKey(adapter: AdapterExecutionProvenanceV2): string {
  return adapter.adapterId;
}

function limitationKey(limitation: CoverageLimitationV2): string {
  return `${limitation.source}\0${limitation.code}\0${limitation.detailHash ?? ''}`;
}

export function finalizeAdapterFamilyCoverageV2(
  input: Omit<AdapterFamilyCoverageV2, 'outputHash'>,
): AdapterFamilyCoverageV2 {
  invariant(
    ADAPTER_FAMILIES_V2.includes(input.family),
    'invalid_schema',
    'Adapter family is not supported by schema major 2.',
  );
  invariant(
    FAMILY_COVERAGE_STATES_V2.includes(input.state),
    'invalid_schema',
    'Family coverage state is not supported by schema major 2.',
  );
  for (const [label, value] of Object.entries({
    eligibleArtifacts: input.eligibleArtifacts,
    processedArtifacts: input.processedArtifacts,
    skippedArtifacts: input.skippedArtifacts,
    failedArtifacts: input.failedArtifacts,
  })) {
    nonNegativeInteger(value, label);
  }
  invariant(
    input.processedArtifacts + input.skippedArtifacts + input.failedArtifacts <=
      input.eligibleArtifacts,
    'invalid_schema',
    'Family coverage cannot account for more artifacts than were eligible.',
  );
  const adapters = [...input.adapters].sort((left, right) =>
    adapterKey(left).localeCompare(adapterKey(right)),
  );
  invariant(
    adapters.every(
      (adapter, index) => index === 0 || adapterKey(adapter) !== adapterKey(adapters[index - 1]!),
    ),
    'invalid_schema',
    'Family coverage adapter provenance must be unique.',
  );
  for (const adapter of adapters) {
    boundedText(adapter.adapterVersion, 'Adapter version');
    boundedText(adapter.extractionVersion, 'Extraction version');
    boundedText(adapter.compatibilityVersion, 'Compatibility version');
    invariant(
      Number.isSafeInteger(adapter.identityVersion) && adapter.identityVersion > 0,
      'invalid_schema',
      'Adapter identity version must be a positive safe integer.',
    );
    invariant(
      Number.isSafeInteger(adapter.partitioningVersion) && adapter.partitioningVersion > 0,
      'invalid_schema',
      'Adapter partitioning version must be a positive safe integer.',
    );
  }
  const limitations = [...input.limitations].sort((left, right) =>
    limitationKey(left).localeCompare(limitationKey(right)),
  );
  limitations.forEach((limitation) => {
    boundedText(limitation.code, 'Coverage limitation', 192);
    invariant(
      ['source', 'adapter', 'selection', 'budget'].includes(limitation.source),
      'invalid_schema',
      'Coverage limitation source is unsupported.',
    );
  });
  invariant(
    limitations.every(
      (limitation, index) =>
        index === 0 || limitationKey(limitation) !== limitationKey(limitations[index - 1]!),
    ),
    'invalid_schema',
    'Family coverage limitations must be unique.',
  );
  if (input.state === 'complete') {
    invariant(
      input.failedArtifacts === 0 &&
        input.processedArtifacts + input.skippedArtifacts === input.eligibleArtifacts &&
        limitations.length === 0,
      'invalid_schema',
      'Complete family coverage must account for every artifact without failures or limitations.',
    );
  } else {
    invariant(
      limitations.length > 0,
      'invalid_schema',
      'Non-complete family coverage requires an explicit limitation.',
    );
  }
  if (input.state === 'not_analysed') {
    invariant(
      input.eligibleArtifacts === 0 &&
        input.processedArtifacts === 0 &&
        input.skippedArtifacts === 0 &&
        input.failedArtifacts === 0 &&
        adapters.length === 0,
      'invalid_schema',
      'A family that was not analysed cannot report artifacts or adapter execution.',
    );
  } else {
    invariant(
      adapters.length > 0,
      'invalid_schema',
      'Analysed family coverage requires adapter provenance.',
    );
  }
  const canonical = { ...input, adapters, limitations };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

export function finalizeRepositoryAnalysisCoverageV2(
  input: Omit<RepositoryAnalysisCoverageV2, 'outputHash'>,
): RepositoryAnalysisCoverageV2 {
  invariant(
    input.role === 'producer_consumer' || input.role === 'consumer',
    'invalid_schema',
    'Repository coverage role is unsupported.',
  );
  invariant(
    CONSUMER_SELECTION_STATES.includes(input.selectionState),
    'invalid_schema',
    'Repository selection state is unsupported.',
  );
  if (input.selectionState === 'current' || input.selectionState === 'stale') {
    invariant(
      input.generationId !== undefined &&
        input.commitSha !== undefined &&
        input.selectedAt !== undefined &&
        input.freshnessAgeMs !== undefined &&
        input.selectionReason === undefined,
      'invalid_schema',
      'Selected repository coverage requires exact generation, commit, time, and freshness provenance.',
    );
    nonNegativeInteger(input.freshnessAgeMs, 'Freshness age');
  } else {
    invariant(
      input.selectionReason !== undefined,
      'invalid_schema',
      'Unavailable repository coverage requires a bounded selection reason.',
    );
    boundedText(input.selectionReason, 'Selection reason', 192);
    if (input.selectionState === 'unsupported') {
      invariant(
        input.generationId !== undefined && input.commitSha !== undefined,
        'invalid_schema',
        'Unsupported repository coverage requires its exact generation and commit.',
      );
    } else {
      invariant(
        input.generationId === undefined &&
          input.commitSha === undefined &&
          input.selectedAt === undefined &&
          input.freshnessAgeMs === undefined,
        'invalid_schema',
        'Unavailable repository coverage cannot claim generation selection provenance.',
      );
    }
  }
  const families = [...input.families].sort((left, right) =>
    left.family.localeCompare(right.family),
  );
  invariant(
    families.every((family, index) => index === 0 || family.family !== families[index - 1]?.family),
    'invalid_schema',
    'Repository family coverage must be unique.',
  );
  for (const family of families) {
    const { outputHash: _outputHash, ...familyInput } = family;
    void _outputHash;
    invariant(
      canonicalJson(finalizeAdapterFamilyCoverageV2(familyInput)) === canonicalJson(family),
      'invalid_schema',
      'Repository family coverage must be canonical.',
    );
  }
  const canonical = { ...input, families };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

export function finalizeAnalysisCoverageV2(input: {
  readonly scope: AnalysisScopeProvenanceV2;
  readonly enabledFamilies: readonly AdapterFamilyV2[];
  readonly repositories: readonly RepositoryAnalysisCoverageV2[];
}): AnalysisCoverageV2 {
  const enabledFamilies = [...new Set(input.enabledFamilies)].sort((left, right) =>
    left.localeCompare(right),
  );
  const repositories = [...input.repositories].sort((left, right) =>
    left.repositoryId.localeCompare(right.repositoryId),
  );
  const expectedRepositories = input.scope.repositories
    .map((repository) => repository.repositoryId)
    .sort((left, right) => left.localeCompare(right));
  invariant(
    repositories.length === expectedRepositories.length &&
      repositories.every(
        (repository, index) => repository.repositoryId === expectedRepositories[index],
      ),
    'invalid_schema',
    'Analysis coverage must contain exactly the authorized scope repositories.',
  );
  for (const repository of repositories) {
    invariant(
      repository.workspaceId === input.scope.workspaceId &&
        repository.registryRevision === input.scope.registryRevision,
      'invalid_schema',
      'Repository coverage must match the analysis workspace and immutable registry revision.',
    );
    invariant(
      repository.families.length === enabledFamilies.length &&
        repository.families.every((family, index) => family.family === enabledFamilies[index]),
      'invalid_schema',
      'Every authorized repository requires exactly one record for every enabled family.',
    );
    const { outputHash: _outputHash, ...repositoryInput } = repository;
    void _outputHash;
    invariant(
      canonicalJson(finalizeRepositoryAnalysisCoverageV2(repositoryInput)) ===
        canonicalJson(repository),
      'invalid_schema',
      'Repository analysis coverage must be canonical.',
    );
  }
  const producer = repositories.find(
    (repository) => repository.repositoryId === input.scope.producerRepositoryId,
  );
  invariant(
    producer?.role === 'producer_consumer',
    'invalid_schema',
    'Analysis coverage must represent the producer as a consumer at the exact head.',
  );
  invariant(
    repositories.every(
      (repository) =>
        repository.repositoryId === input.scope.producerRepositoryId ||
        repository.role === 'consumer',
    ),
    'invalid_schema',
    'Only the producer repository can have the producer-consumer role.',
  );
  const scopeGaps = [...input.scope.gaps].sort((left, right) =>
    `${left.repositoryId}\0${left.reason}`.localeCompare(`${right.repositoryId}\0${right.reason}`),
  );
  const state: AnalysisCoverageV2['state'] =
    scopeGaps.length > 0 ||
    repositories.some(
      (repository) =>
        repository.selectionState !== 'current' ||
        repository.families.some((family) => family.state !== 'complete'),
    )
      ? 'partial'
      : 'complete';
  const canonical = {
    schema: 'reverb.analysis-coverage' as const,
    schemaVersion: '2.0' as const,
    workspaceId: input.scope.workspaceId,
    registryRevision: input.scope.registryRevision,
    scopeHash: input.scope.scopeHash,
    enabledFamilies,
    repositories,
    scopeGaps,
    state,
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}
