import { hashCanonical } from './canonical.js';
import { contentHash } from './values.js';
import type { ContentHash, Instant } from './values.js';

export const EXECUTION_LANES_V2 = [
  'bootstrap_index',
  'incremental_index',
  'pull_request',
  'reasoning',
] as const;
export type ExecutionLaneV2 = (typeof EXECUTION_LANES_V2)[number];

export const BUDGET_DIMENSIONS_V2 = [
  'provider_requests',
  'source_bytes',
  'storage_queries',
  'artifacts',
  'model_tokens',
  'latency_ms',
] as const;
export type BudgetDimensionV2 = (typeof BUDGET_DIMENSIONS_V2)[number];

export interface ExecutionBudgetLimitsV2 {
  readonly providerRequests: number;
  readonly sourceBytes: number;
  readonly storageQueries: number;
  readonly artifacts: number;
  readonly modelTokens: number;
  readonly latencyMs: number;
}

export interface ExecutionBudgetUsageV2 {
  readonly providerRequests: number;
  readonly sourceBytes: number;
  readonly storageQueries: number;
  readonly artifacts: number;
  readonly modelTokens: number;
  readonly latencyMs: number;
}

export interface ExecutionBudgetReportV2 {
  readonly schema: 'reverb.execution-budget';
  readonly schemaVersion: '2.0';
  readonly lane: ExecutionLaneV2;
  readonly limits: ExecutionBudgetLimitsV2;
  readonly usage: ExecutionBudgetUsageV2;
  readonly exhaustedDimensions: readonly BudgetDimensionV2[];
  readonly startedAt: Instant;
  readonly completedAt: Instant;
  readonly outputHash: ContentHash;
}

export function finalizeExecutionBudgetReportV2(
  input: Omit<ExecutionBudgetReportV2, 'outputHash'>,
): ExecutionBudgetReportV2 {
  const canonical = {
    ...input,
    exhaustedDimensions: [...new Set(input.exhaustedDimensions)].sort(),
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}
