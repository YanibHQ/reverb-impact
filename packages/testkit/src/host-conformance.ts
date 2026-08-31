import { contentHash, hashCanonical } from '@yanib/reverb-domain';
import type {
  AnalysisId,
  AnalysisResult,
  ContentHash,
  RepositoryStableId,
  WorkspaceId,
} from '@yanib/reverb-domain';

export const HOST_CONFORMANCE_VERSION = '1.0.0';

export interface HostCapabilityDeclaration {
  readonly hostId: string;
  readonly conformanceVersion: typeof HOST_CONFORMANCE_VERSION;
  readonly persistence: 'durable' | 'ephemeral';
  readonly source: 'local_git' | 'github_exact_git' | 'injected' | 'none';
  readonly externalDelivery: 'github_advisory' | 'projection_only' | 'none';
  readonly reviews: boolean;
  readonly disclosureProjection: boolean;
  readonly deletionPropagation: boolean;
  readonly unsupportedOptionalPorts: readonly string[];
}

export interface CanonicalAnalysisHost {
  readonly capabilities: HostCapabilityDeclaration;
  putAnalysis(result: AnalysisResult, supersessionKey: ContentHash): Promise<void>;
  getAnalysis(workspaceId: WorkspaceId, analysisId: AnalysisId): Promise<AnalysisResult | null>;
  getCurrentAnalysis(
    workspaceId: WorkspaceId,
    supersessionKey: ContentHash,
  ): Promise<AnalysisResult | null>;
  purgeRepository?(workspaceId: WorkspaceId, repositoryId: RepositoryStableId): Promise<void>;
  close(): Promise<void>;
}

export interface CanonicalHostConformanceCase {
  readonly result: AnalysisResult;
  readonly supersessionKey: ContentHash;
}

export async function runCanonicalHostConformance(input: {
  readonly create: () => Promise<CanonicalAnalysisHost>;
  readonly cases: readonly CanonicalHostConformanceCase[];
  readonly otherWorkspaceId: WorkspaceId;
}): Promise<void> {
  const host = await input.create();
  try {
    if (host.capabilities.conformanceVersion !== HOST_CONFORMANCE_VERSION) {
      throw new Error('Host conformance version is not current.');
    }
    if (host.capabilities.hostId.trim().length === 0) {
      throw new Error('Host capability declaration requires a stable host ID.');
    }
    for (const fixture of input.cases) {
      await host.putAnalysis(fixture.result, fixture.supersessionKey);
      await host.putAnalysis(fixture.result, fixture.supersessionKey);
      const stored = await host.getAnalysis(fixture.result.workspaceId, fixture.result.analysisId);
      if (!stored || hashCanonical(stored) !== hashCanonical(fixture.result)) {
        throw new Error('Host changed canonical analysis semantics.');
      }
      if (
        stored.state !== fixture.result.state ||
        stored.current !== fixture.result.current ||
        hashCanonical(stored.consumers) !== hashCanonical(fixture.result.consumers) ||
        hashCanonical(stored.findings) !== hashCanonical(fixture.result.findings) ||
        hashCanonical(stored.abstentions) !== hashCanonical(fixture.result.abstentions)
      ) {
        throw new Error('Host changed state, coverage, finding, or abstention semantics.');
      }
      const current = await host.getCurrentAnalysis(
        fixture.result.workspaceId,
        fixture.supersessionKey,
      );
      if (fixture.result.current && current?.analysisId !== fixture.result.analysisId) {
        throw new Error('Host did not preserve the current supersession result.');
      }
      if ((await host.getAnalysis(input.otherWorkspaceId, fixture.result.analysisId)) !== null) {
        throw new Error('Host exposed an analysis across workspaces.');
      }
    }
    const immutableFixture = input.cases[input.cases.length - 1];
    if (immutableFixture) {
      const conflicting: AnalysisResult = {
        ...immutableFixture.result,
        outputHash: contentHash(`sha256:${'f'.repeat(64)}`),
      };
      try {
        await host.putAnalysis(conflicting, immutableFixture.supersessionKey);
      } catch {
        // Hosts may expose immutable conflicts as rejection or an idempotent no-op.
      }
      const unchanged = await host.getAnalysis(
        immutableFixture.result.workspaceId,
        immutableFixture.result.analysisId,
      );
      if (!unchanged || hashCanonical(unchanged) !== hashCanonical(immutableFixture.result)) {
        throw new Error('Host allowed an immutable analysis conflict to overwrite canonical data.');
      }
    }
    const latestBySupersessionKey = new Map<ContentHash, AnalysisResult>();
    for (const fixture of input.cases) {
      if (fixture.result.current)
        latestBySupersessionKey.set(fixture.supersessionKey, fixture.result);
    }
    for (const [supersessionKey, expected] of latestBySupersessionKey) {
      const current = await host.getCurrentAnalysis(expected.workspaceId, supersessionKey);
      if (current?.analysisId !== expected.analysisId) {
        throw new Error('Host did not advance a supersession pointer to the latest result.');
      }
    }
    if (host.capabilities.deletionPropagation && host.purgeRepository === undefined) {
      throw new Error('Host declares deletion propagation without implementing purgeRepository.');
    }
    if (host.capabilities.deletionPropagation && host.purgeRepository && input.cases[0]) {
      const first = input.cases[0].result;
      await host.purgeRepository(first.workspaceId, first.producerRepositoryId);
      if ((await host.getAnalysis(first.workspaceId, first.analysisId)) !== null) {
        throw new Error('Host did not propagate repository deletion to canonical analyses.');
      }
    }
  } finally {
    await host.close();
  }
}
