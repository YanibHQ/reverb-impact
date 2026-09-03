import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { arch, platform } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, URL } from 'node:url';
import { TextEncoder } from 'node:util';

import { format } from 'oxfmt';

import {
  commitSha,
  configRevision,
  contentHash,
  createRegistrySnapshot,
  generationId,
  instant,
  joinChangedContracts,
  projectFindingDisclosure,
  registryRevision,
  repoPath,
  repositoryStableId,
  sha256Bytes,
  workspaceId,
} from '../packages/domain/dist/index.js';
import {
  materializeContractChanges,
  materializeContractObservation,
} from '../packages/adapter-sdk/dist/index.js';
import { typeScriptAdapter } from '../packages/adapter-typescript/dist/index.js';

const scenarioIndex = process.argv.indexOf('--scenario');
const scenario = scenarioIndex < 0 ? 'pr-overlay' : process.argv[scenarioIndex + 1];
const profileIndex = process.argv.indexOf('--profile');
const profile = profileIndex < 0 ? undefined : process.argv[profileIndex + 1];
if (profile === 'release') {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const adapterAdmissionPaths = [
    'docs/verification/adapters/configuration.json',
    'docs/verification/adapters/database.json',
    'docs/verification/adapters/events.json',
    'docs/verification/adapters/http.json',
    'docs/verification/adapters/infrastructure.json',
    'docs/verification/adapters/openapi.json',
    'docs/verification/adapters/protobuf.json',
    'docs/verification/adapters/typescript.json',
  ];
  const publicArtifacts = [
    'features/cross-repo-impact/research/artifacts/phase-003/reduced-baselines.json',
    'docs/verification/phase-004-evaluation.json',
    'docs/verification/phase-005-hosted-benchmark.json',
    'docs/verification/phase-004-reasoning.md',
    ...adapterAdmissionPaths,
    'docs/compatibility/release-metadata.json',
    'docs/compatibility/host-capabilities.json',
    'pnpm-lock.yaml',
  ];
  const artifacts = await Promise.all(
    publicArtifacts.map(async (path) => {
      const bytes = await readFile(resolve(root, path));
      return {
        path,
        sha256: sha256Bytes(bytes),
        bytes: bytes.byteLength,
      };
    }),
  );
  const comparative = JSON.parse(
    await readFile(
      resolve(
        root,
        'features/cross-repo-impact/research/artifacts/phase-003/reduced-baselines.json',
      ),
      'utf8',
    ),
  );
  const evaluation = JSON.parse(
    await readFile(resolve(root, 'docs/verification/phase-004-evaluation.json'), 'utf8'),
  );
  const hosted = JSON.parse(
    await readFile(resolve(root, 'docs/verification/phase-005-hosted-benchmark.json'), 'utf8'),
  );
  const adapterAdmissions = await Promise.all(
    adapterAdmissionPaths.map(async (path) => {
      const admission = JSON.parse(await readFile(resolve(root, path), 'utf8'));
      return {
        adapter: admission.adapterId,
        adapter_version: admission.adapterVersion,
        identity_version: admission.identityVersion,
        promotion_state: admission.promotionState,
        delivery_ready: admission.deliveryReady,
        output_hash: admission.outputHash,
      };
    }),
  );
  if (
    adapterAdmissions.length !== 8 ||
    new Set(adapterAdmissions.map((admission) => admission.adapter)).size !== 8 ||
    adapterAdmissions.some(
      (admission) =>
        admission.promotion_state !== 'UNMEASURED' || admission.delivery_ready !== false,
    )
  ) {
    throw new Error('Release benchmark requires eight unique preview-only adapter admissions.');
  }
  const report = {
    schema: 'reverb.release-benchmark',
    schema_version: '1.0',
    profile,
    artifact_manifest: artifacts,
    mechanics: {
      comparative_results: comparative.results,
      evaluation_decision: evaluation.decision,
      evaluation_strata: evaluation.strata,
      adapter_admissions: adapterAdmissions,
      reasoning: {
        evidence_basis: 'ai_inferred',
        fallback: 'needs_investigation',
        deterministic_isolation: true,
        provider_bundled: false,
        delivery_ready: false,
      },
      hosted_disclosure_projection: {
        iterations: hosted.iterations,
        disclosure_defects: hosted.disclosure_defects,
        projection_latency_ms: hosted.projection_latency_ms,
      },
    },
    environment: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      package_manager: 'pnpm@10.27.0',
      lockfile_sha256: artifacts.find((artifact) => artifact.path === 'pnpm-lock.yaml')?.sha256,
    },
    reproducibility: {
      generator: 'node tools/benchmark.mjs --profile release --write',
      verification: [
        'node tools/benchmark.mjs --profile release',
        'pnpm test:all-hosts',
        'pnpm release:verify',
      ],
    },
    limitations: [
      'This manifest assembles public synthetic mechanics artifacts; it is not an independently labelled real-world corpus.',
      'Stored latency values are local reference observations and are not a production SLO.',
      'All eight deterministic adapter admissions remain UNMEASURED, so this report makes no precision, recall, or promotion claim.',
      'Optional reasoning remains hypothesis-only and is not delivery-ready.',
      'No customer source, repository identity, review, or provider payload is included.',
    ],
  };
  const { code: serialized } = await format('release-benchmark.json', JSON.stringify(report), {
    printWidth: 80,
  });
  if (process.argv.includes('--write')) {
    const output = resolve(
      root,
      'docs/verification/phase-005-next-generation-release-benchmark.json',
    );
    await mkdir(resolve(output, '..'), { recursive: true });
    await writeFile(output, serialized);
    process.stdout.write(`Wrote ${output}\n`);
  }
  process.stdout.write(serialized);
} else if (profile === 'hosted-target') {
  const iterations = 2_000;
  const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000190');
  const producer = repositoryStableId('github:190');
  const consumer = repositoryStableId('github:191');
  const revision = registryRevision(`reg_sha256:${'1'.repeat(64)}`);
  const samples = [];
  let disclosureDefects = 0;
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    const projection = projectFindingDisclosure({
      workspaceId: workspace,
      destinationRepositoryId: producer,
      audience: 'static',
      registryRevision: revision,
      facts: [
        {
          field: 'repository_identity',
          name: 'consumer_repository',
          value: `restricted-consumer-canary-${index}`,
          subjectRepositoryId: consumer,
          explicitGrant: true,
          appCanRead: true,
          wholeProducerAudienceCanRead: false,
        },
        {
          field: 'contract_identity',
          name: 'producer_contract',
          value: `allowed-contract-${index}`,
          subjectRepositoryId: producer,
          explicitGrant: true,
          appCanRead: true,
          wholeProducerAudienceCanRead: true,
        },
      ],
    });
    samples.push(performance.now() - started);
    disclosureDefects += JSON.stringify(projection).includes(`restricted-consumer-canary-${index}`)
      ? 1
      : 0;
  }
  const ordered = [...samples].sort((left, right) => left - right);
  const percentile = (fraction) =>
    ordered[Math.min(ordered.length - 1, Math.floor(fraction * ordered.length))];
  const report = {
    schema: 'reverb.hosted-target-benchmark',
    schema_version: '1.0',
    profile,
    iterations,
    disclosure_defects: disclosureDefects,
    projection_latency_ms: {
      p50: Number(percentile(0.5).toFixed(4)),
      p95: Number(percentile(0.95).toFixed(4)),
      p99: Number(percentile(0.99).toFixed(4)),
      maximum: Number(ordered.at(-1).toFixed(4)),
    },
    environment: { node: process.version, platform: platform(), arch: arch() },
    limitations: [
      'This local target profile measures disclosure projection mechanics, not provider or database network latency.',
      'It is not a production SLO observation and contains no customer source or repository identity.',
    ],
  };
  const { code: serialized } = await format('hosted-benchmark.json', JSON.stringify(report), {
    printWidth: 80,
  });
  if (process.argv.includes('--write')) {
    const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
    const output = resolve(root, 'docs/verification/phase-005-hosted-benchmark.json');
    await mkdir(resolve(output, '..'), { recursive: true });
    await writeFile(output, serialized);
    process.stdout.write(`Wrote ${output}\n`);
  }
  process.stdout.write(serialized);
} else if (profile !== undefined) {
  process.stderr.write(`Unknown benchmark profile: ${profile}\n`);
  process.exitCode = 2;
} else if (scenario !== 'pr-overlay') {
  process.stderr.write(`Unknown benchmark scenario: ${scenario ?? 'missing'}\n`);
  process.exitCode = 2;
} else {
  const started = performance.now();
  const usageBefore = process.resourceUsage();
  const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000180');
  const producer = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
  const consumer = repositoryStableId(`local:sha256:${'2'.repeat(64)}`);
  const unrelated = repositoryStableId(`local:sha256:${'3'.repeat(64)}`);
  const producerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000180');
  const consumerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000181');
  const unrelatedGeneration = generationId('gen_01990f64-0000-7000-8000-000000000182');
  const baseSha = commitSha('a'.repeat(40));
  const headSha = commitSha('b'.repeat(40));
  const consumerSha = commitSha('c'.repeat(40));
  const unrelatedSha = commitSha('d'.repeat(40));
  const observedAt = instant('2026-08-28T20:00:00.000Z');
  const config = configRevision(`cfg_sha256:${'e'.repeat(64)}`);
  const artifact = (path, text) => {
    const bytes = new TextEncoder().encode(text);
    return {
      path: repoPath(path),
      contentHash: contentHash(sha256Bytes(bytes)),
      bytes,
      classification: 'source',
    };
  };
  const packageArtifact = artifact(
    'package.json',
    JSON.stringify({ name: '@fixture/api', exports: './index.ts' }),
  );
  const base = await typeScriptAdapter.extract({
    artifacts: [
      packageArtifact,
      artifact(
        'index.ts',
        "export function x(value: string): string { return value; }\nexport function y(): string { return 'y'; }\n",
      ),
    ],
    configRevision: config,
    context: {},
  });
  const head = await typeScriptAdapter.extract({
    artifacts: [
      packageArtifact,
      artifact('index.ts', "export function y(): string { return 'y'; }\n"),
    ],
    configRevision: config,
    context: {},
  });
  const consumerSource = "import { x } from '@fixture/api';\nexport const value = x('fixture');\n";
  const unrelatedSource = "import { y } from '@fixture/api';\nexport const value = y();\n";
  const consumerExtraction = await typeScriptAdapter.extract({
    artifacts: [
      artifact(
        'package.json',
        JSON.stringify({ name: '@fixture/web', dependencies: { '@fixture/api': '1.0.0' } }),
      ),
      artifact('client.ts', consumerSource),
    ],
    configRevision: config,
    context: { lockedVersions: { '@fixture/api': '1.0.0' } },
  });
  const unrelatedExtraction = await typeScriptAdapter.extract({
    artifacts: [
      artifact(
        'package.json',
        JSON.stringify({ name: '@fixture/worker', dependencies: { '@fixture/api': '1.0.0' } }),
      ),
      artifact('worker.ts', unrelatedSource),
    ],
    configRevision: config,
    context: { lockedVersions: { '@fixture/api': '1.0.0' } },
  });
  const diff = await typeScriptAdapter.diff({ base, head, configRevision: config, context: {} });
  const producerObservation = materializeContractObservation({
    workspaceId: workspace,
    repositoryId: producer,
    generationId: producerGeneration,
    commitSha: baseSha,
    observedAt,
    extractions: [base],
  });
  const consumerObservation = materializeContractObservation({
    workspaceId: workspace,
    repositoryId: consumer,
    generationId: consumerGeneration,
    commitSha: consumerSha,
    observedAt,
    extractions: [consumerExtraction],
  });
  const unrelatedObservation = materializeContractObservation({
    workspaceId: workspace,
    repositoryId: unrelated,
    generationId: unrelatedGeneration,
    commitSha: unrelatedSha,
    observedAt,
    extractions: [unrelatedExtraction],
  });
  const changes = materializeContractChanges({
    workspaceId: workspace,
    producerRepositoryId: producer,
    baseGenerationId: producerGeneration,
    baseSha,
    headSha,
    diffs: [diff],
  }).filter((change) => change.changeKind === 'export_removed');
  const registry = createRegistrySnapshot({
    workspaceId: workspace,
    sequence: 1,
    createdAt: observedAt,
    createdBy: 'benchmark',
    source: 'phase-003',
    reason: 'comparative PR overlay fixture',
    repositories: [
      [producer, 'producer'],
      [consumer, 'consumer'],
      [unrelated, 'unrelated-consumer'],
    ].map(([repositoryId, alias]) => ({
      repositoryId,
      alias,
      defaultBranch: 'main',
      collections: ['benchmark'],
      selected: true,
      consentRevision: 'benchmark-v1',
    })),
  });
  const joined = joinChangedContracts({
    changes,
    definitions: producerObservation.definitions,
    references: [...consumerObservation.references, ...unrelatedObservation.references],
    selections: [
      {
        repositoryId: consumer,
        state: 'current',
        generationId: consumerGeneration,
        commitSha: consumerSha,
        selectedAt: observedAt,
        freshnessAgeMs: 0,
        coverageState: 'complete',
      },
      {
        repositoryId: unrelated,
        state: 'current',
        generationId: unrelatedGeneration,
        commitSha: unrelatedSha,
        selectedAt: observedAt,
        freshnessAgeMs: 0,
        coverageState: 'complete',
      },
    ],
    registry,
    observedAt,
  });
  const expected = new Set(['consumer']);
  const aliases = new Map([
    [consumer, 'consumer'],
    [unrelated, 'unrelated-consumer'],
  ]);
  const score = (name, predicted, attributes) => {
    const values = new Set(predicted);
    const truePositive = [...values].filter((value) => expected.has(value)).length;
    return {
      name,
      predicted_consumers: [...values].sort(),
      true_positives: truePositive,
      false_positives: values.size - truePositive,
      false_negatives: [...expected].filter((value) => !values.has(value)).length,
      ...attributes,
    };
  };
  const reverbConsumers = joined.edges.flatMap((edge) => {
    const alias = aliases.get(edge.consumerRepositoryId);
    return alias === undefined ? [] : [alias];
  });
  const lexicalConsumers = [
    ...(/\bimport\s*\{[^}]*\bx\b/.test(consumerSource) ? ['consumer'] : []),
    ...(/\bimport\s*\{[^}]*\bx\b/.test(unrelatedSource) ? ['unrelated-consumer'] : []),
  ];
  const schemaOnlyConsumers = [
    ...(consumerExtraction.references.some((reference) =>
      changes.some((change) => change.canonicalKey === reference.canonicalKey),
    )
      ? ['consumer']
      : []),
    ...(unrelatedExtraction.references.some((reference) =>
      changes.some((change) => change.canonicalKey === reference.canonicalKey),
    )
      ? ['unrelated-consumer']
      : []),
  ];
  const usageAfter = process.resourceUsage();
  const report = {
    schema: 'reverb.comparative-benchmark',
    schema_version: '1.0',
    scenario,
    fixture: {
      changed_contracts: changes.map((change) => change.canonicalKey),
      expected_consumers: [...expected],
      base_sha: baseSha,
      head_sha: headSha,
      consumer_shas: { consumer: consumerSha, unrelated_consumer: unrelatedSha },
    },
    results: [
      score('reverb', reverbConsumers, {
        exact_base_head: true,
        contract_identity: 'canonical_symbol',
        consumer_evidence: 'stable_reference_and_location',
        coverage_semantics: 'claim_specific_with_abstention',
      }),
      score('manifest', ['consumer', 'unrelated-consumer'], {
        exact_base_head: false,
        contract_identity: 'package_only',
        consumer_evidence: 'manifest_dependency',
        coverage_semantics: 'none',
      }),
      score('lexical', lexicalConsumers, {
        exact_base_head: true,
        contract_identity: 'changed_name',
        consumer_evidence: 'text_match',
        coverage_semantics: 'none',
      }),
      score('schema_only', schemaOnlyConsumers, {
        exact_base_head: true,
        contract_identity: 'canonical_symbol',
        consumer_evidence: 'canonical_reference',
        coverage_semantics: 'none',
      }),
    ],
    resource: {
      elapsed_ms: Number((performance.now() - started).toFixed(3)),
      user_cpu_micros: usageAfter.userCPUTime - usageBefore.userCPUTime,
      system_cpu_micros: usageAfter.systemCPUTime - usageBefore.systemCPUTime,
      max_rss_kib: usageAfter.maxRSS,
    },
    environment: { node: process.version, platform: platform(), arch: arch() },
    limitations: [
      'Synthetic fixture proves mechanics, not real-world precision or recall.',
      'Latency is a single local process observation and is not a comparative SLO.',
      'Reduced baselines intentionally omit product features outside their named evidence source.',
    ],
  };
  const { code: serialized } = await format('reduced-baselines.json', JSON.stringify(report), {
    printWidth: 80,
  });
  if (process.argv.includes('--write')) {
    const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
    const output = resolve(
      root,
      'features/cross-repo-impact/research/artifacts/phase-003/reduced-baselines.json',
    );
    await mkdir(resolve(output, '..'), { recursive: true });
    await writeFile(output, serialized);
    process.stdout.write(`Wrote ${output}\n`);
  }
  process.stdout.write(serialized);
}
