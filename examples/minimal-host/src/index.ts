import type {
  AnalysisId,
  AnalysisResult,
  ContentHash,
  RepositoryStableId,
  WorkspaceId,
} from '@yanibhq/reverb-domain';

export class MinimalMemoryHost {
  public readonly capabilities = Object.freeze({
    hostId: 'reverb.example.memory',
    conformanceVersion: '1.0.0' as const,
    persistence: 'ephemeral' as const,
    source: 'injected' as const,
    externalDelivery: 'projection_only' as const,
    reviews: false,
    disclosureProjection: true,
    deletionPropagation: true,
    unsupportedOptionalPorts: [
      'provider_webhooks',
      'durable_jobs',
      'external_delivery',
      'artifact_blob_store',
    ],
  });

  readonly #analyses = new Map<string, AnalysisResult>();
  readonly #current = new Map<string, AnalysisId>();

  public async putAnalysis(result: AnalysisResult, supersessionKey: ContentHash): Promise<void> {
    const key = `${result.workspaceId}\0${result.analysisId}`;
    const existing = this.#analyses.get(key);
    if (existing && existing.outputHash !== result.outputHash) {
      throw new Error('An immutable analysis ID cannot be overwritten.');
    }
    this.#analyses.set(key, result);
    if (result.current) {
      this.#current.set(`${result.workspaceId}\0${supersessionKey}`, result.analysisId);
    }
  }

  public async getAnalysis(
    workspaceId: WorkspaceId,
    analysisId: AnalysisId,
  ): Promise<AnalysisResult | null> {
    return this.#analyses.get(`${workspaceId}\0${analysisId}`) ?? null;
  }

  public async getCurrentAnalysis(
    workspaceId: WorkspaceId,
    supersessionKey: ContentHash,
  ): Promise<AnalysisResult | null> {
    const analysisId = this.#current.get(`${workspaceId}\0${supersessionKey}`);
    return analysisId ? this.getAnalysis(workspaceId, analysisId) : null;
  }

  public async purgeRepository(
    workspaceId: WorkspaceId,
    repositoryId: RepositoryStableId,
  ): Promise<void> {
    for (const [key, result] of this.#analyses) {
      if (result.workspaceId === workspaceId && result.producerRepositoryId === repositoryId) {
        this.#analyses.delete(key);
      }
    }
    for (const [key, analysisId] of this.#current) {
      if (!key.startsWith(`${workspaceId}\0`)) continue;
      if ((await this.getAnalysis(workspaceId, analysisId)) === null) this.#current.delete(key);
    }
  }

  public async close(): Promise<void> {}
}
