import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

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
} from '@yanibhq/reverb-domain';
import type { AnalysisResult, ContentHash } from '@yanibhq/reverb-domain';
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { MinimalMemoryHost } from '../../../examples/minimal-host/src/index.js';
import { PostgresHostedStore } from '../../storage-postgres/src/index.js';
import { SqliteStore } from '../../storage-sqlite/src/index.js';

import {
  HOST_CONFORMANCE_VERSION,
  runCanonicalHostConformance,
  type CanonicalAnalysisHost,
  type CanonicalHostConformanceCase,
} from '../src/index.js';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000301');
const otherWorkspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000302');
const repository = repositoryStableId('github:301');
const registry = registryRevision(`reg_sha256:${'1'.repeat(64)}`);
const policy = policyRevision(`pol_sha256:${'2'.repeat(64)}`);
const now = instant('2026-08-28T20:00:00.000Z');

function fixture(
  suffix: string,
  state: AnalysisResult['state'],
  current: boolean,
): CanonicalHostConformanceCase {
  const result = finalizeAnalysisResult({
    schema: 'reverb.analysis-result',
    schemaVersion: '1.0',
    analysisId: analysisId(`ana_01990f64-0000-7000-8000-${suffix.padStart(12, '0')}`),
    workspaceId: workspace,
    producerRepositoryId: repository,
    pullRequest: {
      provider: 'github',
      number: Number.parseInt(suffix, 10),
      baseSha: commitSha('a'.repeat(40)),
      headSha: commitSha(suffix.repeat(40).slice(0, 40)),
    },
    registryRevision: registry,
    policyRevision: policy,
    policyMajor: 1,
    state,
    current,
    consumers: [],
    findings: [],
    abstentions: [],
    startedAt: now,
    completedAt: now,
  });
  return {
    result,
    supersessionKey: contentHash(`sha256:${suffix.repeat(64).slice(0, 64)}`),
  };
}

const cases = [
  fixture('3', 'complete', true),
  {
    ...fixture('4', 'partial', true),
    supersessionKey: contentHash(`sha256:${'3'.repeat(64)}`),
  },
  fixture('5', 'not_analysed', true),
  fixture('6', 'superseded', false),
];

function connectionConfig(): PoolConfig {
  const configured = process.env.REVERB_POSTGRES_URL;
  if (configured) return { connectionString: configured };
  if (process.env.CI) {
    return { connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres' };
  }
  return { database: 'postgres' };
}

describe(`canonical host conformance ${HOST_CONFORMANCE_VERSION}`, () => {
  const schema = `reverb_hosts_${randomUUID().replaceAll('-', '')}`;
  const baseConfig = connectionConfig();
  const admin = new Pool(baseConfig);

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
  });

  afterAll(async () => {
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  it('preserves canonical semantics in the standalone PostgreSQL host', async () => {
    await runCanonicalHostConformance({
      otherWorkspaceId: otherWorkspace,
      cases,
      create: async (): Promise<CanonicalAnalysisHost> => {
        const store = new PostgresHostedStore({
          ...baseConfig,
          options: `-c search_path=${schema},public`,
        });
        await store.migrate();
        return {
          capabilities: {
            hostId: 'reverb.github-postgres',
            conformanceVersion: HOST_CONFORMANCE_VERSION,
            persistence: 'durable',
            source: 'github_exact_git',
            externalDelivery: 'github_advisory',
            reviews: true,
            disclosureProjection: true,
            deletionPropagation: true,
            unsupportedOptionalPorts: ['model', 'vector_search'],
          },
          async putAnalysis(result, supersessionKey) {
            await store.putCanonicalRecord({
              workspaceId: result.workspaceId,
              recordType: 'analysis',
              recordId: result.analysisId,
              repositoryId: result.producerRepositoryId,
              payloadHash: result.outputHash,
              payload: result as unknown as Readonly<Record<string, unknown>>,
              createdAt: result.completedAt,
            });
            if (result.current) {
              await store.putCanonicalPointer({
                workspaceId: result.workspaceId,
                pointerType: 'current_analysis',
                pointerId: supersessionKey,
                repositoryId: result.producerRepositoryId,
                targetRecordType: 'analysis',
                targetRecordId: result.analysisId,
                updatedAt: result.completedAt,
              });
            }
          },
          async getAnalysis(workspaceId, id) {
            const record = await store.getCanonicalRecord({
              workspaceId,
              recordType: 'analysis',
              recordId: id,
            });
            return record ? (record.payload as unknown as AnalysisResult) : null;
          },
          async getCurrentAnalysis(workspaceId, supersessionKey) {
            const pointer = await store.getCanonicalPointer({
              workspaceId,
              pointerType: 'current_analysis',
              pointerId: supersessionKey,
            });
            const id = pointer?.targetRecordId;
            return id ? this.getAnalysis(workspaceId, id as AnalysisResult['analysisId']) : null;
          },
          async purgeRepository(workspaceId, repositoryId) {
            await store.purgeRepository({
              workspaceId,
              repositoryId,
              authorizationRevision: 'conformance-purge',
              requestedAt: now,
              completedAt: now,
            });
          },
          close: () => store.close(),
        };
      },
    });
  });

  it('preserves canonical semantics in the local SQLite host', async () => {
    const roots: string[] = [];
    try {
      await runCanonicalHostConformance({
        otherWorkspaceId: otherWorkspace,
        cases,
        create: async () => {
          const root = await mkdtemp(resolve(tmpdir(), 'reverb-all-hosts-'));
          roots.push(root);
          const store = new SqliteStore(resolve(root, 'reverb.sqlite'));
          return {
            capabilities: {
              hostId: 'reverb.local-sqlite',
              conformanceVersion: HOST_CONFORMANCE_VERSION,
              persistence: 'durable',
              source: 'local_git',
              externalDelivery: 'projection_only',
              reviews: true,
              disclosureProjection: true,
              deletionPropagation: false,
              unsupportedOptionalPorts: ['provider_webhooks', 'external_delivery', 'purge'],
            },
            async putAnalysis(result: AnalysisResult, supersessionKey: ContentHash) {
              const stored = await store.persistAnalysis(result, supersessionKey);
              if (!stored.ok) throw new Error(stored.failure.safeMessage);
            },
            async getAnalysis(_workspaceId, id) {
              const found = await store.getAnalysis(id);
              if (!found.ok || found.value.workspaceId !== _workspaceId) return null;
              return found.value;
            },
            async getCurrentAnalysis(_workspaceId, supersessionKey) {
              const found = await store.getCurrentAnalysis(supersessionKey);
              if (!found.ok || found.value?.workspaceId !== _workspaceId) return null;
              return found.value;
            },
            close: async () => store.close(),
          } satisfies CanonicalAnalysisHost;
        },
      });
    } finally {
      await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    }
  });

  it('preserves canonical semantics in the minimal third-host example', async () => {
    await runCanonicalHostConformance({
      otherWorkspaceId: otherWorkspace,
      cases,
      create: async () => new MinimalMemoryHost(),
    });
  });
});
