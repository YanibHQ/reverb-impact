import {
  contentHash,
  hashCanonical,
  type AnalysisResult,
  type CheckDeliveryPlan,
  type ContentHash,
  type Instant,
  type WorkspaceId,
} from '@yanib/reverb-domain';

import type { CheckWriteResult, GitHubCheckWriter } from './check-writer.js';
import type { HostedOperationalControls } from './controls.js';
import type { AuthorizedReviewService } from './detail.js';

export const GITHUB_HOSTED_JOB_KINDS = [
  'index_generation',
  'create_overlay',
  'analyze_pull_request',
  'purge_repository',
  'reconcile_provider',
  'record_review',
] as const;

export type GitHubHostedJobKind = (typeof GITHUB_HOSTED_JOB_KINDS)[number];

const GITHUB_HOSTED_JOB_KIND_SET: ReadonlySet<string> = new Set(GITHUB_HOSTED_JOB_KINDS);

export function isGitHubHostedJobKind(kind: string): kind is GitHubHostedJobKind {
  return GITHUB_HOSTED_JOB_KIND_SET.has(kind);
}

export interface HostedWebhookClaim {
  readonly workspaceId: WorkspaceId;
  readonly installationId: number;
  readonly deliveryId: string;
  readonly eventType: string;
  readonly repositoryExternalId?: number;
  readonly receivedAt: Instant;
  readonly payloadHash: ContentHash;
  readonly pointer: Readonly<Record<string, unknown>>;
  readonly attempt: number;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Instant;
}

export interface HostedJobClaim {
  readonly workspaceId: WorkspaceId;
  readonly jobId: string;
  readonly kind: string;
  readonly idempotencyKey: ContentHash;
  readonly repositoryId?: string;
  readonly supersessionKey?: ContentHash;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly availableAt: Instant;
  readonly maximumAttempts: number;
  readonly attempt: number;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Instant;
}

export interface HostedDeliveryClaim {
  readonly workspaceId: WorkspaceId;
  readonly idempotencyKey: ContentHash;
  readonly repositoryId: string;
  readonly canonicalRecordHash: ContentHash;
  readonly projectionHash: ContentHash;
  readonly projection: Readonly<Record<string, unknown>>;
  readonly availableAt: Instant;
  readonly maximumAttempts: number;
  readonly attempt: number;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Instant;
}

export interface GitHubHostedRuntimeStore {
  claimWebhook(input: {
    readonly workspaceId: WorkspaceId;
    readonly workerId: string;
    readonly now: Instant;
    readonly leaseExpiresAt: Instant;
  }): Promise<HostedWebhookClaim | null>;
  resolveWebhook(input: {
    readonly workspaceId: WorkspaceId;
    readonly installationId: number;
    readonly deliveryId: string;
    readonly workerId: string;
    readonly state: 'pending' | 'processed' | 'failed';
    readonly failureCode?: string;
  }): Promise<boolean>;
  enqueueJob(input: {
    readonly workspaceId: WorkspaceId;
    readonly kind: string;
    readonly idempotencyKey: ContentHash;
    readonly repositoryId?: string;
    readonly supersessionKey?: ContentHash;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly availableAt: Instant;
    readonly maximumAttempts: number;
  }): Promise<string>;
  supersedeJobs(input: {
    readonly workspaceId: WorkspaceId;
    readonly supersessionKey: ContentHash;
    readonly exceptJobId?: string;
  }): Promise<number>;
  claimJob(input: {
    readonly workspaceId: WorkspaceId;
    readonly workerId: string;
    readonly now: Instant;
    readonly leaseExpiresAt: Instant;
    readonly kinds?: readonly string[];
  }): Promise<HostedJobClaim | null>;
  completeJob(input: {
    readonly workspaceId: WorkspaceId;
    readonly jobId: string;
    readonly workerId: string;
    readonly resultHash: ContentHash;
  }): Promise<boolean>;
  failJob(input: {
    readonly workspaceId: WorkspaceId;
    readonly jobId: string;
    readonly workerId: string;
    readonly failureCode: string;
    readonly retryable: boolean;
    readonly retryAt: Instant;
  }): Promise<'retry_scheduled' | 'failed' | 'stale_claim'>;
  putCanonicalRecord(record: HostedCanonicalRecord): Promise<boolean>;
  putCanonicalPointer(pointer: HostedCanonicalPointer): Promise<void>;
  enqueueDelivery(input: HostedDeliveryInput): Promise<boolean>;
  claimDelivery(input: {
    readonly workspaceId: WorkspaceId;
    readonly workerId: string;
    readonly now: Instant;
    readonly leaseExpiresAt: Instant;
  }): Promise<HostedDeliveryClaim | null>;
  resolveDelivery(input: {
    readonly workspaceId: WorkspaceId;
    readonly idempotencyKey: ContentHash;
    readonly workerId: string;
    readonly state: 'delivered' | 'disabled' | 'superseded';
    readonly providerExternalId?: string;
  }): Promise<boolean>;
  failDelivery(input: {
    readonly workspaceId: WorkspaceId;
    readonly idempotencyKey: ContentHash;
    readonly workerId: string;
    readonly failureCode: string;
    readonly retryable: boolean;
    readonly retryAt: Instant;
  }): Promise<'retry_scheduled' | 'failed' | 'stale_claim'>;
}

export interface HostedCanonicalRecord {
  readonly workspaceId: WorkspaceId;
  readonly recordType: string;
  readonly recordId: string;
  readonly repositoryId?: string;
  readonly payloadHash: ContentHash;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: Instant;
}

export interface HostedCanonicalPointer {
  readonly workspaceId: WorkspaceId;
  readonly pointerType: string;
  readonly pointerId: string;
  readonly repositoryId?: string;
  readonly targetRecordType: string;
  readonly targetRecordId: string;
  readonly updatedAt: Instant;
}

export interface HostedDeliveryInput {
  readonly workspaceId: WorkspaceId;
  readonly idempotencyKey: ContentHash;
  readonly repositoryId: string;
  readonly canonicalRecordHash: ContentHash;
  readonly projectionHash: ContentHash;
  readonly projection: Readonly<Record<string, unknown>>;
  readonly availableAt: Instant;
  readonly maximumAttempts: number;
  readonly state?: 'available' | 'disabled';
}

export interface HostedJobResult {
  readonly resultHash: ContentHash;
  readonly records?: readonly HostedCanonicalRecord[];
  readonly pointers?: readonly HostedCanonicalPointer[];
  readonly deliveries?: readonly HostedDeliveryInput[];
}

export type HostedJobHandler = (claim: HostedJobClaim) => Promise<HostedJobResult>;

export interface HostedAnalysisExecution {
  readonly analysis: AnalysisResult;
  readonly supersessionKey: ContentHash;
  readonly deliveries?: readonly HostedDeliveryInput[];
}

export class CanonicalAnalysisJobAdapter {
  public constructor(
    private readonly analyze: (claim: HostedJobClaim) => Promise<HostedAnalysisExecution>,
  ) {}

  public readonly handle: HostedJobHandler = async (claim) => {
    if (claim.kind !== 'analyze_pull_request') {
      throw new HostedRuntimeFailure('invalid_analysis_job_kind', false);
    }
    const execution = await this.analyze(claim);
    const analysis = execution.analysis;
    if (
      analysis.workspaceId !== claim.workspaceId ||
      (claim.repositoryId !== undefined && analysis.producerRepositoryId !== claim.repositoryId)
    ) {
      throw new HostedRuntimeFailure('analysis_job_scope_mismatch', false);
    }
    return {
      resultHash: analysis.outputHash,
      records: [
        {
          workspaceId: analysis.workspaceId,
          recordType: 'analysis',
          recordId: analysis.analysisId,
          repositoryId: analysis.producerRepositoryId,
          payloadHash: analysis.outputHash,
          payload: analysis as unknown as Readonly<Record<string, unknown>>,
          createdAt: analysis.completedAt,
        },
      ],
      ...(analysis.current
        ? {
            pointers: [
              {
                workspaceId: analysis.workspaceId,
                pointerType: 'current_analysis',
                pointerId: execution.supersessionKey,
                repositoryId: analysis.producerRepositoryId,
                targetRecordType: 'analysis',
                targetRecordId: analysis.analysisId,
                updatedAt: analysis.completedAt,
              },
            ],
          }
        : {}),
      ...(execution.deliveries === undefined ? {} : { deliveries: execution.deliveries }),
    };
  };
}

export class AuthorizedReviewJobAdapter {
  public constructor(
    private readonly reviews: AuthorizedReviewService,
    private readonly resolve: (
      claim: HostedJobClaim,
    ) => Promise<Parameters<AuthorizedReviewService['record']>[0]>,
  ) {}

  public readonly handle: HostedJobHandler = async (claim) => {
    if (claim.kind !== 'record_review') {
      throw new HostedRuntimeFailure('invalid_review_job_kind', false);
    }
    const request = await this.resolve(claim);
    if (request.review.workspaceId !== claim.workspaceId) {
      throw new HostedRuntimeFailure('review_job_scope_mismatch', false);
    }
    const recorded = await this.reviews.record(request);
    if (!recorded.ok) {
      throw new HostedRuntimeFailure(
        recorded.failure.code,
        recorded.failure.retryable,
        recorded.failure.safeMessage,
      );
    }
    const event = recorded.value;
    return {
      resultHash: event.outputHash,
      records: [
        {
          workspaceId: event.workspaceId,
          recordType: 'review_event',
          recordId: event.id,
          repositoryId: request.producerRepositoryId,
          payloadHash: event.outputHash,
          payload: event as unknown as Readonly<Record<string, unknown>>,
          createdAt: event.occurredAt,
        },
      ],
    };
  };
}

export class HostedRuntimeFailure extends Error {
  public constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    message = 'Hosted runtime operation failed.',
  ) {
    super(message);
    this.name = 'HostedRuntimeFailure';
  }
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new HostedRuntimeFailure('invalid_webhook_pointer', false, `${field} is invalid.`);
  }
  return value;
}

function routeWebhook(claim: HostedWebhookClaim): {
  readonly kind: GitHubHostedJobKind;
  readonly repositoryId?: string;
  readonly supersessionKey?: ContentHash;
} {
  const repositoryId =
    claim.repositoryExternalId === undefined ? undefined : `github:${claim.repositoryExternalId}`;
  let kind: GitHubHostedJobKind;
  if (claim.eventType === 'push') kind = 'index_generation';
  else if (claim.eventType === 'pull_request') {
    kind = claim.pointer.action === 'closed' ? 'reconcile_provider' : 'analyze_pull_request';
  } else if (claim.eventType === 'check_run') kind = 'record_review';
  else if (claim.eventType === 'installation' || claim.eventType === 'installation_repositories') {
    kind = 'reconcile_provider';
  } else {
    throw new HostedRuntimeFailure('unsupported_webhook_event', false);
  }
  let supersessionKey: ContentHash | undefined;
  if (kind === 'analyze_pull_request') {
    const pullRequestNumber = positiveInteger(claim.pointer.pullRequestNumber, 'pullRequestNumber');
    supersessionKey = contentHash(
      hashCanonical({
        workspaceId: claim.workspaceId,
        repositoryId,
        pullRequestNumber,
        kind,
      }),
    );
  } else if (kind === 'index_generation') {
    supersessionKey = contentHash(
      hashCanonical({
        workspaceId: claim.workspaceId,
        repositoryId,
        ref: claim.pointer.ref ?? 'unknown',
        kind,
      }),
    );
  }
  return {
    kind,
    ...(repositoryId === undefined ? {} : { repositoryId }),
    ...(supersessionKey === undefined ? {} : { supersessionKey }),
  };
}

export type RuntimeStepResult =
  | { readonly state: 'idle' | 'disabled' }
  | { readonly state: 'complete'; readonly id: string }
  | { readonly state: 'retry_scheduled' | 'failed' | 'stale_claim'; readonly id: string };

export class GitHubHostedRuntime {
  readonly #store: GitHubHostedRuntimeStore;
  readonly #controls: HostedOperationalControls;
  readonly #handlers: Readonly<Partial<Record<GitHubHostedJobKind, HostedJobHandler>>>;
  readonly #maximumWebhookAttempts: number;

  public constructor(input: {
    readonly store: GitHubHostedRuntimeStore;
    readonly controls: HostedOperationalControls;
    readonly handlers: Readonly<Partial<Record<GitHubHostedJobKind, HostedJobHandler>>>;
    readonly maximumWebhookAttempts?: number;
  }) {
    this.#store = input.store;
    this.#controls = input.controls;
    this.#handlers = input.handlers;
    this.#maximumWebhookAttempts = input.maximumWebhookAttempts ?? 5;
  }

  public async processNextWebhook(input: {
    readonly workspaceId: WorkspaceId;
    readonly workerId: string;
    readonly now: Instant;
    readonly leaseExpiresAt: Instant;
    readonly maximumJobAttempts?: number;
  }): Promise<RuntimeStepResult> {
    if (this.#controls.snapshot().readDisabled) return { state: 'disabled' };
    const claim = await this.#store.claimWebhook(input);
    if (claim === null) return { state: 'idle' };
    try {
      const route = routeWebhook(claim);
      const idempotencyKey = contentHash(
        hashCanonical({
          workspaceId: claim.workspaceId,
          installationId: claim.installationId,
          deliveryId: claim.deliveryId,
          payloadHash: claim.payloadHash,
          kind: route.kind,
        }),
      );
      const jobId = await this.#store.enqueueJob({
        workspaceId: claim.workspaceId,
        kind: route.kind,
        idempotencyKey,
        ...(route.repositoryId === undefined ? {} : { repositoryId: route.repositoryId }),
        ...(route.supersessionKey === undefined ? {} : { supersessionKey: route.supersessionKey }),
        payload: {
          installationId: claim.installationId,
          deliveryId: claim.deliveryId,
          eventType: claim.eventType,
          ...(claim.repositoryExternalId === undefined
            ? {}
            : { repositoryExternalId: claim.repositoryExternalId }),
          pointer: claim.pointer,
        },
        availableAt: input.now,
        maximumAttempts: input.maximumJobAttempts ?? 3,
      });
      if (route.supersessionKey !== undefined) {
        await this.#store.supersedeJobs({
          workspaceId: claim.workspaceId,
          supersessionKey: route.supersessionKey,
          exceptJobId: jobId,
        });
      }
      const resolved = await this.#store.resolveWebhook({
        workspaceId: claim.workspaceId,
        installationId: claim.installationId,
        deliveryId: claim.deliveryId,
        workerId: input.workerId,
        state: 'processed',
      });
      return resolved ? { state: 'complete', id: jobId } : { state: 'stale_claim', id: jobId };
    } catch (error) {
      const failure =
        error instanceof HostedRuntimeFailure
          ? error
          : new HostedRuntimeFailure('webhook_schedule_failed', true);
      const retryable = failure.retryable && claim.attempt < this.#maximumWebhookAttempts;
      const resolved = await this.#store.resolveWebhook({
        workspaceId: claim.workspaceId,
        installationId: claim.installationId,
        deliveryId: claim.deliveryId,
        workerId: input.workerId,
        state: retryable ? 'pending' : 'failed',
        failureCode: failure.code,
      });
      return {
        state: resolved ? (retryable ? 'retry_scheduled' : 'failed') : 'stale_claim',
        id: claim.deliveryId,
      };
    }
  }

  public async processNextJob(input: {
    readonly workspaceId: WorkspaceId;
    readonly workerId: string;
    readonly now: Instant;
    readonly leaseExpiresAt: Instant;
    readonly retryAt: Instant;
    readonly kinds?: readonly GitHubHostedJobKind[];
  }): Promise<RuntimeStepResult> {
    if (this.#controls.snapshot().readDisabled) return { state: 'disabled' };
    const claim = await this.#store.claimJob(input);
    if (claim === null) return { state: 'idle' };
    const handler = isGitHubHostedJobKind(claim.kind) ? this.#handlers[claim.kind] : undefined;
    try {
      if (handler === undefined) {
        throw new HostedRuntimeFailure('unsupported_job_kind', false);
      }
      const result = await handler(claim);
      for (const record of result.records ?? []) {
        if (record.workspaceId !== claim.workspaceId) {
          throw new HostedRuntimeFailure('cross_workspace_job_result', false);
        }
        await this.#store.putCanonicalRecord(record);
      }
      for (const pointer of result.pointers ?? []) {
        if (pointer.workspaceId !== claim.workspaceId) {
          throw new HostedRuntimeFailure('cross_workspace_job_result', false);
        }
        await this.#store.putCanonicalPointer(pointer);
      }
      for (const delivery of result.deliveries ?? []) {
        if (delivery.workspaceId !== claim.workspaceId) {
          throw new HostedRuntimeFailure('cross_workspace_job_result', false);
        }
        await this.#store.enqueueDelivery(delivery);
      }
      const completed = await this.#store.completeJob({
        workspaceId: claim.workspaceId,
        jobId: claim.jobId,
        workerId: input.workerId,
        resultHash: result.resultHash,
      });
      return completed
        ? { state: 'complete', id: claim.jobId }
        : { state: 'stale_claim', id: claim.jobId };
    } catch (error) {
      const failure =
        error instanceof HostedRuntimeFailure
          ? error
          : new HostedRuntimeFailure('job_handler_failed', true);
      const state = await this.#store.failJob({
        workspaceId: claim.workspaceId,
        jobId: claim.jobId,
        workerId: input.workerId,
        failureCode: failure.code,
        retryable: failure.retryable,
        retryAt: input.retryAt,
      });
      return { state, id: claim.jobId };
    }
  }

  public async processNextDelivery(input: {
    readonly workspaceId: WorkspaceId;
    readonly workerId: string;
    readonly now: Instant;
    readonly leaseExpiresAt: Instant;
    readonly retryAt: Instant;
    readonly deliver: HostedDeliveryHandler;
  }): Promise<RuntimeStepResult> {
    if (this.#controls.snapshot().writeDisabled) return { state: 'disabled' };
    const claim = await this.#store.claimDelivery(input);
    if (claim === null) return { state: 'idle' };
    try {
      const result = await input.deliver(claim);
      const completed = await this.#store.resolveDelivery({
        workspaceId: claim.workspaceId,
        idempotencyKey: claim.idempotencyKey,
        workerId: input.workerId,
        state: result.state,
        ...(result.providerExternalId === undefined
          ? {}
          : { providerExternalId: result.providerExternalId }),
      });
      return completed
        ? { state: 'complete', id: claim.idempotencyKey }
        : { state: 'stale_claim', id: claim.idempotencyKey };
    } catch (error) {
      const failure =
        error instanceof HostedRuntimeFailure
          ? error
          : new HostedRuntimeFailure('delivery_handler_failed', true);
      const state = await this.#store.failDelivery({
        workspaceId: claim.workspaceId,
        idempotencyKey: claim.idempotencyKey,
        workerId: input.workerId,
        failureCode: failure.code,
        retryable: failure.retryable,
        retryAt: input.retryAt,
      });
      return { state, id: claim.idempotencyKey };
    }
  }
}

export type HostedDeliveryResult = {
  readonly state: 'delivered' | 'disabled' | 'superseded';
  readonly providerExternalId?: string;
};

export type HostedDeliveryHandler = (claim: HostedDeliveryClaim) => Promise<HostedDeliveryResult>;

export interface GitHubCheckDeliveryEnvelope {
  readonly schema: 'reverb.github-check-delivery';
  readonly schemaVersion: '1.0';
  readonly installationId: number;
  readonly repositoryExternalId: number;
  readonly plan: CheckDeliveryPlan;
  readonly existingExternalId?: string;
}

function checkEnvelope(value: Readonly<Record<string, unknown>>): GitHubCheckDeliveryEnvelope {
  const plan =
    value.plan !== null && typeof value.plan === 'object' && !Array.isArray(value.plan)
      ? (value.plan as Readonly<Record<string, unknown>>)
      : undefined;
  const projection =
    plan?.projection !== null &&
    typeof plan?.projection === 'object' &&
    !Array.isArray(plan.projection)
      ? (plan.projection as Readonly<Record<string, unknown>>)
      : undefined;
  if (
    value.schema !== 'reverb.github-check-delivery' ||
    value.schemaVersion !== '1.0' ||
    typeof value.installationId !== 'number' ||
    !Number.isSafeInteger(value.installationId) ||
    value.installationId < 1 ||
    typeof value.repositoryExternalId !== 'number' ||
    !Number.isSafeInteger(value.repositoryExternalId) ||
    value.repositoryExternalId < 1 ||
    plan === undefined ||
    !['shadow', 'write', 'no_write'].includes(String(plan.mode)) ||
    projection === undefined ||
    typeof projection.projectionHash !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(projection.projectionHash) ||
    typeof projection.headSha !== 'string' ||
    !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(projection.headSha)
  ) {
    throw new HostedRuntimeFailure('invalid_delivery_projection', false);
  }
  return value as unknown as GitHubCheckDeliveryEnvelope;
}

export class GitHubCheckDeliveryAdapter {
  public constructor(
    private readonly writer: GitHubCheckWriter,
    private readonly authority: {
      readonly reauthorize: (input: GitHubCheckDeliveryEnvelope) => Promise<boolean>;
      readonly currentHead: (input: GitHubCheckDeliveryEnvelope) => Promise<string>;
    },
  ) {}

  public async deliver(claim: HostedDeliveryClaim): Promise<HostedDeliveryResult> {
    const envelope = checkEnvelope(claim.projection);
    if (envelope.plan.projection.projectionHash !== claim.projectionHash) {
      throw new HostedRuntimeFailure('delivery_projection_hash_mismatch', false);
    }
    const result: CheckWriteResult = await this.writer.write({
      installationId: envelope.installationId,
      repositoryExternalId: envelope.repositoryExternalId,
      plan: envelope.plan,
      ...(envelope.existingExternalId === undefined
        ? {}
        : { existingExternalId: envelope.existingExternalId }),
      reauthorize: () => this.authority.reauthorize(envelope),
      currentHead: () => this.authority.currentHead(envelope),
    });
    if (result.state === 'delivered') {
      return { state: 'delivered', providerExternalId: result.externalId };
    }
    if (result.state === 'superseded') return { state: 'superseded' };
    return { state: 'disabled' };
  }
}
