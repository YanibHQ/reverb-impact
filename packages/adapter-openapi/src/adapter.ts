import {
  contentHash,
  hashCanonical,
  repoPath,
  type BoundedDiagnostic,
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
  type AdapterSandboxRunner,
  type ArtifactInput,
  type ContractAdapter,
  type ContractChange,
  type ContractDefinition,
  type ContractReference,
  type DiffRequest,
  type DifferMetadata,
  type ExtractRequest,
} from '@yanib/reverb-adapter-sdk';

import { openApiFallbackKey, openApiOperationKey } from './identity.js';
import { OPENAPI_ADAPTER_MANIFEST } from './manifest.js';
import { isRecord, parseOpenApiDocument, resolveLocalReference } from './parser.js';

const METHODS = ['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace'] as const;
const decoder = new TextDecoder('utf-8', { fatal: true });
const manifest = OPENAPI_ADAPTER_MANIFEST;
const tool = manifest.externalTools[0]!;

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
  artifact: ArtifactInput,
  configRevision: ExtractRequest['configRevision'],
  text: string,
  serviceId: string,
  path: string,
  method: string,
  operation: Readonly<Record<string, unknown>>,
): ContractDefinition {
  const operationId = typeof operation.operationId === 'string' ? operation.operationId.trim() : '';
  const exact = operationId.length > 0;
  const identity = exact
    ? openApiOperationKey(serviceId, operationId)
    : openApiFallbackKey(serviceId, method, path);
  const canonical = canonicalShape(operationShape(serviceId, path, method, operation));
  const range = sourceRange(text, exact ? operationId : path);
  return {
    contractKind: 'openapi_operation',
    canonicalKey: identity,
    displayName: exact ? operationId : `${method.toUpperCase()} ${path}`,
    path: artifact.path,
    ...(range === undefined ? {} : { range }),
    contentHash: artifact.contentHash,
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

function sourceFingerprint(request: ExtractRequest): ContentHash {
  return contentHash(
    hashCanonical({
      artifacts: request.artifacts
        .map(({ path, contentHash: hash, classification }) => ({
          path,
          contentHash: hash,
          classification,
        }))
        .sort((left, right) =>
          `${left.path}\0${left.contentHash}\0${left.classification}`.localeCompare(
            `${right.path}\0${right.contentHash}\0${right.classification}`,
          ),
        ),
      serviceId: contextString(request.context, 'serviceId') ?? null,
      clientBindings: clientBindings(request.context),
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

function resolvePathItem(
  document: Readonly<Record<string, unknown>>,
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  let current = value;
  const seen = new Set<string>();
  while (isRecord(current) && typeof current.$ref === 'string') {
    if (seen.has(current.$ref)) return undefined;
    seen.add(current.$ref);
    current = resolveLocalReference(document, current.$ref);
  }
  return isRecord(current) ? current : undefined;
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

export class OpenApiContractAdapter implements ContractAdapter {
  public readonly manifest = manifest;

  public async extract(request: ExtractRequest) {
    const definitions: ContractDefinition[] = [];
    const diagnostics: BoundedDiagnostic[] = [];
    const limitations: AdapterCoverage['limitations'][number][] = [];
    const serviceId = contextString(request.context, 'serviceId');
    let eligible = 0;
    let processed = 0;
    let failed = 0;
    let partial = false;

    for (const artifact of request.artifacts) {
      if (artifact.classification === 'vendored' || artifact.classification === 'test') continue;
      let text: string;
      try {
        text = decoder.decode(artifact.bytes);
      } catch {
        continue;
      }
      const probable = /(?:^|[\n{,])\s*["']?openapi["']?\s*:/.test(text);
      if (artifact.bytes.byteLength > manifest.resourceBudget.maximumInputBytes) {
        if (probable) {
          eligible += 1;
          failed += 1;
          diagnostics.push(
            diagnostic(
              'source_truncated',
              'error',
              'OpenAPI input exceeds the declared byte limit.',
              artifact.path,
            ),
          );
        }
        continue;
      }
      try {
        const parsed = parseOpenApiDocument(text, manifest.resourceBudget.maximumItems);
        if (parsed === null) continue;
        eligible += 1;
        processed += 1;
        if (parsed.remoteReferences.length > 0) {
          partial = true;
          limitations.push({ code: 'remote_ref_not_fetched', scope: artifact.path });
          diagnostics.push(
            diagnostic(
              'parse_failure',
              'warning',
              'Remote OpenAPI references were not fetched; compatibility remains unknown.',
              artifact.path,
            ),
          );
        }
        if (parsed.unresolvedLocalReferences.length > 0) {
          partial = true;
          limitations.push({ code: 'unresolved_local_ref', scope: artifact.path });
          diagnostics.push(
            diagnostic(
              'parse_failure',
              'warning',
              'One or more local OpenAPI references do not resolve.',
              artifact.path,
            ),
          );
        }
        const paths = parsed.document.paths as Readonly<Record<string, unknown>>;
        for (const path of Object.keys(paths).sort()) {
          const pathItem = resolvePathItem(parsed.document, paths[path]);
          if (pathItem === undefined) {
            partial = true;
            limitations.push({ code: 'unresolved_local_ref', scope: artifact.path });
            continue;
          }
          for (const method of METHODS) {
            const operation = pathItem[method];
            if (!isRecord(operation)) continue;
            if (definitions.length >= manifest.resourceBudget.maximumItems) {
              partial = true;
              limitations.push({ code: 'item_limit', scope: artifact.path });
              break;
            }
            if (serviceId === undefined) {
              partial = true;
              limitations.push({ code: 'registry_service_identity_missing', scope: artifact.path });
              continue;
            }
            definitions.push(
              definition(
                artifact,
                request.configRevision,
                text,
                serviceId,
                path,
                method,
                operation,
              ),
            );
          }
        }
      } catch {
        if (!probable) continue;
        eligible += 1;
        failed += 1;
        diagnostics.push(
          diagnostic(
            'parse_failure',
            'error',
            'OpenAPI input could not be parsed safely.',
            artifact.path,
          ),
        );
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
    const refs = references(request.context, request.configRevision, serviceId).map((reference) => {
      if (
        reference.canonicalKey === undefined ||
        !unique.ambiguousKeys.has(reference.canonicalKey)
      ) {
        return reference;
      }
      return {
        contractKind: reference.contractKind,
        unresolvedPattern: reference.canonicalKey,
        unresolvedReason: 'ambiguous_operation_identity',
        ...(reference.semanticOwner === undefined
          ? {}
          : { semanticOwner: reference.semanticOwner }),
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
      configRevision: request.configRevision,
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
      sourceFingerprint: sourceFingerprint(request),
    });
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
