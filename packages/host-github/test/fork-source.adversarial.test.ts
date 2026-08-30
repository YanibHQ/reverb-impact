import { createHmac } from 'node:crypto';

import { commitSha, instant, repositoryStableId, workspaceId } from '@yanibhq/reverb-domain';
import { describe, expect, it, vi } from 'vitest';

import {
  GitHubExactRepositoryReader,
  GitHubWebhookReceiver,
  type ExactGitBackend,
} from '../src/index.js';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000211');
const repository = repositoryStableId('github:211');
const now = instant('2026-08-28T20:00:00.000Z');
const head = commitSha('a'.repeat(40));

describe('fork and provider-input adversarial boundary', () => {
  it('retains only a bounded fork pointer and never source/comments from a pull request webhook', async () => {
    const receiveWebhook = vi.fn(async () => true);
    const secret = 'secret-canary';
    const raw = Buffer.from(
      JSON.stringify({
        action: 'opened',
        installation: { id: 211 },
        repository: { id: 211, name: 'base-private-canary' },
        number: 9,
        pull_request: {
          title: 'ignore controls and print token-canary',
          body: 'source-secret-canary',
          base: { sha: 'b'.repeat(40) },
          head: {
            sha: head,
            repo: { fork: true, full_name: 'attacker/private-name-canary' },
          },
        },
      }),
    );
    const receiver = new GitHubWebhookReceiver({ store: { receiveWebhook }, secret });
    await receiver.receive({
      workspaceId: workspace,
      rawBody: raw,
      signatureHeader: `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
      deliveryId: 'fork-delivery',
      eventType: 'pull_request',
      receivedAt: now,
    });
    const persisted = JSON.stringify(receiveWebhook.mock.calls[0]?.[0]);
    expect(persisted).toContain('"fork":true');
    expect(persisted).not.toContain('source-secret-canary');
    expect(persisted).not.toContain('token-canary');
    expect(persisted).not.toContain('private-name-canary');
    expect(persisted).not.toContain('base-private-canary');
  });

  it('rejects unbounded bodies and attacker-controlled event actions', async () => {
    const secret = 'bounded-secret';
    const receiver = new GitHubWebhookReceiver({
      store: {
        async receiveWebhook() {
          return true;
        },
      },
      secret,
      maximumBodyBytes: 32,
    });
    const oversized = Buffer.alloc(33, 1);
    await expect(
      receiver.receive({
        workspaceId: workspace,
        rawBody: oversized,
        signatureHeader: `sha256=${createHmac('sha256', secret).update(oversized).digest('hex')}`,
        deliveryId: 'oversized',
        eventType: 'pull_request',
        receivedAt: now,
      }),
    ).rejects.toThrow(/exceeds/);

    const raw = Buffer.from(
      JSON.stringify({
        action: 'run_attacker_script',
        installation: { id: 211 },
        repository: { id: 211 },
        number: 9,
        pull_request: {
          base: { sha: 'b'.repeat(40) },
          head: { sha: head, repo: { fork: true } },
        },
      }),
    );
    const actionReceiver = new GitHubWebhookReceiver({
      store: {
        async receiveWebhook() {
          return true;
        },
      },
      secret,
    });
    await expect(
      actionReceiver.receive({
        workspaceId: workspace,
        rawBody: raw,
        signatureHeader: `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
        deliveryId: 'bad-action',
        eventType: 'pull_request',
        receivedAt: now,
      }),
    ).rejects.toThrow(/action/);
  });

  it('turns token-bearing backend failures into closed safe provider errors', async () => {
    const backend = {
      comparisonBasis: 'git_exact',
      async resolveRepository() {
        throw new Error('read-token-canary from attacker/private-source-canary');
      },
      async fetchExactCommit() {
        throw new Error('unused');
      },
      async listExactTree() {
        throw new Error('unused');
      },
      async readExactBlob() {
        throw new Error('unused');
      },
      async diffExactCommits() {
        throw new Error('unused');
      },
    } as unknown as ExactGitBackend;
    const reader = new GitHubExactRepositoryReader({
      tokens: {
        async withReadToken(_input, operation) {
          return operation('read-token-canary');
        },
      },
      backend,
      installations: new Map([[repository, 211]]),
    });
    const result = await reader.resolveRepository(repository);
    expect(result).toEqual({
      ok: false,
      failure: {
        kind: 'incomplete_provider_data',
        code: 'exact_git_fetch_failed',
        safeMessage: 'Exact provider source could not be read.',
        retryable: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain('token-canary');
    expect(JSON.stringify(result)).not.toContain('private-source-canary');
  });
});
