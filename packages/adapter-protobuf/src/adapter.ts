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

import {
  protobufFieldNameFallbackKey,
  protobufFieldWireKey,
  protobufMethodKey,
} from './identity.js';
import { PROTOBUF_ADAPTER_MANIFEST } from './manifest.js';
import { parseDescriptorSetJson, type DescriptorField, type DescriptorMethod } from './parser.js';

const decoder = new TextDecoder('utf-8', { fatal: true });
const manifest = PROTOBUF_ADAPTER_MANIFEST;
const tool = manifest.externalTools[0]!;

type DescriptorDocumentFact =
  | {
      readonly state: 'parsed';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly methods: readonly DescriptorMethod[];
      readonly fields: readonly DescriptorField[];
    }
  | {
      readonly state: 'failed';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly reason: 'byte_limit' | 'parse_failure';
    };

interface DescriptorPartitionPayload extends Readonly<Record<string, unknown>> {
  readonly schema: 'reverb.protobuf-descriptor-partition';
  readonly schemaVersion: '1.0';
  readonly descriptor: DescriptorDocumentFact;
}

function diagnostic(
  severity: BoundedDiagnostic['severity'],
  message: string,
  scope?: RepoPath,
): BoundedDiagnostic {
  return scope === undefined
    ? { code: 'parse_failure', severity, safeMessage: message.slice(0, 256) }
    : { code: 'parse_failure', severity, safeMessage: message.slice(0, 256), scope };
}

function contextString(
  context: Readonly<Record<string, unknown>>,
  name: string,
): string | undefined {
  const value = context[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function metadata(category: string): DifferMetadata {
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
  return typeof (value as { readonly run?: unknown }).run === 'function'
    ? (value as AdapterSandboxRunner)
    : undefined;
}

function sourceFingerprint(
  documents: readonly DescriptorDocumentFact[],
  config: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
): ContentHash {
  const referenceIdentity = generatedReferences(config, context)
    .map((reference) => ({
      contractKind: reference.contractKind,
      canonicalKey: reference.canonicalKey ?? null,
      unresolvedPattern: reference.unresolvedPattern ?? null,
      path: reference.path,
      contentHash: reference.contentHash,
    }))
    .sort((left, right) =>
      `${left.contractKind}\0${left.canonicalKey ?? ''}\0${left.unresolvedPattern ?? ''}\0${left.path}\0${left.contentHash}`.localeCompare(
        `${right.contractKind}\0${right.canonicalKey ?? ''}\0${right.unresolvedPattern ?? ''}\0${right.path}\0${right.contentHash}`,
      ),
    );
  return contentHash(
    hashCanonical({
      descriptors: documents
        .map(({ path, contentHash: hash, classification, state }) => ({
          path,
          contentHash: hash,
          classification,
          state,
        }))
        .sort((left, right) =>
          `${left.path}\0${left.contentHash}\0${left.classification}\0${left.state}`.localeCompare(
            `${right.path}\0${right.contentHash}\0${right.classification}\0${right.state}`,
          ),
        ),
      generatedStubBindings: referenceIdentity,
    }),
  );
}

function generatedReferences(
  config: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
): readonly ContractReference[] {
  const raw = context.generatedStubBindings;
  if (!Array.isArray(raw)) return [];
  const references: ContractReference[] = [];
  for (const value of raw) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const item = value as Readonly<Record<string, unknown>>;
    if (typeof item.kind !== 'string' || typeof item.path !== 'string') continue;
    let path;
    try {
      path = repoPath(item.path);
    } catch {
      continue;
    }
    const packageName = typeof item.packageName === 'string' ? item.packageName : '';
    const declaration = typeof item.declaration === 'string' ? item.declaration : '';
    const member = typeof item.member === 'string' ? item.member : '';
    if (declaration.length === 0 || member.length === 0) continue;
    const hash =
      typeof item.contentHash === 'string'
        ? (() => {
            try {
              return contentHash(item.contentHash as string);
            } catch {
              return contentHash(hashCanonical({ path, item }));
            }
          })()
        : contentHash(hashCanonical({ path, item }));
    if (item.kind === 'method') {
      references.push({
        contractKind: 'protobuf_method',
        canonicalKey: protobufMethodKey(packageName, declaration, member),
        semanticOwner: `${declaration}.${member}`,
        path,
        contentHash: hash,
        extractorId: manifest.id,
        extractorVersion: manifest.version,
        identityVersion: manifest.identityVersion,
        configRevision: config,
        evidenceStratum: 'descriptor_method',
        activation: 'on_deploy',
      });
    } else if (item.kind === 'field') {
      const fieldNumber = item.fieldNumber;
      const exact =
        typeof fieldNumber === 'number' && Number.isSafeInteger(fieldNumber) && fieldNumber > 0;
      references.push({
        contractKind: 'protobuf_field',
        canonicalKey: exact
          ? protobufFieldWireKey(packageName, declaration, fieldNumber)
          : protobufFieldNameFallbackKey(packageName, declaration, member),
        semanticOwner: `${declaration}.${exact ? String(fieldNumber) : member}`,
        path,
        contentHash: hash,
        extractorId: manifest.id,
        extractorVersion: manifest.version,
        identityVersion: manifest.identityVersion,
        configRevision: config,
        evidenceStratum: exact ? 'descriptor_field_wire' : 'generated_name_fallback',
        activation: 'on_deploy',
      });
    }
  }
  return references.sort((left, right) =>
    `${left.contractKind}\0${left.canonicalKey ?? ''}\0${left.unresolvedPattern ?? ''}\0${left.path}\0${left.contentHash}`.localeCompare(
      `${right.contractKind}\0${right.canonicalKey ?? ''}\0${right.unresolvedPattern ?? ''}\0${right.path}\0${right.contentHash}`,
    ),
  );
}

function coverage(
  eligible: number,
  processed: number,
  failed: number,
  ambiguous: number,
): AdapterCoverage {
  return {
    state:
      eligible === 0
        ? 'unsupported'
        : failed === eligible
          ? 'failed'
          : failed > 0 || ambiguous > 0
            ? 'partial'
            : 'complete',
    eligibleArtifacts: eligible,
    processedArtifacts: processed,
    skippedArtifacts: 0,
    failedArtifacts: failed,
    limitations: [
      ...(failed > 0 ? [{ code: 'descriptor_parse_failure' }] : []),
      ...(ambiguous > 0 ? [{ code: 'ambiguous_descriptor_identity' }] : []),
    ],
  };
}

function uniqueDefinitions(values: readonly ContractDefinition[]): {
  readonly definitions: readonly ContractDefinition[];
  readonly ambiguousKeys: ReadonlySet<string>;
} {
  const unique = new Map<string, ContractDefinition>();
  const ambiguous = new Set<string>();
  for (const value of [...values].sort((left, right) =>
    `${left.canonicalKey}\0${left.path}`.localeCompare(`${right.canonicalKey}\0${right.path}`),
  )) {
    if (ambiguous.has(value.canonicalKey)) continue;
    const prior = unique.get(value.canonicalKey);
    if (prior === undefined) unique.set(value.canonicalKey, value);
    else if (prior.shapeHash !== value.shapeHash) {
      unique.delete(value.canonicalKey);
      ambiguous.add(value.canonicalKey);
    }
  }
  return { definitions: [...unique.values()], ambiguousKeys: ambiguous };
}

function parseDescriptorFact(artifact: ArtifactInput): DescriptorDocumentFact | null {
  if (artifact.classification === 'vendored' || artifact.classification === 'test') return null;
  let text: string;
  try {
    text = decoder.decode(artifact.bytes);
  } catch {
    return null;
  }
  const probable = /^\s*\{[\s\S]*["']file["']\s*:/.test(text);
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
    const parsed = parseDescriptorSetJson(text, manifest.resourceBudget.maximumItems);
    return parsed === null
      ? null
      : {
          state: 'parsed',
          path: artifact.path,
          contentHash: artifact.contentHash,
          classification: artifact.classification,
          methods: parsed.methods,
          fields: parsed.fields,
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

function materializeDescriptors(
  documents: readonly DescriptorDocumentFact[],
  config: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
) {
  const definitions: ContractDefinition[] = [];
  const diagnostics: BoundedDiagnostic[] = [];
  let processed = 0;
  let failed = 0;
  for (const document of [...documents].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    if (document.state === 'failed') {
      failed += 1;
      diagnostics.push(
        diagnostic(
          'error',
          document.reason === 'byte_limit'
            ? 'Descriptor input exceeds the declared byte limit.'
            : 'Descriptor input could not be parsed safely.',
          document.path,
        ),
      );
      continue;
    }
    processed += 1;
    for (const method of document.methods) {
      const canonical = canonicalShape(method.shape);
      definitions.push({
        contractKind: 'protobuf_method',
        canonicalKey: protobufMethodKey(method.packageName, method.serviceName, method.methodName),
        displayName: `${method.serviceName}.${method.methodName}`,
        path: document.path,
        contentHash: document.contentHash,
        shapeHash: canonical.shapeHash,
        shape: canonical.shape,
        extractorId: manifest.id,
        extractorVersion: manifest.version,
        identityVersion: manifest.identityVersion,
        configRevision: config,
        evidenceStratum: 'descriptor_method',
      });
    }
    for (const field of document.fields) {
      const canonical = canonicalShape(field.shape);
      definitions.push({
        contractKind: 'protobuf_field',
        canonicalKey: protobufFieldWireKey(field.packageName, field.messageName, field.fieldNumber),
        displayName: `${field.messageName}.${field.fieldName}`,
        path: document.path,
        contentHash: document.contentHash,
        shapeHash: canonical.shapeHash,
        shape: canonical.shape,
        extractorId: manifest.id,
        extractorVersion: manifest.version,
        identityVersion: manifest.identityVersion,
        configRevision: config,
        evidenceStratum: 'descriptor_field_wire',
      });
    }
  }
  const unique = uniqueDefinitions(definitions);
  if (unique.ambiguousKeys.size > 0) {
    diagnostics.push(
      diagnostic(
        'warning',
        'Conflicting descriptor declarations share an identity and were left unresolved.',
      ),
    );
  }
  const references = generatedReferences(config, context).map((reference) => {
    if (reference.canonicalKey === undefined || !unique.ambiguousKeys.has(reference.canonicalKey)) {
      return reference;
    }
    return {
      contractKind: reference.contractKind,
      unresolvedPattern: reference.canonicalKey,
      unresolvedReason: 'ambiguous_descriptor_identity',
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
  return finalizeExtraction({
    schema: 'reverb.adapter-extraction',
    schemaVersion: '1.0',
    adapterId: manifest.id,
    adapterVersion: manifest.version,
    identityVersion: manifest.identityVersion,
    configRevision: config,
    definitions: unique.definitions,
    references,
    coverage: coverage(documents.length, processed, failed, unique.ambiguousKeys.size),
    diagnostics,
    sourceFingerprint: sourceFingerprint(documents, config, context),
  });
}

function diffCoverage(eligible: number, changed: number, complete: boolean): AdapterCoverage {
  return {
    state: complete ? 'complete' : 'partial',
    eligibleArtifacts: eligible,
    processedArtifacts: changed,
    skippedArtifacts: eligible - changed,
    failedArtifacts: 0,
    limitations: complete ? [] : [{ code: 'incomplete_input' }],
  };
}

function partitionKey(path: RepoPath): string {
  return `descriptor:${path}`;
}

function encodeDocument(descriptor: DescriptorDocumentFact): DescriptorPartitionPayload {
  return {
    schema: 'reverb.protobuf-descriptor-partition',
    schemaVersion: '1.0',
    descriptor,
  };
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requirePayload(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AdapterValidationError('invalid_partition_payload', message);
}

function decodeDocument(payload: Readonly<Record<string, unknown>>): DescriptorDocumentFact {
  requirePayload(
    payload.schema === 'reverb.protobuf-descriptor-partition' && payload.schemaVersion === '1.0',
    'Protobuf partition payload schema is unsupported.',
  );
  requirePayload(record(payload.descriptor), 'Protobuf partition descriptor is invalid.');
  const value = payload.descriptor;
  requirePayload(
    typeof value.path === 'string' &&
      typeof value.contentHash === 'string' &&
      ['source', 'generated', 'vendored', 'test', 'example'].includes(
        String(value.classification),
      ) &&
      (value.state === 'parsed' || value.state === 'failed'),
    'Protobuf partition descriptor fields are invalid.',
  );
  const common = {
    path: repoPath(value.path),
    contentHash: contentHash(value.contentHash),
    classification: value.classification as ArtifactInput['classification'],
  };
  if (value.state === 'failed') {
    requirePayload(
      value.reason === 'byte_limit' || value.reason === 'parse_failure',
      'Protobuf partition failure is invalid.',
    );
    return { state: 'failed', ...common, reason: value.reason };
  }
  requirePayload(
    Array.isArray(value.methods) && Array.isArray(value.fields),
    'Protobuf partition parsed facts are invalid.',
  );
  return {
    state: 'parsed',
    ...common,
    methods: value.methods as unknown as readonly DescriptorMethod[],
    fields: value.fields as unknown as readonly DescriptorField[],
  };
}

function buildPartition(
  document: DescriptorDocumentFact,
  config: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
): AdapterPartitionBuild {
  return {
    partitionKey: partitionKey(document.path),
    ownedPaths: [document.path],
    dependencyKeys: [],
    payload: encodeDocument(document),
    extraction: materializeDescriptors([document], config, context),
  };
}

function buildResult(
  documents: readonly DescriptorDocumentFact[],
  partitions: readonly AdapterPartitionBuild[],
  config: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
): AdapterPartitionBuildResult {
  const extraction = materializeDescriptors(documents, config, context);
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

export class ProtobufContractAdapter implements IncrementalContractAdapter {
  public readonly manifest = manifest;
  public readonly partitioningVersion = 1;

  public async extract(request: ExtractRequest) {
    const documents = request.artifacts.flatMap((artifact) => {
      const fact = parseDescriptorFact(artifact);
      return fact === null ? [] : [fact];
    });
    return materializeDescriptors(documents, request.configRevision, request.context);
  }

  public async buildPartitions(request: ExtractRequest): Promise<AdapterPartitionBuildResult> {
    const documents = request.artifacts.flatMap((artifact) => {
      const fact = parseDescriptorFact(artifact);
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
          'Protobuf partition keys must be unique.',
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
    const logical = new Map<string, DescriptorDocumentFact>();
    try {
      for (const partition of request.basePartitions) {
        const document = decodeDocument(partition.payload);
        if (
          partition.partitionKey !== partitionKey(document.path) ||
          logical.has(partition.partitionKey)
        ) {
          throw new AdapterValidationError(
            'invalid_partition_payload',
            'Protobuf partition identity does not match its descriptor.',
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
        diagnostics: [diagnostic('error', 'Persisted Protobuf descriptor state is invalid.')],
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
      if (change.kind !== 'copied' && change.previousPath !== undefined)
        remove(change.previousPath);
      if (change.kind !== 'deleted') expectedHeadPaths.add(change.path);
    }
    const replacements = new Map<string, AdapterPartitionBuild>();
    const supplied = new Set<RepoPath>();
    for (const artifact of request.changedArtifacts) {
      supplied.add(artifact.path);
      const document = parseDescriptorFact(artifact);
      if (document === null) continue;
      const replacement = buildPartition(document, request.configRevision, request.context);
      logical.set(replacement.partitionKey, document);
      replacements.set(replacement.partitionKey, replacement);
      tombstones.delete(replacement.partitionKey);
    }
    const missingPaths = [...expectedHeadPaths].filter((path) => !supplied.has(path)).sort();
    const extraction = materializeDescriptors(
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
    return updateResult({
      replacements: [...replacements.values()].sort((left, right) =>
        left.partitionKey.localeCompare(right.partitionKey),
      ),
      tombstones: [...tombstones].sort(),
      coverage,
      diagnostics: [
        ...extraction.diagnostics,
        ...missingPaths.map((path) =>
          diagnostic('error', 'A changed artifact was unavailable within the source budget.', path),
        ),
      ],
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
        'Protobuf partition set contains a duplicate or mismatched identity.',
      );
      keys.add(partition.partitionKey);
      return document;
    });
    return materializeDescriptors(documents, request.configRevision, request.context);
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
        coverage: {
          state: 'failed',
          eligibleArtifacts: 0,
          processedArtifacts: 0,
          skippedArtifacts: 0,
          failedArtifacts: 0,
          limitations: [{ code: 'incompatible_extraction' }],
        },
        diagnostics: [diagnostic('error', 'Adapter extraction versions are incompatible.')],
      });
    }
    const category = contextString(request.context, 'breakingCategory') ?? 'FILE';
    const allowedCategory = ['FILE', 'PACKAGE', 'WIRE_JSON', 'WIRE'].includes(category)
      ? category
      : 'FILE';
    const sandbox = sandboxFrom(request.context);
    const baseRef = contextString(request.context, 'baseBlobRef');
    const headRef = contextString(request.context, 'headBlobRef');
    let toolState: 'compatible' | 'breaking' | 'unknown' | 'tool_failure' = 'unknown';
    if (sandbox !== undefined && baseRef !== undefined && headRef !== undefined) {
      const differ = new DeclaredExternalDiffer(tool, sandbox, {
        timeoutMs: manifest.resourceBudget.timeoutMs,
        memoryMiB: manifest.resourceBudget.memoryMiB,
        maximumOutputBytes: manifest.resourceBudget.maximumOutputBytes,
        exitMap: { compatible: [0], breaking: [100], unknown: [] },
        category: allowedCategory,
      });
      toolState = (
        await differ.run(
          [
            'breaking',
            '/inputs/head.json',
            '--against',
            '/inputs/base.json',
            '--error-format=json',
          ],
          [baseRef, headRef],
        )
      ).state;
    }
    const complete =
      request.base.coverage.state === 'complete' && request.head.coverage.state === 'complete';
    const base = new Map(request.base.definitions.map((value) => [value.canonicalKey, value]));
    const head = new Map(request.head.definitions.map((value) => [value.canonicalKey, value]));
    const keys = [...new Set([...base.keys(), ...head.keys()])].sort();
    const changes: ContractChange[] = [];
    for (const key of keys) {
      const before = base.get(key);
      const after = head.get(key);
      if (before?.shapeHash === after?.shapeHash) continue;
      const fallback = (before ?? after)?.evidenceStratum === 'generated_name_fallback';
      let compatibility: ContractChange['compatibility'] = 'unknown';
      if (before === undefined && complete && !fallback) compatibility = 'compatible';
      else if (complete && !fallback && toolState === 'compatible') compatibility = 'compatible';
      else if (complete && !fallback && toolState === 'breaking') compatibility = 'breaking';
      const kind = before?.contractKind ?? after!.contractKind;
      changes.push({
        contractKind: kind,
        canonicalKey: key,
        changeKind:
          before === undefined
            ? 'declaration_added'
            : after === undefined
              ? 'declaration_removed'
              : 'declaration_changed',
        compatibility,
        activation: 'on_deploy',
        ...(before === undefined ? {} : { baseShapeHash: before.shapeHash }),
        ...(after === undefined ? {} : { headShapeHash: after.shapeHash }),
        coverageDependencies: [
          'base.descriptor_set',
          'head.descriptor_set',
          `buf.${allowedCategory}`,
        ],
        remedy: {
          kind: 'reserve_or_coordinate',
          text: 'Preserve the prior wire/source contract, reserve deleted identifiers, or coordinate rollout.',
        },
        differ: metadata(allowedCategory),
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
      diagnostics:
        toolState === 'unknown' || toolState === 'tool_failure'
          ? [
              diagnostic(
                'warning',
                'The pinned Buf differ did not produce a usable result; compatibility is unknown.',
              ),
            ]
          : [],
    });
  }
}

export const protobufAdapter = new ProtobufContractAdapter();
