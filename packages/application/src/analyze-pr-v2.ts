import {
  assertReasoningRunScope,
  canonicalJson,
  createDeterministicFindingsV2,
  finalizeAnalysisResultV2,
  finalizeReasoningRunV2,
  joinChangedContractsV2,
  type AdapterFamilyV2,
  type AnalysisResultV2,
  type ConsumerScopeV2,
  type ExecutionBudgetLimitsV2,
  type IndexedContractChangeV2,
  type IndexedContractDefinitionV2,
  type IndexedContractReferenceV2,
  type RegistryRevision,
  type RegistrySnapshot,
  type WorkspaceId,
} from '@yanib/reverb-domain';

import { ResolveAnalysisScope } from './analysis-scope.js';
import { composeAnalysisCoverageV2 } from './analysis-coverage-v2.js';
import type { RepositoryCoverageSourceV2 } from './analysis-coverage-v2.js';
import { ExecutionBudgetV2 } from './execution-budget-v2.js';
import {
  AnalyzePullRequest,
  type AnalyzePullRequestDependencies,
  type AnalyzePullRequestInput,
} from './analyze-pr.js';
import { portFailure, portSuccess } from './ports.js';
import type {
  AuthorizationPort,
  AnalysisResultStoreV2,
  DisclosureRequest,
  PortResult,
  Subject,
  WorkspaceRegistry,
} from './ports.js';
import type { ReasoningAnalysisPortV2, ReasoningRequestV2 } from './reasoning-v2.js';

export interface AnalyzePullRequestV2Input extends AnalyzePullRequestInput {
  readonly schemaMajor: 2;
  readonly subject: Subject;
  readonly consumerScope?: ConsumerScopeV2;
  readonly enabledAdapterFamilies: readonly AdapterFamilyV2[];
  readonly executionBudget: ExecutionBudgetLimitsV2;
  readonly reasoning?: ReasoningRequestV2;
  readonly deterministicEvidence?: {
    readonly definitions: readonly IndexedContractDefinitionV2[];
    readonly references: readonly IndexedContractReferenceV2[];
    readonly changes: readonly IndexedContractChangeV2[];
  };
}

export interface AnalyzePullRequestV2Dependencies extends AnalyzePullRequestDependencies {
  readonly authorization: AuthorizationPort;
  readonly coverage?: RepositoryCoverageSourceV2;
  readonly v2Results: AnalysisResultStoreV2;
  readonly reasoning?: ReasoningAnalysisPortV2;
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
    const budget = new ExecutionBudgetV2(
      'pull_request',
      input.executionBudget,
      this.dependencies.clock,
    );
    const registryReservation = budget.reserve({ storageQueries: 1 });
    if (!registryReservation.ok) return registryReservation;
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
    const deterministicReservation = budget.reserve({
      storageQueries:
        6 +
        Math.max(0, repositoryIds.length - 1) * 2 +
        (input.enabledAdapterFamilies.length === 0 ? 0 : repositoryIds.length),
      artifacts:
        input.changes.length +
        input.producerDefinitions.length +
        input.producerHeadObservation.references.length +
        (input.deterministicEvidence?.definitions.length ?? 0) +
        (input.deterministicEvidence?.references.length ?? 0) +
        (input.deterministicEvidence?.changes.length ?? 0),
    });
    if (!deterministicReservation.ok) return deterministicReservation;
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
    const coverage = await composeAnalysisCoverageV2({
      scope: resolved.value.provenance,
      capability: resolved.value.capability,
      enabledFamilies: input.enabledAdapterFamilies,
      selections: legacy.value.consumers,
      ...(this.dependencies.coverage === undefined ? {} : { source: this.dependencies.coverage }),
    });
    const budgetReport = budget.complete();
    const newFamilyFindings =
      input.deterministicEvidence === undefined
        ? []
        : createDeterministicFindingsV2({
            analysisId: legacy.value.analysisId,
            policyMajor: input.policyMajor,
            changes: input.deterministicEvidence.changes,
            edges: joinChangedContractsV2({
              capability: resolved.value.capability,
              workspaceId: input.workspaceId,
              registryRevision: input.registryRevision,
              observedAt: this.dependencies.clock.now(),
              changes: input.deterministicEvidence.changes,
              definitions: input.deterministicEvidence.definitions,
              references: input.deterministicEvidence.references,
              selectedGenerations: new Map(
                legacy.value.consumers.flatMap((selection) =>
                  selection.generationId === undefined
                    ? []
                    : [
                        [
                          selection.repositoryId,
                          {
                            generationId: selection.generationId,
                            commitSha: selection.commitSha,
                          },
                        ] as const,
                      ],
                ),
              ),
            }),
          });
    const state =
      legacy.value.state === 'superseded'
        ? 'superseded'
        : legacy.value.state === 'partial' ||
            resolved.value.provenance.gaps.length > 0 ||
            coverage.state === 'partial' ||
            budgetReport.exhaustedDimensions.length > 0
          ? 'partial'
          : 'complete';
    let reasoningOutcome;
    if (input.reasoning?.enabled === true && this.dependencies.reasoning !== undefined) {
      try {
        const reasoned = await this.dependencies.reasoning.analyze({
          analysisId: legacy.value.analysisId,
          subject: input.subject,
          scope: resolved.value.provenance,
          capability: resolved.value.capability,
          definitions: input.deterministicEvidence?.definitions ?? [],
          references: input.deterministicEvidence?.references ?? [],
          changes: input.deterministicEvidence?.changes ?? [],
          executionBudget: input.reasoning.executionBudget,
        });
        if (reasoned.ok) {
          assertReasoningRunScope(reasoned.value.run, resolved.value.provenance);
          const { outputHash: _runOutputHash, ...runInput } = reasoned.value.run;
          void _runOutputHash;
          if (
            reasoned.value.run.state !== 'deleted' &&
            reasoned.value.run.analysisId === legacy.value.analysisId &&
            reasoned.value.executionBudget.lane === 'reasoning' &&
            canonicalJson(finalizeReasoningRunV2(runInput)) === canonicalJson(reasoned.value.run) &&
            canonicalJson(reasoned.value.run.executionBudget) ===
              canonicalJson(reasoned.value.executionBudget) &&
            canonicalJson(reasoned.value.run.hypotheses) ===
              canonicalJson(reasoned.value.hypotheses)
          )
            reasoningOutcome = reasoned.value;
        }
      } catch {
        // Optional reasoning is failure-isolated from deterministic analysis.
      }
    }
    const resultState =
      state === 'superseded'
        ? state
        : reasoningOutcome !== undefined && reasoningOutcome.run.state !== 'complete'
          ? 'partial'
          : state;
    const result = finalizeAnalysisResultV2({
      schema: 'reverb.analysis-result',
      schemaVersion: '2.0',
      legacyResult: legacy.value,
      scope: resolved.value.provenance,
      coverage,
      state: resultState,
      executionBudgets:
        reasoningOutcome === undefined
          ? [budgetReport]
          : [budgetReport, reasoningOutcome.executionBudget],
      deterministicFindings: [...legacy.value.findings, ...newFamilyFindings],
      reasoningHypotheses: reasoningOutcome?.hypotheses ?? [],
    });
    const persisted = await this.dependencies.v2Results.persistAnalysisV2(
      result,
      reasoningOutcome?.run,
    );
    return persisted.ok ? portSuccess(result) : persisted;
  }
}
