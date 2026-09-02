import {
  finalizeExecutionBudgetReportV2,
  type BudgetDimensionV2,
  type ExecutionBudgetLimitsV2,
  type ExecutionBudgetReportV2,
  type ExecutionBudgetUsageV2,
  type ExecutionLaneV2,
  type Instant,
} from '@yanib/reverb-domain';

import { portFailure, portSuccess } from './ports.js';
import type { Clock, PortResult } from './ports.js';

export type ExecutionBudgetDeltaV2 = Partial<Omit<ExecutionBudgetUsageV2, 'latencyMs'>>;
type MutableExecutionUsageV2 = {
  -readonly [Key in keyof Omit<ExecutionBudgetUsageV2, 'latencyMs'>]: number;
};

export type ExecutionBudgetTelemetryEventV2 =
  | {
      readonly type: 'execution_budget_exhausted';
      readonly lane: ExecutionLaneV2;
      readonly dimension: BudgetDimensionV2;
      readonly usage: ExecutionBudgetUsageV2;
    }
  | {
      readonly type: 'execution_budget_completed';
      readonly lane: ExecutionLaneV2;
      readonly usage: ExecutionBudgetUsageV2;
      readonly exhaustedDimensions: readonly BudgetDimensionV2[];
    };

export interface ExecutionBudgetTelemetryPortV2 {
  emit(event: ExecutionBudgetTelemetryEventV2): void;
}

const usageToDimension = {
  providerRequests: 'provider_requests',
  sourceBytes: 'source_bytes',
  storageQueries: 'storage_queries',
  artifacts: 'artifacts',
  modelTokens: 'model_tokens',
} as const satisfies Record<keyof ExecutionBudgetDeltaV2, BudgetDimensionV2>;
type ReservableDimensionV2 = keyof typeof usageToDimension;

function reservationEntries(
  delta: ExecutionBudgetDeltaV2,
): readonly (readonly [ReservableDimensionV2, number])[] {
  return Object.entries(delta).map(([key, amount]) => {
    if (!Object.hasOwn(usageToDimension, key) || !validNonNegativeInteger(amount)) {
      throw new RangeError(
        'Execution budget reservations require known dimensions and non-negative safe integers.',
      );
    }
    return [key as ReservableDimensionV2, amount] as const;
  });
}

function validNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function elapsed(startedAt: Instant, now: Instant): number {
  return Math.max(0, new Date(now).valueOf() - new Date(startedAt).valueOf());
}

export class ExecutionBudgetV2 {
  readonly #startedAt: Instant;
  readonly #exhausted = new Set<BudgetDimensionV2>();
  readonly #usage: MutableExecutionUsageV2 = {
    providerRequests: 0,
    sourceBytes: 0,
    storageQueries: 0,
    artifacts: 0,
    modelTokens: 0,
  };

  public constructor(
    public readonly lane: ExecutionLaneV2,
    public readonly limits: ExecutionBudgetLimitsV2,
    private readonly clock: Clock,
    private readonly telemetry?: ExecutionBudgetTelemetryPortV2,
  ) {
    if (
      !Object.values(limits).every(
        (value) => typeof value === 'number' && validNonNegativeInteger(value),
      )
    ) {
      throw new RangeError('Execution budgets must be non-negative safe integers.');
    }
    this.#startedAt = clock.now();
  }

  public usage(): ExecutionBudgetUsageV2 {
    return { ...this.#usage, latencyMs: elapsed(this.#startedAt, this.clock.now()) };
  }

  public remaining(): ExecutionBudgetLimitsV2 {
    const usage = this.usage();
    return {
      providerRequests: Math.max(0, this.limits.providerRequests - usage.providerRequests),
      sourceBytes: Math.max(0, this.limits.sourceBytes - usage.sourceBytes),
      storageQueries: Math.max(0, this.limits.storageQueries - usage.storageQueries),
      artifacts: Math.max(0, this.limits.artifacts - usage.artifacts),
      modelTokens: Math.max(0, this.limits.modelTokens - usage.modelTokens),
      latencyMs: Math.max(0, this.limits.latencyMs - usage.latencyMs),
    };
  }

  #exhaustedResult(dimension: BudgetDimensionV2): PortResult<void> {
    this.#exhausted.add(dimension);
    this.telemetry?.emit({
      type: 'execution_budget_exhausted',
      lane: this.lane,
      dimension,
      usage: this.usage(),
    });
    return portFailure({
      kind: 'incomplete_provider_data',
      code: 'execution_budget_exceeded',
      safeMessage: `The ${dimension} execution budget was exhausted.`,
      retryable: false,
    });
  }

  public reserve(delta: ExecutionBudgetDeltaV2): PortResult<void> {
    const entries = reservationEntries(delta);
    const latencyMs = elapsed(this.#startedAt, this.clock.now());
    if (latencyMs > this.limits.latencyMs) return this.#exhaustedResult('latency_ms');
    for (const [key, amount] of entries) {
      const next = this.#usage[key] + amount;
      if (next > this.limits[key]) return this.#exhaustedResult(usageToDimension[key]);
    }
    for (const [key, amount] of entries) {
      this.#usage[key] += amount;
    }
    return portSuccess(undefined);
  }

  public release(delta: ExecutionBudgetDeltaV2): void {
    const entries = reservationEntries(delta);
    for (const [key, amount] of entries) {
      if (amount > this.#usage[key]) {
        throw new RangeError('Execution budget releases cannot exceed reserved usage.');
      }
    }
    for (const [key, amount] of entries) this.#usage[key] -= amount;
  }

  public complete(completedAt = this.clock.now()): ExecutionBudgetReportV2 {
    const latencyMs = elapsed(this.#startedAt, completedAt);
    if (latencyMs > this.limits.latencyMs) this.#exhausted.add('latency_ms');
    const report = finalizeExecutionBudgetReportV2({
      schema: 'reverb.execution-budget',
      schemaVersion: '2.0',
      lane: this.lane,
      limits: this.limits,
      usage: { ...this.#usage, latencyMs },
      exhaustedDimensions: [...this.#exhausted],
      startedAt: this.#startedAt,
      completedAt,
    });
    this.telemetry?.emit({
      type: 'execution_budget_completed',
      lane: this.lane,
      usage: report.usage,
      exhaustedDimensions: report.exhaustedDimensions,
    });
    return report;
  }
}

export interface ExecutionQueueV2<Job> {
  enqueue(job: Job): Promise<PortResult<void>>;
}

export class SeparatedExecutionQueuesV2<Job extends { readonly lane: ExecutionLaneV2 }> {
  public constructor(
    private readonly queues: Readonly<Record<ExecutionLaneV2, ExecutionQueueV2<Job>>>,
  ) {}

  public enqueue(job: Job): Promise<PortResult<void>> {
    return this.queues[job.lane].enqueue(job);
  }
}
