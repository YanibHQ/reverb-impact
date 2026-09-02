import {
  analysisId,
  commitSha,
  configRevision,
  contentHash,
  createDeterministicFindingsV2,
  createRegistrySnapshot,
  finalizeAnalysisScope,
  generationId,
  instant,
  joinChangedContractsV2,
  prepareAnalysisScope,
  repoPath,
  repositoryStableId,
  sha256Bytes,
  workspaceId,
} from '@yanib/reverb-domain';
import {
  materializeContractChangesV2,
  materializeContractObservationV2,
  type ArtifactInput,
} from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import {
  eventAdapter,
  eventDestinationKey,
  type EventDestinationKind,
  type EventProvider,
} from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'b'.repeat(64)}`);
const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000601');
const producerRepository = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
const consumerRepository = repositoryStableId(`local:sha256:${'2'.repeat(64)}`);
const baseGeneration = generationId('gen_01990f64-0000-7000-8000-000000000601');
const headGeneration = generationId('gen_01990f64-0000-7000-8000-000000000602');
const consumerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000603');
const baseSha = commitSha('a'.repeat(40));
const headSha = commitSha('b'.repeat(40));
const consumerSha = commitSha('c'.repeat(40));
const now = instant('2026-09-02T22:00:00.000Z');

const registry = createRegistrySnapshot({
  workspaceId: workspace,
  sequence: 1,
  createdAt: now,
  createdBy: 'event-fixture',
  source: 'fixture',
  reason: 'event impact',
  repositories: [producerRepository, consumerRepository].map((repositoryId, index) => ({
    repositoryId,
    alias: index === 0 ? 'producer' : 'consumer',
    defaultBranch: 'main',
    collections: ['default'],
    selected: true,
    consentRevision: '1',
  })),
});

function capability(repositoryIds: readonly (typeof producerRepository)[]) {
  const prepared = prepareAnalysisScope({
    registry,
    producerRepositoryId: producerRepository,
    consumerScope: { mode: 'allowlist', repositoryIds },
    consentGrantee: 'reverb',
  });
  return finalizeAnalysisScope({
    prepared,
    repositories: prepared.candidates.map((candidate) => ({
      repositoryId: candidate.membership.repositoryId,
      producer: candidate.producer,
      requested: candidate.requested,
      consentRevision: candidate.membership.consentRevision,
      authorizationRevision: registry.revision.revision,
      authorizationDecisionHash: contentHash(`sha256:${'d'.repeat(64)}`),
    })),
  }).capability;
}

function artifact(path: string, bindings: string): ArtifactInput {
  const bytes = new TextEncoder().encode(
    `schema: reverb.events\nschemaVersion: '1.0'\n${bindings.trim().length === 0 ? 'bindings: []' : `bindings:\n${bindings}`}\n`,
  );
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

function binding(input: {
  readonly role: 'producer' | 'consumer';
  readonly provider: EventProvider;
  readonly namespace: string;
  readonly kind: EventDestinationKind;
  readonly destination: string;
}): string {
  return `  - role: ${input.role}\n    provider: ${input.provider}\n    brokerNamespace: ${input.namespace}\n    destinationKind: ${input.kind}\n    destination: ${input.destination}`;
}

const providers = [
  { provider: 'kafka', namespace: 'cluster-prod', kind: 'topic', destination: 'orders' },
  { provider: 'aws_sqs', namespace: 'aws:us-east-1:123', kind: 'queue', destination: 'orders' },
  { provider: 'aws_sns', namespace: 'aws:us-east-1:123', kind: 'topic', destination: 'orders' },
  { provider: 'gcp_pubsub', namespace: 'project-prod', kind: 'topic', destination: 'orders' },
] as const;

describe('event backend impact identity', () => {
  it.each(providers)(
    'joins a $provider producer change to an exact downstream backend consumer',
    async ({ provider, namespace, kind, destination }) => {
      const producer = await eventAdapter.extract({
        artifacts: [
          artifact(
            'producer/events.yaml',
            binding({ role: 'producer', provider, namespace, kind, destination }),
          ),
        ],
        configRevision: revision,
        context: {},
      });
      const consumer = await eventAdapter.extract({
        artifacts: [
          artifact(
            'consumer/events.yaml',
            binding({ role: 'consumer', provider, namespace, kind, destination }),
          ),
        ],
        configRevision: revision,
        context: {},
      });
      const empty = await eventAdapter.extract({
        artifacts: [artifact('producer/events.yaml', '')],
        configRevision: revision,
        context: {},
      });
      const diff = await eventAdapter.diff({
        base: producer,
        head: empty,
        configRevision: revision,
        context: {},
      });
      const key = eventDestinationKey({
        provider,
        brokerNamespace: namespace,
        destinationKind: kind,
        destination,
      });
      expect(producer.definitions[0]).toMatchObject({ canonicalKey: key });
      expect(consumer.references[0]).toMatchObject({ canonicalKey: key });
      expect(diff.changes[0]).toMatchObject({
        canonicalKey: key,
        changeKind: 'destination_removed',
        compatibility: 'breaking',
      });
      const producerObservation = materializeContractObservationV2({
        workspaceId: workspace,
        repositoryId: producerRepository,
        generationId: baseGeneration,
        commitSha: baseSha,
        observedAt: now,
        extraction: producer,
      });
      const consumerObservation = materializeContractObservationV2({
        workspaceId: workspace,
        repositoryId: consumerRepository,
        generationId: consumerGeneration,
        commitSha: consumerSha,
        observedAt: now,
        extraction: consumer,
      });
      const changes = materializeContractChangesV2({
        workspaceId: workspace,
        producerRepositoryId: producerRepository,
        baseGenerationId: baseGeneration,
        headGenerationId: headGeneration,
        baseSha,
        headSha,
        diff,
      });
      const edges = joinChangedContractsV2({
        capability: capability([consumerRepository]),
        workspaceId: workspace,
        registryRevision: registry.revision.revision,
        observedAt: now,
        changes,
        definitions: producerObservation.definitions,
        references: consumerObservation.references,
        selectedGenerations: new Map([
          [consumerRepository, { generationId: consumerGeneration, commitSha: consumerSha }],
        ]),
      });
      const findings = createDeterministicFindingsV2({
        analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000601'),
        policyMajor: 2,
        changes,
        edges,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        schemaVersion: '2.0',
        family: 'events',
        state: 'PREVIEW',
        claims: { edge: 'candidate', impact: 'breaking', action: 'coordinate' },
        edge: {
          producerRepositoryId: producerRepository,
          consumerRepositoryId: consumerRepository,
          producerGenerationId: baseGeneration,
          consumerGenerationId: consumerGeneration,
          definition: { path: repoPath('producer/events.yaml'), contentHash: expect.any(String) },
          reference: { path: repoPath('consumer/events.yaml'), contentHash: expect.any(String) },
        },
      });
    },
  );

  it('detects an exact-head same-repository consumer of a removed producer destination', async () => {
    const producer = binding({
      role: 'producer',
      provider: 'kafka',
      namespace: 'cluster-prod',
      kind: 'topic',
      destination: 'orders',
    });
    const consumer = binding({
      role: 'consumer',
      provider: 'kafka',
      namespace: 'cluster-prod',
      kind: 'topic',
      destination: 'orders',
    });
    const base = await eventAdapter.extract({
      artifacts: [artifact('events.yaml', `${producer}\n${consumer}`)],
      configRevision: revision,
      context: {},
    });
    const head = await eventAdapter.extract({
      artifacts: [artifact('events.yaml', consumer)],
      configRevision: revision,
      context: {},
    });
    const diff = await eventAdapter.diff({ base, head, configRevision: revision, context: {} });
    const removed = diff.changes.find((value) => value.changeKind === 'destination_removed');
    expect(removed).toBeDefined();
    expect(head.references).toContainEqual(
      expect.objectContaining({ canonicalKey: removed?.canonicalKey }),
    );
    const baseObservation = materializeContractObservationV2({
      workspaceId: workspace,
      repositoryId: producerRepository,
      generationId: baseGeneration,
      commitSha: baseSha,
      observedAt: now,
      extraction: base,
    });
    const headObservation = materializeContractObservationV2({
      workspaceId: workspace,
      repositoryId: producerRepository,
      generationId: headGeneration,
      commitSha: headSha,
      observedAt: now,
      extraction: head,
    });
    const changes = materializeContractChangesV2({
      workspaceId: workspace,
      producerRepositoryId: producerRepository,
      baseGenerationId: baseGeneration,
      headGenerationId: headGeneration,
      baseSha,
      headSha,
      diff,
    });
    const joinInput = {
      capability: capability([]),
      workspaceId: workspace,
      registryRevision: registry.revision.revision,
      observedAt: now,
      changes,
      definitions: baseObservation.definitions,
      references: headObservation.references,
      selectedGenerations: new Map([
        [producerRepository, { generationId: headGeneration, commitSha: headSha }],
      ]),
    } as const;
    expect(() =>
      joinChangedContractsV2({
        ...joinInput,
        references: headObservation.references.map((reference) => ({
          ...reference,
          identityVersion: 2,
        })),
      }),
    ).toThrowError(/incompatible adapter identity protocol/);
    const edges = joinChangedContractsV2(joinInput);
    expect(
      createDeterministicFindingsV2({
        analysisId: analysisId('ana_01990f64-0000-7000-8000-000000000602'),
        policyMajor: 2,
        changes,
        edges,
      }),
    ).toHaveLength(1);
  });
});
