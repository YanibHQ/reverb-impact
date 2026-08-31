import {
  adapterId,
  canonicalJson,
  configRevision,
  contentHash,
  hashCanonical,
  repoPath,
  type BoundedDiagnostic,
} from '@yanib/reverb-domain';

import {
  ACTIVATION_TIMINGS,
  CAPABILITY_TIERS,
  COMPATIBILITY_RESULTS,
  CONTRACT_KINDS,
  type AdapterCoverage,
  type AdapterDiffResult,
  type AdapterExtractionResult,
  type AdapterManifest,
  type ContractChange,
  type ContractDefinition,
  type ContractReference,
} from './types.js';

const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const TOKEN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export class AdapterValidationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AdapterValidationError';
  }
}

function requireCondition(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new AdapterValidationError(code, message);
}

function boundedText(value: string, name: string, maximum = 256): void {
  requireCondition(value.trim().length > 0, 'invalid_manifest', `${name} cannot be empty.`);
  requireCondition(value.length <= maximum, 'invalid_manifest', `${name} exceeds its limit.`);
}

export function validateAdapterManifest(manifest: AdapterManifest): AdapterManifest {
  requireCondition(
    manifest.schema === 'reverb.adapter-manifest' && manifest.schemaVersion === '1.0',
    'unsupported_manifest_schema',
    'Adapter manifest schema is unsupported.',
  );
  adapterId(manifest.id);
  requireCondition(SEMVER.test(manifest.version), 'invalid_manifest', 'Version must be SemVer.');
  requireCondition(
    Number.isSafeInteger(manifest.identityVersion) && manifest.identityVersion > 0,
    'invalid_manifest',
    'Identity version must be positive.',
  );
  requireCondition(manifest.contractKinds.length > 0, 'invalid_manifest', 'Kinds are required.');
  requireCondition(
    new Set(manifest.contractKinds).size === manifest.contractKinds.length &&
      manifest.contractKinds.every((kind) => CONTRACT_KINDS.includes(kind)),
    'invalid_manifest',
    'Contract kinds must be unique and closed.',
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
      stratum.promotionState === 'UNMEASURED',
      'invalid_manifest',
      'New adapter strata must be unmeasured.',
    );
    requireCondition(
      stratum.requiredEvidence.length > 0,
      'invalid_manifest',
      'Strata require evidence declarations.',
    );
    strata.add(stratum.id);
  }
  requireCondition(
    strata.size > 0,
    'invalid_manifest',
    'At least one evidence stratum is required.',
  );
  const tools = new Set<string>();
  for (const tool of manifest.externalTools) {
    boundedText(tool.id, 'Tool ID');
    boundedText(tool.version, 'Tool version');
    contentHash(tool.digest);
    boundedText(tool.license, 'Tool license');
    requireCondition(
      tool.network === false,
      'invalid_manifest',
      'External tools must deny network.',
    );
    requireCondition(!tools.has(tool.id), 'invalid_manifest', 'External tool is duplicated.');
    tools.add(tool.id);
  }
  for (const limitation of manifest.limitations) boundedText(limitation, 'Limitation', 512);
  boundedText(manifest.maintainer, 'Maintainer');
  for (const [name, value] of Object.entries(manifest.resourceBudget)) {
    requireCondition(
      Number.isSafeInteger(value) && value > 0,
      'invalid_manifest',
      `${name} must be positive.`,
    );
  }
  return manifest;
}

export function validateCoverage(coverage: AdapterCoverage): AdapterCoverage {
  for (const value of [
    coverage.eligibleArtifacts,
    coverage.processedArtifacts,
    coverage.skippedArtifacts,
    coverage.failedArtifacts,
  ]) {
    requireCondition(
      Number.isSafeInteger(value) && value >= 0,
      'invalid_coverage',
      'Coverage counts must be non-negative integers.',
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
        coverage.processedArtifacts + coverage.skippedArtifacts === coverage.eligibleArtifacts,
      'invalid_coverage',
      'Complete coverage must account for every artifact.',
    );
  }
  return coverage;
}

function validateDiagnostic(diagnostic: BoundedDiagnostic): void {
  requireCondition(
    diagnostic.safeMessage.length > 0 && diagnostic.safeMessage.length <= 256,
    'invalid_diagnostic',
    'Diagnostic text must be bounded.',
  );
  if (diagnostic.scope) repoPath(diagnostic.scope);
  if (diagnostic.detailHash) contentHash(diagnostic.detailHash);
}

function validateRange(range: ContractDefinition['range']): void {
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

function validateContractKey(value: string): void {
  requireCondition(
    value.length > 0 && value.length <= 2048 && !value.includes('\0'),
    'invalid_output',
    'Canonical contract key is not bounded.',
  );
}

function validateDefinition(value: ContractDefinition): void {
  requireCondition(
    CONTRACT_KINDS.includes(value.contractKind),
    'invalid_output',
    'Contract kind is invalid.',
  );
  validateContractKey(value.canonicalKey);
  boundedText(value.displayName, 'Definition display name', 512);
  repoPath(value.path);
  validateRange(value.range);
  contentHash(value.contentHash);
  contentHash(value.shapeHash);
  requireCondition(
    value.shapeHash === contentHash(hashCanonical(value.shape)),
    'invalid_output',
    'Definition shape hash does not match its shape.',
  );
  boundedText(value.evidenceStratum, 'Evidence stratum', 128);
}

function validateReference(value: ContractReference): void {
  requireCondition(
    CONTRACT_KINDS.includes(value.contractKind),
    'invalid_output',
    'Contract kind is invalid.',
  );
  const resolved = value.canonicalKey !== undefined;
  const unresolved = value.unresolvedPattern !== undefined && value.unresolvedReason !== undefined;
  requireCondition(
    resolved !== unresolved,
    'invalid_output',
    'Reference must be exactly resolved or unresolved.',
  );
  if (value.canonicalKey !== undefined) validateContractKey(value.canonicalKey);
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

function validateChange(value: ContractChange): void {
  requireCondition(
    CONTRACT_KINDS.includes(value.contractKind),
    'invalid_output',
    'Contract kind is invalid.',
  );
  validateContractKey(value.canonicalKey);
  boundedText(value.changeKind, 'Change kind', 128);
  requireCondition(
    COMPATIBILITY_RESULTS.includes(value.compatibility),
    'invalid_output',
    'Compatibility result is invalid.',
  );
  requireCondition(
    ACTIVATION_TIMINGS.includes(value.activation),
    'invalid_output',
    'Activation is invalid.',
  );
  if (value.baseShapeHash) contentHash(value.baseShapeHash);
  if (value.headShapeHash) contentHash(value.headShapeHash);
  value.coverageDependencies.forEach((dependency) =>
    boundedText(dependency, 'Coverage dependency', 256),
  );
  boundedText(value.remedy.kind, 'Remedy kind', 128);
  boundedText(value.remedy.text, 'Remedy text', 1024);
  boundedText(value.differ.toolId, 'Differ tool ID');
  boundedText(value.differ.toolVersion, 'Differ tool version');
  contentHash(value.differ.toolDigest);
  boundedText(value.differ.toolLicense, 'Differ tool license');
  boundedText(value.differ.category, 'Differ category');
}

function definitionSortKey(value: ContractDefinition): string {
  return `${value.contractKind}\u0000${value.canonicalKey}\u0000${value.path}`;
}

function referenceSortKey(value: ContractReference): string {
  return `${value.contractKind}\u0000${value.canonicalKey ?? value.unresolvedPattern ?? ''}\u0000${value.path}`;
}

function changeSortKey(value: ContractChange): string {
  return `${value.contractKind}\u0000${value.canonicalKey}\u0000${value.changeKind}`;
}

export function finalizeExtraction(
  input: Omit<AdapterExtractionResult, 'outputHash'>,
): AdapterExtractionResult {
  validateCoverage(input.coverage);
  input.diagnostics.forEach(validateDiagnostic);
  adapterId(input.adapterId);
  requireCondition(
    SEMVER.test(input.adapterVersion),
    'invalid_output',
    'Adapter output version is invalid.',
  );
  requireCondition(
    Number.isSafeInteger(input.identityVersion) && input.identityVersion > 0,
    'invalid_output',
    'Identity version is invalid.',
  );
  configRevision(input.configRevision);
  contentHash(input.sourceFingerprint);
  input.definitions.forEach(validateDefinition);
  input.references.forEach(validateReference);
  const definitions = [...input.definitions].sort((left, right) =>
    definitionSortKey(left).localeCompare(definitionSortKey(right)),
  );
  const references = [...input.references].sort((left, right) =>
    referenceSortKey(left).localeCompare(referenceSortKey(right)),
  );
  const identity = `${input.adapterId}@${input.adapterVersion}#${input.identityVersion}`;
  for (const item of [...definitions, ...references]) {
    requireCondition(
      `${item.extractorId}@${item.extractorVersion}#${item.identityVersion}` === identity,
      'incompatible_output_version',
      'Adapter output version stamps do not match its result.',
    );
    requireCondition(
      item.configRevision === input.configRevision,
      'incompatible_output_version',
      'Adapter output config revision does not match its result.',
    );
  }
  const withoutHash = { ...input, definitions, references };
  return {
    ...withoutHash,
    outputHash: contentHash(hashCanonical(withoutHash)),
  };
}

export function finalizeDiff(input: Omit<AdapterDiffResult, 'outputHash'>): AdapterDiffResult {
  validateCoverage(input.coverage);
  input.diagnostics.forEach(validateDiagnostic);
  adapterId(input.adapterId);
  requireCondition(
    SEMVER.test(input.adapterVersion),
    'invalid_output',
    'Adapter output version is invalid.',
  );
  requireCondition(
    Number.isSafeInteger(input.identityVersion) && input.identityVersion > 0,
    'invalid_output',
    'Identity version is invalid.',
  );
  input.changes.forEach(validateChange);
  const changes = [...input.changes].sort((left, right) =>
    changeSortKey(left).localeCompare(changeSortKey(right)),
  );
  const withoutHash = { ...input, changes };
  return { ...withoutHash, outputHash: contentHash(hashCanonical(withoutHash)) };
}

export function assertComparableExtractions(
  manifest: AdapterManifest,
  base: AdapterExtractionResult,
  head: AdapterExtractionResult,
  expectedConfigRevision?: AdapterExtractionResult['configRevision'],
): void {
  const expected = `${manifest.id}@${manifest.version}#${manifest.identityVersion}`;
  for (const result of [base, head]) {
    requireCondition(
      `${result.adapterId}@${result.adapterVersion}#${result.identityVersion}` === expected,
      'incompatible_extraction',
      'Extraction was produced by an incompatible adapter or identity version.',
    );
  }
  requireCondition(
    base.configRevision === head.configRevision &&
      (expectedConfigRevision === undefined || base.configRevision === expectedConfigRevision),
    'incompatible_extraction',
    'Extraction config revisions are incompatible.',
  );
}

export function canonicalAdapterJson(value: unknown): string {
  return canonicalJson(value);
}

export function validateConfigRevision(value: string): ReturnType<typeof configRevision> {
  return configRevision(value);
}
