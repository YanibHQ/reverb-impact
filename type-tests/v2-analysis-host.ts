import type {
  AnalysisResultStoreV2,
  AnalyzePullRequestV2Input,
  RepositoryCoverageSourceV2,
} from '@yanib/reverb-application';
import type { AdapterFamilyV2, AnalysisCoverageV2 } from '@yanib/reverb-domain';
import { PostgresHostedStore } from '@yanib/reverb-storage-postgres';
import { SqliteStore } from '@yanib/reverb-storage-sqlite';
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

const sqlite: AnalysisResultStoreV2 = null as unknown as SqliteStore;
const postgres: AnalysisResultStoreV2 = null as unknown as PostgresHostedStore;
const memory: AnalysisResultStoreV2 = new InMemoryAnalysisResultStoreV2();

void families;
void input.enabledAdapterFamilies;
void coverage.repositories;
void source.readRepositoryCoverage;
void sqlite.persistAnalysisV2;
void postgres.getAnalysisV2;
void memory;
