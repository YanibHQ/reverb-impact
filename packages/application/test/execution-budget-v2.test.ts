import { instant, type ExecutionLaneV2 } from '@yanib/reverb-domain';
import {
  ExecutionBudgetV2,
  SeparatedExecutionQueuesV2,
  portSuccess,
  type ExecutionBudgetTelemetryEventV2,
} from '../src/index.js';
import { describe, expect, it, vi } from 'vitest';

class Clock {
  public value = instant('2026-09-02T20:00:00.000Z');

  public now() {
    return this.value;
  }
}

const limits = {
  providerRequests: 2,
  sourceBytes: 100,
  storageQueries: 3,
  artifacts: 5,
  modelTokens: 0,
  latencyMs: 1_000,
} as const;

describe('ExecutionBudgetV2', () => {
  it('keeps bootstrap, incremental, pull-request, and reasoning usage independent', () => {
    const clock = new Clock();
    for (const lane of [
      'bootstrap_index',
      'incremental_index',
      'pull_request',
      'reasoning',
    ] satisfies ExecutionLaneV2[]) {
      const budget = new ExecutionBudgetV2(lane, limits, clock);
      expect(budget.reserve({ providerRequests: 2, sourceBytes: 100 })).toMatchObject({ ok: true });
      expect(budget.usage()).toMatchObject({ providerRequests: 2, sourceBytes: 100 });
    }
  });

  it('reserves multiple dimensions atomically and reports bounded exhaustion', () => {
    const clock = new Clock();
    const budget = new ExecutionBudgetV2('pull_request', limits, clock);
    expect(budget.reserve({ providerRequests: 2, storageQueries: 4 })).toMatchObject({
      ok: false,
      failure: { code: 'execution_budget_exceeded', retryable: false },
    });
    expect(budget.usage()).toMatchObject({ providerRequests: 0, storageQueries: 0 });
    expect(budget.complete().exhaustedDimensions).toEqual(['storage_queries']);
  });

  it('turns latency overrun into explicit partial-budget evidence', () => {
    const clock = new Clock();
    const budget = new ExecutionBudgetV2('incremental_index', limits, clock);
    clock.value = instant('2026-09-02T20:00:01.001Z');
    expect(budget.reserve({ artifacts: 1 })).toMatchObject({
      ok: false,
      failure: { code: 'execution_budget_exceeded' },
    });
    expect(budget.complete().exhaustedDimensions).toEqual(['latency_ms']);
  });

  it('emits identifier-free closed telemetry', () => {
    const events: ExecutionBudgetTelemetryEventV2[] = [];
    const budget = new ExecutionBudgetV2('pull_request', limits, new Clock(), {
      emit: (event) => events.push(event),
    });
    budget.reserve({ providerRequests: 3 });
    budget.complete();
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('private-repository-canary');
    expect(events.map((event) => event.type)).toEqual([
      'execution_budget_exhausted',
      'execution_budget_completed',
    ]);
  });

  it('routes every lane to a separately controlled queue', async () => {
    const queues = Object.fromEntries(
      (['bootstrap_index', 'incremental_index', 'pull_request', 'reasoning'] as const).map(
        (lane) => [lane, { enqueue: vi.fn(async () => portSuccess(undefined)) }],
      ),
    ) as ConstructorParameters<typeof SeparatedExecutionQueuesV2<{ lane: ExecutionLaneV2 }>>[0];
    const router = new SeparatedExecutionQueuesV2(queues);
    await router.enqueue({ lane: 'pull_request' });
    expect(queues.pull_request.enqueue).toHaveBeenCalledOnce();
    expect(queues.bootstrap_index.enqueue).not.toHaveBeenCalled();
    expect(queues.incremental_index.enqueue).not.toHaveBeenCalled();
    expect(queues.reasoning.enqueue).not.toHaveBeenCalled();
  });
});
