import assert from 'node:assert/strict';

import {
  adapterId,
  analysisId,
  commitSha,
  configRevision,
  contentHash,
  evidenceEdgeId,
  finalizeAnalysisResult,
  generationId,
  generationLeaseId,
  instant,
  policyRevision,
  registryRevision,
  repoPath,
  repositoryStableId,
  stableReferenceId,
  treeHash,
  workspaceId,
  type AnalysisResult,
  type ContractGenerationObservation,
  type EvidenceEdge,
  type GenerationId,
  type IndexedContractDefinition,
  type IndexedContractReference,
  type RepositoryStableId,
} from '@yanib/reverb-domain';
import type { EvidenceGraphStore, GenerationStore } from '@yanib/reverb-application';

const workspace = workspaceId('wsp_01990f64-0000-7000-8000-000000000090');
const producer = repositoryStableId(`local:sha256:${'1'.repeat(64)}`);
const consumer = repositoryStableId(`local:sha256:${'2'.repeat(64)}`);
const producerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000090');
const consumerGeneration = generationId('gen_01990f64-0000-7000-8000-000000000091');
const partialGeneration = generationId('gen_01990f64-0000-7000-8000-000000000092');
const completeGeneration = generationId('gen_01990f64-0000-7000-8000-000000000093');
const producerSha = commitSha('a'.repeat(40));
const consumerSha = commitSha('b'.repeat(40));
const now = instant('2026-08-28T20:00:00.000Z');
const later = instant('2026-08-28T21:00:00.000Z');
const latest = instant('2026-08-28T22:00:00.000Z');
const config = configRevision(`cfg_sha256:${'c'.repeat(64)}`);
const registry = registryRevision(`reg_sha256:${'d'.repeat(64)}`);
const hash = contentHash(`sha256:${'e'.repeat(64)}`);

async function selectableGeneration(
  store: GenerationStore,
  id: GenerationId,
  repositoryId: RepositoryStableId,
  sha: ReturnType<typeof commitSha>,
  sequence: number,
): Promise<void> {
  const lease = await store.beginGeneration({
    generationId: id,
    workspaceId: workspace,
    repositoryId,
    commitSha: sha,
    treeHash: treeHash(sequence.toString(16).repeat(40).slice(0, 40)),
    indexerBundleVersion: 'graph-1.0.0',
    configRevision: config,
    registryRevision: registry,
    startedAt: now,
    leaseId: generationLeaseId(
      `lea_01990f64-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`,
    ),
    leaseExpiresAt: later,
  });
  assert.equal(lease.ok, true);
  if (!lease.ok) throw new Error('Graph conformance generation lease was not created.');
  assert.equal(
    (
      await store.putArtifacts(lease.value, {
        artifacts: [],
        diagnostics: [],
        coverage: [],
      })
    ).ok,
    true,
  );
  assert.equal(
    (
      await store.completeGeneration(lease.value, {
        state: 'complete',
        completedAt: later,
        selectable: true,
        coverage: [],
        diagnostics: [],
        coverageHash: hash,
        artifactResultHash: hash,
      })
    ).ok,
    true,
  );
}

const definition: IndexedContractDefinition = {
  workspaceId: workspace,
  repositoryId: producer,
  generationId: producerGeneration,
  commitSha: producerSha,
  serviceId: 'svc.producer',
  contractKind: 'typescript_symbol',
  canonicalKey: 'typescript:@acme/api#Pet',
  path: repoPath('src/pet.ts'),
  contentHash: hash,
  shapeHash: hash,
  adapterId: adapterId('reverb.typescript'),
  adapterVersion: '1.0.0',
  identityVersion: 1,
  configRevision: config,
  evidenceStratum: 'export_symbol',
};

const reference: IndexedContractReference = {
  workspaceId: workspace,
  repositoryId: consumer,
  generationId: consumerGeneration,
  commitSha: consumerSha,
  consumerServiceId: 'svc.consumer',
  contractKind: 'typescript_symbol',
  canonicalKey: definition.canonicalKey,
  stableReferenceId: stableReferenceId(`ref_sha256:${'f'.repeat(64)}`),
  path: repoPath('src/client.ts'),
  contentHash: hash,
  adapterId: adapterId('reverb.typescript'),
  adapterVersion: '1.0.0',
  identityVersion: 1,
  configRevision: config,
  evidenceStratum: 'import_symbol',
  activation: 'on_deploy',
};

const edge: EvidenceEdge = {
  id: evidenceEdgeId(`edg_sha256:${'1'.repeat(64)}`),
  workspaceId: workspace,
  producerRepositoryId: producer,
  consumerRepositoryId: consumer,
  producerGenerationId: producerGeneration,
  consumerGenerationId: consumerGeneration,
  definitionKey: definition.canonicalKey,
  stableReferenceId: reference.stableReferenceId,
  contractKind: 'typescript_symbol',
  basis: 'exact',
  primaryPath: {
    id: 'producer_definition.consumer_reference',
    steps: [
      {
        id: 'producer_definition',
        required: true,
        basis: 'exact',
        sourceKey: definition.canonicalKey,
      },
      {
        id: 'consumer_reference',
        required: true,
        basis: 'exact',
        sourceKey: reference.stableReferenceId,
      },
    ],
  },
  stratumKey: 'typescript_symbol|exact|v1',
  registryRevision: registry,
  firstObservedAt: now,
  lastObservedAt: now,
  definition,
  reference,
};

function observation(
  generation: GenerationId,
  sha: ReturnType<typeof commitSha>,
  coverageState: ContractGenerationObservation['coverageState'],
  references: readonly IndexedContractReference[],
  observedAt: ReturnType<typeof instant>,
  output: string,
): ContractGenerationObservation {
  return {
    workspaceId: workspace,
    repositoryId: consumer,
    generationId: generation,
    commitSha: sha,
    coverageState,
    definitions: [],
    references,
    observedAt,
    outputHash: contentHash(`sha256:${output.repeat(64)}`),
  };
}

function analysis(sequence: number, head: string): AnalysisResult {
  return finalizeAnalysisResult({
    schema: 'reverb.analysis-result',
    schemaVersion: '1.0',
    analysisId: analysisId(
      `ana_01990f64-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`,
    ),
    workspaceId: workspace,
    producerRepositoryId: producer,
    pullRequest: {
      provider: 'local',
      number: 12,
      baseSha: producerSha,
      headSha: commitSha(head.repeat(40)),
    },
    registryRevision: registry,
    policyRevision: policyRevision(`pol_sha256:${'2'.repeat(64)}`),
    policyMajor: 1,
    state: 'complete',
    current: true,
    consumers: [],
    findings: [],
    abstentions: [],
    startedAt: now,
    completedAt: later,
  });
}

export interface GraphConformanceStoreHandle {
  readonly store: GenerationStore & EvidenceGraphStore;
  close(): void | Promise<void>;
}

export type GraphConformanceStoreFactory = () =>
  | GraphConformanceStoreHandle
  | Promise<GraphConformanceStoreHandle>;

export async function runEvidenceGraphStoreConformance(
  factory: GraphConformanceStoreFactory,
): Promise<void> {
  const handle = await factory();
  try {
    await selectableGeneration(handle.store, producerGeneration, producer, producerSha, 90);
    await selectableGeneration(handle.store, consumerGeneration, consumer, consumerSha, 91);
    const producerObservation: ContractGenerationObservation = {
      workspaceId: workspace,
      repositoryId: producer,
      generationId: producerGeneration,
      commitSha: producerSha,
      coverageState: 'complete',
      definitions: [definition],
      references: [],
      observedAt: now,
      outputHash: contentHash(`sha256:${'3'.repeat(64)}`),
    };
    assert.equal((await handle.store.putContractObservation(producerObservation)).ok, true);
    const consumerObservation = observation(
      consumerGeneration,
      consumerSha,
      'complete',
      [reference],
      now,
      '4',
    );
    assert.equal((await handle.store.putContractObservation(consumerObservation)).ok, true);
    assert.equal((await handle.store.putContractObservation(consumerObservation)).ok, true);
    assert.equal(
      (
        await handle.store.putContractObservation({
          ...consumerObservation,
          outputHash: contentHash(`sha256:${'5'.repeat(64)}`),
        })
      ).ok,
      false,
    );
    const definitions = await handle.store.readDefinitions({
      workspaceId: workspace,
      generationId: producerGeneration,
      canonicalKeys: [definition.canonicalKey],
    });
    assert.equal(definitions.ok, true);
    if (definitions.ok) assert.deepEqual(definitions.value, [definition]);
    const references = await handle.store.readReferences({
      workspaceId: workspace,
      generationIds: [consumerGeneration],
      canonicalKeys: [definition.canonicalKey],
    });
    assert.equal(references.ok, true);
    if (references.ok) assert.deepEqual(references.value, [reference]);

    assert.equal((await handle.store.observeEdges([edge])).ok, true);
    assert.deepEqual(await handle.store.rebuildServiceEdges(workspace), { ok: true, value: 1 });
    const current = await handle.store.readEdges({
      workspaceId: workspace,
      currentAt: later,
      freshnessTtlMs: 3_600_000,
    });
    assert.equal(current.ok, true);
    if (current.ok) assert.equal(current.value.length, 1);

    const partialSha = commitSha('6'.repeat(40));
    await selectableGeneration(handle.store, partialGeneration, consumer, partialSha, 92);
    assert.equal(
      (
        await handle.store.putContractObservation(
          observation(partialGeneration, partialSha, 'partial', [], later, '6'),
        )
      ).ok,
      true,
    );
    const afterPartial = await handle.store.readEdges({ workspaceId: workspace });
    assert.equal(afterPartial.ok, true);
    if (afterPartial.ok) assert.equal(afterPartial.value[0]?.invalidatedAt, undefined);

    const completeSha = commitSha('7'.repeat(40));
    await selectableGeneration(handle.store, completeGeneration, consumer, completeSha, 93);
    assert.equal(
      (
        await handle.store.putContractObservation(
          observation(completeGeneration, completeSha, 'complete', [], latest, '7'),
        )
      ).ok,
      true,
    );
    const afterComplete = await handle.store.readEdges({ workspaceId: workspace });
    assert.equal(afterComplete.ok, true);
    if (afterComplete.ok) {
      assert.equal(afterComplete.value[0]?.invalidatedAt, latest);
      assert.equal(afterComplete.value[0]?.invalidationReason, 'complete_reference_absence');
    }
    assert.deepEqual(await handle.store.rebuildServiceEdges(workspace), { ok: true, value: 0 });

    const key = contentHash(`sha256:${'8'.repeat(64)}`);
    const first = analysis(1, '8');
    const second = analysis(2, '9');
    assert.equal((await handle.store.persistAnalysis(first, key)).ok, true);
    assert.equal((await handle.store.persistAnalysis(second, key)).ok, true);
    const prior = await handle.store.getAnalysis(first.analysisId);
    assert.equal(prior.ok, true);
    if (prior.ok) assert.deepEqual([prior.value.state, prior.value.current], ['superseded', false]);
    const selected = await handle.store.getCurrentAnalysis(key);
    assert.equal(selected.ok, true);
    if (selected.ok) assert.equal(selected.value?.analysisId, second.analysisId);
  } finally {
    await handle.close();
  }
}
