import {
  contentHash,
  hashCanonical,
  repoPath,
  type BoundedDiagnostic,
  type ConfigRevision,
  type ContentHash,
  type RepoPath,
} from '@yanib/reverb-domain';
import {
  AdapterValidationError,
  assertComparableExtractionsV2,
  canonicalShape,
  finalizeDiffV2,
  finalizeExtractionV2,
  type AdapterCoverageV2,
  type AdapterDiffResultV2,
  type AdapterInvalidationPlan,
  type AdapterPartitionBuildV2,
  type AdapterPartitionDescriptor,
  type AdapterPartitionUpdateResultV2,
  type AdapterPartitionViewV2,
  type AdapterPathChange,
  type ArtifactInput,
  type ContractChangeV2,
  type ContractDefinitionV2,
  type ContractReferenceV2,
  type ExtractRequestV2,
  type IncrementalContractAdapterV2,
  type SourceRange,
} from '@yanib/reverb-adapter-sdk';

import { databaseColumnKey, databaseEnumKey, databaseTableKey } from './identity.js';
import { DATABASE_ADAPTER_MANIFEST } from './manifest.js';
import {
  parseDatabaseSource,
  type DatabaseColumnShape,
  type DatabaseQueryReference,
  type DatabaseSchemaOperation,
  type LocatedFact,
  type PrismaClientReference,
  type PrismaEnumReference,
  type PrismaModelReference,
  type QualifiedDatabaseName,
} from './parser.js';

const decoder = new TextDecoder('utf-8', { fatal: true });
const manifest = DATABASE_ADAPTER_MANIFEST;

interface ParsedDatabaseDocument {
  readonly state: 'parsed';
  readonly path: RepoPath;
  readonly contentHash: ContentHash;
  readonly classification: ArtifactInput['classification'];
  readonly databaseNamespace: string;
  readonly lineStarts: readonly number[];
  readonly operations: readonly DatabaseSchemaOperation[];
  readonly sqlReferences: readonly DatabaseQueryReference[];
  readonly prismaModels: readonly PrismaModelReference[];
  readonly prismaEnums: readonly PrismaEnumReference[];
  readonly prismaQueries: readonly PrismaClientReference[];
  readonly limitations: readonly string[];
}

interface IncompleteDatabaseDocument {
  readonly state: 'incomplete';
  readonly path: RepoPath;
  readonly contentHash: ContentHash;
  readonly classification: ArtifactInput['classification'];
  readonly reason:
    | 'database_namespace_missing'
    | 'generated_migration_excluded'
    | 'unsupported_sql_dialect';
}

interface FailedDatabaseDocument {
  readonly state: 'failed';
  readonly path: RepoPath;
  readonly contentHash: ContentHash;
  readonly classification: ArtifactInput['classification'];
  readonly reason: 'byte_limit' | 'parse_failure';
}

type DatabaseDocumentFact =
  | ParsedDatabaseDocument
  | IncompleteDatabaseDocument
  | FailedDatabaseDocument;

interface DatabasePartitionPayload extends Readonly<Record<string, unknown>> {
  readonly schema: 'reverb.database-partition';
  readonly schemaVersion: '1.0';
  readonly document: DatabaseDocumentFact;
}

interface LocatedState {
  readonly databaseNamespace: string;
  readonly path: RepoPath;
  readonly range: SourceRange;
  readonly contentHash: ContentHash;
}

interface TableState extends LocatedState {
  readonly target: QualifiedDatabaseName;
}

interface ColumnState extends LocatedState {
  readonly target: QualifiedDatabaseName;
  readonly column: DatabaseColumnShape;
}

interface EnumState extends LocatedState {
  readonly target: QualifiedDatabaseName;
  readonly values: readonly string[];
}

const evidenceVersion = {
  extractorId: manifest.id,
  extractorVersion: manifest.version,
  extractionVersion: manifest.extractionVersion,
  identityVersion: manifest.identityVersion,
  partitioningVersion: manifest.partitioningVersion,
  compatibilityVersion: manifest.compatibilityVersion,
} as const;

function diagnostic(
  code: BoundedDiagnostic['code'],
  severity: BoundedDiagnostic['severity'],
  message: string,
  scope?: RepoPath,
): BoundedDiagnostic {
  return scope === undefined
    ? { code, severity, safeMessage: message.slice(0, 256) }
    : { code, severity, safeMessage: message.slice(0, 256), scope };
}

function boundedContextText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= 512 && !normalized.includes('\0')
    ? normalized
    : undefined;
}

function databaseNamespace(context: Readonly<Record<string, unknown>>): string | undefined {
  const direct = boundedContextText(context.databaseNamespace);
  if (direct !== undefined) return direct;
  const namespaces = context.databaseNamespaces;
  if (typeof namespaces !== 'object' || namespaces === null || Array.isArray(namespaces)) {
    return undefined;
  }
  return boundedContextText((namespaces as Readonly<Record<string, unknown>>).postgresql);
}

function defaultSchema(context: Readonly<Record<string, unknown>>): string {
  return boundedContextText(context.defaultDatabaseSchema) ?? 'public';
}

function isProbableDatabaseArtifact(path: RepoPath, text: string): boolean {
  return (
    /(?:^|\/)(?:migrations?|schema)(?:\/|\.|$)/i.test(path) ||
    /\.(?:sql|prisma)$/i.test(path) ||
    /\b(?:create|alter|drop)\s+(?:table|type)\b|\b(?:select|insert|update|delete)\b|\b(?:model|enum)\s+[A-Za-z_]|\b(?:prisma|db)\.[A-Za-z_]|\b(?:query|execute)\s*\(/i.test(
      text,
    )
  );
}

function isProbableDatabasePath(path: RepoPath): boolean {
  return /(?:^|\/)(?:migrations?|schema)(?:\/|\.|$)/i.test(path) || /\.(?:sql|prisma)$/i.test(path);
}

function parseArtifact(
  artifact: ArtifactInput,
  context: Readonly<Record<string, unknown>>,
): DatabaseDocumentFact | null {
  if (artifact.classification === 'vendored' || artifact.classification === 'test') return null;
  if (artifact.bytes.byteLength > manifest.resourceBudget.maximumInputBytes) {
    let probable = isProbableDatabasePath(artifact.path);
    if (!probable) {
      try {
        probable = isProbableDatabaseArtifact(
          artifact.path,
          decoder.decode(artifact.bytes.slice(0, 65_536)),
        );
      } catch {
        probable = false;
      }
    }
    return probable
      ? {
          state: 'failed',
          path: artifact.path,
          contentHash: artifact.contentHash,
          classification: artifact.classification,
          reason: 'byte_limit',
        }
      : null;
  }
  let text: string;
  try {
    text = decoder.decode(artifact.bytes);
  } catch {
    return isProbableDatabasePath(artifact.path)
      ? {
          state: 'failed',
          path: artifact.path,
          contentHash: artifact.contentHash,
          classification: artifact.classification,
          reason: 'parse_failure',
        }
      : null;
  }
  const probable = isProbableDatabaseArtifact(artifact.path, text);
  if (!probable) return null;
  if (artifact.classification === 'generated') {
    return {
      state: 'incomplete',
      path: artifact.path,
      contentHash: artifact.contentHash,
      classification: artifact.classification,
      reason: 'generated_migration_excluded',
    };
  }
  const dialect = boundedContextText(context.sqlDialect) ?? 'postgresql';
  if (dialect !== 'postgresql') {
    return {
      state: 'incomplete',
      path: artifact.path,
      contentHash: artifact.contentHash,
      classification: artifact.classification,
      reason: 'unsupported_sql_dialect',
    };
  }
  const namespace = databaseNamespace(context);
  if (namespace === undefined) {
    return {
      state: 'incomplete',
      path: artifact.path,
      contentHash: artifact.contentHash,
      classification: artifact.classification,
      reason: 'database_namespace_missing',
    };
  }
  try {
    const parsed = parseDatabaseSource(text, {
      defaultSchema: defaultSchema(context),
      maximumItems: manifest.resourceBudget.maximumItems,
    });
    if (!parsed.probable) return null;
    const lineStarts = [0, ...[...text.matchAll(/\n/g)].map((match) => match.index + 1)];
    if (lineStarts.length > manifest.resourceBudget.maximumItems) {
      throw new Error('database_line_limit');
    }
    return {
      state: 'parsed',
      path: artifact.path,
      contentHash: artifact.contentHash,
      classification: artifact.classification,
      databaseNamespace: namespace,
      lineStarts,
      operations: parsed.operations,
      sqlReferences: parsed.sqlReferences,
      prismaModels: parsed.prismaModels,
      prismaEnums: parsed.prismaEnums,
      prismaQueries: parsed.prismaQueries,
      limitations: parsed.limitations,
    };
  } catch {
    return {
      state: 'failed',
      path: artifact.path,
      contentHash: artifact.contentHash,
      classification: artifact.classification,
      reason: 'parse_failure',
    };
  }
}

function approximateRange(document: ParsedDatabaseDocument, fact: LocatedFact): SourceRange {
  const position = (offset: number) => {
    let line = 0;
    while (line + 1 < document.lineStarts.length && document.lineStarts[line + 1]! <= offset) {
      line += 1;
    }
    return { line: line + 1, column: offset - document.lineStarts[line]! + 1 };
  };
  const start = position(fact.offset);
  const end = position(fact.offset + fact.length);
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

function tableStateKey(namespace: string, target: QualifiedDatabaseName): string {
  return `${namespace}\0${target.schemaName}\0${target.objectName}`;
}

function columnStateKey(
  namespace: string,
  target: QualifiedDatabaseName,
  columnName: string,
): string {
  return `${tableStateKey(namespace, target)}\0${columnName}`;
}

function enumStateKey(namespace: string, target: QualifiedDatabaseName): string {
  return `${namespace}\0${target.schemaName}\0${target.objectName}`;
}

function location(document: ParsedDatabaseDocument, fact: LocatedFact): LocatedState {
  return {
    databaseNamespace: document.databaseNamespace,
    path: document.path,
    range: approximateRange(document, fact),
    contentHash: document.contentHash,
  };
}

function applyOperations(documents: readonly ParsedDatabaseDocument[]) {
  const tables = new Map<string, TableState>();
  const columns = new Map<string, ColumnState>();
  const enums = new Map<string, EnumState>();
  const limitations: { readonly code: string; readonly scope: RepoPath }[] = [];
  const missingBase = (document: ParsedDatabaseDocument) => {
    limitations.push({ code: 'migration_base_missing', scope: document.path });
  };
  for (const document of documents) {
    for (const operation of [...document.operations].sort(
      (left, right) => left.offset - right.offset,
    )) {
      const tableKey = tableStateKey(document.databaseNamespace, operation.target);
      if (operation.kind === 'create_table') {
        tables.set(tableKey, { target: operation.target, ...location(document, operation) });
        for (const column of operation.columns) {
          columns.set(columnStateKey(document.databaseNamespace, operation.target, column.name), {
            target: operation.target,
            column,
            ...location(document, operation),
          });
        }
      } else if (operation.kind === 'drop_table') {
        if (!tables.has(tableKey)) missingBase(document);
        tables.delete(tableKey);
        for (const key of columns.keys()) {
          if (key.startsWith(`${tableKey}\0`)) columns.delete(key);
        }
      } else if (operation.kind === 'rename_table') {
        const prior = tables.get(tableKey);
        if (prior === undefined) {
          missingBase(document);
          continue;
        }
        const nextTableKey = tableStateKey(document.databaseNamespace, operation.newTarget);
        tables.delete(tableKey);
        tables.set(nextTableKey, {
          target: operation.newTarget,
          ...location(document, operation),
        });
        for (const [key, priorColumn] of [...columns.entries()]) {
          if (!key.startsWith(`${tableKey}\0`)) continue;
          columns.delete(key);
          columns.set(
            columnStateKey(
              document.databaseNamespace,
              operation.newTarget,
              priorColumn.column.name,
            ),
            {
              target: operation.newTarget,
              column: priorColumn.column,
              ...location(document, operation),
            },
          );
        }
      } else if (operation.kind === 'add_column') {
        if (!tables.has(tableKey)) {
          missingBase(document);
          continue;
        }
        columns.set(
          columnStateKey(document.databaseNamespace, operation.target, operation.column.name),
          { target: operation.target, column: operation.column, ...location(document, operation) },
        );
      } else if (operation.kind === 'alter_column') {
        const key = columnStateKey(
          document.databaseNamespace,
          operation.target,
          operation.column.name,
        );
        const prior = columns.get(key);
        if (prior === undefined) {
          missingBase(document);
          continue;
        }
        columns.set(key, {
          target: operation.target,
          column: {
            ...operation.column,
            nullable:
              operation.column.nullable === 'unknown'
                ? (prior?.column.nullable ?? 'unknown')
                : operation.column.nullable,
          },
          ...location(document, operation),
        });
      } else if (operation.kind === 'drop_column') {
        const key = columnStateKey(
          document.databaseNamespace,
          operation.target,
          operation.columnName,
        );
        if (!columns.delete(key)) missingBase(document);
      } else if (operation.kind === 'rename_column') {
        const key = columnStateKey(
          document.databaseNamespace,
          operation.target,
          operation.columnName,
        );
        const prior = columns.get(key);
        if (prior === undefined) {
          missingBase(document);
          continue;
        }
        columns.delete(key);
        const column = { ...prior.column, name: operation.newColumnName };
        columns.set(
          columnStateKey(document.databaseNamespace, operation.target, operation.newColumnName),
          { target: operation.target, column, ...location(document, operation) },
        );
      } else if (operation.kind === 'set_column_nullability') {
        const key = columnStateKey(
          document.databaseNamespace,
          operation.target,
          operation.columnName,
        );
        const prior = columns.get(key);
        if (prior !== undefined) {
          columns.set(key, {
            target: operation.target,
            column: { ...prior.column, nullable: operation.nullable },
            ...location(document, operation),
          });
        } else missingBase(document);
      } else if (operation.kind === 'create_enum') {
        enums.set(enumStateKey(document.databaseNamespace, operation.target), {
          target: operation.target,
          values: [...operation.values].sort(),
          ...location(document, operation),
        });
      } else if (operation.kind === 'add_enum_value') {
        const key = enumStateKey(document.databaseNamespace, operation.target);
        const prior = enums.get(key);
        if (prior !== undefined) {
          enums.set(key, {
            target: operation.target,
            values: [...new Set([...prior.values, operation.value])].sort(),
            ...location(document, operation),
          });
        } else missingBase(document);
      } else if (operation.kind === 'rename_enum') {
        const key = enumStateKey(document.databaseNamespace, operation.target);
        const prior = enums.get(key);
        if (prior === undefined) {
          missingBase(document);
          continue;
        }
        enums.delete(key);
        enums.set(enumStateKey(document.databaseNamespace, operation.newTarget), {
          target: operation.newTarget,
          values: prior.values,
          ...location(document, operation),
        });
      } else {
        const key = enumStateKey(document.databaseNamespace, operation.target);
        if (!enums.delete(key)) missingBase(document);
      }
    }
  }
  return { tables, columns, enums, limitations };
}

function definition(
  input: {
    readonly contractKind: ContractDefinitionV2['contractKind'];
    readonly canonicalKey: string;
    readonly displayName: string;
    readonly shape: Readonly<Record<string, unknown>>;
    readonly located: LocatedState;
    readonly evidenceStratum: string;
  },
  configRevision: ConfigRevision,
): ContractDefinitionV2 {
  return {
    contractKind: input.contractKind,
    canonicalKey: input.canonicalKey,
    displayName: input.displayName,
    path: input.located.path,
    range: input.located.range,
    contentHash: input.located.contentHash,
    ...canonicalShape(input.shape),
    ...evidenceVersion,
    configRevision,
    evidenceStratum: input.evidenceStratum,
  };
}

function reference(
  input: {
    readonly contractKind: ContractReferenceV2['contractKind'];
    readonly canonicalKey: string;
    readonly semanticOwner: string;
    readonly document: ParsedDatabaseDocument;
    readonly fact: LocatedFact;
    readonly evidenceStratum: string;
  },
  configRevision: ConfigRevision,
): ContractReferenceV2 {
  return {
    contractKind: input.contractKind,
    canonicalKey: input.canonicalKey,
    semanticOwner: input.semanticOwner,
    path: input.document.path,
    range: approximateRange(input.document, input.fact),
    contentHash: input.document.contentHash,
    ...evidenceVersion,
    configRevision,
    evidenceStratum: input.evidenceStratum,
    activation: 'on_deploy',
  };
}

function contextPrismaModel(
  context: Readonly<Record<string, unknown>>,
  modelName: string,
):
  | {
      readonly target: QualifiedDatabaseName;
      readonly columnMappings: ReadonlyMap<string, string>;
    }
  | undefined {
  const mappings = context.prismaModels;
  if (typeof mappings !== 'object' || mappings === null || Array.isArray(mappings))
    return undefined;
  const raw = (mappings as Readonly<Record<string, unknown>>)[modelName];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const record = raw as Readonly<Record<string, unknown>>;
  const tableName = boundedContextText(record.tableName ?? record.table);
  const schemaName =
    boundedContextText(record.schemaName ?? record.schema) ?? defaultSchema(context);
  if (tableName === undefined) return undefined;
  const rawColumns = record.columns ?? record.fields;
  const columnMappings = new Map<string, string>();
  if (isRecord(rawColumns)) {
    for (const [field, column] of Object.entries(rawColumns)) {
      const fieldName = boundedContextText(field);
      const columnName = boundedContextText(column);
      if (fieldName !== undefined && columnName !== undefined) {
        columnMappings.set(fieldName, columnName);
      }
    }
  }
  return { target: { schemaName, objectName: tableName }, columnMappings };
}

function addReferenceSet(
  references: ContractReferenceV2[],
  document: ParsedDatabaseDocument,
  fact: LocatedFact,
  target: QualifiedDatabaseName,
  columns: readonly string[],
  role: 'reader' | 'writer',
  stratum: 'sql_query' | 'prisma_metadata' | 'prisma_query',
  configRevision: ConfigRevision,
): void {
  const tableKey = databaseTableKey({
    databaseNamespace: document.databaseNamespace,
    schemaName: target.schemaName,
    tableName: target.objectName,
  });
  const owner = `${role}:${stratum}:${target.schemaName}.${target.objectName}`;
  references.push(
    reference(
      {
        contractKind: 'database.table',
        canonicalKey: tableKey,
        semanticOwner: owner,
        document,
        fact,
        evidenceStratum: stratum,
      },
      configRevision,
    ),
  );
  for (const columnName of columns) {
    references.push(
      reference(
        {
          contractKind: 'database.column',
          canonicalKey: databaseColumnKey({ tableKey, columnName }),
          semanticOwner: `${owner}:${columnName}`,
          document,
          fact,
          evidenceStratum: stratum,
        },
        configRevision,
      ),
    );
  }
}

function materialize(
  documents: readonly DatabaseDocumentFact[],
  configRevision: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
) {
  const parsed = documents
    .filter((document): document is ParsedDatabaseDocument => document.state === 'parsed')
    .sort((left, right) => left.path.localeCompare(right.path));
  const state = applyOperations(parsed);
  const definitions: ContractDefinitionV2[] = [];
  const references: ContractReferenceV2[] = [];
  const limitations: AdapterCoverageV2['limitations'][number][] = [];
  const diagnostics: BoundedDiagnostic[] = [];
  let processed = 0;
  let failed = 0;
  for (const limitation of state.limitations) {
    limitations.push(limitation);
    diagnostics.push(
      diagnostic(
        'missing_blob',
        'warning',
        'A migration operation depends on schema state unavailable to this extraction.',
        limitation.scope,
      ),
    );
  }
  for (const document of documents) {
    if (document.state === 'failed') {
      failed += 1;
      limitations.push({ code: document.reason, scope: document.path });
      diagnostics.push(
        diagnostic(
          document.reason === 'byte_limit' ? 'source_truncated' : 'parse_failure',
          'error',
          document.reason === 'byte_limit'
            ? 'Database input exceeds the declared byte limit.'
            : 'Database input could not be parsed safely.',
          document.path,
        ),
      );
    } else if (document.state === 'incomplete') {
      processed += 1;
      limitations.push({ code: document.reason, scope: document.path });
      diagnostics.push(
        diagnostic(
          document.reason === 'generated_migration_excluded'
            ? 'generated_path'
            : 'unsupported_language',
          'warning',
          'Database evidence is outside the configured deterministic capability.',
          document.path,
        ),
      );
    } else {
      processed += 1;
      for (const code of document.limitations) {
        limitations.push({ code, scope: document.path });
        diagnostics.push(
          diagnostic(
            code === 'dynamic_sql' ? 'ambiguous_alias' : 'unsupported_language',
            'warning',
            'Database source contains unsupported or unresolved semantics.',
            document.path,
          ),
        );
      }
      for (const query of document.sqlReferences) {
        addReferenceSet(
          references,
          document,
          query,
          query.target,
          query.columns,
          query.role,
          'sql_query',
          configRevision,
        );
        if (!query.columnsComplete) {
          limitations.push({ code: 'query_columns_unresolved', scope: document.path });
        }
      }
      for (const model of document.prismaModels) {
        addReferenceSet(
          references,
          document,
          model,
          { schemaName: model.schemaName, objectName: model.tableName },
          model.columns,
          'reader',
          'prisma_metadata',
          configRevision,
        );
      }
      for (const enumReference of document.prismaEnums) {
        references.push(
          reference(
            {
              contractKind: 'database.enum',
              canonicalKey: databaseEnumKey({
                databaseNamespace: document.databaseNamespace,
                schemaName: enumReference.schemaName,
                enumName: enumReference.databaseEnumName,
              }),
              semanticOwner: `reader:prisma_metadata:${enumReference.enumName}`,
              document,
              fact: enumReference,
              evidenceStratum: 'prisma_metadata',
            },
            configRevision,
          ),
        );
      }
      for (const query of document.prismaQueries) {
        const mapping = contextPrismaModel(context, query.modelName);
        if (mapping === undefined) {
          limitations.push({ code: 'prisma_model_mapping_missing', scope: document.path });
          continue;
        }
        addReferenceSet(
          references,
          document,
          query,
          mapping.target,
          query.columns.map((column) => mapping.columnMappings.get(column) ?? column),
          query.role,
          'prisma_query',
          configRevision,
        );
        if (!query.columnsComplete) {
          limitations.push({ code: 'query_columns_unresolved', scope: document.path });
        }
      }
    }
  }
  for (const table of state.tables.values()) {
    const key = databaseTableKey({
      databaseNamespace: table.databaseNamespace,
      schemaName: table.target.schemaName,
      tableName: table.target.objectName,
    });
    definitions.push(
      definition(
        {
          contractKind: 'database.table',
          canonicalKey: key,
          displayName: `${table.target.schemaName}.${table.target.objectName}`,
          shape: { schemaName: table.target.schemaName, tableName: table.target.objectName },
          located: table,
          evidenceStratum: 'sql_schema',
        },
        configRevision,
      ),
    );
  }
  for (const column of state.columns.values()) {
    const tableKey = databaseTableKey({
      databaseNamespace: column.databaseNamespace,
      schemaName: column.target.schemaName,
      tableName: column.target.objectName,
    });
    definitions.push(
      definition(
        {
          contractKind: 'database.column',
          canonicalKey: databaseColumnKey({ tableKey, columnName: column.column.name }),
          displayName: `${column.target.schemaName}.${column.target.objectName}.${column.column.name}`,
          shape: {
            tableKey,
            columnName: column.column.name,
            dataType: column.column.dataType,
            nullable: column.column.nullable,
          },
          located: column,
          evidenceStratum: 'sql_schema',
        },
        configRevision,
      ),
    );
  }
  for (const enumState of state.enums.values()) {
    definitions.push(
      definition(
        {
          contractKind: 'database.enum',
          canonicalKey: databaseEnumKey({
            databaseNamespace: enumState.databaseNamespace,
            schemaName: enumState.target.schemaName,
            enumName: enumState.target.objectName,
          }),
          displayName: `${enumState.target.schemaName}.${enumState.target.objectName}`,
          shape: {
            schemaName: enumState.target.schemaName,
            enumName: enumState.target.objectName,
            values: enumState.values,
          },
          located: enumState,
          evidenceStratum: 'sql_schema',
        },
        configRevision,
      ),
    );
  }
  const uniqueLimitations = [
    ...new Map(limitations.map((value) => [`${value.code}\0${value.scope ?? ''}`, value])).values(),
  ].sort((left, right) =>
    `${left.code}\0${left.scope ?? ''}`.localeCompare(`${right.code}\0${right.scope ?? ''}`),
  );
  const coverage: AdapterCoverageV2 = {
    state:
      documents.length === 0
        ? 'unsupported'
        : failed === documents.length
          ? 'failed'
          : failed > 0 || uniqueLimitations.length > 0
            ? 'partial'
            : 'complete',
    eligibleArtifacts: documents.length,
    processedArtifacts: processed,
    skippedArtifacts: 0,
    failedArtifacts: failed,
    limitations:
      documents.length === 0 ? [{ code: 'database_inputs_not_found' }] : uniqueLimitations,
  };
  return { definitions, references, coverage, diagnostics };
}

function sourceFingerprint(documents: readonly DatabaseDocumentFact[]): ContentHash {
  return contentHash(
    hashCanonical(
      documents
        .map((document) => ({
          path: document.path,
          contentHash: document.contentHash,
          classification: document.classification,
          state: document.state,
        }))
        .sort((left, right) => left.path.localeCompare(right.path)),
    ),
  );
}

function extraction(
  documents: readonly DatabaseDocumentFact[],
  configRevision: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
) {
  const result = materialize(documents, configRevision, context);
  return finalizeExtractionV2({
    schema: 'reverb.adapter-extraction',
    schemaVersion: '2.0',
    family: manifest.family,
    adapterId: manifest.id,
    adapterVersion: manifest.version,
    extractionVersion: manifest.extractionVersion,
    identityVersion: manifest.identityVersion,
    partitioningVersion: manifest.partitioningVersion,
    compatibilityVersion: manifest.compatibilityVersion,
    configRevision,
    ...result,
    sourceFingerprint: sourceFingerprint(documents),
  });
}

function partitionKey(path: RepoPath): string {
  return `database-document:${path}`;
}

function buildPartition(
  document: DatabaseDocumentFact,
  configRevision: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
): AdapterPartitionBuildV2 {
  const payload: DatabasePartitionPayload = {
    schema: 'reverb.database-partition',
    schemaVersion: '1.0',
    document,
  };
  return {
    partitionKey: partitionKey(document.path),
    ownedPaths: [document.path],
    dependencyKeys: [],
    payload,
    extraction: extraction([document], configRevision, context),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function boundedPersistedText(value: unknown, maximum = 512): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !value.includes('\0')
  );
}

function validLocatedFact(value: Readonly<Record<string, unknown>>): boolean {
  return (
    Number.isSafeInteger(value.offset) &&
    Number(value.offset) >= 0 &&
    Number.isSafeInteger(value.length) &&
    Number(value.length) > 0 &&
    Number(value.offset) + Number(value.length) <= manifest.resourceBudget.maximumInputBytes
  );
}

function validQualifiedName(value: unknown): value is QualifiedDatabaseName {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['schemaName', 'objectName']) &&
    boundedPersistedText(value.schemaName, 256) &&
    boundedPersistedText(value.objectName, 256)
  );
}

function validColumnShape(value: unknown): value is DatabaseColumnShape {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['name', 'dataType', 'nullable']) &&
    boundedPersistedText(value.name, 256) &&
    boundedPersistedText(value.dataType, 256) &&
    (typeof value.nullable === 'boolean' || value.nullable === 'unknown')
  );
}

function validTextArray(value: unknown, maximum = 512): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= manifest.resourceBudget.maximumItems &&
    value.every((item) => boundedPersistedText(item, maximum))
  );
}

function validOperation(value: unknown): value is DatabaseSchemaOperation {
  if (!isRecord(value) || !validLocatedFact(value) || !validQualifiedName(value.target)) {
    return false;
  }
  const common = ['kind', 'target', 'offset', 'length'];
  if (value.kind === 'create_table') {
    return (
      hasOnlyKeys(value, [...common, 'columns']) &&
      Array.isArray(value.columns) &&
      value.columns.length <= manifest.resourceBudget.maximumItems &&
      value.columns.every(validColumnShape)
    );
  }
  if (value.kind === 'drop_table' || value.kind === 'drop_enum') {
    return hasOnlyKeys(value, common);
  }
  if (value.kind === 'rename_table' || value.kind === 'rename_enum') {
    return hasOnlyKeys(value, [...common, 'newTarget']) && validQualifiedName(value.newTarget);
  }
  if (value.kind === 'add_column' || value.kind === 'alter_column') {
    return hasOnlyKeys(value, [...common, 'column']) && validColumnShape(value.column);
  }
  if (value.kind === 'drop_column') {
    return (
      hasOnlyKeys(value, [...common, 'columnName']) && boundedPersistedText(value.columnName, 256)
    );
  }
  if (value.kind === 'rename_column') {
    return (
      hasOnlyKeys(value, [...common, 'columnName', 'newColumnName']) &&
      boundedPersistedText(value.columnName, 256) &&
      boundedPersistedText(value.newColumnName, 256)
    );
  }
  if (value.kind === 'set_column_nullability') {
    return (
      hasOnlyKeys(value, [...common, 'columnName', 'nullable']) &&
      boundedPersistedText(value.columnName, 256) &&
      typeof value.nullable === 'boolean'
    );
  }
  if (value.kind === 'create_enum') {
    return hasOnlyKeys(value, [...common, 'values']) && validTextArray(value.values);
  }
  if (value.kind === 'add_enum_value') {
    return hasOnlyKeys(value, [...common, 'value']) && boundedPersistedText(value.value);
  }
  return false;
}

function validSqlReference(value: unknown): value is DatabaseQueryReference {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'source',
      'role',
      'target',
      'columns',
      'columnsComplete',
      'offset',
      'length',
    ]) &&
    validLocatedFact(value) &&
    value.source === 'sql_query' &&
    (value.role === 'reader' || value.role === 'writer') &&
    validQualifiedName(value.target) &&
    validTextArray(value.columns, 256) &&
    typeof value.columnsComplete === 'boolean'
  );
}

function validPrismaModel(value: unknown): value is PrismaModelReference {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'source',
      'modelName',
      'tableName',
      'schemaName',
      'columns',
      'offset',
      'length',
    ]) &&
    validLocatedFact(value) &&
    value.source === 'prisma_metadata' &&
    boundedPersistedText(value.modelName, 256) &&
    boundedPersistedText(value.tableName, 256) &&
    boundedPersistedText(value.schemaName, 256) &&
    validTextArray(value.columns, 256)
  );
}

function validPrismaEnum(value: unknown): value is PrismaEnumReference {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'source',
      'enumName',
      'databaseEnumName',
      'schemaName',
      'values',
      'offset',
      'length',
    ]) &&
    validLocatedFact(value) &&
    value.source === 'prisma_metadata' &&
    boundedPersistedText(value.enumName, 256) &&
    boundedPersistedText(value.databaseEnumName, 256) &&
    boundedPersistedText(value.schemaName, 256) &&
    validTextArray(value.values)
  );
}

function validPrismaQuery(value: unknown): value is PrismaClientReference {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'source',
      'role',
      'modelName',
      'columns',
      'columnsComplete',
      'offset',
      'length',
    ]) &&
    validLocatedFact(value) &&
    value.source === 'prisma_query' &&
    (value.role === 'reader' || value.role === 'writer') &&
    boundedPersistedText(value.modelName, 256) &&
    validTextArray(value.columns, 256) &&
    typeof value.columnsComplete === 'boolean'
  );
}

function decodeDocument(payload: Readonly<Record<string, unknown>>): DatabaseDocumentFact {
  if (
    payload.schema !== 'reverb.database-partition' ||
    payload.schemaVersion !== '1.0' ||
    !hasOnlyKeys(payload, ['schema', 'schemaVersion', 'document']) ||
    typeof payload.document !== 'object' ||
    payload.document === null ||
    Array.isArray(payload.document)
  ) {
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Persisted database partition is invalid.',
    );
  }
  const document = payload.document as Readonly<Record<string, unknown>>;
  if (
    typeof document.path !== 'string' ||
    typeof document.contentHash !== 'string' ||
    !['source', 'generated', 'vendored', 'test', 'example'].includes(
      String(document.classification),
    ) ||
    !['parsed', 'incomplete', 'failed'].includes(String(document.state))
  ) {
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Persisted database provenance is invalid.',
    );
  }
  repoPath(document.path);
  contentHash(document.contentHash);
  if (document.state === 'parsed') {
    const lineStarts = document.lineStarts;
    if (
      !hasOnlyKeys(document, [
        'state',
        'path',
        'contentHash',
        'classification',
        'databaseNamespace',
        'lineStarts',
        'operations',
        'sqlReferences',
        'prismaModels',
        'prismaEnums',
        'prismaQueries',
        'limitations',
      ]) ||
      !boundedPersistedText(document.databaseNamespace) ||
      !Array.isArray(lineStarts) ||
      lineStarts.length === 0 ||
      lineStarts.length > manifest.resourceBudget.maximumItems ||
      !lineStarts.every(
        (value, index) =>
          Number.isSafeInteger(value) &&
          Number(value) >= 0 &&
          Number(value) <= manifest.resourceBudget.maximumInputBytes &&
          (index === 0 ? value === 0 : Number(value) > Number(lineStarts[index - 1])),
      ) ||
      !Array.isArray(document.operations) ||
      !document.operations.every(validOperation) ||
      !Array.isArray(document.sqlReferences) ||
      !document.sqlReferences.every(validSqlReference) ||
      !Array.isArray(document.prismaModels) ||
      !document.prismaModels.every(validPrismaModel) ||
      !Array.isArray(document.prismaEnums) ||
      !document.prismaEnums.every(validPrismaEnum) ||
      !Array.isArray(document.prismaQueries) ||
      !document.prismaQueries.every(validPrismaQuery) ||
      !validTextArray(document.limitations) ||
      document.limitations.some(
        (value) =>
          !['stored_procedure_unsupported', 'dynamic_sql', 'database_syntax_unresolved'].includes(
            value,
          ),
      ) ||
      document.operations.length +
        document.sqlReferences.length +
        document.prismaModels.length +
        document.prismaEnums.length +
        document.prismaQueries.length >
        manifest.resourceBudget.maximumItems
    ) {
      throw new AdapterValidationError(
        'invalid_partition_payload',
        'Persisted parsed database state is invalid.',
      );
    }
  } else if (
    !hasOnlyKeys(document, ['state', 'path', 'contentHash', 'classification', 'reason']) ||
    (document.state === 'incomplete'
      ? ![
          'database_namespace_missing',
          'generated_migration_excluded',
          'unsupported_sql_dialect',
        ].includes(String(document.reason))
      : !['byte_limit', 'parse_failure'].includes(String(document.reason)))
  ) {
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Persisted database failure state is invalid.',
    );
  }
  return document as unknown as DatabaseDocumentFact;
}

function decodePartition(
  partition: AdapterPartitionViewV2,
  keys: Set<string>,
): DatabaseDocumentFact {
  const document = decodeDocument(partition.payload);
  if (
    partition.partitionKey !== partitionKey(document.path) ||
    keys.has(partition.partitionKey) ||
    partition.ownedPaths.length !== 1 ||
    partition.ownedPaths[0] !== document.path ||
    partition.dependencyKeys.length !== 0 ||
    partition.outputHash !== contentHash(hashCanonical(partition.payload))
  ) {
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Database partition identity or integrity is invalid.',
    );
  }
  keys.add(partition.partitionKey);
  return document;
}

function databaseCompatibility(
  before: ContractDefinitionV2,
  after: ContractDefinitionV2,
): ContractChangeV2['compatibility'] {
  if (before.contractKind === 'database.enum') {
    const oldValues = new Set(
      Array.isArray(before.shape.values) ? before.shape.values.map(String) : [],
    );
    const newValues = new Set(
      Array.isArray(after.shape.values) ? after.shape.values.map(String) : [],
    );
    if ([...oldValues].some((value) => !newValues.has(value))) return 'breaking';
    if ([...newValues].some((value) => !oldValues.has(value))) return 'potentially_breaking';
    return 'compatible';
  }
  if (before.contractKind === 'database.column') {
    if (before.shape.dataType !== after.shape.dataType) {
      const priorType = String(before.shape.dataType);
      const nextType = String(after.shape.dataType);
      if (isWideningTypeChange(priorType, nextType)) return 'compatible';
      if (isWideningTypeChange(nextType, priorType)) return 'breaking';
      return 'potentially_breaking';
    }
    if (before.shape.nullable !== after.shape.nullable) {
      if (after.shape.nullable === false) return 'breaking';
      if (before.shape.nullable === false && after.shape.nullable === true) return 'compatible';
      return 'potentially_breaking';
    }
  }
  return 'compatible';
}

function isWideningTypeChange(before: string, after: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/^int2$/, 'smallint')
      .replace(/^int4$/, 'integer')
      .replace(/^int8$/, 'bigint')
      .trim();
  const prior = normalize(before);
  const next = normalize(after);
  const ranks = new Map([
    ['smallint', 1],
    ['integer', 2],
    ['bigint', 3],
    ['numeric', 4],
    ['decimal', 4],
  ]);
  const priorRank = ranks.get(prior);
  const nextRank = ranks.get(next);
  if (priorRank !== undefined && nextRank !== undefined) return nextRank >= priorRank;
  if (next === 'text' && /^(?:character varying|varchar)(?:\(\d+\))?$/.test(prior)) return true;
  const priorLength = prior.match(/^(?:character varying|varchar)\((\d+)\)$/)?.[1];
  const nextLength = next.match(/^(?:character varying|varchar)\((\d+)\)$/)?.[1];
  return (
    priorLength !== undefined &&
    nextLength !== undefined &&
    Number(nextLength) >= Number(priorLength)
  );
}

function additionCompatibility(value: ContractDefinitionV2): ContractChangeV2['compatibility'] {
  if (value.contractKind !== 'database.column') return 'compatible';
  return value.shape.nullable === true ? 'compatible' : 'potentially_breaking';
}

function changes(
  base: readonly ContractDefinitionV2[],
  head: readonly ContractDefinitionV2[],
  complete: boolean,
): readonly ContractChangeV2[] {
  const before = new Map(
    base.map((value) => [`${value.contractKind}\0${value.canonicalKey}`, value]),
  );
  const after = new Map(
    head.map((value) => [`${value.contractKind}\0${value.canonicalKey}`, value]),
  );
  const result: ContractChangeV2[] = [];
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const oldValue = before.get(key);
    const newValue = after.get(key);
    const value = oldValue ?? newValue!;
    if (oldValue === undefined) {
      result.push({
        contractKind: value.contractKind,
        canonicalKey: value.canonicalKey,
        changeKind: `${value.contractKind.split('.')[1]}_added`,
        compatibility: complete ? additionCompatibility(value) : 'unknown',
        activation: 'on_deploy',
        headShapeHash: value.shapeHash,
        coverageDependencies: ['database.head.complete'],
        remedy:
          complete && additionCompatibility(value) === 'compatible'
            ? { kind: 'none', text: 'No consumer coordination is required for this addition.' }
            : {
                kind: 'coordinate_database_migration',
                text: 'Review consumers before adding a required database column.',
              },
      });
    } else if (newValue === undefined) {
      result.push({
        contractKind: value.contractKind,
        canonicalKey: value.canonicalKey,
        changeKind: `${value.contractKind.split('.')[1]}_removed`,
        compatibility: complete ? 'breaking' : 'unknown',
        activation: 'on_deploy',
        baseShapeHash: value.shapeHash,
        coverageDependencies: ['database.base.complete', 'database.head.complete'],
        remedy: {
          kind: 'coordinate_database_migration',
          text: 'Coordinate affected database consumers before applying this migration.',
        },
      });
    } else if (oldValue.shapeHash !== newValue.shapeHash) {
      const compatibility = complete ? databaseCompatibility(oldValue, newValue) : 'unknown';
      result.push({
        contractKind: value.contractKind,
        canonicalKey: value.canonicalKey,
        changeKind: `${value.contractKind.split('.')[1]}_changed`,
        compatibility,
        activation: 'on_deploy',
        baseShapeHash: oldValue.shapeHash,
        headShapeHash: newValue.shapeHash,
        coverageDependencies: ['database.base.complete', 'database.head.complete'],
        remedy: {
          kind: compatibility === 'compatible' ? 'none' : 'coordinate_database_migration',
          text:
            compatibility === 'compatible'
              ? 'The bounded schema change is consumer-compatible.'
              : 'Review and coordinate affected database consumers.',
        },
      });
    }
  }
  return result;
}

function updateResult(
  input: Omit<AdapterPartitionUpdateResultV2, 'outputHash'>,
): AdapterPartitionUpdateResultV2 {
  const canonical = {
    ...input,
    replacements: [...input.replacements].sort((left, right) =>
      left.partitionKey.localeCompare(right.partitionKey),
    ),
    tombstones: [...new Set(input.tombstones)].sort(),
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

export const databaseAdapter: IncrementalContractAdapterV2 = new (class {
  public readonly manifest = manifest;

  public async extract(request: ExtractRequestV2) {
    const documents = request.artifacts
      .map((artifact) => parseArtifact(artifact, request.context))
      .filter((value): value is DatabaseDocumentFact => value !== null);
    return extraction(documents, request.configRevision, request.context);
  }

  public async diff(
    request: Parameters<IncrementalContractAdapterV2['diff']>[0],
  ): Promise<AdapterDiffResultV2> {
    assertComparableExtractionsV2(manifest, request.base, request.head, request.configRevision);
    const complete =
      request.base.coverage.state === 'complete' && request.head.coverage.state === 'complete';
    return finalizeDiffV2({
      schema: 'reverb.adapter-diff',
      schemaVersion: '2.0',
      family: manifest.family,
      adapterId: manifest.id,
      adapterVersion: manifest.version,
      extractionVersion: manifest.extractionVersion,
      identityVersion: manifest.identityVersion,
      partitioningVersion: manifest.partitioningVersion,
      compatibilityVersion: manifest.compatibilityVersion,
      changes: changes(request.base.definitions, request.head.definitions, complete),
      coverage: complete
        ? {
            state: 'complete',
            eligibleArtifacts: request.head.coverage.eligibleArtifacts,
            processedArtifacts: request.head.coverage.processedArtifacts,
            skippedArtifacts: request.head.coverage.skippedArtifacts,
            failedArtifacts: 0,
            limitations: [],
          }
        : {
            state: 'partial',
            eligibleArtifacts: request.head.coverage.eligibleArtifacts,
            processedArtifacts: request.head.coverage.processedArtifacts,
            skippedArtifacts: request.head.coverage.skippedArtifacts,
            failedArtifacts: request.head.coverage.failedArtifacts,
            limitations: [{ code: 'incomplete_database_extraction' }],
          },
      diagnostics: [],
    });
  }

  public async buildPartitions(request: ExtractRequestV2) {
    const documents = request.artifacts
      .map((artifact) => parseArtifact(artifact, request.context))
      .filter((value): value is DatabaseDocumentFact => value !== null);
    const partitions = documents.map((document) =>
      buildPartition(document, request.configRevision, request.context),
    );
    const materialized = extraction(documents, request.configRevision, request.context);
    const canonical = {
      partitions,
      coverage: materialized.coverage,
      diagnostics: materialized.diagnostics,
    };
    return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
  }

  public planInvalidation(request: {
    readonly partitions: readonly AdapterPartitionDescriptor[];
    readonly changes: readonly AdapterPathChange[];
    readonly context: Readonly<Record<string, unknown>>;
  }): AdapterInvalidationPlan {
    const owners = new Map(
      request.partitions.flatMap((partition) =>
        partition.ownedPaths.map((path) => [path, partition.partitionKey]),
      ),
    );
    const changedPaths = [
      ...new Set(
        request.changes.flatMap((change) =>
          change.previousPath ? [change.path, change.previousPath] : [change.path],
        ),
      ),
    ].sort() as RepoPath[];
    const directPartitionKeys = [
      ...new Set(
        changedPaths
          .map((path) => owners.get(path))
          .filter((value): value is string => value !== undefined),
      ),
    ].sort();
    const canonical = {
      changedPaths,
      directPartitionKeys,
      dependentPartitionKeys: [] as string[],
      invalidatedPartitionKeys: directPartitionKeys,
      unmatchedPaths: [] as RepoPath[],
      complete: true,
    };
    return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
  }

  public async updatePartitions(
    request: Parameters<IncrementalContractAdapterV2['updatePartitions']>[0],
  ) {
    const logical = new Map<string, DatabaseDocumentFact>();
    try {
      const keys = new Set<string>();
      for (const partition of request.basePartitions) {
        logical.set(partition.partitionKey, decodePartition(partition, keys));
      }
    } catch {
      return updateResult({
        replacements: [],
        tombstones: [],
        coverage: {
          state: 'failed',
          eligibleArtifacts: 1,
          processedArtifacts: 0,
          skippedArtifacts: 0,
          failedArtifacts: 1,
          limitations: [{ code: 'invalid_partition_payload' }],
        },
        diagnostics: [diagnostic('parse_failure', 'error', 'Persisted database state is invalid.')],
      });
    }
    const tombstones = new Set<string>();
    const expectedPaths = new Set<RepoPath>();
    const remove = (path: RepoPath) => {
      const key = partitionKey(path);
      if (logical.delete(key)) tombstones.add(key);
    };
    for (const change of request.changes) {
      remove(change.path);
      if (change.previousPath !== undefined && change.kind !== 'copied')
        remove(change.previousPath);
      if (change.kind !== 'deleted') expectedPaths.add(change.path);
    }
    const replacements = new Map<string, AdapterPartitionBuildV2>();
    const supplied = new Set<RepoPath>();
    for (const artifact of request.changedArtifacts) {
      supplied.add(artifact.path);
      const document = parseArtifact(artifact, request.context);
      if (document === null) continue;
      const replacement = buildPartition(document, request.configRevision, request.context);
      logical.set(replacement.partitionKey, document);
      replacements.set(replacement.partitionKey, replacement);
      tombstones.delete(replacement.partitionKey);
    }
    const missing = [...expectedPaths].filter((path) => !supplied.has(path));
    const materialized = extraction([...logical.values()], request.configRevision, request.context);
    const partial =
      missing.length > 0 || !request.plan.complete || materialized.coverage.state !== 'complete';
    return updateResult({
      replacements: [...replacements.values()],
      tombstones: [...tombstones],
      coverage: partial
        ? {
            ...materialized.coverage,
            state: 'partial',
            limitations: [
              ...materialized.coverage.limitations,
              ...missing.map((path) => ({ code: 'changed_artifact_missing', scope: path })),
            ],
          }
        : materialized.coverage,
      diagnostics: [
        ...materialized.diagnostics,
        ...missing.map((path) =>
          diagnostic('missing_blob', 'error', 'Changed database artifact is unavailable.', path),
        ),
      ],
    });
  }

  public async materializePartitions(
    request: Parameters<IncrementalContractAdapterV2['materializePartitions']>[0],
  ) {
    const keys = new Set<string>();
    const documents = request.partitions.map((partition) => decodePartition(partition, keys));
    return extraction(documents, request.configRevision, request.context);
  }
})();
