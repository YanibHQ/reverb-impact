import {
  assertScopedRepositoryRead,
  canonicalJson,
  finalizeAdapterFamilyCoverageV2,
  finalizeAnalysisCoverageV2,
  finalizeRepositoryAnalysisCoverageV2,
  type AdapterFamilyV2,
  type AnalysisCoverageV2,
  type AnalysisScopeProvenanceV2,
  type ConsumerGenerationSelection,
  type RepositoryAnalysisCoverageV2,
  type ScopedReadCapability,
} from '@yanib/reverb-domain';

import type { PortResult } from './ports.js';

export interface RepositoryCoverageQueryV2 {
  readonly workspaceId: AnalysisScopeProvenanceV2['workspaceId'];
  readonly registryRevision: AnalysisScopeProvenanceV2['registryRevision'];
  readonly scopeHash: AnalysisScopeProvenanceV2['scopeHash'];
  readonly repositoryId: ConsumerGenerationSelection['repositoryId'];
  readonly generationId: NonNullable<ConsumerGenerationSelection['generationId']>;
  readonly commitSha: NonNullable<ConsumerGenerationSelection['commitSha']>;
  readonly selectionState: ConsumerGenerationSelection['state'];
  readonly selectedAt?: ConsumerGenerationSelection['selectedAt'];
  readonly freshnessAgeMs?: ConsumerGenerationSelection['freshnessAgeMs'];
  readonly enabledFamilies: readonly AdapterFamilyV2[];
}

export interface RepositoryCoverageSourceV2 {
  readRepositoryCoverage(
    capability: ScopedReadCapability,
    query: RepositoryCoverageQueryV2,
  ): Promise<PortResult<RepositoryAnalysisCoverageV2 | null>>;
}

function unavailableFamily(family: AdapterFamilyV2, code: string) {
  return finalizeAdapterFamilyCoverageV2({
    family,
    state: 'not_analysed',
    eligibleArtifacts: 0,
    processedArtifacts: 0,
    skippedArtifacts: 0,
    failedArtifacts: 0,
    adapters: [],
    limitations: [{ source: 'selection', code }],
  });
}

function repositoryFromSelection(input: {
  readonly scope: AnalysisScopeProvenanceV2;
  readonly selection: ConsumerGenerationSelection;
  readonly families: RepositoryAnalysisCoverageV2['families'];
}): RepositoryAnalysisCoverageV2 {
  const common = {
    workspaceId: input.scope.workspaceId,
    registryRevision: input.scope.registryRevision,
    repositoryId: input.selection.repositoryId,
    role:
      input.selection.repositoryId === input.scope.producerRepositoryId
        ? ('producer_consumer' as const)
        : ('consumer' as const),
    selectionState: input.selection.state,
    families: input.families,
  };
  if (input.selection.state === 'current' || input.selection.state === 'stale') {
    return finalizeRepositoryAnalysisCoverageV2({
      ...common,
      generationId: input.selection.generationId,
      commitSha: input.selection.commitSha,
      selectedAt: input.selection.selectedAt,
      freshnessAgeMs: input.selection.freshnessAgeMs,
    });
  }
  return finalizeRepositoryAnalysisCoverageV2({
    ...common,
    ...(input.selection.generationId === undefined
      ? {}
      : { generationId: input.selection.generationId }),
    ...(input.selection.commitSha === undefined ? {} : { commitSha: input.selection.commitSha }),
    ...(input.selection.selectedAt === undefined ? {} : { selectedAt: input.selection.selectedAt }),
    selectionReason: input.selection.reason,
  });
}

function matchesQuery(
  coverage: RepositoryAnalysisCoverageV2,
  query: RepositoryCoverageQueryV2,
  role: RepositoryAnalysisCoverageV2['role'],
): boolean {
  try {
    const { outputHash: _outputHash, ...coverageInput } = coverage;
    void _outputHash;
    return (
      coverage.workspaceId === query.workspaceId &&
      coverage.registryRevision === query.registryRevision &&
      coverage.repositoryId === query.repositoryId &&
      coverage.generationId === query.generationId &&
      coverage.commitSha === query.commitSha &&
      coverage.selectionState === query.selectionState &&
      coverage.selectedAt === query.selectedAt &&
      coverage.freshnessAgeMs === query.freshnessAgeMs &&
      coverage.role === role &&
      coverage.families.length === query.enabledFamilies.length &&
      coverage.families.every((family, index) => family.family === query.enabledFamilies[index]) &&
      canonicalJson(finalizeRepositoryAnalysisCoverageV2(coverageInput)) === canonicalJson(coverage)
    );
  } catch {
    return false;
  }
}

export async function composeAnalysisCoverageV2(input: {
  readonly scope: AnalysisScopeProvenanceV2;
  readonly capability: ScopedReadCapability;
  readonly enabledFamilies: readonly AdapterFamilyV2[];
  readonly selections: readonly ConsumerGenerationSelection[];
  readonly source?: RepositoryCoverageSourceV2;
}): Promise<AnalysisCoverageV2> {
  const enabledFamilies = [...new Set(input.enabledFamilies)].sort((left, right) =>
    left.localeCompare(right),
  );
  const selections = new Map(
    input.selections.map((selection) => [selection.repositoryId, selection]),
  );
  const repositories: RepositoryAnalysisCoverageV2[] = [];
  for (const authorized of input.scope.repositories) {
    const selection = selections.get(authorized.repositoryId);
    if (selection === undefined) {
      throw new Error('Legacy analysis omitted an authorized repository selection.');
    }
    const unavailable = (code: string) =>
      repositoryFromSelection({
        scope: input.scope,
        selection,
        families: enabledFamilies.map((family) => unavailableFamily(family, code)),
      });
    if (
      enabledFamilies.length === 0 ||
      input.source === undefined ||
      selection.generationId === undefined ||
      selection.commitSha === undefined
    ) {
      repositories.push(
        enabledFamilies.length === 0
          ? repositoryFromSelection({ scope: input.scope, selection, families: [] })
          : unavailable(`repository_${selection.state}`),
      );
      continue;
    }
    assertScopedRepositoryRead(input.capability, input.scope.workspaceId, selection.repositoryId);
    const query: RepositoryCoverageQueryV2 = {
      workspaceId: input.scope.workspaceId,
      registryRevision: input.scope.registryRevision,
      scopeHash: input.scope.scopeHash,
      repositoryId: selection.repositoryId,
      generationId: selection.generationId,
      commitSha: selection.commitSha,
      selectionState: selection.state,
      ...(selection.selectedAt === undefined ? {} : { selectedAt: selection.selectedAt }),
      ...(selection.freshnessAgeMs === undefined
        ? {}
        : { freshnessAgeMs: selection.freshnessAgeMs }),
      enabledFamilies,
    };
    let result;
    try {
      result = await input.source.readRepositoryCoverage(input.capability, query);
    } catch {
      repositories.push(unavailable('family_coverage_unavailable'));
      continue;
    }
    const role =
      selection.repositoryId === input.scope.producerRepositoryId
        ? 'producer_consumer'
        : 'consumer';
    if (!result.ok || result.value === null || !matchesQuery(result.value, query, role)) {
      repositories.push(unavailable('family_coverage_unavailable'));
      continue;
    }
    repositories.push(result.value);
  }
  return finalizeAnalysisCoverageV2({ scope: input.scope, enabledFamilies, repositories });
}
