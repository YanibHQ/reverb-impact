import {
  applyCompleteReferenceObservation,
  assertReasoningRunScope,
  canonicalJson,
  currentEvidenceEdges,
  finalizeAnalysisResult,
  finalizeReasoningRunV2,
  removeReasoningFromAnalysisResultV2,
  type AnalysisId,
  type AnalysisResult,
  type AnalysisResultV2,
  type ContentHash,
  type ContractGenerationObservation,
  type EvidenceEdge,
  type FindingFingerprint,
  type FindingOccurrence,
  type GenerationId,
  type IndexedContractDefinition,
  type IndexedContractReference,
  type WorkspaceId,
  type ReviewEvent,
  type SuppressionRule,
  type SuppressionStateEvent,
  type CorpusManifest,
  type ImpactCase,
  type EvaluationReport,
  type PromotionRecord,
  type Instant,
  type ReasoningRunId,
  type ReasoningRunV2,
} from '@yanib/reverb-domain';
import {
  portFailure,
  portSuccess,
  type DefinitionQuery,
  type EdgeQuery,
  type EvidenceGraphStore,
  type AnalysisResultStoreV2,
  type PortResult,
  type ReferenceQuery,
  type ReviewEvaluationStore,
  type ReasoningRunStoreV2,
} from '@yanib/reverb-application';

function conflict(message: string) {
  return portFailure({
    kind: 'conflict' as const,
    code: 'immutable_observation_conflict',
    safeMessage: message,
    retryable: false,
  });
}

function notFound(subject: string) {
  return portFailure({
    kind: 'not_found' as const,
    code: 'not_found',
    safeMessage: `${subject} was not found.`,
    retryable: false,
  });
}

export class InMemoryEvidenceGraphStore implements EvidenceGraphStore, ReviewEvaluationStore {
  readonly #observations = new Map<GenerationId, ContractGenerationObservation>();
  readonly #edges = new Map<string, EvidenceEdge>();
  readonly #analyses = new Map<AnalysisId, AnalysisResult>();
  readonly #currentAnalyses = new Map<string, AnalysisId>();
  readonly #serviceEdges = new Map<string, ReadonlySet<string>>();
  readonly #reviews = new Map<string, ReviewEvent>();
  readonly #suppressions = new Map<string, SuppressionRule>();
  readonly #suppressionStates = new Map<string, SuppressionStateEvent>();
  readonly #corpora = new Map<
    ContentHash,
    { readonly manifest: CorpusManifest; readonly cases: readonly ImpactCase[] }
  >();
  readonly #evaluationReports = new Map<string, EvaluationReport>();
  readonly #promotions = new Map<string, PromotionRecord>();

  public async putContractObservation(
    observation: ContractGenerationObservation,
  ): Promise<PortResult<void>> {
    const existing = this.#observations.get(observation.generationId);
    if (existing !== undefined) {
      return existing.outputHash === observation.outputHash
        ? portSuccess(undefined)
        : conflict('A generation contract observation is immutable.');
    }
    if (
      observation.definitions.some(
        (value) =>
          value.workspaceId !== observation.workspaceId ||
          value.repositoryId !== observation.repositoryId ||
          value.generationId !== observation.generationId ||
          value.commitSha !== observation.commitSha,
      ) ||
      observation.references.some(
        (value) =>
          value.workspaceId !== observation.workspaceId ||
          value.repositoryId !== observation.repositoryId ||
          value.generationId !== observation.generationId ||
          value.commitSha !== observation.commitSha,
      )
    ) {
      return conflict('Contract observation items do not match their generation.');
    }
    this.#observations.set(observation.generationId, observation);
    if (observation.coverageState === 'complete') {
      const updated = applyCompleteReferenceObservation({
        edges: [...this.#edges.values()],
        consumerRepositoryId: observation.repositoryId,
        currentReferenceIds: new Set(
          observation.references.map((value) => value.stableReferenceId),
        ),
        observedAt: observation.observedAt,
        complete: true,
      });
      updated.forEach((edge) => this.#edges.set(edge.id, edge));
    }
    return portSuccess(undefined);
  }

  public async getContractObservation(
    generationId: GenerationId,
  ): Promise<PortResult<ContractGenerationObservation | null>> {
    return portSuccess(this.#observations.get(generationId) ?? null);
  }

  public async readDefinitions(
    query: DefinitionQuery,
  ): Promise<PortResult<readonly IndexedContractDefinition[]>> {
    const keys = query.canonicalKeys === undefined ? undefined : new Set(query.canonicalKeys);
    return portSuccess(
      [...this.#observations.values()]
        .filter(
          (observation) =>
            observation.workspaceId === query.workspaceId &&
            (query.generationId === undefined || observation.generationId === query.generationId) &&
            (query.repositoryId === undefined || observation.repositoryId === query.repositoryId),
        )
        .flatMap((observation) => observation.definitions)
        .filter(
          (value) =>
            (query.contractKind === undefined || value.contractKind === query.contractKind) &&
            (keys === undefined || keys.has(value.canonicalKey)),
        )
        .sort((left, right) =>
          `${left.contractKind}\0${left.canonicalKey}\0${left.repositoryId}`.localeCompare(
            `${right.contractKind}\0${right.canonicalKey}\0${right.repositoryId}`,
          ),
        ),
    );
  }

  public async readReferences(
    query: ReferenceQuery,
  ): Promise<PortResult<readonly IndexedContractReference[]>> {
    const generations =
      query.generationIds === undefined ? undefined : new Set(query.generationIds);
    const keys = query.canonicalKeys === undefined ? undefined : new Set(query.canonicalKeys);
    return portSuccess(
      [...this.#observations.values()]
        .filter(
          (observation) =>
            observation.workspaceId === query.workspaceId &&
            (generations === undefined || generations.has(observation.generationId)) &&
            (query.repositoryId === undefined || observation.repositoryId === query.repositoryId),
        )
        .flatMap((observation) => observation.references)
        .filter(
          (value) =>
            (query.contractKind === undefined || value.contractKind === query.contractKind) &&
            (keys === undefined ||
              (value.canonicalKey !== undefined && keys.has(value.canonicalKey)) ||
              (value.constrainedContractKey !== undefined &&
                keys.has(value.constrainedContractKey))),
        )
        .sort((left, right) => left.stableReferenceId.localeCompare(right.stableReferenceId)),
    );
  }

  public async observeEdges(edges: readonly EvidenceEdge[]): Promise<PortResult<void>> {
    for (const edge of edges) {
      const prior = this.#edges.get(edge.id);
      this.#edges.set(
        edge.id,
        prior === undefined
          ? edge
          : {
              ...edge,
              firstObservedAt:
                prior.firstObservedAt < edge.firstObservedAt
                  ? prior.firstObservedAt
                  : edge.firstObservedAt,
              lastObservedAt:
                prior.lastObservedAt > edge.lastObservedAt
                  ? prior.lastObservedAt
                  : edge.lastObservedAt,
            },
      );
    }
    return portSuccess(undefined);
  }

  public async readEdges(query: EdgeQuery): Promise<PortResult<readonly EvidenceEdge[]>> {
    const keys = query.canonicalKeys === undefined ? undefined : new Set(query.canonicalKeys);
    let edges = [...this.#edges.values()].filter(
      (edge) =>
        edge.workspaceId === query.workspaceId &&
        (query.producerRepositoryId === undefined ||
          edge.producerRepositoryId === query.producerRepositoryId) &&
        (query.consumerRepositoryId === undefined ||
          edge.consumerRepositoryId === query.consumerRepositoryId) &&
        (keys === undefined || keys.has(edge.definitionKey)),
    );
    if (query.currentAt !== undefined) {
      edges = [
        ...currentEvidenceEdges({
          edges,
          asOf: query.currentAt,
          freshnessTtlMs: query.freshnessTtlMs ?? Number.MAX_SAFE_INTEGER,
        }),
      ];
    }
    return portSuccess(edges.sort((left, right) => left.id.localeCompare(right.id)));
  }

  public async rebuildServiceEdges(workspaceId: WorkspaceId): Promise<PortResult<number>> {
    this.#serviceEdges.clear();
    for (const edge of this.#edges.values()) {
      if (edge.workspaceId !== workspaceId || edge.invalidatedAt !== undefined) continue;
      const producer = edge.definition.serviceId;
      const consumer = edge.reference.consumerServiceId;
      if (producer === undefined || consumer === undefined) continue;
      const key = `${workspaceId}\0${producer}\0${consumer}`;
      const pointers = new Set(this.#serviceEdges.get(key) ?? []);
      pointers.add(edge.id);
      this.#serviceEdges.set(key, pointers);
    }
    return portSuccess(this.#serviceEdges.size);
  }

  public async persistAnalysis(
    result: AnalysisResult,
    supersessionKey: ContentHash,
  ): Promise<PortResult<void>> {
    const existing = this.#analyses.get(result.analysisId);
    if (existing !== undefined) {
      return existing.outputHash === result.outputHash
        ? portSuccess(undefined)
        : conflict('An analysis result is immutable for its analysis ID.');
    }
    if (result.current) {
      const priorId = this.#currentAnalyses.get(supersessionKey);
      const prior = priorId === undefined ? undefined : this.#analyses.get(priorId);
      if (prior !== undefined) {
        this.#analyses.set(
          prior.analysisId,
          finalizeAnalysisResult({ ...prior, state: 'superseded', current: false }),
        );
      }
      this.#currentAnalyses.set(supersessionKey, result.analysisId);
    }
    this.#analyses.set(result.analysisId, result);
    return portSuccess(undefined);
  }

  public async getAnalysis(analysisId: AnalysisId): Promise<PortResult<AnalysisResult>> {
    const result = this.#analyses.get(analysisId);
    return result === undefined ? notFound('Analysis') : portSuccess(result);
  }

  public async getCurrentAnalysis(
    supersessionKey: ContentHash,
  ): Promise<PortResult<AnalysisResult | null>> {
    const id = this.#currentAnalyses.get(supersessionKey);
    return portSuccess(id === undefined ? null : (this.#analyses.get(id) ?? null));
  }

  public async findFinding(
    workspaceId: WorkspaceId,
    fingerprint: FindingFingerprint,
  ): Promise<
    PortResult<{ readonly analysis: AnalysisResult; readonly finding: FindingOccurrence }>
  > {
    const candidates = [...this.#analyses.values()]
      .filter((analysis) => analysis.workspaceId === workspaceId)
      .sort(
        (left, right) =>
          Number(right.current) - Number(left.current) ||
          right.completedAt.localeCompare(left.completedAt),
      );
    for (const analysis of candidates) {
      const finding = analysis.findings.find((value) => value.fingerprint === fingerprint);
      if (finding !== undefined) return portSuccess({ analysis, finding });
    }
    return notFound('Finding');
  }

  public async appendReview(input: {
    readonly event: ReviewEvent;
    readonly suppression?: SuppressionRule;
  }): Promise<PortResult<void>> {
    const existing = this.#reviews.get(input.event.id);
    if (existing !== undefined) {
      return existing.outputHash === input.event.outputHash
        ? portSuccess(undefined)
        : conflict('A review event is immutable for its event ID.');
    }
    const latest = [...this.#reviews.values()]
      .filter(
        (value) =>
          value.workspaceId === input.event.workspaceId &&
          value.findingOccurrenceId === input.event.findingOccurrenceId,
      )
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .at(-1);
    if (
      (latest === undefined && input.event.supersedes !== undefined) ||
      (latest !== undefined && input.event.supersedes !== latest.id)
    ) {
      return conflict('A review must supersede the latest event for the immutable occurrence.');
    }
    if (input.suppression !== undefined) {
      const prior = this.#suppressions.get(input.suppression.id);
      if (prior !== undefined && prior.outputHash !== input.suppression.outputHash) {
        return conflict('A suppression rule is immutable for its rule ID.');
      }
      this.#suppressions.set(input.suppression.id, input.suppression);
    }
    this.#reviews.set(input.event.id, input.event);
    return portSuccess(undefined);
  }

  public async listReviews(
    workspaceId: WorkspaceId,
    fingerprint: FindingFingerprint,
  ): Promise<PortResult<readonly ReviewEvent[]>> {
    return portSuccess(
      [...this.#reviews.values()]
        .filter(
          (value) => value.workspaceId === workspaceId && value.findingFingerprint === fingerprint,
        )
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
    );
  }

  public async appendSuppressionState(event: SuppressionStateEvent): Promise<PortResult<void>> {
    const rule = this.#suppressions.get(event.suppressionRuleId);
    if (rule === undefined) return notFound('Suppression rule');
    if (rule.workspaceId !== event.workspaceId) {
      return conflict('Suppression state event workspace does not match its rule.');
    }
    const existing = this.#suppressionStates.get(event.id);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(event)) {
      return conflict('A suppression state event is immutable for its event ID.');
    }
    this.#suppressionStates.set(event.id, event);
    return portSuccess(undefined);
  }

  public async listSuppressions(
    workspaceId: WorkspaceId,
  ): Promise<PortResult<readonly SuppressionRule[]>> {
    return portSuccess(
      [...this.#suppressions.values()]
        .filter((value) => value.workspaceId === workspaceId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    );
  }

  public async listSuppressionStateEvents(
    workspaceId: WorkspaceId,
  ): Promise<PortResult<readonly SuppressionStateEvent[]>> {
    return portSuccess(
      [...this.#suppressionStates.values()]
        .filter((value) => value.workspaceId === workspaceId)
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
    );
  }

  public async putCorpus(
    manifest: CorpusManifest,
    cases: readonly ImpactCase[],
  ): Promise<PortResult<void>> {
    if (
      JSON.stringify([...manifest.caseIds].sort()) !==
      JSON.stringify([...cases.map((value) => value.id)].sort())
    ) {
      return conflict('Corpus manifest case IDs do not match the materialized cases.');
    }
    const existing = this.#corpora.get(manifest.revision);
    if (existing !== undefined) {
      return existing.manifest.outputHash === manifest.outputHash
        ? portSuccess(undefined)
        : conflict('A corpus revision is immutable.');
    }
    this.#corpora.set(manifest.revision, { manifest, cases: [...cases] });
    return portSuccess(undefined);
  }

  public async getCorpus(
    revision: ContentHash,
  ): Promise<
    PortResult<{ readonly manifest: CorpusManifest; readonly cases: readonly ImpactCase[] }>
  > {
    const corpus = this.#corpora.get(revision);
    return corpus === undefined ? notFound('Corpus') : portSuccess(corpus);
  }

  public async putEvaluationReport(report: EvaluationReport): Promise<PortResult<void>> {
    const existing = this.#evaluationReports.get(report.outputHash);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(report)) {
      return conflict('An evaluation report is immutable for its output hash.');
    }
    this.#evaluationReports.set(report.outputHash, report);
    return portSuccess(undefined);
  }

  public async getEvaluationReport(outputHash: ContentHash): Promise<PortResult<EvaluationReport>> {
    const report = this.#evaluationReports.get(outputHash);
    return report === undefined ? notFound('Evaluation report') : portSuccess(report);
  }

  public async appendPromotion(record: PromotionRecord): Promise<PortResult<void>> {
    const existing = this.#promotions.get(record.id);
    if (existing !== undefined && existing.outputHash !== record.outputHash) {
      return conflict('A promotion record is immutable for its record ID.');
    }
    this.#promotions.set(record.id, record);
    return portSuccess(undefined);
  }

  public async listPromotions(stratumKey: string): Promise<PortResult<readonly PromotionRecord[]>> {
    return portSuccess(
      [...this.#promotions.values()]
        .filter((value) => value.stratumKey === stratumKey)
        .sort((left, right) => left.decidedAt.localeCompare(right.decidedAt)),
    );
  }
}

export class InMemoryAnalysisResultStoreV2 implements AnalysisResultStoreV2, ReasoningRunStoreV2 {
  readonly #analyses = new Map<string, AnalysisResultV2>();
  readonly #reasoningRuns = new Map<string, ReasoningRunV2>();

  public async persistAnalysisV2(
    result: AnalysisResultV2,
    reasoningRun?: ReasoningRunV2,
  ): Promise<PortResult<void>> {
    const hasReasoningData =
      result.reasoningHypotheses.length > 0 ||
      result.executionBudgets.some((budget) => budget.lane === 'reasoning');
    if (hasReasoningData !== (reasoningRun !== undefined) || reasoningRun?.state === 'deleted')
      return conflict('Reasoning analysis data requires its active provenance run.');
    const key = `${result.legacyResult.workspaceId}\0${result.legacyResult.analysisId}`;
    const existing = this.#analyses.get(key);
    if (existing !== undefined && existing.outputHash !== result.outputHash)
      return conflict('A v2 analysis result is immutable.');
    let runKey: string | undefined;
    if (reasoningRun !== undefined) {
      const { outputHash: _runOutputHash, ...runInput } = reasoningRun;
      void _runOutputHash;
      let canonical = false;
      try {
        assertReasoningRunScope(reasoningRun, result.scope);
        canonical = canonicalJson(finalizeReasoningRunV2(runInput)) === canonicalJson(reasoningRun);
      } catch {
        canonical = false;
      }
      if (
        !canonical ||
        reasoningRun.workspaceId !== result.legacyResult.workspaceId ||
        reasoningRun.analysisId !== result.legacyResult.analysisId ||
        reasoningRun.scopeHash !== result.scope.scopeHash ||
        canonicalJson(reasoningRun.hypotheses) !== canonicalJson(result.reasoningHypotheses) ||
        !result.executionBudgets.some(
          (budget) => canonicalJson(budget) === canonicalJson(reasoningRun.executionBudget),
        )
      )
        return conflict('A reasoning run has inconsistent provenance.');
      runKey = `${reasoningRun.workspaceId}\0${reasoningRun.id}`;
      const existingRun = this.#reasoningRuns.get(runKey);
      if (existingRun !== undefined && existingRun.outputHash !== reasoningRun.outputHash)
        return conflict('A reasoning run is immutable.');
    }
    this.#analyses.set(key, result);
    if (reasoningRun !== undefined && runKey !== undefined)
      this.#reasoningRuns.set(runKey, reasoningRun);
    return portSuccess(undefined);
  }

  public async getAnalysisV2(
    workspaceId: WorkspaceId,
    analysisId: AnalysisId,
  ): Promise<PortResult<AnalysisResultV2 | null>> {
    return portSuccess(this.#analyses.get(`${workspaceId}\0${analysisId}`) ?? null);
  }

  public async getReasoningRunV2(
    workspaceId: WorkspaceId,
    reasoningRunId: ReasoningRunId,
  ): Promise<PortResult<ReasoningRunV2 | null>> {
    return portSuccess(this.#reasoningRuns.get(`${workspaceId}\0${reasoningRunId}`) ?? null);
  }

  public async purgeReasoningRunV2(
    workspaceId: WorkspaceId,
    reasoningRunId: ReasoningRunId,
    deletedAt: Instant,
  ): Promise<PortResult<ReasoningRunV2 | null>> {
    const key = `${workspaceId}\0${reasoningRunId}`;
    const current = this.#reasoningRuns.get(key);
    if (current === undefined) return portSuccess(null);
    if (current.state === 'deleted') return portSuccess(current);
    const {
      outputHash: _outputHash,
      providerOutputHash: _providerOutputHash,
      deletedAt: _deletedAt,
      ...retained
    } = current;
    void _outputHash;
    void _providerOutputHash;
    void _deletedAt;
    const deleted = finalizeReasoningRunV2({
      ...retained,
      state: 'deleted',
      citations: [],
      hypotheses: [],
      limitations: ['reasoning_data_deleted'],
      deletedAt,
    });
    const analysisKey = `${workspaceId}\0${current.analysisId}`;
    const analysis = this.#analyses.get(analysisKey);
    if (analysis === undefined) return conflict('The reasoning analysis result is missing.');
    this.#analyses.set(analysisKey, removeReasoningFromAnalysisResultV2(analysis));
    this.#reasoningRuns.set(key, deleted);
    return portSuccess(deleted);
  }
}
