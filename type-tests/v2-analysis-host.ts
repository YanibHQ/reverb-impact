import type {
  AnalysisResultStoreV2,
  AnalyzePullRequestV2Input,
  ReasoningAnalysisPortV2,
  RepositoryCoverageSourceV2,
} from '@yanib/reverb-application';
import type { AdapterFamilyV2, AnalysisCoverageV2 } from '@yanib/reverb-domain';
import type {
  ReasoningEngineV1,
  ReasoningPortV1,
  StructuredReasoningRequestV1,
} from '@yanib/reverb-reasoning';
import type { PostgresHostedStore } from '@yanib/reverb-storage-postgres';
import type { SqliteStore } from '@yanib/reverb-storage-sqlite';
import { InMemoryAnalysisResultStoreV2 } from '@yanib/reverb-testkit';

const families = [
  'events',
  'database',
  'implicit_http',
  'configuration',
  'infrastructure',
] as const satisfies readonly AdapterFamilyV2[];

declare const input: AnalyzePullRequestV2Input;
declare const coverage: AnalysisCoverageV2;
declare const source: RepositoryCoverageSourceV2;
declare const engine: ReasoningEngineV1;
declare const provider: ReasoningPortV1;
declare const reasoningRequest: StructuredReasoningRequestV1;

const sqlite: AnalysisResultStoreV2 = null as unknown as SqliteStore;
const postgres: AnalysisResultStoreV2 = null as unknown as PostgresHostedStore;
const memory: AnalysisResultStoreV2 = new InMemoryAnalysisResultStoreV2();
const reasoning: ReasoningAnalysisPortV2 = engine;

void families;
void input.enabledAdapterFamilies;
void coverage.repositories;
void source.readRepositoryCoverage;
void provider.reason(reasoningRequest, new AbortController().signal);
void reasoning.analyze;
void sqlite.persistAnalysisV2;
void postgres.getAnalysisV2;
void memory;
