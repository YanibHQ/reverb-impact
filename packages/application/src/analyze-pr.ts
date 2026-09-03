import {
  analysisSupersessionKey,
  createFindingOccurrences,
  finalizeAnalysisResult,
  joinChangedContracts,
  matchSuppression,
  type AnalysisId,
  type AnalysisResult,
  type ContractGenerationObservation,
  type ConsumerGenerationSelection,
  type FindingAbstention,
  type FindingOccurrence,
  type IndexedContractChange,
  type IndexedContractDefinition,
  type OverlayId,
  type PolicyRevision,
  type RegistryRevision,
  type RepositoryMembership,
  type RepositoryStableId,
  type WorkspaceId,
  type SuppressionVersionContext,
} from '@yanib/reverb-domain';

import { portFailure, portSuccess } from './ports.js';
import type {
  AuthorizationPort,
  CancellationPort,
  Clock,
  ConsumerRefreshPort,
  EvidenceGraphStore,
  GenerationStore,
  PortFailure,
  PortResult,
  Subject,
  WorkspaceRegistry,
  ReviewEvaluationStore,
} from './ports.js';

export interface AnalyzePullRequestInput {
  readonly analysisId: AnalysisId;
  readonly workspaceId: WorkspaceId;
  readonly registryRevision: RegistryRevision;
  readonly policyRevision: PolicyRevision;
  readonly policyMajor: number;
  readonly producerRepositoryId: RepositoryStableId;
  readonly baseGenerationId: IndexedContractChange['baseGenerationId'];
  readonly overlayId: OverlayId;
  readonly pullRequest: {
    readonly provider: 'local' | 'github';
    readonly number?: number;
    readonly baseSha: IndexedContractChange['baseSha'];
    readonly headSha: IndexedContractChange['headSha'];
  };
  readonly changes: readonly IndexedContractChange[];
  readonly producerDefinitions: readonly IndexedContractDefinition[];
  /** Exact contract evidence extracted from the analyzed PR head. */
  readonly producerHeadObservation: ContractGenerationObservation;
  readonly subject?: Subject;
  readonly freshnessTtlMs?: number;
  readonly refreshBudgetMs?: number;
  readonly analysisBudgetMs?: number;
  readonly suppressionVersions?: SuppressionVersionContext;
  readonly adapterRuleIds?: readonly string[];
}

export interface AnalyzePullRequestDependencies {
  readonly generations: GenerationStore;
  readonly evidence: EvidenceGraphStore;
  readonly registry: WorkspaceRegistry;
  readonly clock: Clock;
  readonly cancellation?: CancellationPort;
  readonly authorization?: AuthorizationPort;
  readonly refresh?: ConsumerRefreshPort;
  readonly reviews?: ReviewEvaluationStore;
}

function propagated<Value>(failure: PortFailure): PortResult<Value> {
  return portFailure(failure);
}

function invalid(code: string, safeMessage: string): PortResult<never> {
  return portFailure({ kind: 'domain', code, safeMessage, retryable: false });
}

function elapsed(started: string, current: string): number {
  return Math.max(0, new Date(current).valueOf() - new Date(started).valueOf());
}

function unavailableSelection(
  repositoryId: RepositoryStableId,
  state: Extract<ConsumerGenerationSelection['state'], 'unauthorized' | 'failed' | 'not_indexed'>,
  reason: string,
): ConsumerGenerationSelection {
  return { repositoryId, state, reason };
}

async function boundedRefresh(
  refresh: ConsumerRefreshPort,
  request: Parameters<ConsumerRefreshPort['refresh']>[0],
): Promise<Awaited<ReturnType<ConsumerRefreshPort['refresh']>> | null> {
  if (request.maximumDurationMs <= 0) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), request.maximumDurationMs);
  });
  try {
    return await Promise.race([refresh.refresh(request), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function selectionAbstention(
  selection: ConsumerGenerationSelection,
): FindingAbstention | undefined {
  const reason =
    selection.state === 'stale'
      ? 'stale_consumer_generation'
      : selection.state === 'unauthorized'
        ? 'privacy_restricted'
        : selection.state === 'unsupported'
          ? 'unsupported_language'
          : selection.state === 'failed' || selection.state === 'not_indexed'
            ? 'incomplete_index'
            : undefined;
  return reason === undefined
    ? undefined
    : {
        consumerRepositoryId: selection.repositoryId,
        reason,
        safeMessage: 'Consumer repository was not available as current complete evidence.',
      };
}

function observationMatches(
  observation: ContractGenerationObservation,
  expected: {
    readonly workspaceId: WorkspaceId;
    readonly repositoryId: RepositoryStableId;
    readonly generationId: ContractGenerationObservation['generationId'];
    readonly commitSha: ContractGenerationObservation['commitSha'];
  },
): boolean {
  return (
    observation.workspaceId === expected.workspaceId &&
    observation.repositoryId === expected.repositoryId &&
    observation.generationId === expected.generationId &&
    observation.commitSha === expected.commitSha &&
    observation.definitions.every(
      (value) =>
        value.workspaceId === expected.workspaceId &&
        value.repositoryId === expected.repositoryId &&
        value.generationId === expected.generationId &&
        value.commitSha === expected.commitSha,
    ) &&
    observation.references.every(
      (value) =>
        value.workspaceId === expected.workspaceId &&
        value.repositoryId === expected.repositoryId &&
        value.generationId === expected.generationId &&
        value.commitSha === expected.commitSha,
    )
  );
}

export class AnalyzePullRequest {
  public constructor(private readonly dependencies: AnalyzePullRequestDependencies) {}

  async #selectConsumer(
    input: AnalyzePullRequestInput,
    repository: RepositoryMembership,
    startedAt: ReturnType<Clock['now']>,
  ): Promise<PortResult<ConsumerGenerationSelection>> {
    if (this.dependencies.authorization !== undefined) {
      const authorization = await this.dependencies.authorization.authorizeRepositoryUse(
        input.subject ?? { kind: 'workspace', id: input.workspaceId },
        'evidence.consume',
        repository.repositoryId,
      );
      if (!authorization.ok || !authorization.value.allowed) {
        return portSuccess(
          unavailableSelection(
            repository.repositoryId,
            'unauthorized',
            authorization.ok ? authorization.value.reason : authorization.failure.code,
          ),
        );
      }
    }
    const selected = await this.dependencies.generations.selectGeneration({
      workspaceId: input.workspaceId,
      repositoryId: repository.repositoryId,
      allowPartial: true,
    });
    if (!selected.ok) return propagated(selected.failure);
    if (selected.value.state === 'failed') {
      return portSuccess(
        unavailableSelection(repository.repositoryId, 'failed', 'selected_generation_failed'),
      );
    }
    let initial: ConsumerGenerationSelection;
    if (selected.value.state === 'not_indexed') {
      initial = unavailableSelection(
        repository.repositoryId,
        'not_indexed',
        'repository_not_indexed',
      );
    } else {
      const generation = selected.value.generation;
      if (
        generation.workspaceId !== input.workspaceId ||
        generation.repositoryId !== repository.repositoryId ||
        (generation.state !== 'complete' && generation.state !== 'partial')
      ) {
        return invalid(
          'consumer_generation_scope_mismatch',
          'Selected consumer generation does not match the requested repository scope.',
        );
      }
      const observation = await this.dependencies.evidence.getContractObservation(generation.id);
      if (!observation.ok) return propagated(observation.failure);
      if (observation.value === null) {
        initial = unavailableSelection(
          repository.repositoryId,
          'not_indexed',
          'contracts_not_indexed',
        );
      } else if (
        !observationMatches(observation.value, {
          workspaceId: input.workspaceId,
          repositoryId: repository.repositoryId,
          generationId: generation.id,
          commitSha: generation.commitSha,
        })
      ) {
        return invalid(
          'consumer_observation_scope_mismatch',
          'Consumer contract evidence does not match its selected exact generation.',
        );
      } else if (observation.value.coverageState === 'failed') {
        initial = unavailableSelection(
          repository.repositoryId,
          'failed',
          'contract_extraction_failed',
        );
      } else if (observation.value.coverageState === 'unsupported') {
        initial = {
          repositoryId: repository.repositoryId,
          state: 'unsupported',
          generationId: generation.id,
          commitSha: generation.commitSha,
          ...(generation.completedAt === undefined ? {} : { selectedAt: generation.completedAt }),
          reason: 'contract_inputs_unsupported',
        };
      } else {
        const selectedAt = generation.completedAt ?? startedAt;
        const freshnessAgeMs = elapsed(selectedAt, startedAt);
        const state =
          freshnessAgeMs > (input.freshnessTtlMs ?? 24 * 60 * 60_000) ? 'stale' : 'current';
        initial = {
          repositoryId: repository.repositoryId,
          state,
          generationId: generation.id,
          commitSha: generation.commitSha,
          selectedAt,
          freshnessAgeMs,
          coverageState: observation.value.coverageState,
        };
      }
    }
    if (
      (initial.state === 'stale' || initial.state === 'not_indexed') &&
      this.dependencies.refresh !== undefined
    ) {
      const totalBudget = input.refreshBudgetMs ?? 0;
      const remaining = Math.max(
        0,
        totalBudget - elapsed(startedAt, this.dependencies.clock.now()),
      );
      const refreshed = await boundedRefresh(this.dependencies.refresh, {
        workspaceId: input.workspaceId,
        repositoryId: repository.repositoryId,
        maximumDurationMs: remaining,
      });
      if (refreshed?.ok && refreshed.value !== null) {
        if (refreshed.value.repositoryId !== repository.repositoryId) {
          return invalid(
            'consumer_refresh_scope_mismatch',
            'Refreshed consumer selection does not match the requested repository.',
          );
        }
        return portSuccess(refreshed.value);
      }
    }
    return portSuccess(initial);
  }

  async #selectProducerHead(
    input: AnalyzePullRequestInput,
    repository: RepositoryMembership,
  ): Promise<PortResult<ConsumerGenerationSelection>> {
    if (this.dependencies.authorization !== undefined) {
      const authorization = await this.dependencies.authorization.authorizeRepositoryUse(
        input.subject ?? { kind: 'workspace', id: input.workspaceId },
        'evidence.consume',
        repository.repositoryId,
      );
      if (!authorization.ok || !authorization.value.allowed) {
        return portSuccess(
          unavailableSelection(
            repository.repositoryId,
            'unauthorized',
            authorization.ok ? authorization.value.reason : authorization.failure.code,
          ),
        );
      }
    }
    const observation = input.producerHeadObservation;
    if (observation.coverageState === 'failed') {
      return portSuccess(
        unavailableSelection(repository.repositoryId, 'failed', 'head_contract_extraction_failed'),
      );
    }
    if (observation.coverageState === 'unsupported') {
      return portSuccess({
        repositoryId: repository.repositoryId,
        state: 'unsupported',
        generationId: observation.generationId,
        commitSha: observation.commitSha,
        selectedAt: observation.observedAt,
        reason: 'head_contract_inputs_unsupported',
      });
    }
    return portSuccess({
      repositoryId: repository.repositoryId,
      state: 'current',
      generationId: observation.generationId,
      commitSha: observation.commitSha,
      selectedAt: observation.observedAt,
      freshnessAgeMs: 0,
      coverageState: observation.coverageState,
    });
  }

  public async execute(input: AnalyzePullRequestInput): Promise<PortResult<AnalysisResult>> {
    const startedAt = this.dependencies.clock.now();
    const base = await this.dependencies.generations.getGeneration(input.baseGenerationId);
    if (!base.ok) return propagated(base.failure);
    if (
      base.value.workspaceId !== input.workspaceId ||
      base.value.repositoryId !== input.producerRepositoryId ||
      base.value.commitSha !== input.pullRequest.baseSha ||
      base.value.registryRevision !== input.registryRevision ||
      (base.value.state !== 'complete' && base.value.state !== 'partial')
    ) {
      return invalid(
        'base_generation_mismatch',
        'Analysis requires the exact producer base generation.',
      );
    }
    const overlay = await this.dependencies.generations.getOverlay(input.overlayId);
    if (!overlay.ok) return propagated(overlay.failure);
    if (
      overlay.value.workspaceId !== input.workspaceId ||
      overlay.value.repositoryId !== input.producerRepositoryId ||
      overlay.value.baseGenerationId !== input.baseGenerationId ||
      overlay.value.baseSha !== input.pullRequest.baseSha ||
      overlay.value.headSha !== input.pullRequest.headSha ||
      overlay.value.registryRevision !== input.registryRevision ||
      (overlay.value.state !== 'complete' && overlay.value.state !== 'partial')
    ) {
      return invalid('overlay_mismatch', 'Analysis requires the exact producer head overlay.');
    }
    const producerHead = input.producerHeadObservation;
    if (
      !observationMatches(producerHead, {
        workspaceId: input.workspaceId,
        repositoryId: input.producerRepositoryId,
        generationId: producerHead.generationId,
        commitSha: input.pullRequest.headSha,
      })
    ) {
      return invalid(
        'producer_head_observation_mismatch',
        'Analysis requires contract evidence from the exact producer head.',
      );
    }
    const registry = await this.dependencies.registry.getRevision(
      input.workspaceId,
      input.registryRevision,
    );
    if (!registry.ok) return propagated(registry.failure);
    if (
      registry.value.revision.workspaceId !== input.workspaceId ||
      registry.value.revision.revision !== input.registryRevision
    ) {
      return invalid(
        'registry_scope_mismatch',
        'Workspace registry does not match the requested analysis revision.',
      );
    }
    if (
      input.producerDefinitions.some(
        (definition) =>
          definition.workspaceId !== input.workspaceId ||
          definition.repositoryId !== input.producerRepositoryId ||
          definition.generationId !== input.baseGenerationId ||
          definition.commitSha !== input.pullRequest.baseSha,
      )
    ) {
      return invalid(
        'definition_scope_mismatch',
        'Producer definitions do not match the exact base generation.',
      );
    }
    if (
      input.changes.some(
        (change) =>
          change.workspaceId !== input.workspaceId ||
          change.producerRepositoryId !== input.producerRepositoryId ||
          change.baseGenerationId !== input.baseGenerationId ||
          (change.headGenerationId !== undefined &&
            change.headGenerationId !== producerHead.generationId) ||
          change.baseSha !== input.pullRequest.baseSha ||
          change.headSha !== input.pullRequest.headSha,
      )
    ) {
      return invalid(
        'change_scope_mismatch',
        'Producer changes do not match the exact analysis input.',
      );
    }
    const consumers: ConsumerGenerationSelection[] = [];
    for (const repository of registry.value.repositories
      .filter((value) => value.selected)
      .sort((left, right) => left.repositoryId.localeCompare(right.repositoryId))) {
      const selected =
        repository.repositoryId === input.producerRepositoryId
          ? await this.#selectProducerHead(input, repository)
          : await this.#selectConsumer(input, repository, startedAt);
      if (!selected.ok) return propagated(selected.failure);
      consumers.push(selected.value);
    }
    if (!consumers.some((value) => value.repositoryId === input.producerRepositoryId)) {
      return invalid(
        'producer_not_selected',
        'The producer repository must be selected in the workspace registry.',
      );
    }
    const generationIds = consumers.flatMap((consumer) =>
      consumer.repositoryId === input.producerRepositoryId || consumer.generationId === undefined
        ? []
        : [consumer.generationId],
    );
    const references = await this.dependencies.evidence.readReferences({
      workspaceId: input.workspaceId,
      generationIds,
      canonicalKeys: input.changes.map((change) => change.canonicalKey),
    });
    if (!references.ok) return propagated(references.failure);
    const selectionByGeneration = new Map(
      consumers.flatMap((consumer) =>
        consumer.repositoryId === input.producerRepositoryId || consumer.generationId === undefined
          ? []
          : [[consumer.generationId, consumer] as const],
      ),
    );
    if (
      references.value.some((reference) => {
        const selection = selectionByGeneration.get(reference.generationId);
        return (
          selection === undefined ||
          reference.workspaceId !== input.workspaceId ||
          reference.repositoryId !== selection.repositoryId ||
          reference.commitSha !== selection.commitSha
        );
      })
    ) {
      return invalid(
        'reference_scope_mismatch',
        'Consumer references do not match the exact selected generations.',
      );
    }
    const producerSelected = consumers.some(
      (value) =>
        value.repositoryId === input.producerRepositoryId &&
        value.state === 'current' &&
        value.generationId === producerHead.generationId,
    );
    const changedKeys = new Set(input.changes.map((change) => change.canonicalKey));
    const exactReferences = [
      ...references.value,
      ...(producerSelected
        ? producerHead.references.filter(
            (value) =>
              (value.canonicalKey !== undefined && changedKeys.has(value.canonicalKey)) ||
              (value.constrainedContractKey !== undefined &&
                changedKeys.has(value.constrainedContractKey)),
          )
        : []),
    ];
    const joined = joinChangedContracts({
      changes: input.changes,
      definitions: input.producerDefinitions,
      references: exactReferences,
      selections: consumers,
      registry: registry.value,
      observedAt: this.dependencies.clock.now(),
    });
    const edgeWrite = await this.dependencies.evidence.observeEdges(joined.edges);
    if (!edgeWrite.ok) return propagated(edgeWrite.failure);
    const occurrences = createFindingOccurrences({
      analysisId: input.analysisId,
      workspaceId: input.workspaceId,
      producerRepositoryId: input.producerRepositoryId,
      baseSha: input.pullRequest.baseSha,
      headSha: input.pullRequest.headSha,
      policyMajor: input.policyMajor,
      changes: input.changes,
      edges: joined.edges,
      consumers,
    });
    let findings: readonly FindingOccurrence[] = occurrences.findings;
    if (this.dependencies.reviews !== undefined && findings.length > 0) {
      const rules = await this.dependencies.reviews.listSuppressions(input.workspaceId);
      if (!rules.ok) return propagated(rules.failure);
      const stateEvents = await this.dependencies.reviews.listSuppressionStateEvents(
        input.workspaceId,
      );
      if (!stateEvents.ok) return propagated(stateEvents.failure);
      const derivedVersions: SuppressionVersionContext = input.suppressionVersions ?? {
        now: this.dependencies.clock.now(),
        producerGenerations: Object.fromEntries(
          input.changes.map((change) => [
            input.producerRepositoryId,
            change.headGenerationId ?? change.baseGenerationId,
          ]),
        ),
        consumerGenerations: Object.fromEntries(
          consumers.flatMap((consumer) =>
            consumer.generationId === undefined
              ? []
              : [[consumer.repositoryId, consumer.generationId]],
          ),
        ),
        referenceHashes: Object.fromEntries(
          findings.map((finding) => [
            finding.edge.stableReferenceId,
            finding.edge.reference.contentHash,
          ]),
        ),
        contractShapeHashes: Object.fromEntries(
          findings.map((finding) => [
            `${finding.change.contractKind}\0${finding.change.canonicalKey}`,
            finding.edge.definition.shapeHash,
          ]),
        ),
        identityVersions: Object.fromEntries(
          findings.flatMap((finding) => [
            [finding.edge.definition.adapterId, finding.edge.definition.identityVersion],
            [finding.edge.reference.adapterId, finding.edge.reference.identityVersion],
          ]),
        ),
        adapterVersions: Object.fromEntries(
          findings.flatMap((finding) => [
            [finding.edge.definition.adapterId, finding.edge.definition.adapterVersion],
            [finding.edge.reference.adapterId, finding.edge.reference.adapterVersion],
          ]),
        ),
        evidenceStrata: [...new Set(findings.map((finding) => finding.edge.stratumKey))],
        policyRevision: input.policyRevision,
        registryRevision: input.registryRevision,
      };
      findings = findings.map((finding) => {
        const decision = matchSuppression({
          candidate: {
            workspaceId: input.workspaceId,
            occurrenceId: finding.id,
            fingerprint: finding.fingerprint,
            producerRepositoryId: input.producerRepositoryId,
            consumerRepositoryId: finding.edge.consumerRepositoryId,
            contractKind: finding.change.contractKind,
            canonicalContractKey: finding.change.canonicalKey,
            adapterId: finding.change.adapterId,
            adapterRuleIds: [finding.change.changeKind, ...(input.adapterRuleIds ?? [])],
          },
          versions: derivedVersions,
          rules: rules.value,
          stateEvents: stateEvents.value,
        });
        return decision.suppressed
          ? {
              ...finding,
              delivery: {
                decision: 'suppressed' as const,
                reason: 'matched_active_suppression' as const,
                suppressionRuleId: decision.ruleId!,
              },
            }
          : finding;
      });
    }
    const selectionAbstentions = consumers
      .map(selectionAbstention)
      .filter((value): value is FindingAbstention => value !== undefined);
    const abstentions = [...occurrences.abstentions];
    for (const abstention of selectionAbstentions) {
      if (
        !abstentions.some(
          (value) =>
            value.consumerRepositoryId === abstention.consumerRepositoryId &&
            value.reason === abstention.reason,
        )
      ) {
        abstentions.push(abstention);
      }
    }
    const supersessionKey = analysisSupersessionKey({
      workspaceId: input.workspaceId,
      producerRepositoryId: input.producerRepositoryId,
      provider: input.pullRequest.provider,
      ...(input.pullRequest.number === undefined
        ? {}
        : { pullRequestNumber: input.pullRequest.number }),
      policyMajor: input.policyMajor,
    });
    const currentCheck = this.dependencies.cancellation
      ? await this.dependencies.cancellation.isCurrent(supersessionKey)
      : portSuccess(true);
    if (!currentCheck.ok) return propagated(currentCheck.failure);
    const completedAt = this.dependencies.clock.now();
    const overBudget =
      elapsed(startedAt, completedAt) > (input.analysisBudgetMs ?? Number.MAX_SAFE_INTEGER);
    const partial =
      overlay.value.state === 'partial' ||
      input.changes.some((change) => change.coverageState !== 'complete') ||
      consumers.some((consumer) => consumer.state !== 'current') ||
      joined.diagnostics.length > 0 ||
      overBudget;
    const current = currentCheck.value && !overBudget;
    const result = finalizeAnalysisResult({
      schema: 'reverb.analysis-result',
      schemaVersion: '1.0',
      analysisId: input.analysisId,
      workspaceId: input.workspaceId,
      producerRepositoryId: input.producerRepositoryId,
      pullRequest: input.pullRequest,
      registryRevision: input.registryRevision,
      policyRevision: input.policyRevision,
      policyMajor: input.policyMajor,
      state: current ? (partial ? 'partial' : 'complete') : 'superseded',
      current,
      consumers,
      findings,
      abstentions,
      startedAt,
      completedAt,
    });
    const persisted = await this.dependencies.evidence.persistAnalysis(result, supersessionKey);
    if (!persisted.ok) return propagated(persisted.failure);
    return portSuccess(result);
  }
}
