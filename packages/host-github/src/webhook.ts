import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { contentHash } from '@yanib/reverb-domain';
import type { ContentHash, Instant, WorkspaceId } from '@yanib/reverb-domain';

const SUPPORTED_EVENTS = new Set([
  'installation',
  'installation_repositories',
  'push',
  'pull_request',
  'check_run',
]);

const SUPPORTED_ACTIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  installation: new Set(['created', 'deleted', 'suspend', 'unsuspend', 'new_permissions_accepted']),
  installation_repositories: new Set(['added', 'removed']),
  pull_request: new Set(['opened', 'synchronize', 'reopened', 'closed']),
  check_run: new Set(['requested_action']),
};

export interface WebhookReceiptStore {
  receiveWebhook(entry: {
    readonly workspaceId: WorkspaceId;
    readonly installationId: number;
    readonly deliveryId: string;
    readonly eventType: string;
    readonly repositoryExternalId?: number;
    readonly receivedAt: Instant;
    readonly signatureValidated: true;
    readonly payloadHash: ContentHash;
    readonly pointer: Readonly<Record<string, unknown>>;
  }): Promise<boolean>;
}

export interface WebhookReceiveResult {
  readonly status: 202;
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly eventType: string;
  readonly deliveryId: string;
}

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${subject} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, subject: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${subject} must be a positive integer.`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function providerSha(value: unknown, subject: string): string {
  const sha = optionalString(value);
  if (!sha || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(sha)) {
    throw new Error(`${subject} must be an exact commit SHA.`);
  }
  return sha;
}

export function verifyWebhookSignature(input: {
  readonly rawBody: Uint8Array;
  readonly signatureHeader?: string;
  readonly secret: Uint8Array | string;
}): boolean {
  const prefix = 'sha256=';
  if (!input.signatureHeader?.startsWith(prefix)) return false;
  const encoded = input.signatureHeader.slice(prefix.length);
  if (!/^[0-9a-f]{64}$/.test(encoded)) return false;
  const supplied = Buffer.from(encoded, 'hex');
  const expected = createHmac('sha256', input.secret).update(input.rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function safePointer(
  eventType: string,
  payload: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  const pointer: Record<string, unknown> = {};
  const action = optionalString(payload.action);
  const actions = SUPPORTED_ACTIONS[eventType];
  if (actions && (!action || !actions.has(action))) {
    throw new Error('Webhook action is not supported.');
  }
  if (action) pointer.action = action;
  if (eventType === 'push') {
    const before = providerSha(payload.before, 'Push before');
    const after = providerSha(payload.after, 'Push after');
    const ref = optionalString(payload.ref);
    pointer.beforeSha = before;
    pointer.afterSha = after;
    if (ref) pointer.ref = ref;
  }
  if (eventType === 'pull_request') {
    pointer.pullRequestNumber = positiveInteger(payload.number, 'Pull request number');
    const pullRequest = object(payload.pull_request, 'pull_request');
    const base = object(pullRequest.base, 'pull_request.base');
    const head = object(pullRequest.head, 'pull_request.head');
    const baseSha = providerSha(base.sha, 'Pull request base');
    const headSha = providerSha(head.sha, 'Pull request head');
    pointer.baseSha = baseSha;
    pointer.headSha = headSha;
    pointer.fork = object(head.repo, 'pull_request.head.repo').fork === true;
  }
  if (eventType === 'check_run') {
    const checkRun = object(payload.check_run, 'check_run');
    pointer.checkRunId = positiveInteger(checkRun.id, 'Check run ID');
    const requestedAction = object(payload.requested_action, 'requested_action');
    const identifier = optionalString(requestedAction.identifier);
    if (!identifier) throw new Error('Check action identifier is required.');
    pointer.requestedAction = identifier;
  }
  if (eventType === 'installation_repositories') {
    const added = Array.isArray(payload.repositories_added) ? payload.repositories_added : [];
    const removed = Array.isArray(payload.repositories_removed) ? payload.repositories_removed : [];
    pointer.addedRepositoryIds = added.map((value) =>
      positiveInteger(object(value, 'repository').id, 'Repository ID'),
    );
    pointer.removedRepositoryIds = removed.map((value) =>
      positiveInteger(object(value, 'repository').id, 'Repository ID'),
    );
  }
  return pointer;
}

export class GitHubWebhookReceiver {
  readonly #store: WebhookReceiptStore;
  readonly #secret: Uint8Array | string;
  readonly #maximumBodyBytes: number;

  public constructor(input: {
    readonly store: WebhookReceiptStore;
    readonly secret: Uint8Array | string;
    readonly maximumBodyBytes?: number;
  }) {
    this.#store = input.store;
    this.#secret = input.secret;
    this.#maximumBodyBytes = input.maximumBodyBytes ?? 1_048_576;
  }

  public async receive(input: {
    readonly workspaceId: WorkspaceId;
    readonly rawBody: Uint8Array;
    readonly signatureHeader?: string;
    readonly deliveryId?: string;
    readonly eventType?: string;
    readonly receivedAt: Instant;
  }): Promise<WebhookReceiveResult> {
    if (input.rawBody.byteLength > this.#maximumBodyBytes) {
      throw new Error('Webhook body exceeds the configured bound.');
    }
    if (
      !verifyWebhookSignature({
        rawBody: input.rawBody,
        ...(input.signatureHeader === undefined ? {} : { signatureHeader: input.signatureHeader }),
        secret: this.#secret,
      })
    ) {
      throw new Error('Webhook signature is invalid.');
    }
    if (!input.deliveryId || input.deliveryId.length > 255) {
      throw new Error('Webhook delivery ID is missing or invalid.');
    }
    if (!input.eventType || !SUPPORTED_EVENTS.has(input.eventType)) {
      throw new Error('Webhook event is not supported.');
    }
    const payload = object(
      JSON.parse(Buffer.from(input.rawBody).toString('utf8')) as unknown,
      'Webhook',
    );
    const installation = object(payload.installation, 'installation');
    const repository =
      payload.repository === undefined ? undefined : object(payload.repository, 'repository');
    const inserted = await this.#store.receiveWebhook({
      workspaceId: input.workspaceId,
      installationId: positiveInteger(installation.id, 'Installation ID'),
      deliveryId: input.deliveryId,
      eventType: input.eventType,
      ...(repository === undefined
        ? {}
        : { repositoryExternalId: positiveInteger(repository.id, 'Repository ID') }),
      receivedAt: input.receivedAt,
      signatureValidated: true,
      payloadHash: contentHash(
        `sha256:${createHash('sha256').update(input.rawBody).digest('hex')}`,
      ),
      pointer: safePointer(input.eventType, payload),
    });
    return {
      status: 202,
      accepted: inserted,
      duplicate: !inserted,
      eventType: input.eventType,
      deliveryId: input.deliveryId,
    };
  }
}
