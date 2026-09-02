import {
  ADAPTER_FAMILIES_V2,
  CONTRACT_KINDS_V2,
  adapterId,
  configRevision,
  contentHash,
  hashCanonical,
  repoPath,
  type BoundedDiagnostic,
} from '@yanib/reverb-domain';

import { ACTIVATION_TIMINGS, CAPABILITY_TIERS, COMPATIBILITY_RESULTS } from './types.js';
import type {
  AdapterCoverageV2,
  AdapterDiffResultV2,
  AdapterExtractionResultV2,
  AdapterManifestV2,
  ContractChangeV2,
  ContractDefinitionV2,
  ContractReferenceV2,
} from './types-v2.js';
import { AdapterValidationError } from './validation.js';

const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z._-]{0,127}$/;
const TOKEN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const FAMILY_PREFIX = {
  events: 'event.',
  database: 'database.',
  implicit_http: 'http.',
  configuration: 'configuration.',
  infrastructure: 'infrastructure.',
} as const;

function requireCondition(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new AdapterValidationError(code, message);
}

function boundedText(value: string, name: string, maximum = 256): void {
  requireCondition(value.trim().length > 0, 'invalid_output', `${name} cannot be empty.`);
  requireCondition(value.length <= maximum, 'invalid_output', `${name} exceeds its limit.`);
}

function positiveVersion(value: number, name: string): void {
  requireCondition(
    Number.isSafeInteger(value) && value > 0,
    'invalid_output',
    `${name} must be a positive safe integer.`,
  );
}

function validateProtocolVersions(input: {
  readonly adapterVersion: string;
  readonly extractionVersion: string;
  readonly identityVersion: number;
  readonly partitioningVersion: number;
  readonly compatibilityVersion: string;
}): void {
  requireCondition(SEMVER.test(input.adapterVersion), 'invalid_output', 'Version must be SemVer.');
  requireCondition(
    VERSION.test(input.extractionVersion),
    'invalid_output',
    'Extraction version is invalid.',
  );
  requireCondition(
    VERSION.test(input.compatibilityVersion),
    'invalid_output',
    'Compatibility version is invalid.',
  );
  positiveVersion(input.identityVersion, 'Identity version');
  positiveVersion(input.partitioningVersion, 'Partitioning version');
}

export function validateAdapterManifestV2(manifest: AdapterManifestV2): AdapterManifestV2 {
  requireCondition(
    manifest.schema === 'reverb.adapter-manifest' && manifest.schemaVersion === '2.0',
    'unsupported_manifest_schema',
    'V2 adapter manifest schema is unsupported.',
  );
  adapterId(manifest.id);
  requireCondition(
    ADAPTER_FAMILIES_V2.includes(manifest.family),
    'invalid_manifest',
    'Adapter family is invalid.',
  );
  validateProtocolVersions({
    adapterVersion: manifest.version,
    extractionVersion: manifest.extractionVersion,
    identityVersion: manifest.identityVersion,
    partitioningVersion: manifest.partitioningVersion,
    compatibilityVersion: manifest.compatibilityVersion,
  });
  requireCondition(manifest.contractKinds.length > 0, 'invalid_manifest', 'Kinds are required.');
  requireCondition(
    new Set(manifest.contractKinds).size === manifest.contractKinds.length &&
      manifest.contractKinds.every((kind) => CONTRACT_KINDS_V2.includes(kind)),
    'invalid_manifest',
    'V2 contract kinds must be unique and closed.',
  );
  requireCondition(
    manifest.contractKinds.every((kind) => kind.startsWith(FAMILY_PREFIX[manifest.family])),
    'invalid_manifest',
    'V2 adapters can declare contract kinds only from their own family.',
  );
  requireCondition(
    manifest.capabilityTiers.length > 0 &&
      manifest.capabilityTiers.every(
        (entry) => entry.input.length > 0 && CAPABILITY_TIERS.includes(entry.tier),
      ),
    'invalid_manifest',
    'Capability tiers are invalid.',
  );
  const strata = new Set<string>();
  for (const stratum of manifest.evidenceStrata) {
    requireCondition(TOKEN.test(stratum.id), 'invalid_manifest', 'Stratum ID is invalid.');
    requireCondition(!strata.has(stratum.id), 'invalid_manifest', 'Stratum ID is duplicated.');
    requireCondition(
      stratum.promotionState === 'UNMEASURED' && stratum.requiredEvidence.length > 0,
      'invalid_manifest',
      'New strata must be unmeasured and declare required evidence.',
    );
    strata.add(stratum.id);
  }
  requireCondition(strata.size > 0, 'invalid_manifest', 'Evidence strata are required.');
  requireCondition(
    manifest.externalTools.length === 0,
    'invalid_manifest',
    'Initial v2 deterministic adapters cannot execute external tools.',
  );
  manifest.limitations.forEach((value) => boundedText(value, 'Limitation', 512));
  boundedText(manifest.maintainer, 'Maintainer');
  for (const value of Object.values(manifest.resourceBudget)) {
    requireCondition(
      Number.isSafeInteger(value) && value > 0,
      'invalid_manifest',
      'Resource budgets must be positive safe integers.',
    );
  }
  return manifest;
}

function validateCoverage(coverage: AdapterCoverageV2): void {
  requireCondition(
    ['complete', 'partial', 'failed', 'unsupported'].includes(coverage.state),
    'invalid_coverage',
    'Coverage state is invalid.',
  );
  for (const value of [
    coverage.eligibleArtifacts,
    coverage.processedArtifacts,
    coverage.skippedArtifacts,
    coverage.failedArtifacts,
  ]) {
    requireCondition(
      Number.isSafeInteger(value) && value >= 0,
      'invalid_coverage',
      'Coverage counts must be non-negative safe integers.',
    );
  }
  requireCondition(
    coverage.processedArtifacts + coverage.skippedArtifacts + coverage.failedArtifacts <=
      coverage.eligibleArtifacts,
    'invalid_coverage',
    'Coverage accounting exceeds eligible artifacts.',
  );
  if (coverage.state === 'complete') {
    requireCondition(
      coverage.failedArtifacts === 0 &&
        coverage.processedArtifacts + coverage.skippedArtifacts === coverage.eligibleArtifacts &&
        coverage.limitations.length === 0,
      'invalid_coverage',
      'Complete coverage must account for every artifact without limitations.',
    );
  } else {
    requireCondition(
      coverage.limitations.length > 0,
      'invalid_coverage',
      'Incomplete coverage requires an explicit limitation.',
    );
  }
  coverage.limitations.forEach((value) => {
    boundedText(value.code, 'Coverage limitation', 192);
    if (value.scope !== undefined) repoPath(value.scope);
  });
}

function validateRange(range: ContractDefinitionV2['range']): void {
  if (range === undefined) return;
  for (const value of [range.startLine, range.startColumn, range.endLine, range.endColumn]) {
    requireCondition(
      Number.isSafeInteger(value) && value > 0,
      'invalid_output',
      'Source ranges must contain positive integers.',
    );
  }
  requireCondition(
    range.endLine > range.startLine ||
      (range.endLine === range.startLine && range.endColumn >= range.startColumn),
    'invalid_output',
    'Source range end precedes its start.',
  );
}

function validateDiagnostic(value: BoundedDiagnostic): void {
  boundedText(value.safeMessage, 'Diagnostic', 256);
  if (value.scope !== undefined) repoPath(value.scope);
  if (value.detailHash !== undefined) contentHash(value.detailHash);
}

function validateKey(value: string): void {
  requireCondition(
    value.length > 0 && value.length <= 2048 && !value.includes('\0'),
    'invalid_output',
    'Canonical contract key is not bounded.',
  );
}

function validateDefinition(value: ContractDefinitionV2): void {
  requireCondition(
    CONTRACT_KINDS_V2.includes(value.contractKind),
    'invalid_output',
    'V2 contract kind is invalid.',
  );
  validateKey(value.canonicalKey);
  boundedText(value.displayName, 'Definition display name', 512);
  repoPath(value.path);
  validateRange(value.range);
  contentHash(value.contentHash);
  requireCondition(
    value.shapeHash === contentHash(hashCanonical(value.shape)),
    'invalid_output',
    'Definition shape hash does not match its shape.',
  );
  boundedText(value.evidenceStratum, 'Evidence stratum', 128);
}

function validateReference(value: ContractReferenceV2): void {
  requireCondition(
    CONTRACT_KINDS_V2.includes(value.contractKind),
    'invalid_output',
    'V2 contract kind is invalid.',
  );
  const resolved =
    value.canonicalKey !== undefined &&
    value.unresolvedPattern === undefined &&
    value.unresolvedReason === undefined;
  const unresolved =
    value.canonicalKey === undefined &&
    value.unresolvedPattern !== undefined &&
    value.unresolvedReason !== undefined;
  requireCondition(
    resolved !== unresolved,
    'invalid_output',
    'Reference must be exactly resolved or unresolved.',
  );
  if (value.canonicalKey !== undefined) validateKey(value.canonicalKey);
  if (value.unresolvedPattern !== undefined)
    boundedText(value.unresolvedPattern, 'Unresolved pattern', 2048);
  if (value.unresolvedReason !== undefined)
    boundedText(value.unresolvedReason, 'Unresolved reason', 256);
  repoPath(value.path);
  validateRange(value.range);
  contentHash(value.contentHash);
  requireCondition(
    ACTIVATION_TIMINGS.includes(value.activation),
    'invalid_output',
    'Activation is invalid.',
  );
  boundedText(value.evidenceStratum, 'Evidence stratum', 128);
}

function stamp(input: {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly extractionVersion: string;
  readonly identityVersion: number;
  readonly partitioningVersion: number;
  readonly compatibilityVersion: string;
}): string {
  return [
    input.adapterId,
    input.adapterVersion,
    input.extractionVersion,
    input.identityVersion,
    input.partitioningVersion,
    input.compatibilityVersion,
  ].join('@');
}

export function finalizeExtractionV2(
  input: Omit<AdapterExtractionResultV2, 'outputHash'>,
): AdapterExtractionResultV2 {
  requireCondition(
    input.schema === 'reverb.adapter-extraction' &&
      input.schemaVersion === '2.0' &&
      ADAPTER_FAMILIES_V2.includes(input.family),
    'invalid_output',
    'V2 extraction envelope is invalid.',
  );
  validateCoverage(input.coverage);
  input.diagnostics.forEach(validateDiagnostic);
  adapterId(input.adapterId);
  validateProtocolVersions(input);
  configRevision(input.configRevision);
  contentHash(input.sourceFingerprint);
  input.definitions.forEach(validateDefinition);
  input.references.forEach(validateReference);
  requireCondition(
    [...input.definitions, ...input.references].every((value) =>
      value.contractKind.startsWith(FAMILY_PREFIX[input.family]),
    ),
    'invalid_output',
    'V2 extraction evidence must belong to its declared family.',
  );
  const definitions = [...input.definitions].sort((left, right) =>
    `${left.contractKind}\0${left.canonicalKey}\0${left.path}`.localeCompare(
      `${right.contractKind}\0${right.canonicalKey}\0${right.path}`,
    ),
  );
  const references = [...input.references].sort((left, right) =>
    `${left.contractKind}\0${left.canonicalKey ?? left.unresolvedPattern}\0${left.path}`.localeCompare(
      `${right.contractKind}\0${right.canonicalKey ?? right.unresolvedPattern}\0${right.path}`,
    ),
  );
  const expected = stamp(input);
  for (const value of [...definitions, ...references]) {
    requireCondition(
      stamp({
        adapterId: value.extractorId,
        adapterVersion: value.extractorVersion,
        extractionVersion: value.extractionVersion,
        identityVersion: value.identityVersion,
        partitioningVersion: value.partitioningVersion,
        compatibilityVersion: value.compatibilityVersion,
      }) === expected && value.configRevision === input.configRevision,
      'incompatible_output_version',
      'V2 evidence version stamps do not match its extraction.',
    );
  }
  const withoutHash = { ...input, definitions, references };
  return { ...withoutHash, outputHash: contentHash(hashCanonical(withoutHash)) };
}

function validateChange(value: ContractChangeV2): void {
  requireCondition(
    CONTRACT_KINDS_V2.includes(value.contractKind),
    'invalid_output',
    'V2 contract kind is invalid.',
  );
  validateKey(value.canonicalKey);
  boundedText(value.changeKind, 'Change kind', 128);
  requireCondition(
    COMPATIBILITY_RESULTS.includes(value.compatibility),
    'invalid_output',
    'Compatibility is invalid.',
  );
  requireCondition(
    ACTIVATION_TIMINGS.includes(value.activation),
    'invalid_output',
    'Activation is invalid.',
  );
  if (value.baseShapeHash !== undefined) contentHash(value.baseShapeHash);
  if (value.headShapeHash !== undefined) contentHash(value.headShapeHash);
  value.coverageDependencies.forEach((item) => boundedText(item, 'Coverage dependency', 256));
  boundedText(value.remedy.kind, 'Remedy kind', 128);
  boundedText(value.remedy.text, 'Remedy text', 1024);
}

export function finalizeDiffV2(
  input: Omit<AdapterDiffResultV2, 'outputHash'>,
): AdapterDiffResultV2 {
  requireCondition(
    input.schema === 'reverb.adapter-diff' &&
      input.schemaVersion === '2.0' &&
      ADAPTER_FAMILIES_V2.includes(input.family),
    'invalid_output',
    'V2 diff envelope is invalid.',
  );
  validateCoverage(input.coverage);
  input.diagnostics.forEach(validateDiagnostic);
  adapterId(input.adapterId);
  validateProtocolVersions(input);
  input.changes.forEach(validateChange);
  requireCondition(
    input.changes.every((value) => value.contractKind.startsWith(FAMILY_PREFIX[input.family])),
    'invalid_output',
    'V2 changes must belong to their declared family.',
  );
  const changes = [...input.changes].sort((left, right) =>
    `${left.contractKind}\0${left.canonicalKey}\0${left.changeKind}`.localeCompare(
      `${right.contractKind}\0${right.canonicalKey}\0${right.changeKind}`,
    ),
  );
  const withoutHash = { ...input, changes };
  return { ...withoutHash, outputHash: contentHash(hashCanonical(withoutHash)) };
}

export function assertComparableExtractionsV2(
  manifest: AdapterManifestV2,
  base: AdapterExtractionResultV2,
  head: AdapterExtractionResultV2,
  expectedConfigRevision?: AdapterExtractionResultV2['configRevision'],
): void {
  const expected = stamp({
    adapterId: manifest.id,
    adapterVersion: manifest.version,
    extractionVersion: manifest.extractionVersion,
    identityVersion: manifest.identityVersion,
    partitioningVersion: manifest.partitioningVersion,
    compatibilityVersion: manifest.compatibilityVersion,
  });
  for (const result of [base, head]) {
    requireCondition(
      result.schemaVersion === '2.0' &&
        result.family === manifest.family &&
        stamp(result) === expected,
      'incompatible_extraction',
      'Extraction was produced by an incompatible v2 adapter protocol.',
    );
  }
  requireCondition(
    base.configRevision === head.configRevision &&
      (expectedConfigRevision === undefined || base.configRevision === expectedConfigRevision),
    'incompatible_extraction',
    'Extraction config revisions are incompatible.',
  );
}
