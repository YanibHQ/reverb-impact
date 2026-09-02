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
import {
  infrastructureEndpointKey,
  infrastructureOutputKey,
  infrastructureServiceKey,
  type InfrastructureIdentityKind,
} from './identity.js';
import { INFRASTRUCTURE_ADAPTER_MANIFEST } from './manifest.js';
import { parseInfrastructureSource, type InfrastructureFact } from './parser.js';

const manifest = INFRASTRUCTURE_ADAPTER_MANIFEST;
const decoder = new TextDecoder('utf-8', { fatal: true });
type InfraDocument =
  | {
      readonly state: 'parsed';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly lineStarts: readonly number[];
      readonly facts: readonly InfrastructureFact[];
      readonly limitations: readonly string[];
    }
  | {
      readonly state: 'incomplete';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly reason:
        | 'sensitive_infrastructure_input_excluded'
        | 'generated_infrastructure_excluded';
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
const parsedLimitationCodes = new Set([
  'helm_template_unresolved',
  'infrastructure_syntax_unresolved',
]);
function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function bounded(value: unknown, max = 512) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= max && !normalized.includes('\0')
    ? normalized
    : undefined;
}
function sensitivePath(path: RepoPath) {
  return /\.(?:tfstate|tfplan|tfvars)(?:\.json)?$|(?:^|\/)(?:secret|secrets|credentials)(?:\.|\/|$)/i.test(
    path,
  );
}
function probablePath(path: RepoPath) {
  return (
    /\.tf$/i.test(path) ||
    /(?:^|\/)(?:k8s|kubernetes|manifests?|helm|charts?)(?:\/|$)/i.test(path) ||
    /(?:^|\/)(?:service|ingress|deployment|statefulset|daemonset)\.ya?ml$/i.test(path)
  );
}
function parseArtifact(
  artifact: ArtifactInput,
  context: Readonly<Record<string, unknown>>,
): InfraDocument | null {
  if (artifact.classification === 'vendored' || artifact.classification === 'test') return null;
  if (sensitivePath(artifact.path))
    return {
      state: 'incomplete',
      path: artifact.path,
      contentHash: artifact.contentHash,
      classification: artifact.classification,
      reason: 'sensitive_infrastructure_input_excluded',
    };
  if (artifact.bytes.byteLength > manifest.resourceBudget.maximumInputBytes)
    return probablePath(artifact.path)
      ? {
          state: 'failed',
          path: artifact.path,
          contentHash: artifact.contentHash,
          classification: artifact.classification,
          reason: 'byte_limit',
        }
      : null;
  let text: string;
  try {
    text = decoder.decode(artifact.bytes);
  } catch {
    return probablePath(artifact.path)
      ? {
          state: 'failed',
          path: artifact.path,
          contentHash: artifact.contentHash,
          classification: artifact.classification,
          reason: 'parse_failure',
        }
      : null;
  }
  if (/(?:^|\n)\s*kind\s*:\s*Secret\s*(?:\n|$)/i.test(text))
    return {
      state: 'incomplete',
      path: artifact.path,
      contentHash: artifact.contentHash,
      classification: artifact.classification,
      reason: 'sensitive_infrastructure_input_excluded',
    };
  try {
    const parsed = parseInfrastructureSource(
      text,
      artifact.path,
      context,
      manifest.resourceBudget.maximumItems,
    );
    if (!parsed.probable) return null;
    if (artifact.classification === 'generated')
      return {
        state: 'incomplete',
        path: artifact.path,
        contentHash: artifact.contentHash,
        classification: artifact.classification,
        reason: 'generated_infrastructure_excluded',
      };
    const lineStarts = [0, ...[...text.matchAll(/\n/g)].map((match) => match.index + 1)];
    if (lineStarts.length > manifest.resourceBudget.maximumItems) throw new Error('line_limit');
    return {
      state: 'parsed',
      path: artifact.path,
      contentHash: artifact.contentHash,
      classification: artifact.classification,
      lineStarts,
      facts: parsed.facts,
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
function sourceRange(
  document: Extract<InfraDocument, { state: 'parsed' }>,
  fact: InfrastructureFact,
): SourceRange {
  const locate = (offset: number) => {
    let line = 0;
    while (line + 1 < document.lineStarts.length && document.lineStarts[line + 1]! <= offset)
      line += 1;
    return { line: line + 1, column: offset - document.lineStarts[line]! + 1 };
  };
  const start = locate(fact.offset);
  const end = locate(fact.offset + fact.length);
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
function resolveScope(
  context: Readonly<Record<string, unknown>>,
  fact?: InfrastructureFact,
): { environment: string; serviceScope: string } | undefined {
  if (fact?.remoteStateAlias !== undefined) {
    const mappings = context.terraformRemoteStates;
    if (!record(mappings)) return undefined;
    const raw = mappings[fact.remoteStateAlias];
    if (!record(raw)) return undefined;
    const environment = bounded(raw.environment);
    const serviceScope = bounded(raw.serviceScope);
    return environment && serviceScope ? { environment, serviceScope } : undefined;
  }
  const environment = bounded(context.infrastructureEnvironment);
  const serviceScope = bounded(context.infrastructureServiceScope);
  return environment && serviceScope ? { environment, serviceScope } : undefined;
}
function identity(
  fact: InfrastructureFact,
  context: Readonly<Record<string, unknown>>,
):
  | {
      contractKind: 'infrastructure.service' | 'infrastructure.endpoint' | 'infrastructure.output';
      canonicalKey: string;
      shape: Readonly<Record<string, unknown>>;
    }
  | undefined {
  const resolved = resolveScope(context, fact);
  if (resolved === undefined) return undefined;
  if (fact.kind === 'output')
    return {
      contractKind: 'infrastructure.output',
      canonicalKey: infrastructureOutputKey({ ...resolved, outputName: fact.name }),
      shape: { ...resolved, outputName: fact.name },
    };
  const identityKind: InfrastructureIdentityKind =
    fact.kind === 'workload' ? 'workload' : fact.kind === 'container' ? 'container' : 'service';
  const serviceKey = infrastructureServiceKey({
    ...resolved,
    serviceName: fact.name,
    identityKind,
  });
  if (fact.kind === 'endpoint') {
    if (fact.port === undefined || fact.protocol === undefined) return undefined;
    const protocol = fact.protocol.toUpperCase();
    return {
      contractKind: 'infrastructure.endpoint',
      canonicalKey: infrastructureEndpointKey({
        serviceKey,
        port: fact.port,
        protocol,
      }),
      shape: { serviceKey, port: fact.port, protocol },
    };
  }
  return {
    contractKind: 'infrastructure.service',
    canonicalKey: serviceKey,
    shape: { ...resolved, serviceName: fact.name, identityKind },
  };
}
function materialize(
  documents: readonly InfraDocument[],
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
          'Infrastructure input could not be parsed safely.',
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
          'unsupported_language',
          'warning',
          'Sensitive or generated infrastructure input is excluded.',
          document.path,
        ),
      );
      continue;
    }
    for (const code of document.limitations) limitations.push({ code, scope: document.path });
    for (const fact of document.facts) {
      const resolved = identity(fact, context);
      if (resolved === undefined) {
        limitations.push({
          code: fact.remoteStateAlias
            ? 'terraform_remote_state_alias_unresolved'
            : 'infrastructure_scope_missing',
          scope: document.path,
        });
        continue;
      }
      const common = {
        contractKind: resolved.contractKind,
        canonicalKey: resolved.canonicalKey,
        path: document.path,
        range: sourceRange(document, fact),
        contentHash: document.contentHash,
        ...version,
        configRevision,
        evidenceStratum: fact.source,
        activation: 'on_deploy' as const,
      };
      if (fact.role === 'definition')
        definitions.push({
          ...common,
          displayName: fact.kind === 'endpoint' ? `${fact.name}:${fact.port}` : fact.name,
          ...canonicalShape(resolved.shape),
        });
      else
        references.push({
          ...common,
          semanticOwner: `${fact.source}:${fact.name}:${fact.port ?? ''}`,
        });
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
    limitations: documents.length === 0 ? [{ code: 'infrastructure_inputs_not_found' }] : unique,
  };
  return { definitions, references, coverage, diagnostics };
}
function fingerprint(documents: readonly InfraDocument[]) {
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
  documents: readonly InfraDocument[],
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
  return `infrastructure-document:${path}`;
}
function buildPartition(
  document: InfraDocument,
  configRevision: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
): AdapterPartitionBuildV2 {
  const payload = {
    schema: 'reverb.infrastructure-partition',
    schemaVersion: '1.0',
    document,
  } as const;
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
function validText(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 2048 && !value.includes('\0')
  );
}
function validFact(value: unknown): value is InfrastructureFact {
  if (
    !record(value) ||
    !onlyKeys(value, [
      'role',
      'kind',
      'name',
      'port',
      'protocol',
      'remoteStateAlias',
      'source',
      'offset',
      'length',
    ]) ||
    !['definition', 'reference'].includes(String(value.role)) ||
    !['service', 'workload', 'container', 'endpoint', 'output'].includes(String(value.kind)) ||
    !validText(value.name) ||
    (value.port !== undefined && !validText(value.port)) ||
    (value.protocol !== undefined && !validText(value.protocol)) ||
    (value.remoteStateAlias !== undefined && !validText(value.remoteStateAlias)) ||
    !['kubernetes_manifest', 'helm_rendered_manifest', 'terraform_configuration'].includes(
      String(value.source),
    ) ||
    !Number.isSafeInteger(value.offset) ||
    Number(value.offset) < 0 ||
    !Number.isSafeInteger(value.length) ||
    Number(value.length) <= 0 ||
    Number(value.offset) + Number(value.length) > manifest.resourceBudget.maximumInputBytes
  )
    return false;
  if (value.kind === 'endpoint') {
    const sourceAllowsEndpoint =
      value.source === 'terraform_configuration'
        ? value.role === 'definition'
        : value.source === 'kubernetes_manifest' || value.source === 'helm_rendered_manifest';
    return (
      sourceAllowsEndpoint &&
      value.port !== undefined &&
      value.protocol !== undefined &&
      value.remoteStateAlias === undefined
    );
  }
  if (value.kind === 'output')
    return (
      value.port === undefined &&
      value.protocol === undefined &&
      (value.remoteStateAlias === undefined || value.role === 'reference') &&
      value.source === 'terraform_configuration'
    );
  if (value.kind === 'workload' || value.kind === 'container')
    return (
      value.role === 'definition' &&
      value.source !== 'terraform_configuration' &&
      value.port === undefined &&
      value.protocol === undefined &&
      value.remoteStateAlias === undefined
    );
  return (
    (value.source !== 'terraform_configuration' || value.role === 'definition') &&
    value.port === undefined &&
    value.protocol === undefined &&
    value.remoteStateAlias === undefined
  );
}
function validFacts(values: readonly unknown[]): values is readonly InfrastructureFact[] {
  if (!values.every(validFact)) return false;
  const identities = values.map((value) =>
    [
      value.role,
      value.kind,
      value.name,
      value.port ?? '',
      value.protocol ?? '',
      value.remoteStateAlias ?? '',
      value.source,
      value.offset,
      value.length,
    ].join('\0'),
  );
  return new Set(identities).size === identities.length;
}
function decode(partition: AdapterPartitionViewV2, keys: Set<string>): InfraDocument {
  const payload = partition.payload;
  if (
    payload.schema !== 'reverb.infrastructure-partition' ||
    payload.schemaVersion !== '1.0' ||
    !onlyKeys(payload, ['schema', 'schemaVersion', 'document']) ||
    !record(payload.document)
  )
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Persisted infrastructure partition is invalid.',
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
      'Persisted infrastructure provenance is invalid.',
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
        'facts',
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
      !Array.isArray(document.facts) ||
      document.facts.length > manifest.resourceBudget.maximumItems ||
      !validFacts(document.facts) ||
      !Array.isArray(document.limitations) ||
      !document.limitations.every((item) => validText(item) && parsedLimitationCodes.has(item)) ||
      new Set(document.limitations).size !== document.limitations.length
    )
      throw new AdapterValidationError(
        'invalid_partition_payload',
        'Persisted infrastructure extraction is invalid.',
      );
  } else if (
    !onlyKeys(document, ['state', 'path', 'contentHash', 'classification', 'reason']) ||
    (document.state === 'incomplete'
      ? !['sensitive_infrastructure_input_excluded', 'generated_infrastructure_excluded'].includes(
          String(document.reason),
        )
      : !['byte_limit', 'parse_failure'].includes(String(document.reason)))
  )
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Persisted infrastructure state is invalid.',
    );
  const typed = document as unknown as InfraDocument;
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
      'Infrastructure partition integrity is invalid.',
    );
  keys.add(partition.partitionKey);
  return typed;
}
function changes(
  base: readonly ContractDefinitionV2[],
  head: readonly ContractDefinitionV2[],
  complete: boolean,
): readonly ContractChangeV2[] {
  const before = new Map(base.map((item) => [`${item.contractKind}\0${item.canonicalKey}`, item]));
  const after = new Map(head.map((item) => [`${item.contractKind}\0${item.canonicalKey}`, item]));
  const result: ContractChangeV2[] = [];
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const oldValue = before.get(key);
    const newValue = after.get(key);
    const value = oldValue ?? newValue!;
    const name = value.contractKind.split('.')[1]!;
    if (oldValue === undefined)
      result.push({
        contractKind: value.contractKind,
        canonicalKey: value.canonicalKey,
        changeKind: `${name}_added`,
        compatibility: complete ? 'compatible' : 'unknown',
        activation: 'on_deploy',
        headShapeHash: value.shapeHash,
        coverageDependencies: ['infrastructure.head.complete'],
        remedy: { kind: 'none', text: 'No consumer coordination is required for this addition.' },
      });
    else if (newValue === undefined)
      result.push({
        contractKind: value.contractKind,
        canonicalKey: value.canonicalKey,
        changeKind: `${name}_removed`,
        compatibility: complete ? 'breaking' : 'unknown',
        activation: 'on_deploy',
        baseShapeHash: value.shapeHash,
        coverageDependencies: ['infrastructure.base.complete', 'infrastructure.head.complete'],
        remedy: {
          kind: 'coordinate_infrastructure_change',
          text: 'Coordinate affected deployment consumers before removal.',
        },
      });
    else if (oldValue.shapeHash !== newValue.shapeHash)
      result.push({
        contractKind: value.contractKind,
        canonicalKey: value.canonicalKey,
        changeKind: `${name}_changed`,
        compatibility: complete ? 'potentially_breaking' : 'unknown',
        activation: 'on_deploy',
        baseShapeHash: oldValue.shapeHash,
        headShapeHash: newValue.shapeHash,
        coverageDependencies: ['infrastructure.base.complete', 'infrastructure.head.complete'],
        remedy: {
          kind: 'coordinate_infrastructure_change',
          text: 'Review affected deployment consumers.',
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
export const infrastructureAdapter: IncrementalContractAdapterV2 = new (class {
  public readonly manifest = manifest;
  public async extract(request: ExtractRequestV2) {
    return extraction(
      request.artifacts
        .map((item) => parseArtifact(item, request.context))
        .filter((item): item is InfraDocument => item !== null),
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
            limitations: [{ code: 'incomplete_infrastructure_extraction' }],
          },
      diagnostics: [],
    });
  }
  public async buildPartitions(request: ExtractRequestV2) {
    const documents = request.artifacts
      .map((item) => parseArtifact(item, request.context))
      .filter((item): item is InfraDocument => item !== null);
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
    const logical = new Map<string, InfraDocument>();
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
        diagnostics: [
          diagnostic('parse_failure', 'error', 'Persisted infrastructure state is invalid.'),
        ],
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
      const document = parseArtifact(artifact, request.context);
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
          diagnostic(
            'missing_blob',
            'error',
            'Changed infrastructure artifact is unavailable.',
            scope,
          ),
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
