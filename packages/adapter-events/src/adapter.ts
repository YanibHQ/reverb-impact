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
  type AdapterPartitionDescriptor,
  type AdapterPartitionBuildV2,
  type AdapterPartitionViewV2,
  type AdapterPartitionUpdateResultV2,
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
  eventDestinationKey,
  eventPayloadSchemaKey,
  EVENT_DESTINATION_KINDS,
  EVENT_PROVIDERS,
  type EventDestinationKind,
  type EventProvider,
} from './identity.js';
import { EVENTS_ADAPTER_MANIFEST } from './manifest.js';
import { isRecord, parseEventManifest, type EventBinding } from './parser.js';

const decoder = new TextDecoder('utf-8', { fatal: true });
const manifest = EVENTS_ADAPTER_MANIFEST;

interface LocatedBinding extends EventBinding {
  readonly range?: SourceRange;
}

type EventDocumentFact =
  | {
      readonly state: 'parsed';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly bindings: readonly LocatedBinding[];
      readonly evidenceStratum: 'event_manifest' | 'literal_source_binding';
    }
  | {
      readonly state: 'incomplete';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly reason: 'unresolved_source_binding';
    }
  | {
      readonly state: 'failed';
      readonly path: RepoPath;
      readonly contentHash: ContentHash;
      readonly classification: ArtifactInput['classification'];
      readonly reason: 'byte_limit' | 'parse_failure';
    };

interface EventPartitionPayload extends Readonly<Record<string, unknown>> {
  readonly schema: 'reverb.event-partition';
  readonly schemaVersion: '1.0';
  readonly document: EventDocumentFact;
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

function sourceRange(text: string, offset: number, length: number): SourceRange {
  const lines = text.slice(0, offset).split('\n');
  const startLine = lines.length;
  const startColumn = (lines.at(-1)?.length ?? 0) + 1;
  return { startLine, startColumn, endLine: startLine, endColumn: startColumn + length };
}

function contextNamespace(
  context: Readonly<Record<string, unknown>>,
  provider: EventProvider,
): string | undefined {
  const namespaces = context.brokerNamespaces;
  if (typeof namespaces !== 'object' || namespaces === null || Array.isArray(namespaces)) {
    return undefined;
  }
  const value = (namespaces as Readonly<Record<string, unknown>>)[provider];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function literalBindings(
  text: string,
  context: Readonly<Record<string, unknown>>,
): readonly LocatedBinding[] {
  const bindings: LocatedBinding[] = [];
  const add = (
    regex: RegExp,
    provider: EventProvider,
    role: EventBinding['role'],
    destinationKind: EventDestinationKind,
    destinationGroup = 1,
    namespaceFromMatch?: (match: RegExpExecArray) => string | undefined,
  ) => {
    for (const match of text.matchAll(regex)) {
      const destination = match[destinationGroup];
      if (destination === undefined || destination.length === 0 || destination.length > 512)
        continue;
      const offset = match.index + match[0].indexOf(destination);
      const brokerNamespace = namespaceFromMatch?.(match) ?? contextNamespace(context, provider);
      bindings.push({
        provider,
        role,
        destinationKind,
        destination,
        ...(brokerNamespace === undefined ? {} : { brokerNamespace }),
        range: sourceRange(text, offset, destination.length),
      });
    }
  };
  add(
    /\.send\s*\(\s*\{[\s\S]{0,512}?\btopic\s*:\s*['"]([^'"\n]+)['"]/g,
    'kafka',
    'producer',
    'topic',
  );
  add(
    /\.subscribe\s*\(\s*\{[\s\S]{0,512}?\btopic\s*:\s*['"]([^'"\n]+)['"]/g,
    'kafka',
    'consumer',
    'topic',
  );
  const sqsNamespace = (match: RegExpExecArray): string | undefined => {
    const region = match[1];
    const account = match[2];
    return region && account ? `aws:${region}:${account}` : undefined;
  };
  add(
    /SendMessageCommand\s*\(\s*\{[\s\S]{0,512}?\bQueueUrl\s*:\s*['"]https:\/\/sqs\.([a-z0-9-]+)\.amazonaws\.com\/([0-9]+)\/([^'"/?\n]+)['"]/g,
    'aws_sqs',
    'producer',
    'queue',
    3,
    sqsNamespace,
  );
  add(
    /ReceiveMessageCommand\s*\(\s*\{[\s\S]{0,512}?\bQueueUrl\s*:\s*['"]https:\/\/sqs\.([a-z0-9-]+)\.amazonaws\.com\/([0-9]+)\/([^'"/?\n]+)['"]/g,
    'aws_sqs',
    'consumer',
    'queue',
    3,
    sqsNamespace,
  );
  const snsNamespace = (match: RegExpExecArray): string | undefined => {
    const region = match[1];
    const account = match[2];
    return region && account ? `aws:${region}:${account}` : undefined;
  };
  add(
    /PublishCommand\s*\(\s*\{[\s\S]{0,512}?\bTopicArn\s*:\s*['"]arn:aws:sns:([a-z0-9-]+):([0-9]+):([^'"\n]+)['"]/g,
    'aws_sns',
    'producer',
    'topic',
    3,
    snsNamespace,
  );
  add(
    /SubscribeCommand\s*\(\s*\{[\s\S]{0,512}?\bTopicArn\s*:\s*['"]arn:aws:sns:([a-z0-9-]+):([0-9]+):([^'"\n]+)['"]/g,
    'aws_sns',
    'consumer',
    'topic',
    3,
    snsNamespace,
  );
  add(
    /\.topic\s*\(\s*['"]([^'"\n]+)['"]\s*\)\s*\.publishMessage\s*\(/g,
    'gcp_pubsub',
    'producer',
    'topic',
  );
  add(
    /\.topic\s*\(\s*['"]([^'"\n]+)['"]\s*\)\s*\.subscription\s*\(/g,
    'gcp_pubsub',
    'consumer',
    'topic',
  );
  return bindings.sort((left, right) =>
    `${left.provider}\0${left.destination}\0${left.role}`.localeCompare(
      `${right.provider}\0${right.destination}\0${right.role}`,
    ),
  );
}

function parseArtifact(
  artifact: ArtifactInput,
  context: Readonly<Record<string, unknown>>,
): EventDocumentFact | null {
  if (artifact.classification === 'vendored' || artifact.classification === 'test') return null;
  let text: string;
  try {
    text = decoder.decode(artifact.bytes);
  } catch {
    return null;
  }
  const probable =
    /reverb\.events|\.send\s*\(|\.subscribe\s*\(|(?:Send|Receive)MessageCommand|PublishCommand|\.publishMessage\s*\(/.test(
      text,
    );
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
    const parsed = parseEventManifest(text, manifest.resourceBudget.maximumItems);
    if (parsed !== null) {
      return {
        state: 'parsed',
        path: artifact.path,
        contentHash: artifact.contentHash,
        classification: artifact.classification,
        bindings: parsed.bindings.map((binding) => {
          const token = binding.destination ?? binding.destinationExpression ?? '';
          const offset = text.indexOf(token);
          return {
            ...binding,
            ...(binding.destinationExpression === undefined
              ? {}
              : { destinationExpression: hashCanonical(binding.destinationExpression) }),
            ...(offset < 0 ? {} : { range: sourceRange(text, offset, token.length) }),
          };
        }),
        evidenceStratum: 'event_manifest',
      };
    }
    const bindings = literalBindings(text, context);
    return bindings.length === 0
      ? probable
        ? {
            state: 'incomplete',
            path: artifact.path,
            contentHash: artifact.contentHash,
            classification: artifact.classification,
            reason: 'unresolved_source_binding',
          }
        : null
      : {
          state: 'parsed',
          path: artifact.path,
          contentHash: artifact.contentHash,
          classification: artifact.classification,
          bindings,
          evidenceStratum: 'literal_source_binding',
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

function definition(
  document: Extract<EventDocumentFact, { state: 'parsed' }>,
  binding: LocatedBinding,
  configRevision: ConfigRevision,
  contractKind: 'event.destination' | 'event.payload_schema',
  canonicalKey: string,
  displayName: string,
  shape: Readonly<Record<string, unknown>>,
): ContractDefinitionV2 {
  const canonical = canonicalShape(shape);
  return {
    contractKind,
    canonicalKey,
    displayName,
    path: document.path,
    ...(binding.range === undefined ? {} : { range: binding.range }),
    contentHash: document.contentHash,
    ...canonical,
    ...evidenceVersion,
    configRevision,
    evidenceStratum: document.evidenceStratum,
  };
}

function reference(
  document: Extract<EventDocumentFact, { state: 'parsed' }>,
  binding: LocatedBinding,
  configRevision: ConfigRevision,
  contractKind: 'event.destination' | 'event.payload_schema',
  identity:
    | { readonly canonicalKey: string }
    | { readonly pattern: string; readonly reason: string },
): ContractReferenceV2 {
  return {
    contractKind,
    ...('canonicalKey' in identity
      ? { canonicalKey: identity.canonicalKey }
      : { unresolvedPattern: identity.pattern, unresolvedReason: identity.reason }),
    semanticOwner: `${binding.role}:${binding.provider}:${binding.destination ?? `dynamic:${binding.destinationExpression}`}`,
    path: document.path,
    ...(binding.range === undefined ? {} : { range: binding.range }),
    contentHash: document.contentHash,
    ...evidenceVersion,
    configRevision,
    evidenceStratum: document.evidenceStratum,
    activation: 'on_deploy',
  };
}

function materialize(documents: readonly EventDocumentFact[], configRevision: ConfigRevision) {
  const definitions: ContractDefinitionV2[] = [];
  const references: ContractReferenceV2[] = [];
  const diagnostics: BoundedDiagnostic[] = [];
  const limitations: AdapterCoverageV2['limitations'][number][] = [];
  let processed = 0;
  let failed = 0;
  for (const document of [...documents].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    if (document.state === 'incomplete') {
      processed += 1;
      limitations.push({ code: document.reason, scope: document.path });
      diagnostics.push(
        diagnostic(
          'ambiguous_alias',
          'warning',
          'A probable event binding does not contain a supported literal destination.',
          document.path,
        ),
      );
      continue;
    }
    if (document.state === 'failed') {
      failed += 1;
      limitations.push({ code: document.reason, scope: document.path });
      diagnostics.push(
        diagnostic(
          document.reason === 'byte_limit' ? 'source_truncated' : 'parse_failure',
          'error',
          document.reason === 'byte_limit'
            ? 'Event input exceeds the declared byte limit.'
            : 'Event input could not be parsed safely.',
          document.path,
        ),
      );
      continue;
    }
    processed += 1;
    for (const binding of document.bindings) {
      const destination = binding.destination;
      const namespace = binding.brokerNamespace;
      if (destination === undefined || namespace === undefined) {
        const reason =
          destination === undefined ? 'dynamic_destination' : 'broker_namespace_missing';
        limitations.push({ code: reason, scope: document.path });
        diagnostics.push(
          diagnostic(
            'ambiguous_alias',
            'warning',
            'Event binding lacks a literal destination or resolved broker namespace.',
            document.path,
          ),
        );
        if (binding.role === 'consumer') {
          references.push(
            reference(document, binding, configRevision, 'event.destination', {
              pattern:
                binding.destination === undefined
                  ? `${binding.provider}:dynamic:${binding.destinationExpression}`
                  : `${binding.provider}:${binding.destination}`,
              reason,
            }),
          );
        }
        continue;
      }
      const destinationKey = eventDestinationKey({
        provider: binding.provider,
        brokerNamespace: namespace,
        destinationKind: binding.destinationKind,
        destination,
      });
      if (binding.role === 'producer') {
        definitions.push(
          definition(
            document,
            binding,
            configRevision,
            'event.destination',
            destinationKey,
            destination,
            {
              provider: binding.provider,
              brokerNamespace: namespace,
              destinationKind: binding.destinationKind,
              destination,
              delivery: binding.delivery ?? 'unknown',
              ordering: binding.ordering ?? 'unknown',
              payloadSchemaId: binding.payloadSchema?.id ?? null,
            },
          ),
        );
      } else {
        references.push(
          reference(document, binding, configRevision, 'event.destination', {
            canonicalKey: destinationKey,
          }),
        );
      }
      if (binding.payloadSchema !== undefined) {
        const schemaKey = eventPayloadSchemaKey({
          destinationKey,
          schemaId: binding.payloadSchema.id,
        });
        if (binding.role === 'producer' && binding.payloadSchema.schema !== undefined) {
          definitions.push(
            definition(
              document,
              binding,
              configRevision,
              'event.payload_schema',
              schemaKey,
              binding.payloadSchema.id,
              { schema: binding.payloadSchema.schema },
            ),
          );
        } else if (binding.role === 'consumer') {
          references.push(
            reference(document, binding, configRevision, 'event.payload_schema', {
              canonicalKey: schemaKey,
            }),
          );
        } else {
          limitations.push({ code: 'producer_payload_schema_missing', scope: document.path });
        }
      }
    }
  }
  const uniqueLimitations = [
    ...new Map(limitations.map((value) => [`${value.code}\0${value.scope}`, value])).values(),
  ].sort((left, right) =>
    `${left.code}\0${left.scope}`.localeCompare(`${right.code}\0${right.scope}`),
  );
  const definitionsByKey = new Map<string, ContractDefinitionV2>();
  const ambiguous = new Set<string>();
  for (const value of definitions) {
    const key = `${value.contractKind}\0${value.canonicalKey}`;
    const prior = definitionsByKey.get(key);
    if (prior === undefined && !ambiguous.has(key)) definitionsByKey.set(key, value);
    else if (prior !== undefined && prior.shapeHash !== value.shapeHash) {
      definitionsByKey.delete(key);
      ambiguous.add(key);
    }
  }
  for (const key of ambiguous) {
    const scope = definitions.find(
      (value) => `${value.contractKind}\0${value.canonicalKey}` === key,
    )?.path;
    uniqueLimitations.push({
      code: 'ambiguous_event_definition',
      ...(scope === undefined ? {} : { scope }),
    });
  }
  uniqueLimitations.sort((left, right) =>
    `${left.code}\0${left.scope}`.localeCompare(`${right.code}\0${right.scope}`),
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
    limitations: documents.length === 0 ? [{ code: 'event_inputs_not_found' }] : uniqueLimitations,
  };
  return { definitions: [...definitionsByKey.values()], references, coverage, diagnostics };
}

function sourceFingerprint(documents: readonly EventDocumentFact[]): ContentHash {
  return contentHash(
    hashCanonical(
      documents
        .map((value) => ({
          path: value.path,
          contentHash: value.contentHash,
          classification: value.classification,
          state: value.state,
        }))
        .sort((left, right) => left.path.localeCompare(right.path)),
    ),
  );
}

function extraction(documents: readonly EventDocumentFact[], configRevision: ConfigRevision) {
  const result = materialize(documents, configRevision);
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
  return `event-document:${path}`;
}

function buildPartition(
  document: EventDocumentFact,
  configRevision: ConfigRevision,
): AdapterPartitionBuildV2 {
  const payload: EventPartitionPayload = {
    schema: 'reverb.event-partition',
    schemaVersion: '1.0',
    document,
  };
  return {
    partitionKey: partitionKey(document.path),
    ownedPaths: [document.path],
    dependencyKeys: [],
    payload,
    extraction: extraction([document], configRevision),
  };
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

function validPersistedRange(value: unknown): boolean {
  if (value === undefined) return true;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['startLine', 'startColumn', 'endLine', 'endColumn'])
  ) {
    return false;
  }
  const coordinates = [value.startLine, value.startColumn, value.endLine, value.endColumn];
  if (
    !coordinates.every((coordinate) => Number.isSafeInteger(coordinate) && Number(coordinate) > 0)
  ) {
    return false;
  }
  return (
    Number(value.endLine) > Number(value.startLine) ||
    (value.endLine === value.startLine && Number(value.endColumn) >= Number(value.startColumn))
  );
}

const persistedSchemaKeys = new Set([
  'type',
  'format',
  'properties',
  'required',
  'items',
  'additionalProperties',
  'enum',
  'oneOf',
  'anyOf',
  'allOf',
]);

function validPersistedSchema(value: unknown, budget: { remaining: number }): boolean {
  budget.remaining -= 1;
  if (budget.remaining < 0) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return boundedPersistedText(value, 2_048);
  if (Array.isArray(value)) return value.every((item) => validPersistedSchema(item, budget));
  if (!isRecord(value) || Object.keys(value).some((key) => !persistedSchemaKeys.has(key))) {
    return false;
  }
  if (value.properties !== undefined) {
    if (!isRecord(value.properties)) return false;
    for (const [name, property] of Object.entries(value.properties)) {
      if (!boundedPersistedText(name) || !validPersistedSchema(property, budget)) return false;
    }
  }
  return Object.entries(value).every(
    ([key, item]) => key === 'properties' || validPersistedSchema(item, budget),
  );
}

function validPersistedPayloadSchema(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['id', 'schema']) &&
    boundedPersistedText(value.id) &&
    (value.schema === undefined ||
      (isRecord(value.schema) &&
        validPersistedSchema(value.schema, { remaining: manifest.resourceBudget.maximumItems })))
  );
}

function decodeDocument(payload: Readonly<Record<string, unknown>>): EventDocumentFact {
  if (
    payload.schema !== 'reverb.event-partition' ||
    payload.schemaVersion !== '1.0' ||
    !hasOnlyKeys(payload, ['schema', 'schemaVersion', 'document']) ||
    typeof payload.document !== 'object' ||
    payload.document === null
  ) {
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Persisted event partition is invalid.',
    );
  }
  const document = payload.document as Readonly<Record<string, unknown>>;
  if (
    typeof document.path !== 'string' ||
    typeof document.contentHash !== 'string' ||
    !['source', 'generated', 'vendored', 'test', 'example'].includes(
      String(document.classification),
    )
  ) {
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Persisted event document provenance is invalid.',
    );
  }
  repoPath(document.path);
  contentHash(document.contentHash);
  if (document.state === 'incomplete') {
    if (
      !hasOnlyKeys(document, ['state', 'path', 'contentHash', 'classification', 'reason']) ||
      document.reason !== 'unresolved_source_binding'
    ) {
      throw new AdapterValidationError(
        'invalid_partition_payload',
        'Persisted incomplete event state is invalid.',
      );
    }
    return document as unknown as EventDocumentFact;
  }
  if (document.state === 'failed') {
    if (
      !hasOnlyKeys(document, ['state', 'path', 'contentHash', 'classification', 'reason']) ||
      (document.reason !== 'byte_limit' && document.reason !== 'parse_failure')
    ) {
      throw new AdapterValidationError(
        'invalid_partition_payload',
        'Persisted event failure state is invalid.',
      );
    }
    return document as unknown as EventDocumentFact;
  }
  if (
    document.state !== 'parsed' ||
    !hasOnlyKeys(document, [
      'state',
      'path',
      'contentHash',
      'classification',
      'bindings',
      'evidenceStratum',
    ]) ||
    !Array.isArray(document.bindings) ||
    (document.evidenceStratum !== 'event_manifest' &&
      document.evidenceStratum !== 'literal_source_binding')
  ) {
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Persisted event extraction state is invalid.',
    );
  }
  for (const binding of document.bindings) {
    if (
      !isRecord(binding) ||
      (binding.role !== 'producer' && binding.role !== 'consumer') ||
      !hasOnlyKeys(binding, [
        'role',
        'provider',
        'brokerNamespace',
        'destinationKind',
        'destination',
        'destinationExpression',
        'payloadSchema',
        'delivery',
        'ordering',
        'range',
      ]) ||
      !EVENT_PROVIDERS.includes(binding.provider as EventProvider) ||
      !EVENT_DESTINATION_KINDS.includes(binding.destinationKind as EventDestinationKind) ||
      (typeof binding.destination === 'string') ===
        (typeof binding.destinationExpression === 'string') ||
      (binding.destination !== undefined && !boundedPersistedText(binding.destination)) ||
      (binding.brokerNamespace !== undefined && !boundedPersistedText(binding.brokerNamespace)) ||
      (binding.destinationExpression !== undefined &&
        (typeof binding.destinationExpression !== 'string' ||
          !/^sha256:[0-9a-f]{64}$/.test(binding.destinationExpression))) ||
      (binding.delivery !== undefined &&
        !['at_most_once', 'at_least_once', 'exactly_once', 'unknown'].includes(
          String(binding.delivery),
        )) ||
      (binding.ordering !== undefined &&
        !['ordered', 'unordered', 'partition_ordered', 'unknown'].includes(
          String(binding.ordering),
        )) ||
      !validPersistedPayloadSchema(binding.payloadSchema) ||
      !validPersistedRange(binding.range)
    ) {
      throw new AdapterValidationError(
        'invalid_partition_payload',
        'Persisted event binding is invalid.',
      );
    }
  }
  return document as unknown as EventDocumentFact;
}

function decodePartition(partition: AdapterPartitionViewV2, keys: Set<string>): EventDocumentFact {
  const document = decodeDocument(partition.payload);
  const expectedOutputHash = contentHash(hashCanonical(partition.payload));
  if (
    partition.partitionKey !== partitionKey(document.path) ||
    keys.has(partition.partitionKey) ||
    partition.ownedPaths.length !== 1 ||
    partition.ownedPaths[0] !== document.path ||
    partition.dependencyKeys.length !== 0 ||
    partition.outputHash !== expectedOutputHash
  ) {
    throw new AdapterValidationError(
      'invalid_partition_payload',
      'Event partition identity or integrity is invalid.',
    );
  }
  keys.add(partition.partitionKey);
  return document;
}

function shapeRecord(value: ContractDefinitionV2): Readonly<Record<string, unknown>> {
  return value.shape;
}

function payloadCompatibility(
  base: Readonly<Record<string, unknown>>,
  head: Readonly<Record<string, unknown>>,
): ContractChangeV2['compatibility'] {
  const before = base.schema;
  const after = head.schema;
  if (
    typeof before !== 'object' ||
    before === null ||
    typeof after !== 'object' ||
    after === null
  ) {
    return 'unknown';
  }
  const baseSchema = before as Readonly<Record<string, unknown>>;
  const headSchema = after as Readonly<Record<string, unknown>>;
  if (baseSchema.type !== headSchema.type) return 'breaking';
  const baseProperties =
    typeof baseSchema.properties === 'object' && baseSchema.properties !== null
      ? (baseSchema.properties as Readonly<Record<string, unknown>>)
      : {};
  const headProperties =
    typeof headSchema.properties === 'object' && headSchema.properties !== null
      ? (headSchema.properties as Readonly<Record<string, unknown>>)
      : {};
  for (const [name, property] of Object.entries(baseProperties)) {
    if (!Object.hasOwn(headProperties, name)) return 'breaking';
    if (hashCanonical(property) !== hashCanonical(headProperties[name])) return 'breaking';
  }
  const beforeRequired = new Set(Array.isArray(baseSchema.required) ? baseSchema.required : []);
  const afterRequired = new Set(Array.isArray(headSchema.required) ? headSchema.required : []);
  if ([...beforeRequired].some((name) => !afterRequired.has(name))) return 'breaking';
  const beforeEnum = new Set(Array.isArray(baseSchema.enum) ? baseSchema.enum.map(String) : []);
  const afterEnum = new Set(Array.isArray(headSchema.enum) ? headSchema.enum.map(String) : []);
  if ([...afterEnum].some((value) => !beforeEnum.has(value)) && beforeEnum.size > 0) {
    return 'potentially_breaking';
  }
  return 'compatible';
}

function changes(
  base: readonly ContractDefinitionV2[],
  head: readonly ContractDefinitionV2[],
  coverageComplete: boolean,
): readonly ContractChangeV2[] {
  const before = new Map(
    base.map((value) => [`${value.contractKind}\0${value.canonicalKey}`, value]),
  );
  const after = new Map(
    head.map((value) => [`${value.contractKind}\0${value.canonicalKey}`, value]),
  );
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  const result: ContractChangeV2[] = [];
  for (const key of keys) {
    const oldValue = before.get(key);
    const newValue = after.get(key);
    const value = oldValue ?? newValue!;
    if (oldValue === undefined) {
      result.push({
        contractKind: value.contractKind,
        canonicalKey: value.canonicalKey,
        changeKind:
          value.contractKind === 'event.destination' ? 'destination_added' : 'payload_schema_added',
        compatibility: coverageComplete ? 'compatible' : 'unknown',
        activation: 'on_deploy',
        headShapeHash: value.shapeHash,
        coverageDependencies: ['events.head.complete'],
        remedy: { kind: 'none', text: 'No consumer coordination is required for an addition.' },
      });
    } else if (newValue === undefined) {
      result.push({
        contractKind: value.contractKind,
        canonicalKey: value.canonicalKey,
        changeKind:
          value.contractKind === 'event.destination'
            ? 'destination_removed'
            : 'payload_schema_removed',
        compatibility: coverageComplete ? 'breaking' : 'unknown',
        activation: 'on_deploy',
        baseShapeHash: value.shapeHash,
        coverageDependencies: ['events.base.complete', 'events.head.complete'],
        remedy: {
          kind: 'coordinate_contract_rollout',
          text: 'Coordinate event consumers before removal.',
        },
      });
    } else if (oldValue.shapeHash !== newValue.shapeHash) {
      const compatibility = !coverageComplete
        ? 'unknown'
        : value.contractKind === 'event.payload_schema'
          ? payloadCompatibility(shapeRecord(oldValue), shapeRecord(newValue))
          : 'potentially_breaking';
      result.push({
        contractKind: value.contractKind,
        canonicalKey: value.canonicalKey,
        changeKind:
          value.contractKind === 'event.destination'
            ? 'destination_changed'
            : 'payload_schema_changed',
        compatibility,
        activation: 'on_deploy',
        baseShapeHash: oldValue.shapeHash,
        headShapeHash: newValue.shapeHash,
        coverageDependencies: ['events.base.complete', 'events.head.complete'],
        remedy: {
          kind: compatibility === 'compatible' ? 'none' : 'coordinate_contract_rollout',
          text:
            compatibility === 'compatible'
              ? 'The bounded payload change is consumer-compatible.'
              : 'Review and coordinate affected event consumers.',
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

export const eventAdapter: IncrementalContractAdapterV2 = new (class {
  public readonly manifest = manifest;

  public async extract(request: ExtractRequestV2) {
    const documents = request.artifacts
      .map((artifact) => parseArtifact(artifact, request.context))
      .filter((value): value is EventDocumentFact => value !== null);
    return extraction(documents, request.configRevision);
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
            limitations: [{ code: 'incomplete_event_extraction' }],
          },
      diagnostics: [],
    });
  }

  public async buildPartitions(request: ExtractRequestV2) {
    const documents = request.artifacts
      .map((artifact) => parseArtifact(artifact, request.context))
      .filter((value): value is EventDocumentFact => value !== null);
    const partitions = documents.map((document) =>
      buildPartition(document, request.configRevision),
    );
    const materialized = extraction(documents, request.configRevision);
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
      request.partitions.flatMap((value) =>
        value.ownedPaths.map((path) => [path, value.partitionKey]),
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
    const logical = new Map<string, EventDocumentFact>();
    try {
      const keys = new Set<string>();
      for (const partition of request.basePartitions) {
        const document = decodePartition(partition, keys);
        logical.set(partition.partitionKey, document);
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
        diagnostics: [diagnostic('parse_failure', 'error', 'Persisted event state is invalid.')],
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
      const replacement = buildPartition(document, request.configRevision);
      logical.set(replacement.partitionKey, document);
      replacements.set(replacement.partitionKey, replacement);
      tombstones.delete(replacement.partitionKey);
    }
    const missing = [...expectedPaths].filter((path) => !supplied.has(path));
    const materialized = extraction([...logical.values()], request.configRevision);
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
          diagnostic('missing_blob', 'error', 'Changed event artifact is unavailable.', path),
        ),
      ],
    });
  }

  public async materializePartitions(
    request: Parameters<IncrementalContractAdapterV2['materializePartitions']>[0],
  ) {
    const keys = new Set<string>();
    const documents = request.partitions.map((partition) => decodePartition(partition, keys));
    return extraction(documents, request.configRevision);
  }
})();
