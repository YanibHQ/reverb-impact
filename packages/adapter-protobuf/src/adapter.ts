import {
  contentHash,
  hashCanonical,
  repoPath,
  type BoundedDiagnostic,
  type ContentHash,
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
  type ContractAdapter,
  type ContractChange,
  type ContractDefinition,
  type ContractReference,
  type DiffRequest,
  type DifferMetadata,
  type ExtractRequest,
} from '@yanib/reverb-adapter-sdk';

import {
  protobufFieldNameFallbackKey,
  protobufFieldWireKey,
  protobufMethodKey,
} from './identity.js';
import { PROTOBUF_ADAPTER_MANIFEST } from './manifest.js';
import { parseDescriptorSetJson } from './parser.js';

const decoder = new TextDecoder('utf-8', { fatal: true });
const manifest = PROTOBUF_ADAPTER_MANIFEST;
const tool = manifest.externalTools[0]!;

function diagnostic(severity: BoundedDiagnostic['severity'], message: string): BoundedDiagnostic {
  return { code: 'parse_failure', severity, safeMessage: message.slice(0, 256) };
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

function sourceFingerprint(request: ExtractRequest): ContentHash {
  const referenceIdentity = generatedReferences(request)
    .map((reference) => ({
      contractKind: reference.contractKind,
      canonicalKey: reference.canonicalKey ?? null,
      unresolvedPattern: reference.unresolvedPattern ?? null,
      path: reference.path,
      contentHash: reference.contentHash,
    }))
    .sort((left, right) =>
      `${left.contractKind}\0${left.canonicalKey ?? left.unresolvedPattern}\0${left.path}`.localeCompare(
        `${right.contractKind}\0${right.canonicalKey ?? right.unresolvedPattern}\0${right.path}`,
      ),
    );
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
      generatedStubBindings: referenceIdentity,
    }),
  );
}

function generatedReferences(request: ExtractRequest): readonly ContractReference[] {
  const raw = request.context.generatedStubBindings;
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
        configRevision: request.configRevision,
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
        configRevision: request.configRevision,
        evidenceStratum: exact ? 'descriptor_field_wire' : 'generated_name_fallback',
        activation: 'on_deploy',
      });
    }
  }
  return references;
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

export class ProtobufContractAdapter implements ContractAdapter {
  public readonly manifest = manifest;

  public async extract(request: ExtractRequest) {
    const definitions: ContractDefinition[] = [];
    const diagnostics: BoundedDiagnostic[] = [];
    let eligible = 0;
    let processed = 0;
    let failed = 0;
    for (const artifact of request.artifacts) {
      if (artifact.classification === 'vendored' || artifact.classification === 'test') continue;
      let text: string;
      try {
        text = decoder.decode(artifact.bytes);
      } catch {
        continue;
      }
      const probable = /^\s*\{[\s\S]*["']file["']\s*:/.test(text);
      if (artifact.bytes.byteLength > manifest.resourceBudget.maximumInputBytes) {
        if (probable) {
          eligible += 1;
          failed += 1;
          diagnostics.push(
            diagnostic('error', 'Descriptor input exceeds the declared byte limit.'),
          );
        }
        continue;
      }
      try {
        const parsed = parseDescriptorSetJson(text, manifest.resourceBudget.maximumItems);
        if (parsed === null) continue;
        eligible += 1;
        processed += 1;
        for (const method of parsed.methods) {
          const canonical = canonicalShape(method.shape);
          definitions.push({
            contractKind: 'protobuf_method',
            canonicalKey: protobufMethodKey(
              method.packageName,
              method.serviceName,
              method.methodName,
            ),
            displayName: `${method.serviceName}.${method.methodName}`,
            path: artifact.path,
            contentHash: artifact.contentHash,
            shapeHash: canonical.shapeHash,
            shape: canonical.shape,
            extractorId: manifest.id,
            extractorVersion: manifest.version,
            identityVersion: manifest.identityVersion,
            configRevision: request.configRevision,
            evidenceStratum: 'descriptor_method',
          });
        }
        for (const field of parsed.fields) {
          const canonical = canonicalShape(field.shape);
          definitions.push({
            contractKind: 'protobuf_field',
            canonicalKey: protobufFieldWireKey(
              field.packageName,
              field.messageName,
              field.fieldNumber,
            ),
            displayName: `${field.messageName}.${field.fieldName}`,
            path: artifact.path,
            contentHash: artifact.contentHash,
            shapeHash: canonical.shapeHash,
            shape: canonical.shape,
            extractorId: manifest.id,
            extractorVersion: manifest.version,
            identityVersion: manifest.identityVersion,
            configRevision: request.configRevision,
            evidenceStratum: 'descriptor_field_wire',
          });
        }
      } catch {
        if (!probable) continue;
        eligible += 1;
        failed += 1;
        diagnostics.push(diagnostic('error', 'Descriptor input could not be parsed safely.'));
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
    return finalizeExtraction({
      schema: 'reverb.adapter-extraction',
      schemaVersion: '1.0',
      adapterId: manifest.id,
      adapterVersion: manifest.version,
      identityVersion: manifest.identityVersion,
      configRevision: request.configRevision,
      definitions: unique.definitions,
      references: generatedReferences(request).map((reference) => {
        if (
          reference.canonicalKey === undefined ||
          !unique.ambiguousKeys.has(reference.canonicalKey)
        ) {
          return reference;
        }
        return {
          contractKind: reference.contractKind,
          unresolvedPattern: reference.canonicalKey,
          unresolvedReason: 'ambiguous_descriptor_identity',
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
      }),
      coverage: coverage(eligible, processed, failed, unique.ambiguousKeys.size),
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
