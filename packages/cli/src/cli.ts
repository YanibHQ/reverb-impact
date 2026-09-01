import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  analysisId,
  analysisSupersessionKey,
  ACTION_LABELS,
  contentHash,
  createSuppressionRule,
  decidePromotion,
  EDGE_LABELS,
  enumValue,
  evaluateCorpus,
  findingFingerprint,
  generationId,
  generationLeaseId,
  hashCanonical,
  IMPACT_LABELS,
  instant,
  overlayId,
  policyRevision,
  REVIEW_REASON_CODES,
  REVIEW_ROLES,
  reviewEventId,
  simulateFrozenPolicy,
  SUPPRESSION_SCOPES,
  type CorpusManifest,
  type FrozenPolicy,
  type ImpactCase,
  type Instant,
  type PromotionEvidence,
  type ReviewEvent,
  type RepositoryMembership,
  type SuppressionMatcher,
  type SuppressionRule,
} from '@yanib/reverb-domain';
import {
  AnalyzePullRequest,
  CreatePullRequestOverlay,
  IndexRepositoryGeneration,
  RecordReview,
} from '@yanib/reverb-application';
import { materializeContractChanges } from '@yanib/reverb-adapter-sdk';
import {
  AlwaysCurrentCancellation,
  createSystemId,
  LocalArtifactObjectCache,
  LocalGitRepositoryReader,
  LocalWorkspaceConfig,
  NoopTelemetry,
  SystemClock,
  type LoadedWorkspace,
} from '@yanib/reverb-host-local';
import { SqliteStore } from '@yanib/reverb-storage-sqlite';
import {
  corpusManifestSchema,
  impactCaseSchema,
  reviewEventSchema,
  SchemaValidationError,
  suppressionRuleSchema,
  validateWithSchema,
} from '@yanib/reverb-schema';
import { Command } from 'commander';

import {
  ensureContractObservation,
  extractContractsAtCommit,
  INITIAL_ADAPTERS,
} from './contracts.js';
import { configureCliPresentation, styleRuntimeError, styleState } from './presentation.js';

const INDEXER_BUNDLE_VERSION = 'foundation-1.0.0';

function leaseExpiry(now: Instant): Instant {
  return instant(new Date(new Date(now).valueOf() + 15 * 60_000).toISOString());
}

function repositoryByAlias(
  repositories: readonly RepositoryMembership[],
  alias: string,
): RepositoryMembership {
  const repository = repositories.find((candidate) => candidate.alias === alias);
  if (!repository) throw new Error(`Repository alias is not configured: ${alias}`);
  return repository;
}

async function withStore<Value>(
  workspaceRoot: string,
  operation: (store: SqliteStore) => Promise<Value>,
): Promise<Value> {
  const store = new SqliteStore(resolve(workspaceRoot, '.reverb/reverb.sqlite'));
  try {
    return await operation(store);
  } finally {
    store.close();
  }
}

async function indexRepository(input: {
  readonly workspace: LoadedWorkspace;
  readonly repository: RepositoryMembership;
  readonly ref: string;
  readonly reader: LocalGitRepositoryReader;
  readonly store: SqliteStore;
  readonly cache: LocalArtifactObjectCache;
  readonly clock: SystemClock;
  readonly telemetry: NoopTelemetry;
  readonly cancellation: AlwaysCurrentCancellation;
}) {
  const commit = await input.reader.resolveCommit(input.repository.repositoryId, input.ref);
  if (!commit.ok) throw new Error(commit.failure.safeMessage);
  const previous = await input.store.selectGeneration({
    workspaceId: input.workspace.snapshot.revision.workspaceId,
    repositoryId: input.repository.repositoryId,
    allowPartial: true,
  });
  const now = input.clock.now();
  const indexer = new IndexRepositoryGeneration({
    reader: input.reader,
    store: input.store,
    cache: input.cache,
    clock: input.clock,
    telemetry: input.telemetry,
    cancellation: input.cancellation,
  });
  const result = await indexer.execute({
    generationId: generationId(createSystemId('gen', now)),
    leaseId: generationLeaseId(createSystemId('lea', now)),
    leaseExpiresAt: leaseExpiry(now),
    workspaceId: input.workspace.snapshot.revision.workspaceId,
    registryRevision: input.workspace.snapshot.revision.revision,
    repositoryId: input.repository.repositoryId,
    commitSha: commit.value.sha,
    configRevision: input.workspace.snapshot.revision.configRevision,
    indexerBundleVersion: INDEXER_BUNDLE_VERSION,
    ...(previous.ok && previous.value.state === 'selected'
      ? { previousGenerationId: previous.value.generation.id }
      : {}),
  });
  if (!result.ok) throw new Error(result.failure.safeMessage);
  const observation = await ensureContractObservation({
    reader: input.reader,
    generations: input.store,
    evidence: input.store,
    registry: input.workspace.snapshot,
    workspaceId: input.workspace.snapshot.revision.workspaceId,
    repositoryId: input.repository.repositoryId,
    generationId: result.value.generationId,
    commitSha: commit.value.sha,
    observedAt: input.clock.now(),
  });
  return {
    alias: input.repository.alias,
    commitSha: commit.value.sha,
    ...result.value,
    contractCoverage: observation.coverageState,
    definitionCount: observation.definitions.length,
    referenceCount: observation.references.length,
    observation,
  };
}

function snakeKey(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function canonicalProjection(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalProjection);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [snakeKey(key), canonicalProjection(nested)]),
    );
  }
  return value;
}

function domainProjection(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(domainProjection);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase()),
        domainProjection(nested),
      ]),
    );
  }
  return value;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as unknown;
}

function record(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${subject} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

async function loadCorpusBundle(path: string): Promise<{
  readonly manifest: CorpusManifest;
  readonly cases: readonly ImpactCase[];
}> {
  const bundle = record(await readJson(path), 'Corpus bundle');
  const manifestWire = bundle.manifest;
  const casesWire = bundle.cases;
  if (!Array.isArray(casesWire)) throw new Error('Corpus bundle cases must be an array.');
  try {
    validateWithSchema(corpusManifestSchema.$id, manifestWire);
    casesWire.forEach((value) => validateWithSchema(impactCaseSchema.$id, value));
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      throw new Error(
        `${error.message} ${error.validationErrors
          .map((value) => `${value.instancePath || '/'} ${value.message ?? 'is invalid'}`)
          .map((message, index) => {
            const parameters = error.validationErrors[index]?.params;
            return parameters === undefined ? message : `${message} ${JSON.stringify(parameters)}`;
          })
          .join('; ')}`,
      );
    }
    throw error;
  }
  return {
    manifest: domainProjection(manifestWire) as CorpusManifest,
    cases: domainProjection(casesWire) as readonly ImpactCase[],
  };
}

function frozenPolicy(value: unknown): FrozenPolicy {
  const projected = record(domainProjection(value), 'Frozen policy');
  const strata = projected.allowedStrata;
  const impacts = projected.allowedImpactClaims;
  if (!Array.isArray(strata) || !strata.every((item) => typeof item === 'string')) {
    throw new Error('Frozen policy allowed_strata must be a string array.');
  }
  if (
    !Array.isArray(impacts) ||
    !impacts.every((item) => item === 'breaking' || item === 'behavior_risk')
  ) {
    throw new Error('Frozen policy allowed_impact_claims are invalid.');
  }
  if (
    typeof projected.respectFrozenSuppressions !== 'boolean' ||
    typeof projected.maximumAlertsPerThousand !== 'number'
  ) {
    throw new Error('Frozen policy suppression and alert-budget fields are required.');
  }
  return {
    revision: policyRevision(String(projected.revision)),
    allowedStrata: strata as string[],
    allowedImpactClaims: impacts as ('breaking' | 'behavior_risk')[],
    respectFrozenSuppressions: projected.respectFrozenSuppressions,
    maximumAlertsPerThousand: projected.maximumAlertsPerThousand,
  };
}

function pageOptions(limitValue: string, cursorValue?: string): { limit: number; offset: number } {
  const limit = Number(limitValue);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Finding limit must be an integer from 1 through 100.');
  }
  if (cursorValue === undefined) return { limit, offset: 0 };
  const match = /^offset:([0-9]+)$/.exec(cursorValue);
  if (match === null) throw new Error('Finding cursor is malformed.');
  return { limit, offset: Number(match[1]) };
}

export async function createCli(): Promise<Command> {
  const program = configureCliPresentation(
    new Command()
      .name('reverb')
      .description('Evidence-first cross-repository pull-request impact analysis')
      .version('0.2.0'),
  );

  program
    .command('init')
    .helpGroup('Workspace')
    .argument('[path]', 'workspace root', '.')
    .option('--name <name>', 'workspace display name')
    .action(async (path: string, options: { name?: string }) => {
      const workspace = await LocalWorkspaceConfig.initialize(path, {
        ...(options.name ? { name: options.name } : {}),
      });
      await withStore(workspace.root, async (store) => {
        const result = await store.putRevision(workspace.snapshot);
        if (!result.ok) throw new Error(result.failure.safeMessage);
      });
      process.stdout.write(
        `${JSON.stringify({ workspace_id: workspace.snapshot.revision.workspaceId, root: workspace.root })}\n`,
      );
    });

  const workspace = program
    .command('workspace')
    .helpGroup('Workspace')
    .description('manage explicit repository membership');
  workspace
    .command('add')
    .argument('<repo-path>')
    .requiredOption('--alias <alias>')
    .action(async (path: string, options: { alias: string }) => {
      const current = await LocalWorkspaceConfig.load(process.cwd());
      const updated = await LocalWorkspaceConfig.addRepository(current, path, options.alias);
      await withStore(updated.root, async (store) => {
        const result = await store.putRevision(updated.snapshot);
        if (!result.ok) throw new Error(result.failure.safeMessage);
      });
      process.stdout.write(`${updated.snapshot.revision.revision}\n`);
    });
  workspace
    .command('remove')
    .argument('<alias>')
    .action(async (alias: string) => {
      const current = await LocalWorkspaceConfig.load(process.cwd());
      const updated = await LocalWorkspaceConfig.removeRepository(current, alias);
      await withStore(updated.root, async (store) => {
        const result = await store.putRevision(updated.snapshot);
        if (!result.ok) throw new Error(result.failure.safeMessage);
      });
      process.stdout.write(`${updated.snapshot.revision.revision}\n`);
    });

  const registry = program
    .command('registry')
    .helpGroup('Workspace')
    .description('manage the service registry');
  registry.command('validate').action(async () => {
    const current = await LocalWorkspaceConfig.load(process.cwd());
    process.stdout.write(
      `${JSON.stringify({ revision: current.snapshot.revision.revision, repositories: current.snapshot.repositories.length, services: current.snapshot.services.length, aliases: current.snapshot.aliases.length })}\n`,
    );
  });
  registry
    .command('service-add')
    .requiredOption('--id <id>', 'stable service ID')
    .requiredOption('--repo <alias>', 'repository alias')
    .requiredOption('--root <path>', 'repository-relative service root')
    .requiredOption('--environment <environment>')
    .requiredOption('--owner <owner>')
    .action(
      async (options: {
        id: string;
        repo: string;
        root: string;
        environment: string;
        owner: string;
      }) => {
        const current = await LocalWorkspaceConfig.load(process.cwd());
        const updated = await LocalWorkspaceConfig.addService(current, {
          id: options.id,
          repositoryAlias: options.repo,
          rootPath: options.root,
          environment: options.environment,
          owner: options.owner,
        });
        await withStore(updated.root, async (store) => {
          const result = await store.putRevision(updated.snapshot);
          if (!result.ok) throw new Error(result.failure.safeMessage);
        });
        process.stdout.write(`${updated.snapshot.revision.revision}\n`);
      },
    );
  registry
    .command('alias-add')
    .requiredOption('--service <id>', 'stable service ID')
    .requiredOption('--kind <kind>', 'alias kind')
    .requiredOption('--value <value>', 'alias value')
    .requiredOption('--environment <environment>')
    .requiredOption('--owner <owner>')
    .option('--path-prefix <path>', 'explicit gateway prefix to strip')
    .action(
      async (options: {
        service: string;
        kind: string;
        value: string;
        environment: string;
        owner: string;
        pathPrefix?: string;
      }) => {
        const current = await LocalWorkspaceConfig.load(process.cwd());
        const updated = await LocalWorkspaceConfig.addServiceAlias(current, {
          serviceId: options.service,
          kind: options.kind,
          value: options.value,
          environment: options.environment,
          owner: options.owner,
          ...(options.pathPrefix === undefined ? {} : { pathPrefix: options.pathPrefix }),
        });
        await withStore(updated.root, async (store) => {
          const result = await store.putRevision(updated.snapshot);
          if (!result.ok) throw new Error(result.failure.safeMessage);
        });
        process.stdout.write(`${updated.snapshot.revision.revision}\n`);
      },
    );

  program
    .command('index')
    .helpGroup('Analysis')
    .option('--repo <alias>', 'one repository alias')
    .option('--ref <ref>', 'Git ref, resolved to an exact commit')
    .option('--json', 'emit canonical machine output')
    .action(async (options: { repo?: string; ref?: string; json?: boolean }) => {
      const current = await LocalWorkspaceConfig.load(process.cwd());
      const repositories = options.repo
        ? [repositoryByAlias(current.snapshot.repositories, options.repo)]
        : current.snapshot.repositories.filter((repository) => repository.selected);
      const reader = new LocalGitRepositoryReader(LocalWorkspaceConfig.repositoryBindings(current));
      const cache = new LocalArtifactObjectCache(resolve(current.root, '.reverb/objects'));
      const clock = new SystemClock();
      const telemetry = new NoopTelemetry();
      const cancellation = new AlwaysCurrentCancellation();
      const results = await withStore(current.root, async (store) => {
        const registryWrite = await store.putRevision(current.snapshot);
        if (!registryWrite.ok) throw new Error(registryWrite.failure.safeMessage);
        const indexed = [];
        for (const repository of repositories) {
          const result = await indexRepository({
            workspace: current,
            repository,
            ref: options.ref ?? repository.defaultBranch,
            reader,
            store,
            cache,
            clock,
            telemetry,
            cancellation,
          });
          indexed.push({
            alias: result.alias,
            commit_sha: result.commitSha,
            generationId: result.generationId,
            state: result.state,
            artifactCount: result.artifactCount,
            reusedArtifactCount: result.reusedArtifactCount,
            coverage: result.coverage,
            diagnostics: result.diagnostics,
            artifactResultHash: result.artifactResultHash,
            contract_coverage: result.contractCoverage,
            definition_count: result.definitionCount,
            reference_count: result.referenceCount,
          });
        }
        return indexed;
      });
      if (options.json) process.stdout.write(`${JSON.stringify(results)}\n`);
      else {
        for (const result of results) {
          process.stdout.write(
            `${result.alias}: ${styleState(result.state)} ${result.artifactCount} artifacts, ${result.definition_count} definitions, ${result.reference_count} references at ${result.commit_sha} (${styleState(result.contract_coverage)} contract coverage)\n`,
          );
        }
      }
    });

  program
    .command('analyze')
    .helpGroup('Analysis')
    .description('preview exact base-to-head cross-repository impact')
    .requiredOption('--repo <alias>', 'producer repository alias')
    .requiredOption('--base <ref>', 'exact base SHA or resolvable Git ref')
    .requiredOption('--head <ref>', 'exact head SHA or resolvable Git ref')
    .option('--pr-number <number>', 'stable local pull request number')
    .option('--limit <count>', 'maximum findings returned', '50')
    .option('--cursor <cursor>', 'pagination cursor')
    .option('--json', 'emit canonical machine output')
    .action(
      async (options: {
        repo: string;
        base: string;
        head: string;
        prNumber?: string;
        limit: string;
        cursor?: string;
        json?: boolean;
      }) => {
        const current = await LocalWorkspaceConfig.load(process.cwd());
        const repository = repositoryByAlias(current.snapshot.repositories, options.repo);
        const reader = new LocalGitRepositoryReader(
          LocalWorkspaceConfig.repositoryBindings(current),
        );
        const cache = new LocalArtifactObjectCache(resolve(current.root, '.reverb/objects'));
        const clock = new SystemClock();
        const telemetry = new NoopTelemetry();
        const cancellation = new AlwaysCurrentCancellation();
        const baseCommit = await reader.resolveCommit(repository.repositoryId, options.base);
        if (!baseCommit.ok) throw new Error(baseCommit.failure.safeMessage);
        const headCommit = await reader.resolveCommit(repository.repositoryId, options.head);
        if (!headCommit.ok) throw new Error(headCommit.failure.safeMessage);
        if (baseCommit.value.sha === headCommit.value.sha) {
          throw new Error('Analysis base and head must be different exact commits.');
        }
        const pullRequestNumber =
          options.prNumber === undefined ? undefined : Number(options.prNumber);
        if (
          pullRequestNumber !== undefined &&
          (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber < 1)
        ) {
          throw new Error('Pull request number must be a positive integer.');
        }
        const paging = pageOptions(options.limit, options.cursor);
        const result = await withStore(current.root, async (store) => {
          const registryWrite = await store.putRevision(current.snapshot);
          if (!registryWrite.ok) throw new Error(registryWrite.failure.safeMessage);
          const common = {
            workspace: current,
            repository,
            reader,
            store,
            cache,
            clock,
            telemetry,
            cancellation,
          };
          const base = await indexRepository({ ...common, ref: baseCommit.value.sha });
          const head = await indexRepository({ ...common, ref: headCommit.value.sha });
          const baseExtraction = await extractContractsAtCommit({
            reader,
            generations: store,
            registry: current.snapshot,
            repositoryId: repository.repositoryId,
            generationId: base.generationId,
            commitSha: baseCommit.value.sha,
            observedAt: clock.now(),
          });
          const headExtraction = await extractContractsAtCommit({
            reader,
            generations: store,
            registry: current.snapshot,
            repositoryId: repository.repositoryId,
            generationId: head.generationId,
            commitSha: headCommit.value.sha,
            observedAt: clock.now(),
          });
          const diffs = await Promise.all(
            INITIAL_ADAPTERS.map((adapter, index) =>
              adapter.diff({
                base: baseExtraction.extractions[index]!,
                head: headExtraction.extractions[index]!,
                configRevision: current.snapshot.revision.configRevision,
                context: {},
              }),
            ),
          );
          const changes = materializeContractChanges({
            workspaceId: current.snapshot.revision.workspaceId,
            producerRepositoryId: repository.repositoryId,
            baseGenerationId: base.generationId,
            headGenerationId: head.generationId,
            baseSha: baseCommit.value.sha,
            headSha: headCommit.value.sha,
            diffs,
          });
          const policyMajor = 1;
          const policy = policyRevision(
            `pol_${hashCanonical({ policyMajor, mode: 'local_preview' })}`,
          );
          const runKey = analysisSupersessionKey({
            workspaceId: current.snapshot.revision.workspaceId,
            producerRepositoryId: repository.repositoryId,
            provider: 'local',
            ...(pullRequestNumber === undefined ? {} : { pullRequestNumber }),
            policyMajor,
          });
          const overlay = overlayId(createSystemId('ovl', clock.now()));
          const overlayBuilder = new CreatePullRequestOverlay({
            reader,
            store,
            clock,
            telemetry,
            cancellation,
          });
          const overlayResult = await overlayBuilder.execute({
            overlayId: overlay,
            leaseId: generationLeaseId(createSystemId('lea', clock.now())),
            leaseExpiresAt: leaseExpiry(clock.now()),
            workspaceId: current.snapshot.revision.workspaceId,
            registryRevision: current.snapshot.revision.revision,
            repositoryId: repository.repositoryId,
            baseGenerationId: base.generationId,
            baseSha: baseCommit.value.sha,
            headSha: headCommit.value.sha,
            configRevision: current.snapshot.revision.configRevision,
            indexerBundleVersion: INDEXER_BUNDLE_VERSION,
            supersessionKey: runKey,
          });
          if (!overlayResult.ok) throw new Error(overlayResult.failure.safeMessage);
          const analyzer = new AnalyzePullRequest({
            generations: store,
            evidence: store,
            reviews: store,
            registry: store,
            clock,
            cancellation,
          });
          const analyzed = await analyzer.execute({
            analysisId: analysisId(createSystemId('ana', clock.now())),
            workspaceId: current.snapshot.revision.workspaceId,
            registryRevision: current.snapshot.revision.revision,
            policyRevision: policy,
            policyMajor,
            producerRepositoryId: repository.repositoryId,
            baseGenerationId: base.generationId,
            overlayId: overlay,
            pullRequest: {
              provider: 'local',
              ...(pullRequestNumber === undefined ? {} : { number: pullRequestNumber }),
              baseSha: baseCommit.value.sha,
              headSha: headCommit.value.sha,
            },
            changes,
            producerDefinitions: base.observation.definitions,
            producerHeadObservation: head.observation,
          });
          if (!analyzed.ok) throw new Error(analyzed.failure.safeMessage);
          return analyzed.value;
        });
        const findings = result.findings.slice(paging.offset, paging.offset + paging.limit);
        const nextOffset = paging.offset + findings.length;
        const nextCursor = nextOffset < result.findings.length ? `offset:${nextOffset}` : null;
        if (options.json) {
          process.stdout.write(
            `${JSON.stringify({
              schema: 'reverb.analysis-page',
              schema_version: '1.0',
              total_findings: result.findings.length,
              returned_findings: findings.length,
              next_cursor: nextCursor,
              result: canonicalProjection({ ...result, findings }),
            })}\n`,
          );
        } else {
          process.stdout.write(
            `analysis ${result.state}: ${result.pullRequest.baseSha} -> ${result.pullRequest.headSha}; ${result.findings.length} findings, ${result.abstentions.length} abstentions\n`,
          );
          for (const finding of findings) {
            process.stdout.write(
              `${finding.fingerprint} ${finding.change.compatibility} ${finding.edge.consumerRepositoryId} ${finding.change.canonicalKey}\n  remedy: ${finding.remedy.text}\n`,
            );
          }
          for (const abstention of result.abstentions) {
            process.stdout.write(
              `abstained ${abstention.consumerRepositoryId}: ${abstention.reason}\n`,
            );
          }
          if (nextCursor !== null) process.stdout.write(`next cursor: ${nextCursor}\n`);
          process.stdout.write('preview only: evidence strata are not calibrated for delivery\n');
        }
      },
    );

  const finding = program
    .command('finding')
    .helpGroup('Analysis')
    .description('inspect persisted finding evidence');
  finding
    .command('show')
    .argument('<fingerprint>')
    .option('--json', 'emit canonical machine output')
    .action(async (fingerprintValue: string, options: { json?: boolean }) => {
      const current = await LocalWorkspaceConfig.load(process.cwd());
      const value = findingFingerprint(fingerprintValue);
      const found = await withStore(current.root, async (store) =>
        store.findFinding(current.snapshot.revision.workspaceId, value),
      );
      if (!found.ok) throw new Error(found.failure.safeMessage);
      if (options.json) {
        process.stdout.write(`${JSON.stringify(canonicalProjection(found.value))}\n`);
      } else {
        process.stdout.write(
          `${found.value.finding.fingerprint} ${found.value.finding.state}\nproducer ${found.value.analysis.producerRepositoryId} ${found.value.analysis.pullRequest.baseSha} -> ${found.value.analysis.pullRequest.headSha}\nconsumer ${found.value.finding.edge.consumerRepositoryId} ${found.value.finding.consumer.commitSha ?? 'generation unavailable'}\ncontract ${found.value.finding.change.contractKind} ${found.value.finding.change.canonicalKey}\nremedy ${found.value.finding.remedy.text}\n`,
        );
      }
    });

  const review = program
    .command('review')
    .helpGroup('Governance')
    .description('append human labels and inspect immutable review history');
  review
    .command('add')
    .argument('<fingerprint>')
    .requiredOption('--edge <label>', EDGE_LABELS.join('|'))
    .requiredOption('--impact <label>', IMPACT_LABELS.join('|'))
    .requiredOption('--action <label>', ACTION_LABELS.join('|'))
    .requiredOption('--reason <code>', REVIEW_REASON_CODES.join('|'))
    .requiredOption('--actor <id>', 'stable reviewer identity')
    .option('--role <role>', REVIEW_ROLES.join('|'), 'reviewer')
    .requiredOption('--capability <description>', 'reviewer domain capability')
    .option('--note <text>', 'bounded reviewer note', 'No additional reviewer note.')
    .option('--detector-author-conflict', 'record a detector-author conflict', false)
    .option('--suppress-scope <scope>', SUPPRESSION_SCOPES.join('|'))
    .option('--suppression-justification <text>')
    .option('--suppression-review-at <instant>')
    .option('--suppression-expires-at <instant>')
    .option('--rule-id <id>', 'adapter/workspace rule identifier')
    .option('--json', 'emit canonical machine output')
    .action(
      async (
        fingerprintValue: string,
        options: {
          edge: string;
          impact: string;
          action: string;
          reason: string;
          actor: string;
          role: string;
          capability: string;
          note: string;
          detectorAuthorConflict: boolean;
          suppressScope?: string;
          suppressionJustification?: string;
          suppressionReviewAt?: string;
          suppressionExpiresAt?: string;
          ruleId?: string;
          json?: boolean;
        },
      ) => {
        const current = await LocalWorkspaceConfig.load(process.cwd());
        const fingerprintValueType = findingFingerprint(fingerprintValue);
        const edgeLabel = enumValue(EDGE_LABELS, options.edge, 'edge label');
        const impactLabel = enumValue(IMPACT_LABELS, options.impact, 'impact label');
        const actionLabel = enumValue(ACTION_LABELS, options.action, 'action label');
        const reason = enumValue(REVIEW_REASON_CODES, options.reason, 'review reason');
        const role = enumValue(REVIEW_ROLES, options.role, 'review role');
        const now = new SystemClock().now();
        const result = await withStore(current.root, async (store) => {
          const found = await store.findFinding(
            current.snapshot.revision.workspaceId,
            fingerprintValueType,
          );
          if (!found.ok) throw new Error(found.failure.safeMessage);
          const findingValue = found.value.finding;
          const history = await store.listReviews(
            current.snapshot.revision.workspaceId,
            fingerprintValueType,
          );
          if (!history.ok) throw new Error(history.failure.safeMessage);
          const previous = [...history.value]
            .filter((value) => value.findingOccurrenceId === findingValue.id)
            .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
            .at(-1);
          let matcher: SuppressionMatcher | undefined;
          if (options.suppressScope !== undefined) {
            const scope = enumValue(SUPPRESSION_SCOPES, options.suppressScope, 'suppression scope');
            if (
              options.suppressionJustification === undefined ||
              options.suppressionReviewAt === undefined ||
              options.suppressionExpiresAt === undefined
            ) {
              throw new Error(
                'Suppression scope requires justification, review-at, and expires-at.',
              );
            }
            matcher =
              scope === 'occurrence'
                ? { scope, occurrenceId: findingValue.id }
                : scope === 'stable_finding'
                  ? { scope, fingerprint: findingValue.fingerprint }
                  : scope === 'contract_consumer'
                    ? {
                        scope,
                        contractKind: findingValue.change.contractKind,
                        canonicalContractKey: findingValue.change.canonicalKey,
                        consumerRepositoryId: findingValue.edge.consumerRepositoryId,
                      }
                    : scope === 'repository_pair_kind'
                      ? {
                          scope,
                          producerRepositoryId: found.value.analysis.producerRepositoryId,
                          consumerRepositoryId: findingValue.edge.consumerRepositoryId,
                          contractKind: findingValue.change.contractKind,
                        }
                      : scope === 'adapter_rule'
                        ? {
                            scope,
                            adapterId: findingValue.change.adapterId,
                            ruleId: options.ruleId ?? findingValue.change.changeKind,
                          }
                        : {
                            scope,
                            ruleId: options.ruleId ?? findingValue.change.changeKind,
                          };
          }
          const suppression =
            matcher === undefined
              ? undefined
              : createSuppressionRule({
                  workspaceId: current.snapshot.revision.workspaceId,
                  matcher,
                  owner: {
                    actorId: options.actor,
                    role,
                    authorizationRevision: current.snapshot.revision.revision,
                  },
                  justification: options.suppressionJustification!,
                  createdAt: now,
                  reviewAt: instant(options.suppressionReviewAt!),
                  expiresAt: instant(options.suppressionExpiresAt!),
                  invalidationPredicates: [
                    {
                      kind: 'producer_code',
                      repositoryId: found.value.analysis.producerRepositoryId,
                      generationId: findingValue.edge.producerGenerationId,
                    },
                    {
                      kind: 'consumer_code',
                      repositoryId: findingValue.edge.consumerRepositoryId,
                      generationId: findingValue.edge.consumerGenerationId,
                    },
                    {
                      kind: 'consumer_reference',
                      stableReferenceId: findingValue.edge.stableReferenceId,
                      contentHash: findingValue.edge.reference.contentHash,
                    },
                    {
                      kind: 'contract_shape',
                      contractKind: findingValue.change.contractKind,
                      canonicalContractKey: findingValue.change.canonicalKey,
                      shapeHash: findingValue.edge.definition.shapeHash,
                    },
                    {
                      kind: 'identity_version',
                      adapterId: findingValue.change.adapterId,
                      identityVersion: findingValue.change.identityVersion,
                    },
                    {
                      kind: 'adapter_version',
                      adapterId: findingValue.change.adapterId,
                      adapterVersion: findingValue.change.adapterVersion,
                    },
                    { kind: 'evidence_stratum', stratumKey: findingValue.edge.stratumKey },
                    { kind: 'policy_revision', revision: found.value.analysis.policyRevision },
                    { kind: 'registry_revision', revision: found.value.analysis.registryRevision },
                  ],
                });
          const adapters = new Map(
            [findingValue.edge.definition, findingValue.edge.reference].map((value) => [
              value.adapterId,
              {
                id: value.adapterId,
                version: value.adapterVersion,
                identityVersion: value.identityVersion,
              },
            ]),
          );
          const recorded = await new RecordReview(store, store).execute({
            review: {
              id: reviewEventId(createSystemId('rev', now)),
              workspaceId: current.snapshot.revision.workspaceId,
              findingOccurrenceId: findingValue.id,
              findingFingerprint: findingValue.fingerprint,
              actor: {
                id: options.actor,
                role,
                domainCapability: options.capability,
                detectorAuthorConflict: options.detectorAuthorConflict,
              },
              authorization: {
                revision: current.snapshot.revision.revision,
                authorizedAt: now,
                permission: 'finding.review',
              },
              occurredAt: now,
              versions: {
                producerGenerationId: findingValue.edge.producerGenerationId,
                consumerGenerationId: findingValue.edge.consumerGenerationId,
                adapters: [...adapters.values()],
                evidenceStratum: findingValue.edge.stratumKey,
                policyRevision: found.value.analysis.policyRevision,
                registryRevision: found.value.analysis.registryRevision,
              },
              labels: { edge: edgeLabel, impact: impactLabel, action: actionLabel },
              reason,
              noteHash: contentHash(hashCanonical(options.note)),
              ...(previous === undefined ? {} : { supersedes: previous.id }),
              ...(suppression === undefined ? {} : { suppressionRuleId: suppression.id }),
            },
            ...(suppression === undefined ? {} : { suppression }),
          });
          if (!recorded.ok) throw new Error(recorded.failure.safeMessage);
          return { event: recorded.value, suppression };
        });
        if (options.json) process.stdout.write(`${JSON.stringify(canonicalProjection(result))}\n`);
        else {
          process.stdout.write(`recorded ${result.event.id} for ${fingerprintValueType}\n`);
          if (result.suppression !== undefined) {
            process.stdout.write(
              `suppression ${result.suppression.id} (${result.suppression.matcher.scope})\n`,
            );
          }
        }
      },
    );
  review
    .command('list')
    .argument('<fingerprint>')
    .option('--json', 'emit canonical machine output')
    .action(async (fingerprintValue: string, options: { json?: boolean }) => {
      const current = await LocalWorkspaceConfig.load(process.cwd());
      const events = await withStore(current.root, (store) =>
        store.listReviews(
          current.snapshot.revision.workspaceId,
          findingFingerprint(fingerprintValue),
        ),
      );
      if (!events.ok) throw new Error(events.failure.safeMessage);
      if (options.json)
        process.stdout.write(`${JSON.stringify(canonicalProjection(events.value))}\n`);
      else {
        events.value.forEach((event) =>
          process.stdout.write(
            `${event.id} ${event.labels.edge}/${event.labels.impact}/${event.labels.action} ${event.reason}\n`,
          ),
        );
      }
    });
  review
    .command('import')
    .argument('<jsonl>')
    .description('import canonical review-event records, optionally bundled with suppressions')
    .action(async (path: string) => {
      const current = await LocalWorkspaceConfig.load(process.cwd());
      const lines = (await readFile(resolve(path), 'utf8'))
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      const imported = await withStore(current.root, async (store) => {
        let count = 0;
        for (const line of lines) {
          const wrapper = record(JSON.parse(line) as unknown, 'Review import line');
          const eventWire = wrapper.event ?? wrapper;
          const suppressionWire = wrapper.suppression;
          validateWithSchema(reviewEventSchema.$id, eventWire);
          if (suppressionWire !== undefined) {
            validateWithSchema(suppressionRuleSchema.$id, suppressionWire);
          }
          const event = domainProjection(eventWire) as ReviewEvent;
          const suppression =
            suppressionWire === undefined
              ? undefined
              : (domainProjection(suppressionWire) as SuppressionRule);
          const outputHash = event.outputHash;
          const draft = { ...event };
          Reflect.deleteProperty(draft, 'schema');
          Reflect.deleteProperty(draft, 'schemaVersion');
          Reflect.deleteProperty(draft, 'outputHash');
          const result = await new RecordReview(store, store).execute({
            review: draft,
            ...(suppression === undefined ? {} : { suppression }),
          });
          if (!result.ok) throw new Error(result.failure.safeMessage);
          if (result.value.outputHash !== outputHash) {
            throw new Error('Imported review output_hash does not match canonical content.');
          }
          count += 1;
        }
        return count;
      });
      process.stdout.write(`${JSON.stringify({ imported_reviews: imported })}\n`);
    });

  const corpus = program
    .command('corpus')
    .helpGroup('Governance')
    .description('manage frozen evaluation corpora');
  corpus
    .command('import')
    .argument('<manifest>', 'JSON bundle containing canonical manifest and cases')
    .action(async (path: string) => {
      const current = await LocalWorkspaceConfig.load(process.cwd());
      const bundle = await loadCorpusBundle(path);
      await withStore(current.root, async (store) => {
        const result = await store.putCorpus(bundle.manifest, bundle.cases);
        if (!result.ok) throw new Error(result.failure.safeMessage);
      });
      process.stdout.write(
        `${JSON.stringify({ corpus_revision: bundle.manifest.revision, cases: bundle.cases.length })}\n`,
      );
    });

  program
    .command('eval')
    .helpGroup('Governance')
    .description('evaluate a frozen corpus without rerunning adapters or models')
    .requiredOption('--corpus <revision>')
    .option('--policy <file>', 'also replay a frozen candidate policy')
    .option('--json', 'emit canonical machine output')
    .action(async (options: { corpus: string; policy?: string; json?: boolean }) => {
      const current = await LocalWorkspaceConfig.load(process.cwd());
      const generatedAt = new SystemClock().now();
      const result = await withStore(current.root, async (store) => {
        const corpusResult = await store.getCorpus(contentHash(options.corpus));
        if (!corpusResult.ok) throw new Error(corpusResult.failure.safeMessage);
        const evaluation = evaluateCorpus({
          corpusRevision: corpusResult.value.manifest.revision,
          generatedAt,
          cases: corpusResult.value.cases,
        });
        const write = await store.putEvaluationReport(evaluation);
        if (!write.ok) throw new Error(write.failure.safeMessage);
        if (options.policy === undefined) return { evaluation };
        const candidate = frozenPolicy(await readJson(options.policy));
        const baseline: FrozenPolicy = {
          revision: policyRevision(
            `pol_${hashCanonical({
              corpusRevision: corpusResult.value.manifest.revision,
              mode: 'no_delivery_baseline',
            })}`,
          ),
          allowedStrata: [],
          allowedImpactClaims: ['breaking', 'behavior_risk'],
          respectFrozenSuppressions: true,
          maximumAlertsPerThousand: 0,
        };
        return {
          evaluation,
          policySimulation: simulateFrozenPolicy({
            corpusRevision: corpusResult.value.manifest.revision,
            cases: corpusResult.value.cases,
            baseline,
            candidate,
          }),
        };
      });
      if (options.json) process.stdout.write(`${JSON.stringify(canonicalProjection(result))}\n`);
      else {
        process.stdout.write(
          `evaluation ${result.evaluation.outputHash}: ${result.evaluation.realWorld.independentlyLabeledCases} independently labelled real-world cases\n`,
        );
        if ('policySimulation' in result) {
          process.stdout.write(`policy simulation ${result.policySimulation.resultHash}\n`);
        }
      }
    });

  const policyCommands = program
    .command('policy')
    .helpGroup('Governance')
    .description('replay frozen delivery policies');
  policyCommands
    .command('simulate')
    .argument('<file>', 'candidate policy JSON')
    .requiredOption('--corpus <revision>')
    .option('--baseline <file>', 'baseline policy JSON')
    .option('--json', 'emit canonical machine output')
    .action(
      async (path: string, options: { corpus: string; baseline?: string; json?: boolean }) => {
        const current = await LocalWorkspaceConfig.load(process.cwd());
        const candidate = frozenPolicy(await readJson(path));
        const result = await withStore(current.root, async (store) => {
          const corpusResult = await store.getCorpus(contentHash(options.corpus));
          if (!corpusResult.ok) throw new Error(corpusResult.failure.safeMessage);
          const baseline =
            options.baseline === undefined
              ? {
                  revision: policyRevision(
                    `pol_${hashCanonical({
                      corpusRevision: corpusResult.value.manifest.revision,
                      mode: 'no_delivery_baseline',
                    })}`,
                  ),
                  allowedStrata: [],
                  allowedImpactClaims: ['breaking', 'behavior_risk'] as const,
                  respectFrozenSuppressions: true,
                  maximumAlertsPerThousand: 0,
                }
              : frozenPolicy(await readJson(options.baseline));
          return simulateFrozenPolicy({
            corpusRevision: corpusResult.value.manifest.revision,
            cases: corpusResult.value.cases,
            baseline,
            candidate,
          });
        });
        if (options.json) process.stdout.write(`${JSON.stringify(canonicalProjection(result))}\n`);
        else {
          process.stdout.write(
            `${result.resultHash}: baseline ${result.baseline.deliveries}, candidate ${result.candidate.deliveries} deliveries\n`,
          );
        }
      },
    );

  const promotion = program
    .command('promotion')
    .helpGroup('Governance')
    .description('append promotion audit decisions');
  promotion
    .command('decide')
    .argument('<evidence>', 'frozen promotion evidence JSON')
    .requiredOption('--actor <id>')
    .option('--json', 'emit canonical machine output')
    .action(async (path: string, options: { actor: string; json?: boolean }) => {
      const current = await LocalWorkspaceConfig.load(process.cwd());
      const evidence = domainProjection(await readJson(path)) as PromotionEvidence;
      const decidedAt = new SystemClock().now();
      const decision = await withStore(current.root, async (store) => {
        const history = await store.listPromotions(evidence.stratumKey);
        if (!history.ok) throw new Error(history.failure.safeMessage);
        const previous = [...history.value]
          .sort((left, right) => left.decidedAt.localeCompare(right.decidedAt))
          .at(-1);
        const recordValue = decidePromotion({
          ...(previous === undefined ? {} : { previous }),
          evidence,
          decidedAt,
          decidedBy: options.actor,
        });
        const stored = await store.appendPromotion(recordValue);
        if (!stored.ok) throw new Error(stored.failure.safeMessage);
        return recordValue;
      });
      if (options.json) process.stdout.write(`${JSON.stringify(canonicalProjection(decision))}\n`);
      else {
        process.stdout.write(
          `${decision.id} ${decision.stratumKey}: ${decision.state} (${decision.reasons.join(', ') || 'gate passed'})\n`,
        );
      }
    });

  program
    .command('status')
    .helpGroup('Operations')
    .option('--json', 'emit JSON')
    .action(async (options: { json?: boolean }) => {
      const current = await LocalWorkspaceConfig.load(process.cwd());
      const statuses = await withStore(current.root, async (store) => {
        const output = [];
        for (const repository of current.snapshot.repositories) {
          const selected = await store.selectGeneration({
            workspaceId: current.snapshot.revision.workspaceId,
            repositoryId: repository.repositoryId,
            allowPartial: true,
          });
          const observation =
            selected.ok && selected.value.state === 'selected'
              ? await store.getContractObservation(selected.value.generation.id)
              : null;
          output.push({
            alias: repository.alias,
            repository_id: repository.repositoryId,
            selected:
              selected.ok && selected.value.state === 'selected'
                ? {
                    generation_id: selected.value.generation.id,
                    commit_sha: selected.value.generation.commitSha,
                    state: selected.value.generation.state,
                    selected_at: selected.value.generation.completedAt,
                    contracts:
                      observation?.ok && observation.value !== null
                        ? {
                            coverage: observation.value.coverageState,
                            definitions: observation.value.definitions.length,
                            references: observation.value.references.length,
                            observed_at: observation.value.observedAt,
                          }
                        : null,
                  }
                : null,
          });
        }
        return output;
      });
      if (options.json) process.stdout.write(`${JSON.stringify(statuses)}\n`);
      else {
        for (const status of statuses) {
          process.stdout.write(
            `${status.alias}: ${status.selected ? `${styleState(status.selected.state)} ${status.selected.commit_sha}; contracts ${styleState(status.selected.contracts?.coverage ?? 'not indexed')} (${status.selected.contracts?.definitions ?? 0} definitions, ${status.selected.contracts?.references ?? 0} references)` : styleState('not indexed')}\n`,
          );
        }
      }
    });

  program
    .command('doctor')
    .helpGroup('Operations')
    .option('--json', 'emit JSON')
    .action(async (options: { json?: boolean }) => {
      const checks: { name: string; state: 'pass' | 'fail'; detail: string }[] = [];
      const nodeMajor = Number(process.versions.node.split('.')[0]);
      checks.push({
        name: 'node',
        state: nodeMajor >= 24 ? 'pass' : 'fail',
        detail: `Node ${process.versions.node}`,
      });
      try {
        const current = await LocalWorkspaceConfig.load(process.cwd());
        checks.push({
          name: 'workspace',
          state: 'pass',
          detail: current.snapshot.revision.revision,
        });
        const reader = new LocalGitRepositoryReader(
          LocalWorkspaceConfig.repositoryBindings(current),
        );
        for (const repository of current.snapshot.repositories) {
          const resolved = await reader.resolveRepository(repository.repositoryId);
          checks.push({
            name: `repository:${repository.alias}`,
            state: resolved.ok ? 'pass' : 'fail',
            detail: resolved.ok ? 'Git root is readable' : resolved.failure.code,
          });
        }
        await withStore(current.root, async (store) => {
          checks.push({
            name: 'sqlite',
            state: store.migrationVersions().includes(1) ? 'pass' : 'fail',
            detail: `migrations=${store.migrationVersions().join(',')}`,
          });
        });
        for (const adapter of INITIAL_ADAPTERS) {
          checks.push({
            name: `adapter:${adapter.manifest.id}`,
            state: 'pass',
            detail: `${adapter.manifest.version}; identity v${adapter.manifest.identityVersion}; preview UNMEASURED; ${adapter.manifest.limitations.join('; ')}`,
          });
        }
      } catch (error) {
        checks.push({
          name: 'workspace',
          state: 'fail',
          detail: error instanceof Error ? error.message : 'Workspace check failed',
        });
      }
      if (options.json) process.stdout.write(`${JSON.stringify({ checks })}\n`);
      else
        checks.forEach((check) =>
          process.stdout.write(`${styleState(check.state)}: ${check.name} — ${check.detail}\n`),
        );
      if (checks.some((check) => check.state === 'fail')) process.exitCode = 3;
    });

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  const cli = await createCli();
  try {
    await cli.parseAsync(argv);
  } catch (error) {
    process.stderr.write(
      `${styleRuntimeError(error instanceof Error ? error.message : 'Reverb command failed.')}\n`,
    );
    process.exitCode = 5;
  }
}
