import type { AnalysisScopeProvenanceV2 } from './analysis-scope.js';
import { hashCanonical } from './canonical.js';
import type { AnalysisResult } from './finding.js';
import type { ExecutionBudgetReportV2 } from './execution-v2.js';
import { contentHash } from './values.js';
import type { ContentHash } from './values.js';

export interface ReasoningHypothesisV2 {
  readonly evidenceBasis: 'ai_inferred';
  readonly disposition: 'needs_investigation' | 'withheld';
  readonly producerCitationIds: readonly string[];
  readonly consumerCitationIds: readonly string[];
  readonly limitations: readonly string[];
}

export interface AnalysisResultV2 {
  readonly schema: 'reverb.analysis-result';
  readonly schemaVersion: '2.0';
  readonly legacyResult: AnalysisResult;
  readonly scope: AnalysisScopeProvenanceV2;
  readonly state: Extract<AnalysisResult['state'], 'complete' | 'partial' | 'superseded'>;
  readonly executionBudgets: readonly ExecutionBudgetReportV2[];
  readonly deterministicFindings: AnalysisResult['findings'];
  readonly reasoningHypotheses: readonly ReasoningHypothesisV2[];
  readonly outputHash: ContentHash;
}

export function finalizeAnalysisResultV2(
  input: Omit<AnalysisResultV2, 'outputHash'>,
): AnalysisResultV2 {
  const canonical = {
    ...input,
    deterministicFindings: [...input.deterministicFindings].sort((left, right) =>
      left.fingerprint.localeCompare(right.fingerprint),
    ),
    executionBudgets: [...input.executionBudgets].sort((left, right) =>
      left.lane.localeCompare(right.lane),
    ),
    reasoningHypotheses: [...input.reasoningHypotheses],
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}
