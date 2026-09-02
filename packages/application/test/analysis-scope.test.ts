import {
  contentHash,
  createRegistrySnapshot,
  hashCanonical,
  instant,
  repositoryStableId,
  workspaceId,
  type RegistryRevision,
} from '@yanib/reverb-domain';
import { ResolveAnalysisScope } from '../src/index.js';
import type {
  AuthorizationDecision,
  AuthorizationPort,
  DisclosureProjection,
  DisclosureRequest,
  PortResult,
  RepositoryAction,
  Subject,
} from '../src/index.js';
import { describe, expect, it } from 'vitest';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000501');
const producer = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
const selected = repositoryStableId(`local:sha256:${'2'.repeat(64)}`);
const unselectedCanary = repositoryStableId(`local:sha256:${'3'.repeat(64)}`);
const snapshot = createRegistrySnapshot({
  workspaceId: workspace,
  sequence: 1,
  createdAt: instant('2026-09-02T20:00:00.000Z'),
  createdBy: 'scope-test',
  source: 'fixture',
  reason: 'application scope',
  repositories: [producer, selected, unselectedCanary].map((repositoryId, index) => ({
    repositoryId,
    alias: `repository-${index}`,
    defaultBranch: 'main',
    collections: ['default'],
    selected: repositoryId !== unselectedCanary,
    consentRevision: `consent-${index}`,
  })),
});
const subject = { kind: 'service' as const, id: 'host-worker' };

class FixtureAuthorization implements AuthorizationPort {
  readonly #decisions = new Map<string, AuthorizationDecision>();

  public set(
    candidateSubject: Subject,
    action: RepositoryAction,
    repositoryId: typeof producer,
    decision: AuthorizationDecision,
  ): void {
    this.#decisions.set(
      `${candidateSubject.kind}|${candidateSubject.id}|${action}|${repositoryId}`,
      decision,
    );
  }

  public async authorizeRepositoryUse(
    candidateSubject: Subject,
    action: RepositoryAction,
    repositoryId: typeof producer,
  ): Promise<PortResult<AuthorizationDecision>> {
    return {
      ok: true,
      value: this.#decisions.get(
        `${candidateSubject.kind}|${candidateSubject.id}|${action}|${repositoryId}`,
      ) ?? {
        allowed: false,
        reason: 'default_deny',
        revision: snapshot.revision.revision,
      },
    };
  }

  public async projectDisclosure(
    input: DisclosureRequest,
  ): Promise<PortResult<DisclosureProjection>> {
    return {
      ok: true,
      value: {
        allowedFields: [],
        omittedFields: input.requestedFields,
        decisionHash: contentHash(hashCanonical(input)),
        registryRevision: snapshot.revision.revision,
      },
    };
  }
}

function allowedAuthorization(ids: readonly (typeof producer)[]) {
  const authorization = new FixtureAuthorization();
  for (const repositoryId of ids) {
    authorization.set(subject, 'evidence.consume', repositoryId, {
      allowed: true,
      reason: 'fixture_allow',
      revision: snapshot.revision.revision,
    });
  }
  return authorization;
}

describe('ResolveAnalysisScope', () => {
  it('authorizes only the producer and explicit selected consumers', async () => {
    const authorization = allowedAuthorization([producer, selected]);
    const result = await new ResolveAnalysisScope(authorization).execute({
      workspaceId: workspace,
      registry: snapshot,
      producerRepositoryId: producer,
      consumerScope: { mode: 'allowlist', repositoryIds: [selected] },
      subject,
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        provenance: {
          mode: 'allowlist',
          repositories: [{ repositoryId: producer }, { repositoryId: selected }],
          gaps: [],
        },
      },
    });
  });

  it('fails closed before issuing a capability when producer authorization is unavailable', async () => {
    const authorization = allowedAuthorization([selected]);
    const result = await new ResolveAnalysisScope(authorization).execute({
      workspaceId: workspace,
      registry: snapshot,
      producerRepositoryId: producer,
      consumerScope: { mode: 'allowlist', repositoryIds: [selected, unselectedCanary] },
      subject,
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { kind: 'authorization_denied', code: 'authorization_denied' },
    });
  });

  it('rejects authorization decisions from a different registry revision', async () => {
    const authorization = new FixtureAuthorization();
    for (const repositoryId of [producer, selected]) {
      authorization.set(subject, 'evidence.consume', repositoryId, {
        allowed: true,
        reason: 'stale_allow',
        revision: `reg_sha256:${'0'.repeat(64)}` as RegistryRevision,
      });
    }
    const result = await new ResolveAnalysisScope(authorization).execute({
      workspaceId: workspace,
      registry: snapshot,
      producerRepositoryId: producer,
      consumerScope: { mode: 'allowlist', repositoryIds: [selected] },
      subject,
    });
    expect(result.ok).toBe(false);
  });
});
