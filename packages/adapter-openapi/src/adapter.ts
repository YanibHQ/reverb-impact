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
  DeclaredExternalDiffer,
  assertComparableExtractions,
  canonicalShape,
  finalizeDiff,
  finalizeExtraction,
  type AdapterCoverage,
  type AdapterDiffResult,
  type AdapterInvalidationPlan,
  type AdapterPartitionBuild,
  type AdapterPartitionBuildResult,
  type AdapterPartitionDescriptor,
  type AdapterPartitionUpdateResult,
  type AdapterPartitionView,
  type AdapterPathChange,
  type AdapterSandboxRunner,
  type ArtifactInput,
  type ContractChange,
  type ContractDefinition,
  type ContractReference,
  type DiffRequest,
  type DifferMetadata,
  type ExtractRequest,
  type IncrementalContractAdapter,
} from '@yanib/reverb-adapter-sdk';

import { openApiFallbackKey, openApiOperationKey } from './identity.js';
import { OPENAPI_ADAPTER_MANIFEST } from './manifest.js';
import { isRecord, parseOpenApiDocument } from './parser.js';

const METHODS = ['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace'] as const;
const decoder = new TextDecoder('utf-8', { fatal: true });
const manifest = OPENAPI_ADAPTER_MANIFEST;
const tool = manifest.externalTools[0]!;

interface OpenApiOperationFact {
  readonly path: string;
  readonly method: string;
  readonly operation: Readonly<Record<string, unknown>>;
  readonly range?: ContractDefinition['range'];
}

type OpenApiDocumentFact =
  | {
      readonly state: 'parsed';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly operations: readonly OpenApiOperationFact[];
      readonly hasRemoteReferences: boolean;
      readonly hasUnresolvedLocalReferences: boolean;
    }
  | {
      readonly state: 'failed';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly reason: 'byte_limit' | 'parse_failure';
    };

interface OpenApiPartitionPayload extends Readonly<Record<string, unknown>> {
  readonly schema: 'reverb.openapi-document-partition';
  readonly schemaVersion: '1.0';
  readonly document: OpenApiDocumentFact;
}

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

function contextString(
  context: Readonly<Record<string, unknown>>,
  name: string,
): string | undefined {
  const value = context[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function sourceRange(text: string, token: string): ContractDefinition['range'] {
  const offset = text.indexOf(token);
  if (offset < 0) return undefined;
  const prefix = text.slice(0, offset);
  const lines = prefix.split('\n');
  const startLine = lines.length;
  const startColumn = (lines.at(-1)?.length ?? 0) + 1;
  return { startLine, startColumn, endLine: startLine, endColumn: startColumn + token.length };
}

function operationShape(
  serviceId: string,
  path: string,
  method: string,
  operation: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    serviceId,
    path,
    method,
    operation,
  };
}

function definition(
  document: Pick<OpenApiDocumentFact, 'path' | 'contentHash'>,
  configRevision: ConfigRevision,
  serviceId: string,
  fact: OpenApiOperationFact,
): ContractDefinition {
  const operationId =
    typeof fact.operation.operationId === 'string' ? fact.operation.operationId.trim() : '';
  const exact = operationId.length > 0;
  const identity = exact
    ? openApiOperationKey(serviceId, operationId)
    : openApiFallbackKey(serviceId, fact.method, fact.path);
  const canonical = canonicalShape(
    operationShape(serviceId, fact.path, fact.method, fact.operation),
  );
  return {
    contractKind: 'openapi_operation',
    canonicalKey: identity,
    displayName: exact ? operationId : `${fact.method.toUpperCase()} ${fact.path}`,
    path: document.path,
    ...(fact.range === undefined ? {} : { range: fact.range }),
    contentHash: document.contentHash,
    shapeHash: canonical.shapeHash,
    shape: canonical.shape,
    extractorId: manifest.id,
    extractorVersion: manifest.version,
    identityVersion: manifest.identityVersion,
    configRevision,
    evidenceStratum: exact ? 'operation_id' : 'path_method_fallback',
  };
}

interface ClientBinding {
  readonly operationId: string;
  readonly path: RepoPath;
  readonly contentHash: ContentHash;
}

function clientBindings(context: Readonly<Record<string, unknown>>): readonly ClientBinding[] {
  const raw = context.generatedClientBindings;
  if (!Array.isArray(raw)) return [];
  const bindings: ClientBinding[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.operationId !== 'string' || typeof item.path !== 'string') {
      continue;
    }
    try {
      const path = repoPath(item.path);
      const hash =
        typeof item.contentHash === 'string'
          ? contentHash(item.contentHash)
          : contentHash(hashCanonical({ path, operationId: item.operationId }));
      bindings.push({ operationId: item.operationId, path, contentHash: hash });
    } catch {
      continue;
    }
  }
  return bindings.sort((left, right) =>
    `${left.operationId}\0${left.path}`.localeCompare(`${right.operationId}\0${right.path}`),
  );
}

function references(
  context: Readonly<Record<string, unknown>>,
  configRevision: ExtractRequest['configRevision'],
  serviceId: string | undefined,
): readonly ContractReference[] {
  return clientBindings(context).map((binding) => ({
    contractKind: 'openapi_operation' as const,
    ...(serviceId === undefined
      ? {
          unresolvedPattern: binding.operationId,
          unresolvedReason: 'registry_service_identity_missing',
        }
      : { canonicalKey: openApiOperationKey(serviceId, binding.operationId) }),
    semanticOwner: binding.operationId,
    path: binding.path,
    contentHash: binding.contentHash,
    extractorId: manifest.id,
    extractorVersion: manifest.version,
    identityVersion: manifest.identityVersion,
    configRevision,
    evidenceStratum: 'operation_id',
    activation: 'on_deploy' as const,
  }));
}

function sourceFingerprint(
  documents: readonly OpenApiDocumentFact[],
  context: Readonly<Record<string, unknown>>,
): ContentHash {
  return contentHash(
    hashCanonical({
      documents: documents
        .map(({ path, contentHash: hash, classification, state }) => ({
          path,
          contentHash: hash,
          classification,
          state,
        }))
        .sort((left, right) => left.path.localeCompare(right.path)),
      serviceId: contextString(context, 'serviceId') ?? null,
      clientBindings: clientBindings(context),
    }),
  );
}

function metadata(category = 'oasdiff-breaking'): DifferMetadata {
  return {
    toolId: tool.id,
    toolVersion: tool.version,
    toolDigest: tool.digest,
    toolLicense: tool.license,
    category,
  };
}

function sandboxFrom(context: Readonly<Record<string, unknown>>): AdapterSandboxRunner | undefined {
  const value = context.sandbox;
  if (typeof value !== 'object' || value === null || !('run' in value)) return undefined;
  const run = (value as { readonly run?: unknown }).run;
  return typeof run === 'function' ? (value as AdapterSandboxRunner) : undefined;
}

function compatibleCoverage(base: DiffRequest['base'], head: DiffRequest['head']): boolean {
  return base.coverage.state === 'complete' && head.coverage.state === 'complete';
}

function uniqueDefinitions(values: readonly ContractDefinition[]): {
  readonly definitions: readonly ContractDefinition[];
  readonly ambiguousKeys: ReadonlySet<string>;
} {
  const unique = new Map<string, ContractDefinition>();
  const ambiguousKeys = new Set<string>();
  for (const value of [...values].sort((left, right) =>
    `${left.canonicalKey}\0${left.path}`.localeCompare(`${right.canonicalKey}\0${right.path}`),
  )) {
    if (ambiguousKeys.has(value.canonicalKey)) continue;
    const prior = unique.get(value.canonicalKey);
    if (prior === undefined) unique.set(value.canonicalKey, value);
    else if (prior.shapeHash !== value.shapeHash) {
      unique.delete(value.canonicalKey);
      ambiguousKeys.add(value.canonicalKey);
    }
  }
  return { definitions: [...unique.values()], ambiguousKeys };
}

function parseDocumentFact(artifact: ArtifactInput): OpenApiDocumentFact | null {
  if (artifact.classification === 'vendored' || artifact.classification === 'test') return null;
  let text: string;
  try {
    text = decoder.decode(artifact.bytes);
  } catch {
    return null;
  }
  const probable = /(?:^|\n)\s*["']?openapi["']?\s*:/.test(text);
  if (artifact.bytes.byteLength > manifest.resourceBudget.maximumInputBytes) {
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
  try {
    const parsed = parseOpenApiDocument(text, manifest.resourceBudget.maximumItems);
    if (parsed === null) return null;
    const operations: OpenApiOperationFact[] = [];
    const paths = parsed.document.paths as Readonly<Record<string, unknown>>;
    for (const path of Object.keys(paths).sort()) {
      const pathItem = paths[path];
      if (!isRecord(pathItem)) continue;
      for (const method of METHODS) {
        const operation = pathItem[method];
        if (!isRecord(operation)) continue;
        const operationId =
          typeof operation.operationId === 'string' ? operation.operationId.trim() : '';
        const range = sourceRange(text, operationId.length > 0 ? operationId : path);
        operations.push({
          path,
          method,
          operation,
          ...(range === undefined ? {} : { range }),
        });
      }
    }
    return {
      state: 'parsed',
      path: artifact.path,
      contentHash: artifact.contentHash,
      classification: artifact.classification,
      operations,
      hasRemoteReferences: parsed.remoteReferences.length > 0,
      hasUnresolvedLocalReferences: parsed.unresolvedLocalReferences.length > 0,
    };
  } catch {
    return probable
      ? {
          state: 'failed',
          path: artifact.path,
          contentHash: artifact.contentHash,
          classification: artifact.classification,
          reason: 'parse_failure',
        }
      : null;
  }
}

function materializeDocuments(
  documents: readonly OpenApiDocumentFact[],
  config: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
) {
  const definitions: ContractDefinition[] = [];
  const diagnostics: BoundedDiagnostic[] = [];
  const limitations: AdapterCoverage['limitations'][number][] = [];
  const serviceId = contextString(context, 'serviceId');
  let processed = 0;
  let failed = 0;
  let partial = false;
  for (const document of [...documents].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    if (document.state === 'failed') {
      failed += 1;
      diagnostics.push(
        diagnostic(
          document.reason === 'byte_limit' ? 'source_truncated' : 'parse_failure',
          'error',
          document.reason === 'byte_limit'
            ? 'OpenAPI input exceeds the declared byte limit.'
            : 'OpenAPI input could not be parsed safely.',
          document.path,
        ),
      );
      continue;
    }
    processed += 1;
    if (document.hasRemoteReferences) {
      partial = true;
      limitations.push({ code: 'remote_ref_not_fetched', scope: document.path });
      diagnostics.push(
        diagnostic(
          'parse_failure',
          'warning',
          'Remote OpenAPI references were not fetched; compatibility remains unknown.',
          document.path,
        ),
      );
    }
    if (document.hasUnresolvedLocalReferences) {
      partial = true;
      limitations.push({ code: 'unresolved_local_ref', scope: document.path });
      diagnostics.push(
        diagnostic(
          'parse_failure',
          'warning',
          'One or more local OpenAPI references do not resolve.',
          document.path,
        ),
      );
    }
    for (const operation of document.operations) {
      if (definitions.length >= manifest.resourceBudget.maximumItems) {
        partial = true;
        limitations.push({ code: 'item_limit', scope: document.path });
        break;
      }
      if (serviceId === undefined) {
        partial = true;
        limitations.push({ code: 'registry_service_identity_missing', scope: document.path });
        continue;
      }
      definitions.push(definition(document, config, serviceId, operation));
    }
  }
  const unique = uniqueDefinitions(definitions);
  if (unique.ambiguousKeys.size > 0) {
    partial = true;
    limitations.push({ code: 'ambiguous_operation_identity' });
    diagnostics.push(
      diagnostic(
        'parse_failure',
        'warning',
        'Conflicting OpenAPI operations share an identity and were left unresolved.',
      ),
    );
  }
  const refs = references(context, config, serviceId).map((reference) => {
    if (reference.canonicalKey === undefined || !unique.ambiguousKeys.has(reference.canonicalKey)) {
      return reference;
    }
    return {
      contractKind: reference.contractKind,
      unresolvedPattern: reference.canonicalKey,
      unresolvedReason: 'ambiguous_operation_identity',
      ...(reference.semanticOwner === undefined ? {} : { semanticOwner: reference.semanticOwner }),
      path: reference.path,
      ...(reference.range === undefined ? {} : { range: reference.range }),
      contentHash: reference.contentHash,
      extractorId: reference.extractorId,
      extractorVersion: reference.extractorVersion,
      identityVersion: reference.identityVersion,
      configRevision: reference.configRevision,
      evidenceStratum: reference.evidenceStratum,
      activation: reference.activation,
    } satisfies ContractReference;
  });
  if (refs.some((reference) => reference.canonicalKey === undefined)) partial = true;
  const eligible = documents.length;
  const state: AdapterCoverage['state'] =
    eligible === 0
      ? 'unsupported'
      : failed === eligible
        ? 'failed'
        : failed > 0 || partial
          ? 'partial'
          : 'complete';
  return finalizeExtraction({
    schema: 'reverb.adapter-extraction',
    schemaVersion: '1.0',
    adapterId: manifest.id,
    adapterVersion: manifest.version,
    identityVersion: manifest.identityVersion,
    configRevision: config,
    definitions: unique.definitions,
    references: refs,
    coverage: {
      state,
      eligibleArtifacts: eligible,
      processedArtifacts: processed,
      skippedArtifacts: 0,
      failedArtifacts: failed,
      limitations,
    },
    diagnostics,
    sourceFingerprint: sourceFingerprint(documents, context),
  });
}

function diffCoverage(
  eligible: number,
  changes: number,
  complete: boolean,
  failed = false,
): AdapterCoverage {
  return {
    state: failed ? 'failed' : complete ? 'complete' : 'partial',
    eligibleArtifacts: eligible,
    processedArtifacts: changes,
    skippedArtifacts: Math.max(0, eligible - changes),
    failedArtifacts: failed ? eligible : 0,
    limitations: complete
      ? []
      : [{ code: failed ? 'incompatible_extraction' : 'incomplete_input' }],
  };
}

async function toolState(request: DiffRequest): Promise<{
  readonly state: 'compatible' | 'breaking' | 'unknown' | 'tool_failure';
  readonly failureCode?: string;
}> {
  const sandbox = sandboxFrom(request.context);
  const baseRef = contextString(request.context, 'baseBlobRef');
  const headRef = contextString(request.context, 'headBlobRef');
  if (sandbox === undefined || baseRef === undefined || headRef === undefined) {
    return { state: 'unknown', failureCode: 'differ_input_unavailable' };
  }
  const differ = new DeclaredExternalDiffer(tool, sandbox, {
    timeoutMs: manifest.resourceBudget.timeoutMs,
    memoryMiB: manifest.resourceBudget.memoryMiB,
    maximumOutputBytes: manifest.resourceBudget.maximumOutputBytes,
    exitMap: { compatible: [0], breaking: [1], unknown: [] },
    category: 'oasdiff-breaking',
  });
  return differ.run(
    ['breaking', '--format', 'json', '/inputs/base', '/inputs/head'],
    [baseRef, headRef],
  );
}

function partitionKey(path: RepoPath): string {
  return `document:${path}`;
}

function encodeDocument(document: OpenApiDocumentFact): OpenApiPartitionPayload {
  return {
    schema: 'reverb.openapi-document-partition',
    schemaVersion: '1.0',
    document,
  };
}

function requirePayload(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AdapterValidationError('invalid_partition_payload', message);
}

function decodeDocument(payload: Readonly<Record<string, unknown>>): OpenApiDocumentFact {
  requirePayload(
    payload.schema === 'reverb.openapi-document-partition' && payload.schemaVersion === '1.0',
    'OpenAPI partition payload schema is unsupported.',
  );
  requirePayload(isRecord(payload.document), 'OpenAPI partition document is invalid.');
  const value = payload.document;
  requirePayload(
    typeof value.path === 'string' &&
      typeof value.contentHash === 'string' &&
      ['source', 'generated', 'vendored', 'test', 'example'].includes(
        String(value.classification),
      ) &&
      (value.state === 'parsed' || value.state === 'failed'),
    'OpenAPI partition document fields are invalid.',
  );
  const common = {
    path: repoPath(value.path),
    contentHash: contentHash(value.contentHash),
    classification: value.classification as ArtifactInput['classification'],
  };
  if (value.state === 'failed') {
    requirePayload(
      value.reason === 'byte_limit' || value.reason === 'parse_failure',
      'OpenAPI partition failure is invalid.',
    );
    return { state: 'failed', ...common, reason: value.reason };
  }
  requirePayload(
    Array.isArray(value.operations) &&
      typeof value.hasRemoteReferences === 'boolean' &&
      typeof value.hasUnresolvedLocalReferences === 'boolean',
    'OpenAPI partition parsed document fields are invalid.',
  );
  const operations = value.operations.map((operation): OpenApiOperationFact => {
    requirePayload(
      isRecord(operation) &&
        typeof operation.path === 'string' &&
        typeof operation.method === 'string' &&
        isRecord(operation.operation),
      'OpenAPI partition operation is invalid.',
    );
    return {
      path: operation.path,
      method: operation.method,
      operation: operation.operation,
      ...(operation.range === undefined
        ? {}
        : { range: operation.range as ContractDefinition['range'] }),
    };
  });
  return {
    state: 'parsed',
    ...common,
    operations,
    hasRemoteReferences: value.hasRemoteReferences,
    hasUnresolvedLocalReferences: value.hasUnresolvedLocalReferences,
  };
}

function buildPartition(
  document: OpenApiDocumentFact,
  config: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
): AdapterPartitionBuild {
  return {
    partitionKey: partitionKey(document.path),
    ownedPaths: [document.path],
    dependencyKeys: [],
    payload: encodeDocument(document),
    extraction: materializeDocuments([document], config, context),
  };
}

function buildResult(
  documents: readonly OpenApiDocumentFact[],
  partitions: readonly AdapterPartitionBuild[],
  config: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
): AdapterPartitionBuildResult {
  const extraction = materializeDocuments(documents, config, context);
  const canonical = {
    partitions,
    coverage: extraction.coverage,
    diagnostics: extraction.diagnostics,
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

function updateResult(input: Omit<AdapterPartitionUpdateResult, 'outputHash'>) {
  return { ...input, outputHash: contentHash(hashCanonical(input)) };
}

export class OpenApiContractAdapter implements IncrementalContractAdapter {
  public readonly manifest = manifest;
  public readonly partitioningVersion = 1;

  public async extract(request: ExtractRequest) {
    const documents = request.artifacts.flatMap((artifact) => {
      const fact = parseDocumentFact(artifact);
      return fact === null ? [] : [fact];
    });
    return materializeDocuments(documents, request.configRevision, request.context);
  }

  public async buildPartitions(request: ExtractRequest): Promise<AdapterPartitionBuildResult> {
    const documents = request.artifacts.flatMap((artifact) => {
      const fact = parseDocumentFact(artifact);
      return fact === null ? [] : [fact];
    });
    const partitions = documents.map((document) =>
      buildPartition(document, request.configRevision, request.context),
    );
    return buildResult(documents, partitions, request.configRevision, request.context);
  }

  public planInvalidation(request: {
    readonly partitions: readonly AdapterPartitionDescriptor[];
    readonly changes: readonly AdapterPathChange[];
    readonly context: Readonly<Record<string, unknown>>;
  }): AdapterInvalidationPlan {
    const keys = new Set<string>();
    const owners = new Map<RepoPath, Set<string>>();
    for (const partition of request.partitions) {
      if (keys.has(partition.partitionKey)) {
        throw new AdapterValidationError(
          'invalid_partition_plan',
          'OpenAPI partition keys must be unique.',
        );
      }
      keys.add(partition.partitionKey);
      for (const path of partition.ownedPaths) {
        const values = owners.get(path) ?? new Set<string>();
        values.add(partition.partitionKey);
        owners.set(path, values);
      }
    }
    const changedPaths = [
      ...new Set(
        request.changes.flatMap((change) =>
          change.previousPath === undefined ? [change.path] : [change.path, change.previousPath],
        ),
      ),
    ].sort();
    const direct = new Set<string>();
    for (const path of changedPaths) owners.get(path)?.forEach((key) => direct.add(key));
    const invalidated = new Set(direct);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const partition of request.partitions) {
        if (
          !invalidated.has(partition.partitionKey) &&
          partition.dependencyKeys.some((dependency) => invalidated.has(dependency))
        ) {
          invalidated.add(partition.partitionKey);
          expanded = true;
        }
      }
    }
    const directPartitionKeys = [...direct].sort();
    const invalidatedPartitionKeys = [...invalidated].sort();
    const directSet = new Set(directPartitionKeys);
    const dependentPartitionKeys = invalidatedPartitionKeys.filter((key) => !directSet.has(key));
    const canonical = {
      changedPaths,
      directPartitionKeys,
      dependentPartitionKeys,
      invalidatedPartitionKeys,
      unmatchedPaths: [] as RepoPath[],
      complete: true,
    };
    return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
  }

  public async updatePartitions(request: {
    readonly basePartitions: readonly AdapterPartitionView[];
    readonly plan: AdapterInvalidationPlan;
    readonly changes: readonly AdapterPathChange[];
    readonly changedArtifacts: readonly ArtifactInput[];
    readonly configRevision: ConfigRevision;
    readonly context: Readonly<Record<string, unknown>>;
  }): Promise<AdapterPartitionUpdateResult> {
    const logical = new Map<string, OpenApiDocumentFact>();
    try {
      for (const partition of request.basePartitions) {
        const document = decodeDocument(partition.payload);
        if (
          partition.partitionKey !== partitionKey(document.path) ||
          logical.has(partition.partitionKey)
        ) {
          throw new AdapterValidationError(
            'invalid_partition_payload',
            'OpenAPI partition identity does not match its document.',
          );
        }
        logical.set(partition.partitionKey, document);
      }
    } catch (error) {
      if (!(error instanceof Error)) throw error;
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
        diagnostics: [diagnostic('parse_failure', 'error', 'Persisted OpenAPI state is invalid.')],
      });
    }

    const tombstones = new Set<string>();
    const expectedHeadPaths = new Set<RepoPath>();
    const remove = (path: RepoPath) => {
      const key = partitionKey(path);
      if (logical.delete(key)) tombstones.add(key);
    };
    for (const change of request.changes) {
      remove(change.path);
      if (change.kind !== 'copied' && change.previousPath !== undefined) {
        remove(change.previousPath);
      }
      if (change.kind !== 'deleted') expectedHeadPaths.add(change.path);
    }

    const replacements = new Map<string, AdapterPartitionBuild>();
    const supplied = new Set<RepoPath>();
    for (const artifact of request.changedArtifacts) {
      supplied.add(artifact.path);
      const document = parseDocumentFact(artifact);
      if (document === null) continue;
      const replacement = buildPartition(document, request.configRevision, request.context);
      logical.set(replacement.partitionKey, document);
      replacements.set(replacement.partitionKey, replacement);
      tombstones.delete(replacement.partitionKey);
    }
    const missingPaths = [...expectedHeadPaths].filter((path) => !supplied.has(path)).sort();
    const extraction = materializeDocuments(
      [...logical.values()],
      request.configRevision,
      request.context,
    );
    const coverage =
      missingPaths.length === 0
        ? extraction.coverage
        : {
            ...extraction.coverage,
            state: 'partial' as const,
            eligibleArtifacts: extraction.coverage.eligibleArtifacts + missingPaths.length,
            failedArtifacts: extraction.coverage.failedArtifacts + missingPaths.length,
            limitations: [...extraction.coverage.limitations, { code: 'incomplete_input' }],
          };
    const diagnostics = [
      ...extraction.diagnostics,
      ...missingPaths.map((path) =>
        diagnostic(
          'source_truncated',
          'error',
          'A changed artifact was unavailable within the source budget.',
          path,
        ),
      ),
    ];
    return updateResult({
      replacements: [...replacements.values()].sort((left, right) =>
        left.partitionKey.localeCompare(right.partitionKey),
      ),
      tombstones: [...tombstones].sort(),
      coverage,
      diagnostics,
    });
  }

  public async materializePartitions(request: {
    readonly partitions: readonly AdapterPartitionView[];
    readonly configRevision: ConfigRevision;
    readonly context: Readonly<Record<string, unknown>>;
  }) {
    const keys = new Set<string>();
    const documents = request.partitions.map((partition) => {
      const document = decodeDocument(partition.payload);
      requirePayload(
        partition.partitionKey === partitionKey(document.path) && !keys.has(partition.partitionKey),
        'OpenAPI partition set contains a duplicate or mismatched identity.',
      );
      keys.add(partition.partitionKey);
      return document;
    });
    return materializeDocuments(documents, request.configRevision, request.context);
  }

  public async diff(request: DiffRequest): Promise<AdapterDiffResult> {
    try {
      assertComparableExtractions(manifest, request.base, request.head, request.configRevision);
    } catch (error) {
      if (!(error instanceof AdapterValidationError)) throw error;
      return finalizeDiff({
        schema: 'reverb.adapter-diff',
        schemaVersion: '1.0',
        adapterId: manifest.id,
        adapterVersion: manifest.version,
        identityVersion: manifest.identityVersion,
        changes: [],
        coverage: diffCoverage(0, 0, false, true),
        diagnostics: [
          diagnostic('parse_failure', 'error', 'Adapter extraction versions are incompatible.'),
        ],
      });
    }
    const complete = compatibleCoverage(request.base, request.head);
    const differ = await toolState(request);
    const diagnostics: BoundedDiagnostic[] = [];
    if (differ.state === 'tool_failure' || differ.state === 'unknown') {
      diagnostics.push(
        diagnostic(
          'parse_failure',
          'warning',
          differ.state === 'tool_failure'
            ? 'The pinned OpenAPI differ failed; compatibility is unknown.'
            : 'The pinned OpenAPI differ was not run; compatibility is unknown.',
        ),
      );
    }
    const base = new Map(request.base.definitions.map((item) => [item.canonicalKey, item]));
    const head = new Map(request.head.definitions.map((item) => [item.canonicalKey, item]));
    const keys = [...new Set([...base.keys(), ...head.keys()])].sort();
    const changes: ContractChange[] = [];
    for (const key of keys) {
      const before = base.get(key);
      const after = head.get(key);
      if (before?.shapeHash === after?.shapeHash) continue;
      const exact = (before ?? after)?.evidenceStratum === 'operation_id';
      const changeKind =
        before === undefined
          ? 'operation_added'
          : after === undefined
            ? 'operation_removed'
            : 'operation_changed';
      let compatibility: ContractChange['compatibility'] = 'unknown';
      if (before === undefined && complete) compatibility = exact ? 'compatible' : 'unknown';
      else if (complete && exact && differ.state === 'breaking') compatibility = 'breaking';
      else if (complete && exact && differ.state === 'compatible') compatibility = 'compatible';
      changes.push({
        contractKind: 'openapi_operation',
        canonicalKey: key,
        changeKind,
        compatibility,
        activation: 'on_deploy',
        ...(before === undefined ? {} : { baseShapeHash: before.shapeHash }),
        ...(after === undefined ? {} : { headShapeHash: after.shapeHash }),
        coverageDependencies: ['base.openapi', 'head.openapi', 'oasdiff'],
        remedy: {
          kind: 'coordinate_contract_rollout',
          text: 'Keep the prior operation compatible or coordinate producer and consumer deployment.',
        },
        differ: metadata(),
      });
    }
    return finalizeDiff({
      schema: 'reverb.adapter-diff',
      schemaVersion: '1.0',
      adapterId: manifest.id,
      adapterVersion: manifest.version,
      identityVersion: manifest.identityVersion,
      changes,
      coverage: diffCoverage(keys.length, changes.length, complete),
      diagnostics,
    });
  }
}

export const openApiAdapter = new OpenApiContractAdapter();
