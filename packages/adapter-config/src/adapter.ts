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
  configurationKey,
  featureFlagKey,
  hashSecretReference,
  secretReferenceKey,
} from './identity.js';
import { CONFIG_ADAPTER_MANIFEST } from './manifest.js';
import { parseConfigurationSource, type ConfigurationFact } from './parser.js';

const manifest = CONFIG_ADAPTER_MANIFEST;
const decoder = new TextDecoder('utf-8', { fatal: true });

type StoredFact =
  | {
      readonly role: ConfigurationFact['role'];
      readonly kind: 'configuration_key';
      readonly key: string;
      readonly source: ConfigurationFact['source'];
      readonly offset: number;
      readonly length: number;
    }
  | {
      readonly role: ConfigurationFact['role'];
      readonly kind: 'feature_flag';
      readonly key: string;
      readonly source: ConfigurationFact['source'];
      readonly offset: number;
      readonly length: number;
    }
  | {
      readonly role: ConfigurationFact['role'];
      readonly kind: 'secret_reference';
      readonly identifierHash: string;
      readonly provider: string;
      readonly source: 'secret_reference';
      readonly offset: number;
      readonly length: number;
    };

type ConfigDocument =
  | {
      readonly state: 'parsed';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly lineStarts: readonly number[];
      readonly facts: readonly StoredFact[];
      readonly limitations: readonly string[];
    }
  | {
      readonly state: 'incomplete';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly reason:
        | 'sensitive_configuration_values_excluded'
        | 'generated_configuration_excluded';
    }
  | {
      readonly state: 'failed';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly reason: 'byte_limit' | 'parse_failure';
    };

const evidenceVersion = {
  extractorId: manifest.id,
  extractorVersion: manifest.version,
  extractionVersion: manifest.extractionVersion,
  identityVersion: manifest.identityVersion,
  partitioningVersion: manifest.partitioningVersion,
  compatibilityVersion: manifest.compatibilityVersion,
} as const;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function bounded(value: unknown, max = 512): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= max && !normalized.includes('\0')
    ? normalized
    : undefined;
}
function namespace(context: Readonly<Record<string, unknown>>) {
  return bounded(context.configurationNamespace);
}
function secretSalt(context: Readonly<Record<string, unknown>>) {
  const value = bounded(context.secretIdentitySalt, 4096);
  return value !== undefined && value.length >= 16 ? value : undefined;
}
function isSecretConfigurationKey(
  context: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  const configured = Array.isArray(context.secretConfigurationKeys)
    ? context.secretConfigurationKeys.some((value) => value === key)
    : false;
  return (
    configured || /(?:^|_)(?:PASSWORD|PASSWD|SECRET|TOKEN|PRIVATE_KEY|API_KEY)(?:$|_)/i.test(key)
  );
}
function sensitivePath(path: RepoPath) {
  return (
    /(?:^|\/)\.env(?:$|\.(?!example$|sample$|template$))|\.tfvars(?:\.json)?$|(?:^|\/)(?:secrets?|credentials?)(?:\.|\/|$)/i.test(
      path,
    ) && !/\.(?:[cm]?[jt]sx?|py)$/i.test(path)
  );
}
function probablePath(path: RepoPath) {
  return /(?:^|\/)reverb\.config\.json$|(?:^|\/)\.env\.(?:example|sample|template)$|\.(?:[cm]?[jt]sx?|py)$/i.test(
    path,
  );
}

function parseArtifact(
  artifact: ArtifactInput,
  context: Readonly<Record<string, unknown>>,
): ConfigDocument | null {
  if (artifact.classification === 'vendored' || artifact.classification === 'test') return null;
  if (sensitivePath(artifact.path))
    return {
      state: 'incomplete',
      path: artifact.path,
      contentHash: artifact.contentHash,
      classification: artifact.classification,
      reason: 'sensitive_configuration_values_excluded',
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
  const likely =
    probablePath(artifact.path) ||
    /\b(?:process\.env|Deno\.env|getenv|config\.|featureFlags\.|flags\.|secrets\.|secretManager\.|defineConfigKey|defineFeatureFlag|defineSecretReference)/.test(
      text,
    );
  if (!likely) return null;
  if (artifact.classification === 'generated')
    return {
      state: 'incomplete',
      path: artifact.path,
      contentHash: artifact.contentHash,
      classification: artifact.classification,
      reason: 'generated_configuration_excluded',
    };
  try {
    const parsed = parseConfigurationSource(
      text,
      artifact.path,
      manifest.resourceBudget.maximumItems,
    );
    if (!parsed.probable) return null;
    const limitations = [...parsed.limitations];
    const facts: StoredFact[] = [];
    for (const fact of parsed.facts) {
      const environmentSecret =
        fact.kind === 'configuration_key' && isSecretConfigurationKey(context, fact.key);
      if (fact.kind !== 'secret_reference' && !environmentSecret) {
        facts.push({
          role: fact.role,
          kind: fact.kind,
          key: fact.key,
          source: fact.source,
          offset: fact.offset,
          length: fact.length,
        });
        continue;
      }
      const salt = secretSalt(context);
      const provider = fact.kind === 'secret_reference' ? fact.provider : 'environment';
      if (salt === undefined || provider === undefined) {
        limitations.push('secret_identity_salt_missing');
        continue;
      }
      facts.push({
        role: fact.role,
        kind: 'secret_reference',
        provider,
        identifierHash: hashSecretReference({
          salt,
          configurationNamespace: namespace(context) ?? 'unresolved',
          provider,
          identifier: fact.key,
        }),
        source: 'secret_reference',
        offset: fact.offset,
        length: fact.length,
      });
    }
    const lineStarts = [0, ...[...text.matchAll(/\n/g)].map((match) => match.index + 1)];
    if (lineStarts.length > manifest.resourceBudget.maximumItems) throw new Error('line_limit');
    return {
      state: 'parsed',
      path: artifact.path,
      contentHash: artifact.contentHash,
      classification: artifact.classification,
      lineStarts,
      facts,
      limitations: [...new Set(limitations)].sort(),
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
  document: Extract<ConfigDocument, { state: 'parsed' }>,
  fact: StoredFact,
): SourceRange {
  const position = (offset: number) => {
    let line = 0;
    while (line + 1 < document.lineStarts.length && document.lineStarts[line + 1]! <= offset)
      line += 1;
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
  documents: readonly ConfigDocument[],
  configRevision: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
) {
  const definitions: ContractDefinitionV2[] = [];
  const references: ContractReferenceV2[] = [];
  const limitations: AdapterCoverageV2['limitations'][number][] = [];
  const diagnostics: BoundedDiagnostic[] = [];
  let processed = 0;
  let failed = 0;
  const configurationNamespace = namespace(context);
  for (const document of documents) {
    if (document.state === 'failed') {
      failed += 1;
      limitations.push({ code: document.reason, scope: document.path });
      diagnostics.push(
        diagnostic(
          document.reason === 'byte_limit' ? 'source_truncated' : 'parse_failure',
          'error',
          'Configuration input could not be processed safely.',
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
          'Sensitive or generated configuration input is excluded.',
          document.path,
        ),
      );
      continue;
    }
    for (const code of document.limitations) limitations.push({ code, scope: document.path });
    if (configurationNamespace === undefined) {
      limitations.push({ code: 'configuration_namespace_missing', scope: document.path });
      continue;
    }
    for (const fact of document.facts) {
      const contractKind =
        fact.kind === 'feature_flag'
          ? ('configuration.feature_flag' as const)
          : ('configuration.key' as const);
      const canonicalKey =
        fact.kind === 'feature_flag'
          ? featureFlagKey({ configurationNamespace, key: fact.key })
          : fact.kind === 'configuration_key'
            ? configurationKey({ configurationNamespace, key: fact.key })
            : secretReferenceKey({
                configurationNamespace,
                provider: fact.provider,
                identifierHash: fact.identifierHash,
              });
      const displayName =
        fact.kind === 'secret_reference'
          ? `secret:${fact.provider}:${fact.identifierHash.slice(-12)}`
          : fact.key;
      const shape =
        fact.kind === 'secret_reference'
          ? {
              category: 'secret_reference',
              provider: fact.provider,
              identifierHash: fact.identifierHash,
            }
          : { category: fact.kind, key: fact.key };
      const common = {
        contractKind,
        canonicalKey,
        path: document.path,
        range: range(document, fact),
        contentHash: document.contentHash,
        ...evidenceVersion,
        configRevision,
        evidenceStratum: fact.source,
        activation:
          fact.kind === 'feature_flag' ? ('current_runtime' as const) : ('on_deploy' as const),
      };
      if (fact.role === 'definition')
        definitions.push({ ...common, displayName, ...canonicalShape(shape) });
      else references.push({ ...common, semanticOwner: `${fact.source}:${displayName}` });
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
    limitations: documents.length === 0 ? [{ code: 'configuration_inputs_not_found' }] : unique,
  };
  return { definitions, references, coverage, diagnostics };
}

function fingerprint(documents: readonly ConfigDocument[]) {
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
  documents: readonly ConfigDocument[],
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
  return `configuration-document:${path}`;
}
function buildPartition(
  document: ConfigDocument,
  configRevision: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
): AdapterPartitionBuildV2 {
  const payload = {
    schema: 'reverb.configuration-partition',
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
function validText(value: unknown, max = 2048) {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0')
  );
}
function validFact(value: unknown): value is StoredFact {
  if (
    !isRecord(value) ||
    !onlyKeys(value, [
      'role',
      'kind',
      'key',
      'provider',
      'identifierHash',
      'source',
      'offset',
      'length',
    ]) ||
    !['definition', 'reference'].includes(String(value.role)) ||
    !['configuration_key', 'feature_flag', 'secret_reference'].includes(String(value.kind)) ||
    !['configuration_declaration', 'configuration_read', 'secret_reference'].includes(
      String(value.source),
    ) ||
    !Number.isSafeInteger(value.offset) ||
    Number(value.offset) < 0 ||
    !Number.isSafeInteger(value.length) ||
    Number(value.length) <= 0
  )
    return false;
  return value.kind === 'secret_reference'
    ? value.key === undefined &&
        validText(value.provider, 512) &&
        typeof value.identifierHash === 'string' &&
        /^hmac-sha256:[0-9a-f]{64}$/.test(value.identifierHash)
    : validText(value.key, 512) &&
        value.provider === undefined &&
        value.identifierHash === undefined;
}
function decode(partition: AdapterPartitionViewV2, keys: Set<string>): ConfigDocument {
  const payload = partition.payload;
  if (
    payload.schema !== 'reverb.configuration-partition' ||
    payload.schemaVersion !== '1.0' ||
    !onlyKeys(payload, ['schema', 'schemaVersion', 'document']) ||
    !isRecord(payload.document)
  )
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Persisted configuration partition is invalid.',
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
      'Persisted configuration provenance is invalid.',
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
      !document.facts.every(validFact) ||
      !Array.isArray(document.limitations) ||
      !document.limitations.every((item) => validText(item, 512))
    )
      throw new AdapterValidationError(
        'invalid_partition_payload',
        'Persisted configuration extraction is invalid.',
      );
  } else if (
    !onlyKeys(document, ['state', 'path', 'contentHash', 'classification', 'reason']) ||
    (document.state === 'incomplete'
      ? !['sensitive_configuration_values_excluded', 'generated_configuration_excluded'].includes(
          String(document.reason),
        )
      : !['byte_limit', 'parse_failure'].includes(String(document.reason)))
  )
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Persisted configuration state is invalid.',
    );
  const typed = document as unknown as ConfigDocument;
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
      'Configuration partition integrity is invalid.',
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
  for (const mapKey of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const oldValue = before.get(mapKey);
    const newValue = after.get(mapKey);
    const value = oldValue ?? newValue!;
    const flag = value.contractKind === 'configuration.feature_flag';
    const activation = flag ? ('current_runtime' as const) : ('on_deploy' as const);
    if (oldValue === undefined)
      result.push({
        contractKind: value.contractKind,
        canonicalKey: value.canonicalKey,
        changeKind: flag ? 'feature_flag_added' : 'configuration_key_added',
        compatibility: complete ? 'compatible' : 'unknown',
        activation,
        headShapeHash: value.shapeHash,
        coverageDependencies: ['configuration.head.complete'],
        remedy: { kind: 'none', text: 'No consumer coordination is required for this addition.' },
      });
    else if (newValue === undefined)
      result.push({
        contractKind: value.contractKind,
        canonicalKey: value.canonicalKey,
        changeKind: flag ? 'feature_flag_removed' : 'configuration_key_removed',
        compatibility: complete ? 'breaking' : 'unknown',
        activation,
        baseShapeHash: value.shapeHash,
        coverageDependencies: ['configuration.base.complete', 'configuration.head.complete'],
        remedy: {
          kind: 'coordinate_configuration_change',
          text: 'Coordinate affected consumers before removing this configuration contract.',
        },
      });
    else if (oldValue.shapeHash !== newValue.shapeHash)
      result.push({
        contractKind: value.contractKind,
        canonicalKey: value.canonicalKey,
        changeKind: flag ? 'feature_flag_changed' : 'configuration_key_changed',
        compatibility: complete ? 'potentially_breaking' : 'unknown',
        activation,
        baseShapeHash: oldValue.shapeHash,
        headShapeHash: newValue.shapeHash,
        coverageDependencies: ['configuration.base.complete', 'configuration.head.complete'],
        remedy: {
          kind: 'coordinate_configuration_change',
          text: 'Review affected configuration consumers.',
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

export const configAdapter: IncrementalContractAdapterV2 = new (class {
  public readonly manifest = manifest;
  public async extract(request: ExtractRequestV2) {
    return extraction(
      request.artifacts
        .map((item) => parseArtifact(item, request.context))
        .filter((item): item is ConfigDocument => item !== null),
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
            limitations: [{ code: 'incomplete_configuration_extraction' }],
          },
      diagnostics: [],
    });
  }
  public async buildPartitions(request: ExtractRequestV2) {
    const documents = request.artifacts
      .map((item) => parseArtifact(item, request.context))
      .filter((item): item is ConfigDocument => item !== null);
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
    const logical = new Map<string, ConfigDocument>();
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
          diagnostic('parse_failure', 'error', 'Persisted configuration state is invalid.'),
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
            'Changed configuration artifact is unavailable.',
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
