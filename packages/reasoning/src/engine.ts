import {
  ExecutionBudgetV2,
  portSuccess,
  type Clock,
  type PortResult,
  type ReasoningAnalysisInputV2,
  type ReasoningAnalysisOutcomeV2,
  type ReasoningAnalysisPortV2,
} from '@yanib/reverb-application';
import {
  REASONING_CONFIDENCES_V2,
  REASONING_HYPOTHESIS_LIMITATIONS_V2,
  REASONING_SEVERITIES_V2,
  contentHash,
  finalizeReasoningHypothesisV2,
  finalizeReasoningRunV2,
  hashCanonical,
  reasoningRunIdentity,
  type ReasoningConsentProvenanceV2,
  type ReasoningHypothesisV2,
  type ReasoningRunLimitationV2,
  type ReasoningCitationV2,
  type ReasoningRunV2,
} from '@yanib/reverb-domain';

import type {
  ReasoningCandidateV1,
  ReasoningConsentPortV1,
  ReasoningEngineConfigurationV1,
  ReasoningPortV1,
  ReasoningRetrievalPortV1,
  ReasoningTelemetryPortV1,
  StructuredReasoningRequestV1,
  StructuredReasoningResponseV1,
} from './protocol.js';
import { materializeReasoningContextV1, planReasoningEvidenceV1 } from './retrieval.js';

const candidateKeys = [
  'severity',
  'confidence',
  'producerCitationIds',
  'consumerCitationIds',
  'limitations',
] as const;

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}
function bounded(value: unknown, maximum = 512): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    !value.includes('\0')
  );
}
function stringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= 100 && value.every((item) => bounded(item));
}
function candidateLimitationArray(value: unknown): boolean {
  return (
    stringArray(value) &&
    value.every((item) => REASONING_HYPOTHESIS_LIMITATIONS_V2.includes(item as never))
  );
}
function validConsentDecision(value: {
  readonly allowed: boolean;
  readonly revision: string;
  readonly decisionHash: string;
}): boolean {
  if (typeof value.allowed !== 'boolean' || !bounded(value.revision)) return false;
  try {
    contentHash(value.decisionHash);
    return true;
  } catch {
    return false;
  }
}
function parseCandidate(value: unknown): ReasoningCandidateV1 | undefined {
  if (
    !record(value) ||
    !exactKeys(value, candidateKeys) ||
    !REASONING_SEVERITIES_V2.includes(value.severity as never) ||
    !REASONING_CONFIDENCES_V2.includes(value.confidence as never) ||
    !stringArray(value.producerCitationIds) ||
    !stringArray(value.consumerCitationIds) ||
    !candidateLimitationArray(value.limitations)
  )
    return undefined;
  return value as unknown as ReasoningCandidateV1;
}
function parseResponse(
  value: unknown,
  maximumCandidates: number,
): StructuredReasoningResponseV1 | undefined {
  if (
    !record(value) ||
    !exactKeys(value, ['schema', 'schemaVersion', 'state', 'candidates', 'modelTokens']) ||
    value.schema !== 'reverb.reasoning-response' ||
    value.schemaVersion !== '1.0' ||
    !['complete', 'refused'].includes(String(value.state)) ||
    !Array.isArray(value.candidates) ||
    value.candidates.length > maximumCandidates ||
    !Number.isSafeInteger(value.modelTokens) ||
    Number(value.modelTokens) < 0
  )
    return undefined;
  const candidates = value.candidates.map(parseCandidate);
  if (candidates.some((candidate) => candidate === undefined)) return undefined;
  if (value.state === 'refused' && candidates.length > 0) return undefined;
  return {
    schema: 'reverb.reasoning-response',
    schemaVersion: '1.0',
    state: value.state as StructuredReasoningResponseV1['state'],
    candidates: candidates as ReasoningCandidateV1[],
    modelTokens: Number(value.modelTokens),
  };
}

async function boundedCall<Value>(
  milliseconds: number,
  operation: (signal: AbortSignal) => Promise<Value>,
): Promise<
  { readonly state: 'complete'; readonly value: Value } | { readonly state: 'timeout' | 'failed' }
> {
  const controller = new AbortController();
  if (milliseconds <= 0) {
    controller.abort();
    return { state: 'timeout' };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve()
        .then(() => operation(controller.signal))
        .then(
          (value) => ({ state: 'complete' as const, value }),
          () => ({ state: 'failed' as const }),
        ),
      new Promise<{ readonly state: 'timeout' }>((resolve) => {
        timer = setTimeout(
          () => {
            controller.abort();
            resolve({ state: 'timeout' });
          },
          Math.max(1, milliseconds),
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export class ReasoningEngineV1 implements ReasoningAnalysisPortV2 {
  #consecutiveProviderFailures = 0;
  #openUntil = 0;

  public constructor(
    private readonly dependencies: {
      readonly clock: Clock;
      readonly consent: ReasoningConsentPortV1;
      readonly retrieval: ReasoningRetrievalPortV1;
      readonly provider: ReasoningPortV1;
      readonly telemetry?: ReasoningTelemetryPortV1;
    },
    private readonly configuration: ReasoningEngineConfigurationV1,
  ) {
    if (
      !Number.isSafeInteger(configuration.maximumCandidates) ||
      configuration.maximumCandidates < 0 ||
      !Number.isSafeInteger(configuration.circuitBreakerFailureThreshold) ||
      configuration.circuitBreakerFailureThreshold < 1 ||
      !Number.isSafeInteger(configuration.circuitBreakerCooldownMs) ||
      configuration.circuitBreakerCooldownMs < 0
    )
      throw new RangeError('Reasoning engine limits must be non-negative safe integers.');
  }

  public async analyze(
    input: ReasoningAnalysisInputV2,
  ): Promise<PortResult<ReasoningAnalysisOutcomeV2>> {
    const budget = new ExecutionBudgetV2(
      'reasoning',
      input.executionBudget,
      this.dependencies.clock,
    );
    const handles = planReasoningEvidenceV1({
      capability: input.capability,
      changes: input.changes,
      definitions: input.definitions,
      references: input.references,
      maximumItems: input.executionBudget.artifacts,
    });
    let retainedCitations: ReasoningCitationV2[] = [];
    const consentDecisions: ReasoningConsentProvenanceV2[] = [];
    const seedHash = contentHash(hashCanonical(handles));
    const finish = (parameters: {
      readonly state: ReasoningRunV2['state'];
      readonly inputHash?: ReturnType<typeof contentHash>;
      readonly providerOutputHash?: ReturnType<typeof contentHash>;
      readonly hypotheses?: readonly ReasoningHypothesisV2[];
      readonly limitations?: readonly ReasoningRunLimitationV2[];
      readonly providerFailure?: boolean;
    }): PortResult<ReasoningAnalysisOutcomeV2> => {
      const executionBudget = budget.complete();
      const hypotheses = parameters.hypotheses ?? [];
      const limitations = [...new Set(parameters.limitations ?? [])].sort();
      if (parameters.providerFailure === true) {
        this.#consecutiveProviderFailures += 1;
        if (this.#consecutiveProviderFailures >= this.configuration.circuitBreakerFailureThreshold)
          this.#openUntil =
            new Date(this.dependencies.clock.now()).valueOf() +
            this.configuration.circuitBreakerCooldownMs;
      } else if (parameters.state === 'complete') {
        this.#consecutiveProviderFailures = 0;
        this.#openUntil = 0;
      }
      const inputHash = parameters.inputHash ?? seedHash;
      const run = finalizeReasoningRunV2({
        schema: 'reverb.reasoning-run',
        schemaVersion: '2.0',
        id: reasoningRunIdentity({
          analysisId: input.analysisId,
          scopeHash: input.scope.scopeHash,
          inputHash,
          provider: this.configuration.provider,
          templateVersion: this.configuration.templateVersion,
          reasoningPolicyVersion: this.configuration.reasoningPolicyVersion,
          retrievalVersion: this.configuration.retrievalVersion,
        }),
        workspaceId: input.scope.workspaceId,
        analysisId: input.analysisId,
        scopeHash: input.scope.scopeHash,
        state: parameters.state,
        provider: this.configuration.provider,
        templateVersion: this.configuration.templateVersion,
        reasoningPolicyVersion: this.configuration.reasoningPolicyVersion,
        retrievalVersion: this.configuration.retrievalVersion,
        inputHash,
        ...(parameters.providerOutputHash === undefined
          ? {}
          : { providerOutputHash: parameters.providerOutputHash }),
        executionBudget,
        consentDecisions,
        citations: retainedCitations,
        hypotheses,
        limitations,
        createdAt: executionBudget.completedAt,
      });
      try {
        this.dependencies.telemetry?.emit({
          type: 'reasoning_completed',
          state: parameters.state === 'deleted' ? 'failed' : parameters.state,
          evidenceCount: handles.length,
          candidateCount: hypotheses.length,
          sourceBytes: executionBudget.usage.sourceBytes,
          modelTokens: executionBudget.usage.modelTokens,
          latencyMs: executionBudget.usage.latencyMs,
          limitationCodes: limitations,
        });
      } catch {
        // Telemetry is observational and cannot change analysis behavior.
      }
      return portSuccess({ run, hypotheses: run.hypotheses, executionBudget });
    };

    if (handles.length === 0)
      return finish({ state: 'partial', limitations: ['reasoning_seed_evidence_missing'] });
    const repositories = [...new Set(handles.map((handle) => handle.repositoryId))].sort();
    const consentBudget = budget.reserve({ storageQueries: repositories.length });
    if (!consentBudget.ok)
      return finish({ state: 'failed', limitations: ['reasoning_budget_exhausted'] });
    for (const repositoryId of repositories) {
      const consent = await boundedCall(budget.remaining().latencyMs, (signal) =>
        this.dependencies.consent.authorize({
          subject: input.subject,
          workspaceId: input.scope.workspaceId,
          repositoryId,
          scopeHash: input.scope.scopeHash,
          provider: this.configuration.provider,
          signal,
        }),
      );
      if (consent.state !== 'complete')
        return finish({
          state: 'failed',
          limitations: [
            consent.state === 'timeout' ? 'reasoning_consent_timeout' : 'reasoning_consent_failed',
          ],
        });
      if (!consent.value.ok || !validConsentDecision(consent.value.value))
        return finish({ state: 'failed', limitations: ['reasoning_consent_failed'] });
      consentDecisions.push({ repositoryId, ...consent.value.value });
      if (!consent.value.value.allowed)
        return finish({ state: 'failed', limitations: ['reasoning_consent_denied'] });
    }
    const retrievalBudget = budget.reserve({ storageQueries: 1, artifacts: handles.length });
    if (!retrievalBudget.ok)
      return finish({ state: 'failed', limitations: ['reasoning_budget_exhausted'] });
    const retrieved = await boundedCall(budget.remaining().latencyMs, (signal) =>
      this.dependencies.retrieval.retrieve({
        capability: input.capability,
        handles,
        maximumBytes: budget.remaining().sourceBytes,
        signal,
      }),
    );
    if (retrieved.state !== 'complete')
      return finish({
        state: 'failed',
        limitations: [
          retrieved.state === 'timeout'
            ? 'reasoning_retrieval_timeout'
            : 'reasoning_retrieval_failed',
        ],
      });
    if (!retrieved.value.ok)
      return finish({ state: 'failed', limitations: ['reasoning_retrieval_failed'] });
    if (retrieved.value.value.length > handles.length)
      return finish({ state: 'failed', limitations: ['reasoning_retrieval_invalid'] });
    const materialized = materializeReasoningContextV1({
      capability: input.capability,
      expected: handles,
      retrieved: retrieved.value.value,
      maximumBytes: budget.remaining().sourceBytes,
    });
    retainedCitations = materialized.context.map(({ excerpt: _excerpt, ...citation }) => {
      void _excerpt;
      return citation;
    });
    const byteBudget = budget.reserve({ sourceBytes: materialized.sourceBytes });
    if (!byteBudget.ok)
      return finish({ state: 'failed', limitations: ['reasoning_budget_exhausted'] });
    if (
      !materialized.context.some((item) => item.side === 'producer') ||
      !materialized.context.some((item) => item.side === 'consumer')
    )
      return finish({ state: 'partial', limitations: ['reasoning_two_sided_context_missing'] });
    const requestWithoutHash = {
      schema: 'reverb.reasoning-request' as const,
      schemaVersion: '1.0' as const,
      templateVersion: this.configuration.templateVersion,
      reasoningPolicyVersion: this.configuration.reasoningPolicyVersion,
      retrievalVersion: this.configuration.retrievalVersion,
      evidence: materialized.context,
      maximumCandidates: this.configuration.maximumCandidates,
      maximumOutputTokens: budget.remaining().modelTokens,
    };
    const inputHash = contentHash(hashCanonical(requestWithoutHash));
    const request: StructuredReasoningRequestV1 = { ...requestWithoutHash, inputHash };
    if (new Date(this.dependencies.clock.now()).valueOf() < this.#openUntil)
      return finish({
        state: 'failed',
        inputHash,
        limitations: ['reasoning_circuit_open'],
      });
    const providerBudget = budget.reserve({ providerRequests: 1 });
    if (!providerBudget.ok)
      return finish({ state: 'failed', inputHash, limitations: ['reasoning_budget_exhausted'] });
    const provider = await boundedCall(budget.remaining().latencyMs, (signal) =>
      this.dependencies.provider.reason(request, signal),
    );
    if (provider.state !== 'complete')
      return finish({
        state: 'failed',
        inputHash,
        limitations: [
          provider.state === 'timeout' ? 'reasoning_provider_timeout' : 'reasoning_provider_failed',
        ],
        providerFailure: true,
      });
    const response = parseResponse(provider.value, this.configuration.maximumCandidates);
    if (response === undefined)
      return finish({
        state: 'failed',
        inputHash,
        limitations: ['reasoning_response_malformed'],
        providerFailure: true,
      });
    const tokenBudget = budget.reserve({ modelTokens: response.modelTokens });
    const providerOutputHash = contentHash(hashCanonical(response));
    if (!tokenBudget.ok)
      return finish({
        state: 'failed',
        inputHash,
        providerOutputHash,
        limitations: ['reasoning_budget_exhausted'],
      });
    if (response.state === 'refused')
      return finish({
        state: 'failed',
        inputHash,
        providerOutputHash,
        limitations: ['reasoning_provider_refused'],
        providerFailure: true,
      });
    const supplied = new Map(materialized.context.map((item) => [item.citationId, item]));
    const hypotheses: ReasoningHypothesisV2[] = [];
    let invalidCitations = false;
    for (const candidate of response.candidates) {
      const producerValid =
        candidate.producerCitationIds.length > 0 &&
        candidate.producerCitationIds.every((id) => supplied.get(id)?.side === 'producer');
      const consumerValid =
        candidate.consumerCitationIds.length > 0 &&
        candidate.consumerCitationIds.every((id) => supplied.get(id)?.side === 'consumer');
      if (!producerValid || !consumerValid) {
        invalidCitations = true;
        continue;
      }
      hypotheses.push(
        finalizeReasoningHypothesisV2({
          evidenceBasis: 'ai_inferred',
          disposition: 'needs_investigation',
          severity: candidate.severity,
          confidence: candidate.confidence,
          producerCitationIds: candidate.producerCitationIds,
          consumerCitationIds: candidate.consumerCitationIds,
          limitations:
            candidate.confidence === 'low'
              ? [...candidate.limitations, 'weak_evidence']
              : candidate.limitations,
        }),
      );
    }
    return finish({
      state: invalidCitations ? 'partial' : 'complete',
      inputHash,
      providerOutputHash,
      hypotheses,
      limitations: invalidCitations ? ['reasoning_citation_invalid'] : [],
    });
  }
}
