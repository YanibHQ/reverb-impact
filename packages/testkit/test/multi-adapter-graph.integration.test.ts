import {
  commitSha,
  configRevision,
  contentHash,
  createRegistrySnapshot,
  generationId,
  instant,
  joinChangedContracts,
  repoPath,
  repositoryStableId,
  sha256Bytes,
  workspaceId,
  type ContractKind,
} from '@yanibhq/reverb-domain';
import {
  materializeContractChanges,
  materializeContractObservation,
  type ArtifactInput,
  type ContractAdapter,
  type ExtractRequest,
} from '../../adapter-sdk/src/index.js';
import { openApiAdapter } from '../../adapter-openapi/src/index.js';
import { protobufAdapter } from '../../adapter-protobuf/src/index.js';
import { typeScriptAdapter } from '../../adapter-typescript/src/index.js';
import { describe, expect, it } from 'vitest';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000150');
const producer = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
const consumer = repositoryStableId(`local:sha256:${'2'.repeat(64)}`);
const producerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000150');
const consumerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000151');
const baseSha = commitSha('a'.repeat(40));
const headSha = commitSha('b'.repeat(40));
const consumerSha = commitSha('c'.repeat(40));
const now = instant('2026-08-28T20:00:00.000Z');
const config = configRevision(`cfg_sha256:${'d'.repeat(64)}`);

function artifact(
  path: string,
  text: string,
  classification: ArtifactInput['classification'] = 'source',
): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification,
  };
}

const registry = createRegistrySnapshot({
  workspaceId: workspace,
  sequence: 1,
  createdAt: now,
  createdBy: 'integration-test',
  source: 'fixture',
  reason: 'initial adapter graph pairs',
  repositories: [
    {
      repositoryId: producer,
      alias: 'producer',
      defaultBranch: 'main',
      collections: ['default'],
      selected: true,
      consentRevision: '1',
    },
    {
      repositoryId: consumer,
      alias: 'consumer',
      defaultBranch: 'main',
      collections: ['default'],
      selected: true,
      consentRevision: '1',
    },
  ],
  services: [],
  aliases: [],
});

interface PairFixture {
  readonly adapter: ContractAdapter;
  readonly kind: ContractKind;
  readonly expectedKey: string;
  readonly base: ExtractRequest;
  readonly head: ExtractRequest;
  readonly consumer: ExtractRequest;
  readonly serviceId?: string;
}

const fixtures: readonly PairFixture[] = [
  {
    adapter: typeScriptAdapter,
    kind: 'typescript_symbol',
    expectedKey: 'typescript:npm#%40fixture%2Fapi#.#value#x',
    base: {
      artifacts: [
        artifact(
          'package.json',
          JSON.stringify({ name: '@fixture/api', exports: './src/index.ts' }),
        ),
        artifact('src/index.ts', 'export function x(value: string): string { return value; }'),
      ],
      configRevision: config,
      context: {},
    },
    head: {
      artifacts: [
        artifact(
          'package.json',
          JSON.stringify({ name: '@fixture/api', exports: './src/index.ts' }),
        ),
        artifact('src/index.ts', 'export const replacement = 1;'),
      ],
      configRevision: config,
      context: {},
    },
    consumer: {
      artifacts: [
        artifact(
          'package.json',
          JSON.stringify({ name: '@fixture/web', dependencies: { '@fixture/api': '^1.0.0' } }),
        ),
        artifact(
          'src/client.ts',
          "import { x } from '@fixture/api';\nexport const result = x('ok');",
        ),
      ],
      configRevision: config,
      context: { lockedVersions: { '@fixture/api': '1.0.0' } },
    },
  },
  {
    adapter: openApiAdapter,
    kind: 'openapi_operation',
    expectedKey: 'openapi:svc.fixture#getPet',
    serviceId: 'svc.fixture',
    base: {
      artifacts: [
        artifact(
          'openapi.yaml',
          "openapi: 3.1.0\ninfo: {title: Fixture, version: 1}\npaths:\n  /pets/{id}:\n    get:\n      operationId: getPet\n      responses:\n        '200': {description: ok}\n",
        ),
      ],
      configRevision: config,
      context: { serviceId: 'svc.fixture' },
    },
    head: {
      artifacts: [
        artifact('openapi.yaml', 'openapi: 3.1.0\ninfo: {title: Fixture, version: 2}\npaths: {}\n'),
      ],
      configRevision: config,
      context: { serviceId: 'svc.fixture' },
    },
    consumer: {
      artifacts: [],
      configRevision: config,
      context: {
        serviceId: 'svc.fixture',
        generatedClientBindings: [{ operationId: 'getPet', path: 'src/pets-client.ts' }],
      },
    },
  },
  {
    adapter: protobufAdapter,
    kind: 'protobuf_method',
    expectedKey: 'protobuf-method:fixture.v1.Pets#GetPet',
    base: {
      artifacts: [
        artifact(
          'descriptor.json',
          JSON.stringify({
            file: [
              {
                package: 'fixture.v1',
                service: [{ name: 'Pets', method: [{ name: 'GetPet' }] }],
              },
            ],
          }),
          'generated',
        ),
      ],
      configRevision: config,
      context: {},
    },
    head: {
      artifacts: [
        artifact(
          'descriptor.json',
          JSON.stringify({ file: [{ package: 'fixture.v1', service: [{ name: 'Pets' }] }] }),
          'generated',
        ),
      ],
      configRevision: config,
      context: {},
    },
    consumer: {
      artifacts: [],
      configRevision: config,
      context: {
        generatedStubBindings: [
          {
            kind: 'method',
            packageName: 'fixture.v1',
            declaration: 'Pets',
            member: 'GetPet',
            path: 'src/pets.pb.ts',
          },
        ],
      },
    },
  },
];

describe('initial adapter graph pairs', () => {
  it.each(fixtures)(
    '$kind resolves a real producer change to a consumer reference',
    async (fixture) => {
      const base = await fixture.adapter.extract(fixture.base);
      const head = await fixture.adapter.extract(fixture.head);
      const consumerExtraction = await fixture.adapter.extract(fixture.consumer);
      const diff = await fixture.adapter.diff({ base, head, configRevision: config, context: {} });
      const producerObservation = materializeContractObservation({
        workspaceId: workspace,
        repositoryId: producer,
        generationId: producerGeneration,
        commitSha: baseSha,
        observedAt: now,
        extractions: [base],
        ...(fixture.serviceId === undefined ? {} : { serviceId: fixture.serviceId }),
      });
      const consumerObservation = materializeContractObservation({
        workspaceId: workspace,
        repositoryId: consumer,
        generationId: consumerGeneration,
        commitSha: consumerSha,
        observedAt: now,
        extractions: [consumerExtraction],
      });
      const changes = materializeContractChanges({
        workspaceId: workspace,
        producerRepositoryId: producer,
        baseGenerationId: producerGeneration,
        baseSha,
        headSha,
        diffs: [diff],
      }).filter((value) => value.canonicalKey === fixture.expectedKey);
      expect(base.definitions.some((value) => value.canonicalKey === fixture.expectedKey)).toBe(
        true,
      );
      expect(
        consumerExtraction.references.some((value) => value.canonicalKey === fixture.expectedKey),
      ).toBe(true);
      expect(changes).toHaveLength(1);
      const joined = joinChangedContracts({
        changes,
        definitions: producerObservation.definitions,
        references: consumerObservation.references,
        selections: [
          {
            repositoryId: consumer,
            state: 'current',
            generationId: consumerGeneration,
            commitSha: consumerSha,
            selectedAt: now,
            freshnessAgeMs: 0,
            coverageState:
              consumerObservation.coverageState === 'complete' ? 'complete' : 'partial',
          },
        ],
        registry,
        observedAt: now,
      });
      expect(joined.edges).toHaveLength(1);
      expect(joined.edges[0]).toMatchObject({
        contractKind: fixture.kind,
        definitionKey: fixture.expectedKey,
        basis: 'exact',
        producerRepositoryId: producer,
        consumerRepositoryId: consumer,
      });
    },
  );
});
