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

import { httpRouteKey, HTTP_METHODS, type HttpMethod } from './identity.js';
import { HTTP_ADAPTER_MANIFEST } from './manifest.js';
import { parseHttpSource, type HttpBinding } from './parser.js';

const decoder = new TextDecoder('utf-8', { fatal: true });
const manifest = HTTP_ADAPTER_MANIFEST;

type HttpDocument =
  | {
      readonly state: 'parsed';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly lineStarts: readonly number[];
      readonly bindings: readonly HttpBinding[];
      readonly limitations: readonly string[];
    }
  | {
      readonly state: 'incomplete';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly reason: 'generated_http_source_excluded';
    }
  | {
      readonly state: 'failed';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly reason: 'byte_limit' | 'parse_failure';
    };

const version = {
  extractorId: manifest.id,
  extractorVersion: manifest.version,
  extractionVersion: manifest.extractionVersion,
  identityVersion: manifest.identityVersion,
  partitioningVersion: manifest.partitioningVersion,
  compatibilityVersion: manifest.compatibilityVersion,
} as const;

function bounded(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= 512 && !normalized.includes('\0')
    ? normalized
    : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function producerService(context: Readonly<Record<string, unknown>>): string | undefined {
  return bounded(context.httpServiceId);
}

function mappedValue(
  context: Readonly<Record<string, unknown>>,
  mapName: 'httpServiceAliases' | 'httpClients',
  key: string,
): string | undefined {
  const mapping = context[mapName];
  if (!isRecord(mapping)) return undefined;
  const raw = mapping[key] ?? mapping[key.toLowerCase()];
  if (typeof raw === 'string') return bounded(raw);
  if (!isRecord(raw)) return undefined;
  return bounded(raw.serviceId ?? raw.service);
}

function probable(path: RepoPath, text: string): boolean {
  return (
    /\.(?:[cm]?[jt]sx?)$/i.test(path) &&
    /\b(?:fetch|axios|app|router|server)\b|\.(?:delete|get|head|options|patch|post|put)\s*\(/i.test(
      text,
    )
  );
}

function parseArtifact(artifact: ArtifactInput): HttpDocument | null {
  if (artifact.classification === 'vendored' || artifact.classification === 'test') return null;
  if (artifact.bytes.byteLength > manifest.resourceBudget.maximumInputBytes) {
    return /\.(?:[cm]?[jt]sx?)$/i.test(artifact.path)
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
    return /\.(?:[cm]?[jt]sx?)$/i.test(artifact.path)
      ? {
          state: 'failed',
          path: artifact.path,
          contentHash: artifact.contentHash,
          classification: artifact.classification,
          reason: 'parse_failure',
        }
      : null;
  }
  if (!probable(artifact.path, text)) return null;
  if (artifact.classification === 'generated') {
    return {
      state: 'incomplete',
      path: artifact.path,
      contentHash: artifact.contentHash,
      classification: artifact.classification,
      reason: 'generated_http_source_excluded',
    };
  }
  try {
    const parsed = parseHttpSource(text, manifest.resourceBudget.maximumItems);
    if (!parsed.probable) return null;
    const lineStarts = [0, ...[...text.matchAll(/\n/g)].map((match) => match.index + 1)];
    if (lineStarts.length > manifest.resourceBudget.maximumItems) throw new Error('line_limit');
    return {
      state: 'parsed',
      path: artifact.path,
      contentHash: artifact.contentHash,
      classification: artifact.classification,
      lineStarts,
      bindings: parsed.bindings,
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

function range(
  document: Extract<HttpDocument, { state: 'parsed' }>,
  binding: HttpBinding,
): SourceRange {
  const position = (offset: number) => {
    let line = 0;
    while (line + 1 < document.lineStarts.length && document.lineStarts[line + 1]! <= offset)
      line += 1;
    return { line: line + 1, column: offset - document.lineStarts[line]! + 1 };
  };
  const start = position(binding.offset);
  const end = position(binding.offset + binding.length);
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

function diagnostic(
  code: BoundedDiagnostic['code'],
  severity: BoundedDiagnostic['severity'],
  message: string,
  scope?: RepoPath,
): BoundedDiagnostic {
  return scope === undefined
    ? { code, severity, safeMessage: message }
    : { code, severity, safeMessage: message, scope };
}

function materialize(
  documents: readonly HttpDocument[],
  configRevision: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
) {
  const definitions: ContractDefinitionV2[] = [];
  const references: ContractReferenceV2[] = [];
  const limitations: AdapterCoverageV2['limitations'][number][] = [];
  const diagnostics: BoundedDiagnostic[] = [];
  let processed = 0;
  let failed = 0;
  for (const document of documents) {
    if (document.state === 'failed') {
      failed += 1;
      limitations.push({ code: document.reason, scope: document.path });
      diagnostics.push(
        diagnostic(
          document.reason === 'byte_limit' ? 'source_truncated' : 'parse_failure',
          'error',
          'Implicit HTTP input could not be processed safely.',
          document.path,
        ),
      );
      continue;
    }
    processed += 1;
    if (document.state === 'incomplete') {
      limitations.push({ code: document.reason, scope: document.path });
      diagnostics.push(
        diagnostic(
          'generated_path',
          'warning',
          'Generated HTTP source is excluded.',
          document.path,
        ),
      );
      continue;
    }
    for (const code of document.limitations) limitations.push({ code, scope: document.path });
    for (const binding of document.bindings) {
      let serviceId: string | undefined;
      if (binding.role === 'producer') serviceId = producerService(context);
      else if (binding.serviceHint !== undefined)
        serviceId = mappedValue(context, 'httpServiceAliases', binding.serviceHint);
      else if (binding.clientName !== undefined)
        serviceId = mappedValue(context, 'httpClients', binding.clientName);
      if (binding.routeTemplate === undefined) {
        limitations.push({ code: 'dynamic_url', scope: document.path });
        continue;
      }
      if (serviceId === undefined) {
        limitations.push({
          code: 'service_alias_unresolved',
          scope: document.path,
        });
        continue;
      }
      const canonicalKey = httpRouteKey({
        serviceId,
        method: binding.method,
        routeTemplate: binding.routeTemplate,
      });
      const common = {
        contractKind: 'http.route' as const,
        canonicalKey,
        path: document.path,
        range: range(document, binding),
        contentHash: document.contentHash,
        ...version,
        configRevision,
        evidenceStratum: binding.source,
        activation: 'on_deploy' as const,
      };
      if (binding.role === 'producer') {
        definitions.push({
          ...common,
          displayName: `${binding.method} ${binding.routeTemplate}`,
          ...canonicalShape({
            serviceId,
            method: binding.method,
            routeTemplate: binding.routeTemplate,
            framework: binding.framework,
          }),
        });
      } else {
        references.push({
          ...common,
          semanticOwner: `${binding.framework}:${binding.method}:${binding.routeTemplate}`,
        });
      }
    }
  }
  const unique = [
    ...new Map(limitations.map((item) => [`${item.code}\0${item.scope ?? ''}`, item])).values(),
  ].sort((a, b) => `${a.code}\0${a.scope ?? ''}`.localeCompare(`${b.code}\0${b.scope ?? ''}`));
  const coverage: AdapterCoverageV2 = {
    state:
      documents.length === 0
        ? 'unsupported'
        : failed === documents.length
          ? 'failed'
          : failed > 0 || unique.length > 0
            ? 'partial'
            : 'complete',
    eligibleArtifacts: documents.length,
    processedArtifacts: processed,
    skippedArtifacts: 0,
    failedArtifacts: failed,
    limitations: documents.length === 0 ? [{ code: 'implicit_http_inputs_not_found' }] : unique,
  };
  return { definitions, references, coverage, diagnostics };
}

function fingerprint(documents: readonly HttpDocument[]): ContentHash {
  return contentHash(
    hashCanonical(
      documents
        .map((item) => ({
          path: item.path,
          contentHash: item.contentHash,
          classification: item.classification,
          state: item.state,
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    ),
  );
}

function extraction(
  documents: readonly HttpDocument[],
  configRevision: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
) {
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
    ...materialize(documents, configRevision, context),
    sourceFingerprint: fingerprint(documents),
  });
}

function partitionKey(path: RepoPath) {
  return `http-document:${path}`;
}

function buildPartition(
  document: HttpDocument,
  configRevision: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
): AdapterPartitionBuildV2 {
  const payload = { schema: 'reverb.http-partition', schemaVersion: '1.0', document } as const;
  return {
    partitionKey: partitionKey(document.path),
    ownedPaths: [document.path],
    dependencyKeys: [],
    payload,
    extraction: extraction([document], configRevision, context),
  };
}

function onlyKeys(value: Readonly<Record<string, unknown>>, allowed: readonly string[]) {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}
function validText(value: unknown) {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 2_048 && !value.includes('\0')
  );
}
function validBinding(value: unknown): value is HttpBinding {
  return (
    isRecord(value) &&
    onlyKeys(value, [
      'role',
      'method',
      'routeTemplate',
      'serviceHint',
      'clientName',
      'unresolvedExpressionHash',
      'source',
      'framework',
      'offset',
      'length',
    ]) &&
    (value.role === 'producer' || value.role === 'consumer') &&
    HTTP_METHODS.includes(value.method as HttpMethod) &&
    (value.routeTemplate === undefined || validText(value.routeTemplate)) &&
    (value.serviceHint === undefined || validText(value.serviceHint)) &&
    (value.clientName === undefined || validText(value.clientName)) &&
    (value.unresolvedExpressionHash === undefined ||
      (typeof value.unresolvedExpressionHash === 'string' &&
        /^sha256:[0-9a-f]{64}$/.test(value.unresolvedExpressionHash))) &&
    (value.source === 'framework_route' || value.source === 'literal_http_call') &&
    validText(value.framework) &&
    Number.isSafeInteger(value.offset) &&
    Number(value.offset) >= 0 &&
    Number.isSafeInteger(value.length) &&
    Number(value.length) > 0
  );
}

function decode(partition: AdapterPartitionViewV2, keys: Set<string>): HttpDocument {
  const payload = partition.payload;
  if (
    payload.schema !== 'reverb.http-partition' ||
    payload.schemaVersion !== '1.0' ||
    !onlyKeys(payload, ['schema', 'schemaVersion', 'document']) ||
    !isRecord(payload.document)
  )
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Persisted HTTP partition is invalid.',
    );
  const document = payload.document;
  if (
    !validText(document.path) ||
    typeof document.contentHash !== 'string' ||
    !['source', 'generated', 'vendored', 'test', 'example'].includes(
      String(document.classification),
    ) ||
    !['parsed', 'incomplete', 'failed'].includes(String(document.state))
  )
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Persisted HTTP provenance is invalid.',
    );
  repoPath(document.path as string);
  contentHash(document.contentHash);
  if (document.state === 'parsed') {
    if (
      !onlyKeys(document, [
        'state',
        'path',
        'contentHash',
        'classification',
        'lineStarts',
        'bindings',
        'limitations',
      ]) ||
      !Array.isArray(document.lineStarts) ||
      document.lineStarts.length === 0 ||
      document.lineStarts.length > manifest.resourceBudget.maximumItems ||
      !document.lineStarts.every(
        (item, index, all) =>
          Number.isSafeInteger(item) &&
          Number(item) >= 0 &&
          (index === 0 ? item === 0 : Number(item) > Number(all[index - 1])),
      ) ||
      !Array.isArray(document.bindings) ||
      document.bindings.length > manifest.resourceBudget.maximumItems ||
      !document.bindings.every(validBinding) ||
      !Array.isArray(document.limitations) ||
      !document.limitations.every(validText)
    )
      throw new AdapterValidationError(
        'invalid_partition_payload',
        'Persisted HTTP extraction is invalid.',
      );
  } else if (
    !onlyKeys(document, ['state', 'path', 'contentHash', 'classification', 'reason']) ||
    (document.state === 'incomplete'
      ? document.reason !== 'generated_http_source_excluded'
      : !['byte_limit', 'parse_failure'].includes(String(document.reason)))
  )
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Persisted HTTP state is invalid.',
    );
  const typed = document as unknown as HttpDocument;
  if (
    partition.partitionKey !== partitionKey(typed.path) ||
    keys.has(partition.partitionKey) ||
    partition.ownedPaths.length !== 1 ||
    partition.ownedPaths[0] !== typed.path ||
    partition.dependencyKeys.length !== 0 ||
    partition.outputHash !== contentHash(hashCanonical(payload))
  )
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'HTTP partition integrity is invalid.',
    );
  keys.add(partition.partitionKey);
  return typed;
}

function changes(
  base: readonly ContractDefinitionV2[],
  head: readonly ContractDefinitionV2[],
  complete: boolean,
): readonly ContractChangeV2[] {
  const before = new Map(base.map((item) => [item.canonicalKey, item]));
  const after = new Map(head.map((item) => [item.canonicalKey, item]));
  const result: ContractChangeV2[] = [];
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const oldValue = before.get(key);
    const newValue = after.get(key);
    const value = oldValue ?? newValue!;
    if (oldValue === undefined)
      result.push({
        contractKind: 'http.route',
        canonicalKey: key,
        changeKind: 'route_added',
        compatibility: complete ? 'compatible' : 'unknown',
        activation: 'on_deploy',
        headShapeHash: value.shapeHash,
        coverageDependencies: ['implicit_http.head.complete'],
        remedy: {
          kind: 'none',
          text: 'No consumer coordination is required for this route addition.',
        },
      });
    else if (newValue === undefined)
      result.push({
        contractKind: 'http.route',
        canonicalKey: key,
        changeKind: 'route_removed',
        compatibility: complete ? 'breaking' : 'unknown',
        activation: 'on_deploy',
        baseShapeHash: value.shapeHash,
        coverageDependencies: ['implicit_http.base.complete', 'implicit_http.head.complete'],
        remedy: {
          kind: 'coordinate_http_change',
          text: 'Coordinate affected HTTP consumers before removing this route.',
        },
      });
    else if (oldValue.shapeHash !== newValue.shapeHash)
      result.push({
        contractKind: 'http.route',
        canonicalKey: key,
        changeKind: 'route_changed',
        compatibility: complete ? 'potentially_breaking' : 'unknown',
        activation: 'on_deploy',
        baseShapeHash: oldValue.shapeHash,
        headShapeHash: newValue.shapeHash,
        coverageDependencies: ['implicit_http.base.complete', 'implicit_http.head.complete'],
        remedy: {
          kind: 'coordinate_http_change',
          text: 'Review affected HTTP consumers before deployment.',
        },
      });
  }
  return result;
}

function updateResult(
  input: Omit<AdapterPartitionUpdateResultV2, 'outputHash'>,
): AdapterPartitionUpdateResultV2 {
  const canonical = {
    ...input,
    replacements: [...input.replacements].sort((a, b) =>
      a.partitionKey.localeCompare(b.partitionKey),
    ),
    tombstones: [...new Set(input.tombstones)].sort(),
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

export const httpAdapter: IncrementalContractAdapterV2 = new (class {
  public readonly manifest = manifest;
  public async extract(request: ExtractRequestV2) {
    return extraction(
      request.artifacts.map(parseArtifact).filter((item): item is HttpDocument => item !== null),
      request.configRevision,
      request.context,
    );
  }
  public async diff(request: Parameters<IncrementalContractAdapterV2['diff']>[0]) {
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
        ? { ...request.head.coverage, failedArtifacts: 0, limitations: [] }
        : {
            ...request.head.coverage,
            state: 'partial',
            limitations: [{ code: 'incomplete_implicit_http_extraction' }],
          },
      diagnostics: [],
    });
  }
  public async buildPartitions(request: ExtractRequestV2) {
    const documents = request.artifacts
      .map(parseArtifact)
      .filter((item): item is HttpDocument => item !== null);
    const partitions = documents.map((item) =>
      buildPartition(item, request.configRevision, request.context),
    );
    const result = extraction(documents, request.configRevision, request.context);
    const canonical = { partitions, coverage: result.coverage, diagnostics: result.diagnostics };
    return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
  }
  public planInvalidation(request: {
    readonly partitions: readonly AdapterPartitionDescriptor[];
    readonly changes: readonly AdapterPathChange[];
    readonly context: Readonly<Record<string, unknown>>;
  }): AdapterInvalidationPlan {
    const owners = new Map(
      request.partitions.flatMap((item) =>
        item.ownedPaths.map((path) => [path, item.partitionKey]),
      ),
    );
    const changedPaths = [
      ...new Set(
        request.changes.flatMap((item) =>
          item.previousPath ? [item.path, item.previousPath] : [item.path],
        ),
      ),
    ].sort() as RepoPath[];
    const directPartitionKeys = [
      ...new Set(
        changedPaths
          .map((path) => owners.get(path))
          .filter((item): item is string => item !== undefined),
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
    const logical = new Map<string, HttpDocument>();
    try {
      const keys = new Set<string>();
      for (const item of request.basePartitions) logical.set(item.partitionKey, decode(item, keys));
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
        diagnostics: [diagnostic('parse_failure', 'error', 'Persisted HTTP state is invalid.')],
      });
    }
    const tombstones = new Set<string>();
    const expected = new Set<RepoPath>();
    const remove = (path: RepoPath) => {
      const key = partitionKey(path);
      if (logical.delete(key)) tombstones.add(key);
    };
    for (const change of request.changes) {
      remove(change.path);
      if (change.previousPath !== undefined && change.kind !== 'copied')
        remove(change.previousPath);
      if (change.kind !== 'deleted') expected.add(change.path);
    }
    const replacements = new Map<string, AdapterPartitionBuildV2>();
    const supplied = new Set<RepoPath>();
    for (const artifact of request.changedArtifacts) {
      supplied.add(artifact.path);
      const document = parseArtifact(artifact);
      if (document === null) continue;
      const replacement = buildPartition(document, request.configRevision, request.context);
      logical.set(replacement.partitionKey, document);
      replacements.set(replacement.partitionKey, replacement);
      tombstones.delete(replacement.partitionKey);
    }
    const missing = [...expected].filter((path) => !supplied.has(path));
    const result = extraction([...logical.values()], request.configRevision, request.context);
    const partial =
      missing.length > 0 || !request.plan.complete || result.coverage.state !== 'complete';
    return updateResult({
      replacements: [...replacements.values()],
      tombstones: [...tombstones],
      coverage: partial
        ? {
            ...result.coverage,
            state: 'partial',
            limitations: [
              ...result.coverage.limitations,
              ...missing.map((scope) => ({ code: 'changed_artifact_missing', scope })),
            ],
          }
        : result.coverage,
      diagnostics: [
        ...result.diagnostics,
        ...missing.map((scope) =>
          diagnostic('missing_blob', 'error', 'Changed HTTP artifact is unavailable.', scope),
        ),
      ],
    });
  }
  public async materializePartitions(
    request: Parameters<IncrementalContractAdapterV2['materializePartitions']>[0],
  ) {
    const keys = new Set<string>();
    return extraction(
      request.partitions.map((item) => decode(item, keys)),
      request.configRevision,
      request.context,
    );
  }
})();
