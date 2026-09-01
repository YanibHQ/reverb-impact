import { execFile } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  adapterId,
  commitSha,
  contentHash,
  createCorpusManifest,
  createImpactCase,
  generationId,
  instant,
  policyRevision,
  registryRevision,
  repositoryStableId,
  stableReferenceId,
} from '@yanib/reverb-domain';
import { afterEach, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const cli = resolve(import.meta.dirname, '../src/bin.ts');
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function run(cwd: string, ...argv: string[]): Promise<string> {
  const result = await exec(process.execPath, [tsxCli, cli, ...argv], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return result.stdout.trim();
}

async function git(cwd: string, ...argv: string[]): Promise<string> {
  const result = await exec('git', argv, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}

async function initializeRepository(root: string, filename: string): Promise<void> {
  await git(root, 'init', '-b', 'main');
  await git(root, 'config', 'user.email', 'fixture@example.test');
  await git(root, 'config', 'user.name', 'Fixture');
  await writeFile(resolve(root, filename), 'export const fixture = true;\n');
  await git(root, 'add', '--all');
  await git(root, 'commit', '-m', 'fixture');
}

function wireProjection(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(wireProjection);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`),
        wireProjection(nested),
      ]),
    );
  }
  return value;
}

describe('local CLI workflow', () => {
  it('initializes membership, indexes an exact SHA, reports status, and diagnoses the host', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'reverb-cli-root-'));
    const member = await mkdtemp(resolve(tmpdir(), 'reverb-cli-member-'));
    roots.push(root, member);
    await initializeRepository(root, 'root.ts');
    await initializeRepository(member, 'member.ts');

    const initialized = JSON.parse(await run(root, 'init', '.', '--name', 'CLI fixture')) as {
      workspace_id: string;
      root: string;
    };
    expect(initialized.workspace_id).toMatch(/^wsp_/);
    expect(initialized.root).toBe(await realpath(root));

    const revision = await run(root, 'workspace', 'add', member, '--alias', 'member');
    expect(revision).toMatch(/^reg_sha256:/);
    const validation = JSON.parse(await run(root, 'registry', 'validate')) as {
      repositories: number;
    };
    expect(validation.repositories).toBe(2);
    expect(await run(root, 'workspace', 'remove', 'member')).toMatch(/^reg_sha256:/);

    const indexed = JSON.parse(await run(root, 'index', '--ref', 'HEAD', '--json')) as {
      state: string;
      commit_sha: string;
      artifactCount: number;
    }[];
    expect(indexed).toHaveLength(1);
    expect(indexed[0]).toMatchObject({ state: 'complete', artifactCount: 1 });
    expect(indexed[0]?.commit_sha).toBe(await git(root, 'rev-parse', 'HEAD'));

    const status = JSON.parse(await run(root, 'status', '--json')) as {
      selected: { commit_sha: string; state: string } | null;
    }[];
    expect(status[0]?.selected).toMatchObject({
      commit_sha: await git(root, 'rev-parse', 'HEAD'),
      state: 'complete',
    });

    const doctor = JSON.parse(await run(root, 'doctor', '--json')) as {
      checks: { state: string }[];
    };
    expect(doctor.checks.length).toBeGreaterThanOrEqual(3);
    expect(doctor.checks.every((check) => check.state === 'pass')).toBe(true);
  }, 30_000);

  it('runs an exact local PR preview and exposes persisted finding evidence', async () => {
    const producer = await mkdtemp(resolve(tmpdir(), 'reverb-cli-producer-'));
    const consumer = await mkdtemp(resolve(tmpdir(), 'reverb-cli-consumer-'));
    roots.push(producer, consumer);
    await git(producer, 'init', '-b', 'main');
    await git(producer, 'config', 'user.email', 'fixture@example.test');
    await git(producer, 'config', 'user.name', 'Fixture');
    await writeFile(
      resolve(producer, 'package.json'),
      JSON.stringify({ name: '@fixture/api', exports: './index.ts' }),
    );
    await writeFile(
      resolve(producer, 'index.ts'),
      'export function x(value: string): string { return value; }\n',
    );
    await writeFile(
      resolve(producer, 'client.ts'),
      "import { x } from '@fixture/api';\nexport const local = x('same-repository');\n",
    );
    await git(producer, 'add', '--all');
    await git(producer, 'commit', '-m', 'base API');
    const base = await git(producer, 'rev-parse', 'HEAD');
    await writeFile(resolve(producer, 'index.ts'), 'export const replacement = 1;\n');
    await git(producer, 'add', '--all');
    await git(producer, 'commit', '-m', 'remove API');
    const head = await git(producer, 'rev-parse', 'HEAD');

    await git(consumer, 'init', '-b', 'main');
    await git(consumer, 'config', 'user.email', 'fixture@example.test');
    await git(consumer, 'config', 'user.name', 'Fixture');
    await writeFile(
      resolve(consumer, 'package.json'),
      JSON.stringify({ name: '@fixture/web', dependencies: { '@fixture/api': '1.0.0' } }),
    );
    await writeFile(
      resolve(consumer, 'client.ts'),
      "import { x } from '@fixture/api';\nexport const value = x('fixture');\n",
    );
    await git(consumer, 'add', '--all');
    await git(consumer, 'commit', '-m', 'consumer');

    await run(producer, 'init', '.', '--name', 'Impact fixture');
    await run(producer, 'workspace', 'add', consumer, '--alias', 'consumer');
    await run(producer, 'index', '--repo', 'consumer', '--ref', 'HEAD', '--json');
    const page = JSON.parse(
      await run(
        producer,
        'analyze',
        '--repo',
        basename(producer),
        '--base',
        base,
        '--head',
        head,
        '--pr-number',
        '17',
        '--limit',
        '1',
        '--json',
      ),
    ) as {
      schema: string;
      total_findings: number;
      returned_findings: number;
      next_cursor: string | null;
      result: {
        pull_request: { base_sha: string; head_sha: string };
        findings: { fingerprint: string; delivery: { decision: string } }[];
        consumers: { repository_id: string; commit_sha: string; coverage_state: string }[];
      };
    };
    expect(page).toMatchObject({
      schema: 'reverb.analysis-page',
      total_findings: 2,
      returned_findings: 1,
      next_cursor: 'offset:1',
      result: { pull_request: { base_sha: base, head_sha: head } },
    });
    expect(page.result.findings[0]?.delivery.decision).toBe('preview_only');
    expect(page.result.consumers[0]).toMatchObject({ coverage_state: 'partial' });
    const detail = JSON.parse(
      await run(producer, 'finding', 'show', page.result.findings[0]!.fingerprint, '--json'),
    ) as { finding: { fingerprint: string } };
    expect(detail.finding.fingerprint).toBe(page.result.findings[0]?.fingerprint);
    const recorded = JSON.parse(
      await run(
        producer,
        'review',
        'add',
        page.result.findings[0]!.fingerprint,
        '--edge',
        'confirmed',
        '--impact',
        'breaking',
        '--action',
        'coordinate',
        '--reason',
        'coordination_required',
        '--actor',
        'reviewer-a',
        '--capability',
        'TypeScript package ownership',
        '--json',
      ),
    ) as { event: { labels: { edge: string; impact: string; action: string } } };
    expect(recorded.event.labels).toEqual({
      edge: 'confirmed',
      impact: 'breaking',
      action: 'coordinate',
    });
    const history = JSON.parse(
      await run(producer, 'review', 'list', page.result.findings[0]!.fingerprint, '--json'),
    ) as { reason: string }[];
    expect(history).toHaveLength(1);
    expect(history[0]?.reason).toBe('coordination_required');
  }, 45_000);

  it('imports a frozen corpus, evaluates it, simulates policy, and records remain-preview', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'reverb-cli-evaluation-'));
    roots.push(root);
    await initializeRepository(root, 'fixture.ts');
    await run(root, 'init', '.', '--name', 'Evaluation fixture');
    const adapter = adapterId('reverb.typescript');
    const openedAt = instant('2026-08-28T20:00:00.000Z');
    const stratumKey = 'typescript|typescript|exact|v1';
    const caseValue = createImpactCase({
      subset: 'historical',
      organizationId: 'org-opaque',
      repositoryFamilyId: 'family-opaque',
      teamId: 'team-opaque',
      eligiblePullRequestId: 'pr-1',
      producerRepositoryId: repositoryStableId(`local:sha256:${'1'.repeat(64)}`),
      producerBaseSha: commitSha('a'.repeat(40)),
      producerHeadSha: commitSha('b'.repeat(40)),
      pullRequestOpenedAt: openedAt,
      consumerRepositoryId: repositoryStableId(`local:sha256:${'2'.repeat(64)}`),
      consumerShaAsOfPullRequestOpen: commitSha('c'.repeat(40)),
      consumerSnapshotObservedAt: instant('2026-08-28T19:59:00.000Z'),
      producerGenerationId: generationId('gen_01990f64-0000-7000-8000-000000000088'),
      consumerGenerationId: generationId('gen_01990f64-0000-7000-8000-000000000089'),
      stableConsumerReferenceId: stableReferenceId(`ref_sha256:${'3'.repeat(64)}`),
      contractKind: 'typescript_symbol',
      canonicalContractKey: 'typescript:npm#api#.#value#x',
      changeKind: 'removed_export',
      stratum: {
        key: stratumKey,
        contractKind: 'typescript_symbol',
        producerLanguageTier: 'typescript',
        consumerLanguageTier: 'typescript',
        producerExtractor: { id: adapter, version: '0.1.0' },
        consumerExtractor: { id: adapter, version: '0.1.0' },
        identityVersion: 1,
        joinStrategy: 'exact',
        evidenceComposition: ['definition', 'reference'],
        coverageCompletenessClass: 'complete',
      },
      adapterVersions: { 'reverb.typescript': '0.1.0' },
      identityFunctionVersion: '1.0.0',
      registryRevision: registryRevision(`reg_sha256:${'4'.repeat(64)}`),
      policyRevision: policyRevision(`pol_sha256:${'5'.repeat(64)}`),
      evidence: [],
      coverage: [],
      detectorOutput: 'candidate',
      analysisOutcome: 'completed',
      detectorClaims: { impact: 'breaking', action: 'coordinate' },
      policySelected: true,
      suppressed: false,
      requiredForEvaluation: true,
      labels: { edge: 'confirmed', impact: 'breaking', action: 'coordinate' },
      labelerProvenance: {
        reviewerIds: ['reviewer-a', 'reviewer-b'],
        independentlyLabeled: true,
        blindedToMethod: true,
        blindedToBand: true,
        handbookVersion: '1.0.0',
        detectorAuthorConflicts: [],
        adjudicatedAt: openedAt,
      },
      sampling: {
        frameSource: 'provider_metadata',
        inclusionProbability: 1,
        samplingWeight: 1,
        seed: 'cli-fixture',
      },
      releaseability: 'private_aggregate_only',
      evaluationConsent: true,
      researchConsent: false,
      analysisLatencyMs: 1_000,
      costMicrounits: 1,
      confidentialityDefects: 0,
      removalCoverageDefect: false,
      remedyAvailable: true,
    });
    const manifest = createCorpusManifest({
      createdAt: openedAt,
      handbookVersion: '1.0.0',
      frameSource: 'provider_metadata',
      populationHash: contentHash(`sha256:${'6'.repeat(64)}`),
      eligiblePopulationCount: 1,
      cases: [caseValue],
    });
    const corpusPath = resolve(root, 'corpus.json');
    await writeFile(corpusPath, JSON.stringify(wireProjection({ manifest, cases: [caseValue] })));
    const imported = JSON.parse(await run(root, 'corpus', 'import', corpusPath)) as {
      corpus_revision: string;
      cases: number;
    };
    expect(imported).toEqual({ corpus_revision: manifest.revision, cases: 1 });
    const evaluation = JSON.parse(
      await run(root, 'eval', '--corpus', manifest.revision, '--json'),
    ) as {
      evaluation: {
        output_hash: string;
        real_world: { edge_precision: { total: number } };
      };
    };
    expect(evaluation.evaluation.real_world.edge_precision.total).toBe(1);
    const policyPath = resolve(root, 'policy.json');
    await writeFile(
      policyPath,
      JSON.stringify({
        revision: `pol_sha256:${'7'.repeat(64)}`,
        allowed_strata: [stratumKey],
        allowed_impact_claims: ['breaking'],
        respect_frozen_suppressions: true,
        maximum_alerts_per_thousand: 50,
      }),
    );
    const simulation = JSON.parse(
      await run(root, 'policy', 'simulate', policyPath, '--corpus', manifest.revision, '--json'),
    ) as {
      result_hash: string;
      candidate: { deliveries: number; metrics: Record<string, unknown> };
    };
    expect(simulation.candidate.deliveries).toBe(1);
    const evidencePath = resolve(root, 'promotion-evidence.json');
    await writeFile(
      evidencePath,
      JSON.stringify({
        stratum_key: stratumKey,
        corpus_revision: manifest.revision,
        evaluation_report_hash: evaluation.evaluation.output_hash,
        simulator_result_hash: simulation.result_hash,
        metrics: simulation.candidate.metrics,
        confidentiality_defects: 0,
        removal_coverage_defects: 0,
        deliveries_without_remedy: 0,
        versions: {
          producer_extractor_id: 'reverb.typescript',
          producer_extractor_version: '0.1.0',
          consumer_extractor_id: 'reverb.typescript',
          consumer_extractor_version: '0.1.0',
          identity_version: 1,
          join_strategy: 'exact',
          evidence_composition: ['definition', 'reference'],
          policy_revision: `pol_sha256:${'7'.repeat(64)}`,
        },
        evaluation_window: {
          started_at: '2026-08-01T00:00:00.000Z',
          ended_at: '2026-08-28T20:00:00.000Z',
        },
      }),
    );
    const decision = JSON.parse(
      await run(root, 'promotion', 'decide', evidencePath, '--actor', 'workspace-admin', '--json'),
    ) as { state: string; decision: string };
    expect(decision).toMatchObject({ state: 'PREVIEW', decision: 'remain_preview' });
  }, 30_000);
});
