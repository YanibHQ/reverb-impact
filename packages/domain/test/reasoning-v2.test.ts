import {
  analysisId,
  contentHash,
  finalizeExecutionBudgetReportV2,
  finalizeReasoningHypothesisV2,
  finalizeReasoningRunV2,
  instant,
  reasoningRunIdentity,
  workspaceId,
} from '../src/index.js';
import { describe, expect, it } from 'vitest';

const now = instant('2026-09-03T00:10:00.000Z');
const analysis = analysisId('ana_01990f64-0000-7000-8000-000000000931');
const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000931');
const scopeHash = contentHash(`sha256:${'1'.repeat(64)}`);
const inputHash = contentHash(`sha256:${'2'.repeat(64)}`);
const provider = {
  providerId: 'fake',
  providerVersion: '1',
  modelId: 'fake-model',
  modelVersion: '1',
  dataRegion: 'fixture',
  retentionMode: 'none' as const,
};
const executionBudget = finalizeExecutionBudgetReportV2({
  schema: 'reverb.execution-budget',
  schemaVersion: '2.0',
  lane: 'reasoning',
  limits: {
    providerRequests: 1,
    sourceBytes: 1,
    storageQueries: 1,
    artifacts: 1,
    modelTokens: 1,
    latencyMs: 1,
  },
  usage: {
    providerRequests: 0,
    sourceBytes: 0,
    storageQueries: 0,
    artifacts: 0,
    modelTokens: 0,
    latencyMs: 0,
  },
  exhaustedDimensions: [],
  startedAt: now,
  completedAt: now,
});

describe('reasoning v2 domain records', () => {
  it('keeps severity separate from evidence confidence and requires two-sided citations', () => {
    expect(
      finalizeReasoningHypothesisV2({
        evidenceBasis: 'ai_inferred',
        disposition: 'needs_investigation',
        severity: 'critical',
        confidence: 'low',
        producerCitationIds: [`cit_sha256:${'4'.repeat(64)}`],
        consumerCitationIds: [`cit_sha256:${'5'.repeat(64)}`],
        limitations: ['weak_evidence'],
      }),
    ).toMatchObject({ severity: 'critical', confidence: 'low' });
    expect(() =>
      finalizeReasoningHypothesisV2({
        evidenceBasis: 'ai_inferred',
        disposition: 'needs_investigation',
        severity: 'high',
        confidence: 'high',
        producerCitationIds: [],
        consumerCitationIds: [`cit_sha256:${'5'.repeat(64)}`],
        limitations: [],
      }),
    ).toThrow();
  });

  it('requires deleted runs to scrub hypotheses and provider output hashes', () => {
    const common = {
      schema: 'reverb.reasoning-run' as const,
      schemaVersion: '2.0' as const,
      id: reasoningRunIdentity({
        analysisId: analysis,
        scopeHash,
        inputHash,
        provider,
        templateVersion: '1',
        reasoningPolicyVersion: '1',
        retrievalVersion: '1',
      }),
      workspaceId: workspace,
      analysisId: analysis,
      scopeHash,
      provider,
      templateVersion: '1',
      reasoningPolicyVersion: '1',
      retrievalVersion: '1',
      inputHash,
      executionBudget,
      consentDecisions: [],
      citations: [],
      createdAt: now,
    };
    expect(() =>
      finalizeReasoningRunV2({
        ...common,
        state: 'deleted',
        providerOutputHash: contentHash(`sha256:${'3'.repeat(64)}`),
        hypotheses: [],
        limitations: ['deleted'],
        deletedAt: now,
      }),
    ).toThrow();
    expect(
      finalizeReasoningRunV2({
        ...common,
        state: 'deleted',
        hypotheses: [],
        limitations: ['reasoning_data_deleted'],
        deletedAt: now,
      }),
    ).toMatchObject({ state: 'deleted', hypotheses: [], deletedAt: now });
  });
});
