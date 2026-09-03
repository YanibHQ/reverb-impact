import { ADAPTER_OPENAPI_PACKAGE_ID } from '@yanib/reverb-adapter-openapi';
import { ADAPTER_PROTOBUF_PACKAGE_ID } from '@yanib/reverb-adapter-protobuf';
import {
  ADAPTER_SDK_PACKAGE_ID,
  type ContractAdapter,
  type ContractReference,
} from '@yanib/reverb-adapter-sdk';
import {
  ADAPTER_TYPESCRIPT_PACKAGE_ID,
  type ParsedTypeScriptModule,
} from '@yanib/reverb-adapter-typescript';
import {
  APPLICATION_PACKAGE_ID,
  AnalyzePullRequest,
  type ArtifactCacheKey,
} from '@yanib/reverb-application';
import {
  DOMAIN_PACKAGE_ID,
  canonicalJson,
  type AnalysisResult,
  type ContractGenerationObservation,
} from '@yanib/reverb-domain';
import { HOST_GITHUB_PACKAGE_ID, type GitHubHostedRuntimeStore } from '@yanib/reverb-host-github';
import { HOST_LOCAL_PACKAGE_ID, LocalWorkspaceConfig } from '@yanib/reverb-host-local';
import { SCHEMA_MAJOR_VERSION, validateWithSchema } from '@yanib/reverb-schema';
import { PostgresHostedStore, STORAGE_POSTGRES_PACKAGE_ID } from '@yanib/reverb-storage-postgres';
import { SqliteStore, STORAGE_SQLITE_PACKAGE_ID } from '@yanib/reverb-storage-sqlite';
import { TESTKIT_PACKAGE_ID, type CanonicalAnalysisHost } from '@yanib/reverb-testkit';
import { CLI_PACKAGE_ID, createCli } from 'reverb-impact';

// This fixture represents the documented 0.4 host surface. It deliberately imports every package
// only through its root export so a removal or accidental subpath requirement fails compilation.
declare const analysis: AnalysisResult;
declare const head: ContractGenerationObservation;
declare const reference: ContractReference;
declare const adapter: ContractAdapter;
declare const githubStore: GitHubHostedRuntimeStore;
declare const conformance: CanonicalAnalysisHost;
declare const v04ArtifactCacheKey: Omit<ArtifactCacheKey, 'contextHash'>;
declare const v04ParsedTypeScriptModule: Omit<ParsedTypeScriptModule, 'unresolvedExports'>;

// Additive v0.5 context must not make existing v0.4 host values unassignable.
const compatibleArtifactCacheKey: ArtifactCacheKey = v04ArtifactCacheKey;
const compatibleParsedTypeScriptModule: ParsedTypeScriptModule = v04ParsedTypeScriptModule;

const schemaMajor: 1 = SCHEMA_MAJOR_VERSION;
const serialized: string = canonicalJson(analysis);
const validated: void = validateWithSchema('reverb.analysis-result', analysis);

void [
  ADAPTER_OPENAPI_PACKAGE_ID,
  ADAPTER_PROTOBUF_PACKAGE_ID,
  ADAPTER_SDK_PACKAGE_ID,
  ADAPTER_TYPESCRIPT_PACKAGE_ID,
  APPLICATION_PACKAGE_ID,
  DOMAIN_PACKAGE_ID,
  HOST_GITHUB_PACKAGE_ID,
  HOST_LOCAL_PACKAGE_ID,
  STORAGE_POSTGRES_PACKAGE_ID,
  STORAGE_SQLITE_PACKAGE_ID,
  TESTKIT_PACKAGE_ID,
  CLI_PACKAGE_ID,
  AnalyzePullRequest,
  createCli,
  LocalWorkspaceConfig,
  PostgresHostedStore,
  SqliteStore,
  schemaMajor,
  serialized,
  validated,
  head,
  reference,
  adapter,
  githubStore,
  conformance,
  compatibleArtifactCacheKey,
  compatibleParsedTypeScriptModule,
];
