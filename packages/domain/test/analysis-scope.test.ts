import {
  assertScopedRepositoryRead,
  contentHash,
  createRegistrySnapshot,
  finalizeAnalysisScope,
  hashCanonical,
  instant,
  prepareAnalysisScope,
  repositoryStableId,
  workspaceId,
  type RegistryRevision,
  type RepositoryStableId,
} from '../src/index.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000500');
const producer = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
const consumerA = repositoryStableId(`local:sha256:${'2'.repeat(64)}`);
const consumerB = repositoryStableId(`local:sha256:${'3'.repeat(64)}`);
const outside = repositoryStableId(`local:sha256:${'4'.repeat(64)}`);

function registry() {
  return createRegistrySnapshot({
    workspaceId: workspace,
    sequence: 1,
    createdAt: instant('2026-09-02T20:00:00.000Z'),
    createdBy: 'scope-test',
    source: 'fixture',
    reason: 'scope foundation',
    repositories: [
      {
        repositoryId: producer,
        alias: 'producer',
        defaultBranch: 'main',
        collections: ['default'],
        selected: true,
        consentRevision: 'consent-p',
      },
      {
        repositoryId: consumerA,
        alias: 'consumer-a',
        defaultBranch: 'main',
        collections: ['default'],
        selected: true,
        consentRevision: 'consent-a',
      },
      {
        repositoryId: consumerB,
        alias: 'consumer-b',
        defaultBranch: 'main',
        collections: ['default'],
        selected: false,
        consentRevision: 'consent-b',
      },
    ],
  });
}

function authorize(prepared: ReturnType<typeof prepareAnalysisScope>) {
  return prepared.candidates.map((candidate) => ({
    repositoryId: candidate.membership.repositoryId,
    producer: candidate.producer,
    requested: candidate.requested,
    consentRevision: candidate.membership.consentRevision,
    authorizationRevision: prepared.registryRevision,
    authorizationDecisionHash: contentHash(
      hashCanonical({ repositoryId: candidate.membership.repositoryId, allowed: true }),
    ),
  }));
}

describe('analysis scope v2', () => {
  it('keeps omission as legacy selection and makes an empty allowlist producer-only', () => {
    const legacy = prepareAnalysisScope({
      registry: registry(),
      producerRepositoryId: producer,
      consentGrantee: 'host',
    });
    expect(legacy.mode).toBe('legacy');
    expect(legacy.candidates.map((value) => value.membership.repositoryId)).toEqual([
      producer,
      consumerA,
    ]);

    const empty = prepareAnalysisScope({
      registry: registry(),
      producerRepositoryId: producer,
      consumerScope: { mode: 'allowlist', repositoryIds: [] },
      consentGrantee: 'host',
    });
    expect(empty.mode).toBe('allowlist');
    expect(empty.requestedRepositoryIds).toEqual([]);
    expect(empty.candidates.map((value) => value.membership.repositoryId)).toEqual([producer]);
  });

  it('normalizes duplicates, includes the producer, and reports only requested invalid targets', () => {
    const prepared = prepareAnalysisScope({
      registry: registry(),
      producerRepositoryId: producer,
      consumerScope: {
        mode: 'allowlist',
        repositoryIds: [outside, consumerA, consumerB, consumerA],
      },
      consentGrantee: 'host',
    });
    expect(prepared.requestedRepositoryIds).toEqual([consumerA, consumerB, outside]);
    expect(prepared.candidates.map((value) => value.membership.repositoryId)).toEqual([
      producer,
      consumerA,
    ]);
    expect(prepared.gaps).toEqual([
      { repositoryId: consumerB, reason: 'repository_not_selected' },
      { repositoryId: outside, reason: 'unknown_repository' },
    ]);
  });

  it('creates stable provenance and denies reads outside the authorized capability', () => {
    const prepared = prepareAnalysisScope({
      registry: registry(),
      producerRepositoryId: producer,
      consumerScope: { mode: 'allowlist', repositoryIds: [consumerA] },
      consentGrantee: 'host',
    });
    const first = finalizeAnalysisScope({ prepared, repositories: authorize(prepared) });
    const second = finalizeAnalysisScope({
      prepared,
      repositories: [...authorize(prepared)].reverse(),
    });
    expect(first.provenance.scopeHash).toBe(second.provenance.scopeHash);
    expect(() => assertScopedRepositoryRead(first.capability, workspace, consumerA)).not.toThrow();
    expect(() => assertScopedRepositoryRead(first.capability, workspace, outside)).toThrowError(
      expect.objectContaining({ code: 'authorization_denied' }),
    );
  });

  it('hashes every normalized allowlist independently of input order', () => {
    fc.assert(
      fc.property(fc.shuffledSubarray([producer, consumerA] as RepositoryStableId[]), (ids) => {
        const prepared = prepareAnalysisScope({
          registry: registry(),
          producerRepositoryId: producer,
          consumerScope: { mode: 'allowlist', repositoryIds: [...ids, ...ids].reverse() },
          consentGrantee: 'host',
        });
        const resolved = finalizeAnalysisScope({ prepared, repositories: authorize(prepared) });
        const ordered = prepareAnalysisScope({
          registry: registry(),
          producerRepositoryId: producer,
          consumerScope: { mode: 'allowlist', repositoryIds: [...new Set(ids)].sort() },
          consentGrantee: 'host',
        });
        const expected = finalizeAnalysisScope({
          prepared: ordered,
          repositories: authorize(ordered),
        });
        expect(resolved.provenance.scopeHash).toBe(expected.provenance.scopeHash);
      }),
    );
  });

  it('requires authorization provenance from the same immutable registry revision', () => {
    const prepared = prepareAnalysisScope({
      registry: registry(),
      producerRepositoryId: producer,
      consentGrantee: 'host',
    });
    const repositories = authorize(prepared).map((value) => ({
      ...value,
      authorizationRevision: `reg_sha256:${'0'.repeat(64)}` as RegistryRevision,
    }));
    expect(() => finalizeAnalysisScope({ prepared, repositories })).toThrowError(
      expect.objectContaining({ code: 'authorization_denied' }),
    );
  });
});
