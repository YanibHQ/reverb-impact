import {
  analysisId,
  commitSha,
  contentHash,
  finalizeAnalysisResult,
  instant,
  policyRevision,
  registryRevision,
  repositoryStableId,
  workspaceId,
} from '@yanib/reverb-domain';
import { describe, expect, it } from 'vitest';

import {
  GitHubHostedRuntime,
  CanonicalAnalysisJobAdapter,
  GitHubCheckDeliveryAdapter,
  GitHubCheckWriter,
  HostedOperationalControls,
  HostedRuntimeFailure,
  type GitHubHostedRuntimeStore,
  type HostedCanonicalPointer,
  type HostedCanonicalRecord,
  type HostedDeliveryClaim,
  type HostedDeliveryInput,
  type HostedJobClaim,
  type HostedWebhookClaim,
} from '../src/index.js';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000701');
const otherWorkspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000702');
const now = instant('2026-08-31T20:00:00.000Z');
const leaseEnd = instant('2026-08-31T20:01:00.000Z');
const retryAt = instant('2026-08-31T20:02:00.000Z');
const resultHash = contentHash(`sha256:${'a'.repeat(64)}`);
const projectionHash = contentHash(`sha256:${'b'.repeat(64)}`);

function memoryRuntimeStore(initialWebhook?: HostedWebhookClaim) {
  let webhook = initialWebhook;
  let job: HostedJobClaim | undefined;
  let delivery: HostedDeliveryClaim | undefined;
  const records: HostedCanonicalRecord[] = [];
  const pointers: HostedCanonicalPointer[] = [];
  const failures: string[] = [];
  const superseded: string[] = [];
  const terminalDeliveries: string[] = [];
  const store: GitHubHostedRuntimeStore = {
    async claimWebhook() {
      const claimed = webhook;
      webhook = undefined;
      return claimed ?? null;
    },
    async resolveWebhook(input) {
      if (input.state === 'pending' && initialWebhook !== undefined) webhook = initialWebhook;
      if (input.failureCode !== undefined) failures.push(input.failureCode);
      return true;
    },
    async enqueueJob(input) {
      const jobId = `job-${input.idempotencyKey.slice(-8)}`;
      job = {
        ...input,
        jobId,
        attempt: 1,
        leaseOwner: 'worker-a',
        leaseExpiresAt: leaseEnd,
      };
      return jobId;
    },
    async supersedeJobs(input) {
      superseded.push(input.supersessionKey);
      return 0;
    },
    async claimJob() {
      const claimed = job;
      job = undefined;
      return claimed ?? null;
    },
    async completeJob() {
      return true;
    },
    async failJob(input) {
      failures.push(input.failureCode);
      return input.retryable ? 'retry_scheduled' : 'failed';
    },
    async putCanonicalRecord(record) {
      records.push(record);
      return true;
    },
    async putCanonicalPointer(pointer) {
      pointers.push(pointer);
    },
    async enqueueDelivery(input: HostedDeliveryInput) {
      delivery = {
        ...input,
        attempt: 1,
        leaseOwner: 'worker-a',
        leaseExpiresAt: leaseEnd,
      };
      return true;
    },
    async claimDelivery() {
      const claimed = delivery;
      delivery = undefined;
      return claimed ?? null;
    },
    async resolveDelivery(input) {
      terminalDeliveries.push(input.state);
      return true;
    },
    async failDelivery(input) {
      failures.push(input.failureCode);
      return input.retryable ? 'retry_scheduled' : 'failed';
    },
  };
  return { store, records, pointers, failures, superseded, terminalDeliveries };
}

function pullRequestWebhook(): HostedWebhookClaim {
  return {
    workspaceId: workspace,
    installationId: 44,
    deliveryId: 'delivery-701',
    eventType: 'pull_request',
    repositoryExternalId: 701,
    receivedAt: now,
    payloadHash: contentHash(`sha256:${'7'.repeat(64)}`),
    pointer: {
      action: 'synchronize',
      pullRequestNumber: 17,
      baseSha: '1'.repeat(40),
      headSha: '2'.repeat(40),
    },
    attempt: 1,
    leaseOwner: 'worker-a',
    leaseExpiresAt: leaseEnd,
  };
}

describe('GitHub hosted runtime composition', () => {
  it('rejects malformed delivery envelopes as terminal input failures', async () => {
    const controls = new HostedOperationalControls();
    const adapter = new GitHubCheckDeliveryAdapter(
      new GitHubCheckWriter({
        controls,
        tokens: {
          async withWriteToken(_input, operation) {
            return operation('unused-token');
          },
        },
        client: {
          async upsertCheck() {
            throw new Error('Malformed input must not reach the provider.');
          },
        },
      }),
      {
        async reauthorize() {
          return true;
        },
        async currentHead() {
          return '2'.repeat(40);
        },
      },
    );
    await expect(
      adapter.deliver({
        workspaceId: workspace,
        idempotencyKey: contentHash(`sha256:${'d'.repeat(64)}`),
        repositoryId: 'github:701',
        canonicalRecordHash: resultHash,
        projectionHash,
        projection: { schema: 'untrusted-envelope' },
        availableAt: now,
        maximumAttempts: 3,
        attempt: 1,
        leaseOwner: 'worker-a',
        leaseExpiresAt: leaseEnd,
      }),
    ).rejects.toMatchObject({ code: 'invalid_delivery_projection', retryable: false });
  });

  it('adapts a canonical analysis into its immutable record and current pointer', async () => {
    const repository = repositoryStableId('github:701');
    const analysis = finalizeAnalysisResult({
      schema: 'reverb.analysis-result',
      schemaVersion: '1.0',
      analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000701'),
      workspaceId: workspace,
      producerRepositoryId: repository,
      pullRequest: {
        provider: 'github',
        number: 17,
        baseSha: commitSha('1'.repeat(40)),
        headSha: commitSha('2'.repeat(40)),
      },
      registryRevision: registryRevision(`reg_sha256:${'3'.repeat(64)}`),
      policyRevision: policyRevision(`pol_sha256:${'4'.repeat(64)}`),
      policyMajor: 1,
      state: 'complete',
      current: true,
      consumers: [],
      findings: [],
      abstentions: [],
      startedAt: now,
      completedAt: now,
    });
    const supersessionKey = contentHash(`sha256:${'5'.repeat(64)}`);
    const adapter = new CanonicalAnalysisJobAdapter(async () => ({
      analysis,
      supersessionKey,
    }));
    const result = await adapter.handle({
      workspaceId: workspace,
      jobId: 'job-analysis-701',
      kind: 'analyze_pull_request',
      idempotencyKey: contentHash(`sha256:${'6'.repeat(64)}`),
      repositoryId: repository,
      payload: {},
      availableAt: now,
      maximumAttempts: 3,
      attempt: 1,
      leaseOwner: 'worker-a',
      leaseExpiresAt: leaseEnd,
    });
    expect(result).toMatchObject({
      resultHash: analysis.outputHash,
      records: [{ recordType: 'analysis', recordId: analysis.analysisId }],
      pointers: [{ pointerId: supersessionKey, targetRecordId: analysis.analysisId }],
    });
  });

  it('routes a webhook through analysis persistence and a separately authorized outbox worker', async () => {
    const memory = memoryRuntimeStore(pullRequestWebhook());
    const controls = new HostedOperationalControls();
    const record: HostedCanonicalRecord = {
      workspaceId: workspace,
      recordType: 'analysis',
      recordId: 'analysis-701',
      repositoryId: 'github:701',
      payloadHash: resultHash,
      payload: { schema: 'reverb.analysis-result', state: 'complete' },
      createdAt: now,
    };
    const runtime = new GitHubHostedRuntime({
      store: memory.store,
      controls,
      handlers: {
        async analyze_pull_request(claim) {
          expect(claim.payload).toMatchObject({
            eventType: 'pull_request',
            pointer: { pullRequestNumber: 17, headSha: '2'.repeat(40) },
          });
          return {
            resultHash,
            records: [record],
            pointers: [
              {
                workspaceId: workspace,
                pointerType: 'current_analysis',
                pointerId: 'pull-request-17',
                repositoryId: 'github:701',
                targetRecordType: 'analysis',
                targetRecordId: record.recordId,
                updatedAt: now,
              },
            ],
            deliveries: [
              {
                workspaceId: workspace,
                idempotencyKey: contentHash(`sha256:${'c'.repeat(64)}`),
                repositoryId: 'github:701',
                canonicalRecordHash: resultHash,
                projectionHash,
                projection: { schema: 'fixture-projection' },
                availableAt: now,
                maximumAttempts: 3,
              },
            ],
          };
        },
      },
    });

    await expect(
      runtime.processNextWebhook({
        workspaceId: workspace,
        workerId: 'worker-a',
        now,
        leaseExpiresAt: leaseEnd,
      }),
    ).resolves.toMatchObject({ state: 'complete' });
    expect(memory.superseded).toHaveLength(1);
    await expect(
      runtime.processNextJob({
        workspaceId: workspace,
        workerId: 'worker-a',
        now,
        leaseExpiresAt: leaseEnd,
        retryAt,
      }),
    ).resolves.toMatchObject({ state: 'complete' });
    expect(memory.records).toEqual([record]);
    expect(memory.pointers).toHaveLength(1);

    await expect(
      runtime.processNextDelivery({
        workspaceId: workspace,
        workerId: 'worker-a',
        now,
        leaseExpiresAt: leaseEnd,
        retryAt,
        async deliver(claim) {
          expect(claim.canonicalRecordHash).toBe(resultHash);
          return { state: 'delivered', providerExternalId: 'check-701' };
        },
      }),
    ).resolves.toMatchObject({ state: 'disabled' });
    controls.setDisabled('write', false);
    await expect(
      runtime.processNextDelivery({
        workspaceId: workspace,
        workerId: 'worker-a',
        now,
        leaseExpiresAt: leaseEnd,
        retryAt,
        async deliver(claim) {
          expect(claim.canonicalRecordHash).toBe(resultHash);
          return { state: 'delivered', providerExternalId: 'check-701' };
        },
      }),
    ).resolves.toMatchObject({ state: 'complete' });
    expect(memory.terminalDeliveries).toEqual(['delivered']);
  });

  it('fails closed on cross-workspace handler output and preserves retry classification', async () => {
    const memory = memoryRuntimeStore(pullRequestWebhook());
    const controls = new HostedOperationalControls();
    const runtime = new GitHubHostedRuntime({
      store: memory.store,
      controls,
      handlers: {
        async analyze_pull_request() {
          return {
            resultHash,
            records: [
              {
                workspaceId: otherWorkspace,
                recordType: 'analysis',
                recordId: 'cross-tenant',
                payloadHash: resultHash,
                payload: {},
                createdAt: now,
              },
            ],
          };
        },
      },
    });
    await runtime.processNextWebhook({
      workspaceId: workspace,
      workerId: 'worker-a',
      now,
      leaseExpiresAt: leaseEnd,
    });
    await expect(
      runtime.processNextJob({
        workspaceId: workspace,
        workerId: 'worker-a',
        now,
        leaseExpiresAt: leaseEnd,
        retryAt,
      }),
    ).resolves.toMatchObject({ state: 'failed' });
    expect(memory.records).toEqual([]);
    expect(memory.failures).toContain('cross_workspace_job_result');

    const retryMemory = memoryRuntimeStore(pullRequestWebhook());
    const retryRuntime = new GitHubHostedRuntime({
      store: retryMemory.store,
      controls,
      handlers: {
        async analyze_pull_request() {
          throw new HostedRuntimeFailure('provider_temporarily_unavailable', true);
        },
      },
    });
    await retryRuntime.processNextWebhook({
      workspaceId: workspace,
      workerId: 'worker-a',
      now,
      leaseExpiresAt: leaseEnd,
    });
    await expect(
      retryRuntime.processNextJob({
        workspaceId: workspace,
        workerId: 'worker-a',
        now,
        leaseExpiresAt: leaseEnd,
        retryAt,
      }),
    ).resolves.toMatchObject({ state: 'retry_scheduled' });
    expect(retryMemory.failures).toContain('provider_temporarily_unavailable');
  });

  it('routes requested check actions to the review adapter boundary', async () => {
    const webhook: HostedWebhookClaim = {
      ...pullRequestWebhook(),
      eventType: 'check_run',
      pointer: { checkRunId: 701, requestedAction: 'confirm-impact' },
    };
    const memory = memoryRuntimeStore(webhook);
    const seen: string[] = [];
    const runtime = new GitHubHostedRuntime({
      store: memory.store,
      controls: new HostedOperationalControls(),
      handlers: {
        async record_review(claim) {
          seen.push(claim.kind);
          return { resultHash };
        },
      },
    });
    await runtime.processNextWebhook({
      workspaceId: workspace,
      workerId: 'worker-a',
      now,
      leaseExpiresAt: leaseEnd,
    });
    await runtime.processNextJob({
      workspaceId: workspace,
      workerId: 'worker-a',
      now,
      leaseExpiresAt: leaseEnd,
      retryAt,
    });
    expect(seen).toEqual(['record_review']);
  });
});
