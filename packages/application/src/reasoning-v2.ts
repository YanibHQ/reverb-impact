import type {
  AnalysisId,
  AnalysisScopeProvenanceV2,
  ExecutionBudgetLimitsV2,
  ExecutionBudgetReportV2,
  IndexedContractChangeV2,
  IndexedContractDefinitionV2,
  IndexedContractReferenceV2,
  ReasoningHypothesisV2,
  ReasoningRunV2,
  ScopedReadCapability,
} from '@yanib/reverb-domain';

import type { PortResult, Subject } from './ports.js';

export interface ReasoningRequestV2 {
  readonly enabled: true;
  readonly executionBudget: ExecutionBudgetLimitsV2;
}

export interface ReasoningAnalysisInputV2 {
  readonly analysisId: AnalysisId;
  readonly subject: Subject;
  readonly scope: AnalysisScopeProvenanceV2;
  readonly capability: ScopedReadCapability;
  readonly definitions: readonly IndexedContractDefinitionV2[];
  readonly references: readonly IndexedContractReferenceV2[];
  readonly changes: readonly IndexedContractChangeV2[];
  readonly executionBudget: ExecutionBudgetLimitsV2;
}

export interface ReasoningAnalysisOutcomeV2 {
  readonly run: ReasoningRunV2;
  readonly hypotheses: readonly ReasoningHypothesisV2[];
  readonly executionBudget: ExecutionBudgetReportV2;
}

export interface ReasoningAnalysisPortV2 {
  analyze(input: ReasoningAnalysisInputV2): Promise<PortResult<ReasoningAnalysisOutcomeV2>>;
}
