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
  assertComparableExtractions,
  canonicalShape,
  finalizeDiff,
  finalizeExtraction,
  planPathPartitionInvalidation,
  type AdapterCoverage,
  type AdapterDiffResult,
  type AdapterInvalidationPlan,
  type AdapterPartitionBuild,
  type AdapterPartitionBuildResult,
  type AdapterPartitionDescriptor,
  type AdapterPartitionUpdateResult,
  type AdapterPartitionView,
  type AdapterPathChange,
  type ArtifactInput,
  type ContractChange,
  type ContractDefinition,
  type ContractReference,
  type DiffRequest,
  type DifferMetadata,
  type ExtractRequest,
  type IncrementalContractAdapter,
} from '@yanib/reverb-adapter-sdk';

import { normalizeNpmSubpath, parseNpmSpecifier, typeScriptSymbolKey } from './identity.js';
import { TYPESCRIPT_ADAPTER_MANIFEST } from './manifest.js';
import {
  parseTypeScriptModule,
  resolveRelativeModule,
  type ParsedSymbol,
  type ParsedTypeScriptModule,
} from './parser.js';

const manifest = TYPESCRIPT_ADAPTER_MANIFEST;
const decoder = new TextDecoder('utf-8', { fatal: true });
const TS_PATH = /(?:\.d)?\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const PACKAGE_JSON_PATH = /(?:^|\/)package\.json$/;

type ArtifactClassification = ArtifactInput['classification'];
type FailureReason = 'byte_limit' | 'syntax_error' | 'unsafe_input' | 'missing_changed_blob';

interface SemanticArtifactDescriptor {
  readonly path: RepoPath;
  readonly contentHash: ContentHash;
  readonly classification: ArtifactClassification;
}

interface SemanticFailure {
  readonly path: RepoPath;
  readonly reason: FailureReason;
}

interface TypeScriptSemanticState {
  readonly packageRoot: string;
  readonly artifacts: Map<string, SemanticArtifactDescriptor>;
  readonly modules: Map<string, ParsedTypeScriptModule>;
  readonly packageJson: Map<string, Readonly<Record<string, unknown>>>;
  readonly failures: Map<string, SemanticFailure>;
}

interface TypeScriptPartitionPayload extends Readonly<Record<string, unknown>> {
  readonly schema: 'reverb.typescript-package-partition';
  readonly schemaVersion: '1.0';
  readonly packageRoot: string;
  readonly artifacts: readonly SemanticArtifactDescriptor[];
  readonly modules: readonly {
    readonly path: RepoPath;
    readonly symbols: ParsedTypeScriptModule['symbols'];
    readonly reExports: ParsedTypeScriptModule['reExports'];
    readonly imports: ParsedTypeScriptModule['imports'];
  }[];
  readonly packageJson: readonly {
    readonly path: RepoPath;
    readonly raw: Readonly<Record<string, unknown>>;
  }[];
  readonly failures: readonly SemanticFailure[];
}

interface PackageMetadata {
  readonly name: string;
  readonly version?: string;
  readonly dependencies: ReadonlySet<string>;
  readonly raw: Readonly<Record<string, unknown>>;
}

interface Entrypoint {
  readonly path: RepoPath;
  readonly subpath: string;
}

function sortEntrypoints(values: readonly Entrypoint[]): readonly Entrypoint[] {
  return [...values].sort((left, right) =>
    `${left.subpath}\0${left.path}`.localeCompare(`${right.subpath}\0${right.path}`),
  );
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

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedPackageJson(raw: Readonly<Record<string, unknown>>) {
  const normalized: Record<string, unknown> = {};
  if (typeof raw.name === 'string') normalized.name = raw.name;
  if (typeof raw.version === 'string') normalized.version = raw.version;
  if (typeof raw.exports === 'string' || record(raw.exports)) normalized.exports = raw.exports;
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const values = raw[field];
    if (!record(values)) continue;
    normalized[field] = Object.fromEntries(
      Object.keys(values)
        .sort()
        .map((name) => [name, true]),
    );
  }
  return normalized;
}

function relevantPath(path: RepoPath): boolean {
  return TS_PATH.test(path) || PACKAGE_JSON_PATH.test(path);
}

function packageRoot(context: Readonly<Record<string, unknown>>): string {
  const value = contextString(context, 'packageRoot') ?? '.';
  if (value.length > 512 || value.includes('\0')) {
    throw new AdapterValidationError(
      'invalid_partition_context',
      'TypeScript package root must be a bounded printable path.',
    );
  }
  return value;
}

function emptyState(root: string): TypeScriptSemanticState {
  return {
    packageRoot: root,
    artifacts: new Map(),
    modules: new Map(),
    packageJson: new Map(),
    failures: new Map(),
  };
}

function cloneState(state: TypeScriptSemanticState): TypeScriptSemanticState {
  return {
    packageRoot: state.packageRoot,
    artifacts: new Map(state.artifacts),
    modules: new Map(state.modules),
    packageJson: new Map(state.packageJson),
    failures: new Map(state.failures),
  };
}

function removeStatePath(state: TypeScriptSemanticState, path: RepoPath): void {
  state.artifacts.delete(path);
  state.modules.delete(path);
  state.packageJson.delete(path);
  state.failures.delete(path);
}

function addArtifactToState(state: TypeScriptSemanticState, artifact: ArtifactInput): void {
  if (!relevantPath(artifact.path)) return;
  removeStatePath(state, artifact.path);
  state.artifacts.set(artifact.path, {
    path: artifact.path,
    contentHash: artifact.contentHash,
    classification: artifact.classification,
  });
  if (PACKAGE_JSON_PATH.test(artifact.path)) {
    try {
      const raw: unknown = JSON.parse(decoder.decode(artifact.bytes));
      if (record(raw)) state.packageJson.set(artifact.path, normalizedPackageJson(raw));
    } catch {
      // Invalid package metadata is represented by the descriptor without a parsed record.
    }
  }
  if (
    !TS_PATH.test(artifact.path) ||
    artifact.classification === 'vendored' ||
    artifact.classification === 'test'
  ) {
    return;
  }
  if (artifact.bytes.byteLength > manifest.resourceBudget.maximumInputBytes) {
    state.failures.set(artifact.path, { path: artifact.path, reason: 'byte_limit' });
    return;
  }
  try {
    const parsed = parseTypeScriptModule(artifact, decoder.decode(artifact.bytes));
    if (parsed.parseErrors > 0) {
      state.failures.set(artifact.path, { path: artifact.path, reason: 'syntax_error' });
    } else {
      state.modules.set(artifact.path, parsed);
    }
  } catch {
    state.failures.set(artifact.path, { path: artifact.path, reason: 'unsafe_input' });
  }
}

function prepareState(request: ExtractRequest): TypeScriptSemanticState {
  const state = emptyState(packageRoot(request.context));
  for (const artifact of request.artifacts) addArtifactToState(state, artifact);
  return state;
}

function packageMetadata(state: TypeScriptSemanticState): PackageMetadata | undefined {
  const candidates = [...state.packageJson.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  for (const [, raw] of candidates) {
    if (typeof raw.name !== 'string' || raw.name.trim().length === 0) continue;
    const dependencies = new Set<string>();
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      const values = raw[field];
      if (record(values)) for (const name of Object.keys(values)) dependencies.add(name);
    }
    return {
      name: raw.name,
      ...(typeof raw.version === 'string' ? { version: raw.version } : {}),
      dependencies,
      raw,
    };
  }
  return undefined;
}

function contextString(
  context: Readonly<Record<string, unknown>>,
  name: string,
): string | undefined {
  const value = context[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!record(value)) return undefined;
  for (const key of Object.keys(value).sort()) {
    const found = firstString(value[key]);
    if (found !== undefined) return found;
  }
  return undefined;
}

function matchExportTarget(target: string, modulePaths: ReadonlySet<string>): RepoPath | undefined {
  const normalized = target.replace(/^\.\//, '');
  const stems = [normalized]
    .flatMap((value) => [value, value.replace(/^dist\//, 'src/')])
    .map((value) => value.replace(/(?:\.d)?\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$/, ''));
  const candidates = stems.flatMap((stem) => [
    `${stem}.ts`,
    `${stem}.tsx`,
    `${stem}.mts`,
    `${stem}.cts`,
    `${stem}.d.ts`,
    `${stem}.js`,
    `${stem}.jsx`,
    `${stem}.mjs`,
    `${stem}.cjs`,
    `${stem}/index.ts`,
  ]);
  const found = candidates.find((candidate) => modulePaths.has(candidate));
  return found === undefined ? undefined : repoPath(found);
}

function entrypoints(
  context: Readonly<Record<string, unknown>>,
  metadata: PackageMetadata | undefined,
  modules: ReadonlyMap<string, ParsedTypeScriptModule>,
): { readonly values: readonly Entrypoint[]; readonly unresolved: number } {
  const values: Entrypoint[] = [];
  const explicit = context.entrypoints;
  if (Array.isArray(explicit)) {
    for (const item of explicit) {
      if (!record(item) || typeof item.path !== 'string' || typeof item.subpath !== 'string')
        continue;
      try {
        const path = repoPath(item.path);
        if (modules.has(path)) values.push({ path, subpath: normalizeNpmSubpath(item.subpath) });
      } catch {
        continue;
      }
    }
    return { values: sortEntrypoints(values), unresolved: explicit.length - values.length };
  }
  const modulePaths = new Set(modules.keys());
  let unresolved = 0;
  const exports = metadata?.raw.exports;
  if (typeof exports === 'string') {
    const path = matchExportTarget(exports, modulePaths);
    if (path === undefined) unresolved += 1;
    else values.push({ path, subpath: '.' });
  } else if (record(exports)) {
    const subpathEntries = Object.keys(exports).some((key) => key.startsWith('.'))
      ? Object.entries(exports).filter(([key]) => key.startsWith('.'))
      : [['.', exports] as const];
    for (const [subpath, rawTarget] of subpathEntries) {
      const target = firstString(rawTarget);
      const path = target === undefined ? undefined : matchExportTarget(target, modulePaths);
      if (path === undefined) unresolved += 1;
      else values.push({ path, subpath: normalizeNpmSubpath(subpath) });
    }
  }
  if (values.length === 0 && exports === undefined) {
    for (const candidate of ['src/index.ts', 'src/index.tsx', 'index.ts', 'index.tsx']) {
      if (modules.has(candidate)) {
        values.push({ path: repoPath(candidate), subpath: '.' });
        break;
      }
    }
  }
  return { values: sortEntrypoints(values), unresolved };
}

function aggregateSymbols(symbols: readonly ParsedSymbol[]): readonly ParsedSymbol[] {
  const grouped = new Map<string, ParsedSymbol[]>();
  for (const symbol of symbols) {
    const key = `${symbol.space}\0${symbol.name}`;
    const values = grouped.get(key) ?? [];
    values.push(symbol);
    grouped.set(key, values);
  }
  return [...grouped.values()].map((values) => {
    const first = values[0]!;
    return values.length === 1
      ? first
      : {
          ...first,
          shape: {
            declarationKind: first.declarationKind,
            overloads: values.map((value) => value.shape),
          },
        };
  });
}

function resolvePublicSymbols(
  entrypoint: Entrypoint,
  modules: ReadonlyMap<string, ParsedTypeScriptModule>,
): { readonly symbols: readonly ParsedSymbol[]; readonly unresolved: number } {
  const available = new Set(modules.keys());
  const visit = (
    path: string,
    seen: ReadonlySet<string>,
  ): { symbols: ParsedSymbol[]; unresolved: number } => {
    if (seen.has(path)) return { symbols: [], unresolved: 1 };
    const module = modules.get(path);
    if (module === undefined) return { symbols: [], unresolved: 1 };
    const nextSeen = new Set(seen).add(path);
    const symbols = [...module.symbols];
    let unresolved = 0;
    for (const reExport of module.reExports) {
      const targetPath = resolveRelativeModule(path, reExport.source, available);
      if (targetPath === undefined) {
        const imported = reExport.imported;
        if (!reExport.star && imported !== undefined && reExport.exported !== undefined) {
          symbols.push({
            name: reExport.exported,
            space: reExport.typeOnly ? 'type' : 'value',
            declarationKind: 'external_reexport',
            shape: { source: reExport.source, imported },
            range: reExport.range,
            path: reExport.path,
            contentHash: reExport.contentHash,
          });
        } else unresolved += 1;
        continue;
      }
      const child = visit(targetPath, nextSeen);
      unresolved += child.unresolved;
      if (reExport.star) {
        symbols.push(...child.symbols.filter((symbol) => symbol.name !== 'default'));
      } else {
        const selected = child.symbols.filter(
          (symbol) =>
            symbol.name === reExport.imported && (!reExport.typeOnly || symbol.space === 'type'),
        );
        if (selected.length === 0) unresolved += 1;
        for (const symbol of selected) {
          symbols.push({
            ...symbol,
            name: reExport.exported!,
            ...(reExport.typeOnly ? { space: 'type' as const } : {}),
            range: reExport.range,
            path: reExport.path,
            contentHash: reExport.contentHash,
          });
        }
      }
    }
    return { symbols, unresolved };
  };
  const resolved = visit(entrypoint.path, new Set());
  return { symbols: aggregateSymbols(resolved.symbols), unresolved: resolved.unresolved };
}

function lockedPackages(context: Readonly<Record<string, unknown>>): ReadonlySet<string> {
  const value = context.lockedVersions;
  return record(value) ? new Set(Object.keys(value)) : new Set();
}

function references(
  config: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
  modules: ReadonlyMap<string, ParsedTypeScriptModule>,
  metadata: PackageMetadata | undefined,
  registry: string,
): { readonly values: readonly ContractReference[]; readonly dynamic: number } {
  const values: ContractReference[] = [];
  const locked = lockedPackages(context);
  let dynamic = 0;
  for (const module of modules.values()) {
    for (const imported of module.imports) {
      const parsed = parseNpmSpecifier(imported.source);
      if (parsed === null && imported.source !== '*') continue;
      if (
        imported.unresolvedReason !== undefined ||
        parsed === null ||
        imported.symbol === undefined ||
        imported.space === undefined
      ) {
        dynamic += 1;
        values.push({
          contractKind: 'typescript_symbol',
          unresolvedPattern: imported.source,
          unresolvedReason: imported.unresolvedReason ?? 'import_identity_unknown',
          semanticOwner: imported.symbol ?? imported.source,
          path: module.artifact.path,
          range: imported.range,
          contentHash: module.artifact.contentHash,
          extractorId: manifest.id,
          extractorVersion: manifest.version,
          identityVersion: manifest.identityVersion,
          configRevision: config,
          evidenceStratum: 'dynamic_import',
          activation: 'unknown',
        });
        continue;
      }
      const dependencyDeclared = metadata?.dependencies.has(parsed.packageName) ?? false;
      values.push({
        contractKind: 'typescript_symbol',
        canonicalKey: typeScriptSymbolKey(
          registry,
          parsed.packageName,
          parsed.subpath,
          imported.space,
          imported.symbol,
        ),
        semanticOwner: `${imported.space}:${imported.symbol}`,
        path: module.artifact.path,
        range: imported.range,
        contentHash: module.artifact.contentHash,
        extractorId: manifest.id,
        extractorVersion: manifest.version,
        identityVersion: manifest.identityVersion,
        configRevision: config,
        evidenceStratum: 'static_import',
        activation:
          dependencyDeclared && locked.has(parsed.packageName)
            ? 'on_upgrade'
            : dependencyDeclared
              ? 'current_runtime'
              : 'unknown',
      });
    }
  }
  return { values, dynamic };
}

function sourceFingerprint(
  state: TypeScriptSemanticState,
  context: Readonly<Record<string, unknown>>,
  registry: string,
): ContentHash {
  const safeEntrypoints = (
    Array.isArray(context.entrypoints)
      ? context.entrypoints.flatMap((item) => {
          if (!record(item) || typeof item.path !== 'string' || typeof item.subpath !== 'string') {
            return [];
          }
          return [{ path: item.path, subpath: item.subpath }];
        })
      : []
  ).sort((left, right) =>
    `${left.subpath}\0${left.path}`.localeCompare(`${right.subpath}\0${right.path}`),
  );
  return contentHash(
    hashCanonical({
      registry,
      packageRoot: state.packageRoot,
      artifacts: [...state.artifacts.values()]
        .map(({ path, contentHash: hash, classification }) => ({
          path,
          contentHash: hash,
          classification,
        }))
        .sort((left, right) => left.path.localeCompare(right.path)),
      failures: [...state.failures.values()].sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
      entrypoints: safeEntrypoints,
      lockedPackages: [...lockedPackages(context)].sort(),
    }),
  );
}

function failureDiagnostic(failure: SemanticFailure): BoundedDiagnostic {
  switch (failure.reason) {
    case 'byte_limit':
      return diagnostic('error', 'TypeScript input exceeds the declared byte limit.', failure.path);
    case 'syntax_error':
      return diagnostic('error', 'TypeScript input contains syntax errors.', failure.path);
    case 'unsafe_input':
      return diagnostic('error', 'TypeScript input could not be parsed safely.', failure.path);
    case 'missing_changed_blob':
      return diagnostic(
        'error',
        'A required changed artifact was unavailable within the source budget.',
        failure.path,
      );
  }
}

function materializeState(
  state: TypeScriptSemanticState,
  config: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
) {
  const modules = state.modules;
  const diagnostics = [...state.failures.values()]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(failureDiagnostic);
  const eligibleFailures = [...state.failures.values()].filter((failure) =>
    TS_PATH.test(failure.path),
  ).length;
  const eligible = modules.size + eligibleFailures;
  const processed = modules.size;
  const failed = eligibleFailures;
  const metadata = packageMetadata(state);
  const registry = contextString(context, 'packageRegistry') ?? 'npm';
  const publicEntrypoints = entrypoints(context, metadata, modules);
  const definitions = new Map<string, ContractDefinition>();
  const ambiguousDefinitions = new Set<string>();
  let unresolvedExports = publicEntrypoints.unresolved;
  if (metadata !== undefined) {
    for (const entrypoint of publicEntrypoints.values) {
      const resolved = resolvePublicSymbols(entrypoint, modules);
      unresolvedExports += resolved.unresolved;
      for (const symbol of resolved.symbols) {
        if (definitions.size >= manifest.resourceBudget.maximumItems) {
          unresolvedExports += 1;
          break;
        }
        const shape = canonicalShape({
          namespace: symbol.space,
          declarationKind: symbol.declarationKind,
          ...symbol.shape,
        });
        const key = typeScriptSymbolKey(
          registry,
          metadata.name,
          entrypoint.subpath,
          symbol.space,
          symbol.name,
        );
        const candidate: ContractDefinition = {
          contractKind: 'typescript_symbol',
          canonicalKey: key,
          displayName: symbol.name,
          path: symbol.path,
          range: symbol.range,
          contentHash: symbol.contentHash,
          shapeHash: shape.shapeHash,
          shape: shape.shape,
          extractorId: manifest.id,
          extractorVersion: manifest.version,
          identityVersion: manifest.identityVersion,
          configRevision: config,
          evidenceStratum: 'public_export',
        };
        if (ambiguousDefinitions.has(key)) continue;
        const prior = definitions.get(key);
        if (prior === undefined) definitions.set(key, candidate);
        else if (prior.shapeHash !== candidate.shapeHash) {
          definitions.delete(key);
          ambiguousDefinitions.add(key);
          unresolvedExports += 1;
        }
      }
    }
  } else if (eligible > 0) {
    unresolvedExports += 1;
    diagnostics.push(
      diagnostic('warning', 'Package metadata is missing; public export identity is unknown.'),
    );
  }
  if (ambiguousDefinitions.size > 0) {
    diagnostics.push(
      diagnostic(
        'warning',
        'Conflicting public exports share an identity and were left unresolved.',
      ),
    );
  }
  const imported = references(config, context, modules, metadata, registry);
  if (imported.dynamic > 0) {
    diagnostics.push(
      diagnostic('warning', 'Dynamic or namespace imports were retained as unresolved references.'),
    );
  }
  const partial =
    state.failures.size > 0 || failed > 0 || unresolvedExports > 0 || imported.dynamic > 0;
  const coverageState: AdapterCoverage['state'] =
    eligible === 0
      ? 'unsupported'
      : failed === eligible
        ? 'failed'
        : partial
          ? 'partial'
          : 'complete';
  return finalizeExtraction({
    schema: 'reverb.adapter-extraction',
    schemaVersion: '1.0',
    adapterId: manifest.id,
    adapterVersion: manifest.version,
    identityVersion: manifest.identityVersion,
    configRevision: config,
    definitions: [...definitions.values()],
    references: imported.values,
    coverage: {
      state: coverageState,
      eligibleArtifacts: eligible,
      processedArtifacts: processed,
      skippedArtifacts: 0,
      failedArtifacts: failed,
      limitations: [
        ...(unresolvedExports > 0 ? [{ code: 'unresolved_public_export' }] : []),
        ...(imported.dynamic > 0 ? [{ code: 'dynamic_or_reflective_use' }] : []),
        ...(state.failures.size > failed ? [{ code: 'incomplete_input' }] : []),
      ],
    },
    diagnostics,
    sourceFingerprint: sourceFingerprint(state, context, registry),
  });
}

function encodeState(state: TypeScriptSemanticState): TypeScriptPartitionPayload {
  return {
    schema: 'reverb.typescript-package-partition',
    schemaVersion: '1.0',
    packageRoot: state.packageRoot,
    artifacts: [...state.artifacts.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
    modules: [...state.modules.values()]
      .map((module) => ({
        path: module.artifact.path,
        symbols: module.symbols,
        reExports: module.reExports,
        imports: module.imports,
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    packageJson: [...state.packageJson.entries()]
      .map(([path, raw]) => ({ path: repoPath(path), raw }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    failures: [...state.failures.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
}

function requirePayload(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AdapterValidationError('invalid_partition_payload', message);
}

function decodeState(payload: Readonly<Record<string, unknown>>): TypeScriptSemanticState {
  requirePayload(
    payload.schema === 'reverb.typescript-package-partition' && payload.schemaVersion === '1.0',
    'TypeScript partition payload schema is unsupported.',
  );
  requirePayload(
    typeof payload.packageRoot === 'string' && payload.packageRoot.length <= 512,
    'TypeScript partition package root is invalid.',
  );
  requirePayload(
    Array.isArray(payload.artifacts) &&
      Array.isArray(payload.modules) &&
      Array.isArray(payload.packageJson) &&
      Array.isArray(payload.failures),
    'TypeScript partition payload collections are invalid.',
  );
  const state = emptyState(payload.packageRoot);
  for (const value of payload.artifacts) {
    requirePayload(record(value), 'TypeScript partition artifact is invalid.');
    requirePayload(
      typeof value.path === 'string' &&
        typeof value.contentHash === 'string' &&
        ['source', 'generated', 'vendored', 'test', 'example'].includes(
          String(value.classification),
        ),
      'TypeScript partition artifact fields are invalid.',
    );
    const path = repoPath(value.path);
    requirePayload(!state.artifacts.has(path), 'TypeScript partition artifact path is duplicated.');
    state.artifacts.set(path, {
      path,
      contentHash: contentHash(value.contentHash),
      classification: value.classification as ArtifactClassification,
    });
  }
  for (const value of payload.modules) {
    requirePayload(record(value), 'TypeScript partition module is invalid.');
    requirePayload(
      typeof value.path === 'string' &&
        Array.isArray(value.symbols) &&
        Array.isArray(value.reExports) &&
        Array.isArray(value.imports),
      'TypeScript partition module fields are invalid.',
    );
    const path = repoPath(value.path);
    const descriptor = state.artifacts.get(path);
    requirePayload(descriptor !== undefined, 'TypeScript partition module has no artifact.');
    requirePayload(!state.modules.has(path), 'TypeScript partition module path is duplicated.');
    state.modules.set(path, {
      artifact: { ...descriptor, bytes: new Uint8Array() },
      symbols: value.symbols as unknown as ParsedTypeScriptModule['symbols'],
      reExports: value.reExports as unknown as ParsedTypeScriptModule['reExports'],
      imports: value.imports as unknown as ParsedTypeScriptModule['imports'],
      parseErrors: 0,
    });
  }
  for (const value of payload.packageJson) {
    requirePayload(
      record(value) && typeof value.path === 'string' && record(value.raw),
      'TypeScript partition package metadata is invalid.',
    );
    const path = repoPath(value.path);
    requirePayload(
      state.artifacts.has(path) && !state.packageJson.has(path),
      'TypeScript partition package metadata path is invalid.',
    );
    state.packageJson.set(path, value.raw);
  }
  for (const value of payload.failures) {
    requirePayload(record(value), 'TypeScript partition failure is invalid.');
    requirePayload(
      typeof value.path === 'string' &&
        ['byte_limit', 'syntax_error', 'unsafe_input', 'missing_changed_blob'].includes(
          String(value.reason),
        ),
      'TypeScript partition failure fields are invalid.',
    );
    const path = repoPath(value.path);
    requirePayload(!state.failures.has(path), 'TypeScript partition failure path is duplicated.');
    state.failures.set(path, { path, reason: value.reason as FailureReason });
  }
  return state;
}

function buildPartition(
  state: TypeScriptSemanticState,
  config: ConfigRevision,
  context: Readonly<Record<string, unknown>>,
): AdapterPartitionBuild {
  return {
    partitionKey: `package:${state.packageRoot}`,
    ownedPaths: [...state.artifacts.keys()].sort().map(repoPath),
    dependencyKeys: [],
    payload: encodeState(state),
    extraction: materializeState(state, config, context),
  };
}

function buildResult(partitions: readonly AdapterPartitionBuild[]): AdapterPartitionBuildResult {
  const coverage = partitions[0]?.extraction.coverage ?? {
    state: 'unsupported' as const,
    eligibleArtifacts: 0,
    processedArtifacts: 0,
    skippedArtifacts: 0,
    failedArtifacts: 0,
    limitations: [],
  };
  const diagnostics = partitions.flatMap((partition) => partition.extraction.diagnostics);
  const canonical = {
    partitions,
    coverage,
    diagnostics,
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

function updateResult(input: Omit<AdapterPartitionUpdateResult, 'outputHash'>) {
  return { ...input, outputHash: contentHash(hashCanonical(input)) };
}

function adapterRelevantChange(change: AdapterPathChange): AdapterPathChange | undefined {
  const pathRelevant = relevantPath(change.path);
  const previousRelevant = change.previousPath !== undefined && relevantPath(change.previousPath);
  if (!pathRelevant && !previousRelevant) return undefined;
  if (pathRelevant) {
    return previousRelevant
      ? change
      : {
          kind: change.kind,
          path: change.path,
        };
  }
  return { kind: change.kind, path: change.previousPath! };
}

function differMetadata(): DifferMetadata {
  return {
    toolId: 'reverb-typescript-structural',
    toolVersion: manifest.version,
    toolDigest: contentHash(
      hashCanonical({ adapter: manifest.id, version: manifest.version, typescript: '5.9.2' }),
    ),
    toolLicense: 'Apache-2.0',
    category: 'typescript-public-api',
  };
}

function requiredParameterCounts(
  shape: Readonly<Record<string, unknown>>,
): readonly number[] | null {
  const candidates = Array.isArray(shape.overloads) ? shape.overloads : [shape];
  const counts: number[] = [];
  for (const candidate of candidates) {
    if (!record(candidate)) return null;
    const signature = record(candidate.signature) ? candidate.signature : candidate;
    if (!record(signature) || !Array.isArray(signature.parameters)) return null;
    counts.push(
      signature.parameters.filter(
        (parameter) => record(parameter) && parameter.optional !== true && parameter.rest !== true,
      ).length,
    );
  }
  return counts;
}

function changedCompatibility(
  before: ContractDefinition,
  after: ContractDefinition,
): ContractChange['compatibility'] {
  const beforeCounts = requiredParameterCounts(before.shape);
  const afterCounts = requiredParameterCounts(after.shape);
  if (beforeCounts !== null && afterCounts !== null) {
    if (Math.min(...afterCounts) > Math.max(...beforeCounts)) return 'breaking';
    const priorShapes = Array.isArray(before.shape.overloads)
      ? before.shape.overloads
      : [{ signature: before.shape.signature }];
    const nextShapes = Array.isArray(after.shape.overloads)
      ? after.shape.overloads
      : [{ signature: after.shape.signature }];
    if (
      priorShapes.every((shape) =>
        nextShapes.some((next) => hashCanonical(next) === hashCanonical(shape)),
      )
    ) {
      return 'compatible';
    }
    return 'potentially_breaking';
  }
  return 'unknown';
}

export class TypeScriptContractAdapter implements IncrementalContractAdapter {
  public readonly manifest = manifest;
  public readonly partitioningVersion = 1;

  public async extract(request: ExtractRequest) {
    return materializeState(prepareState(request), request.configRevision, request.context);
  }

  public async buildPartitions(request: ExtractRequest): Promise<AdapterPartitionBuildResult> {
    return buildResult([
      buildPartition(prepareState(request), request.configRevision, request.context),
    ]);
  }

  public planInvalidation(request: {
    readonly partitions: readonly AdapterPartitionDescriptor[];
    readonly changes: readonly AdapterPathChange[];
    readonly context: Readonly<Record<string, unknown>>;
  }): AdapterInvalidationPlan {
    const changes = request.changes.flatMap((change) => {
      const relevant = adapterRelevantChange(change);
      return relevant === undefined ? [] : [relevant];
    });
    const partitions = request.partitions.map((partition) => {
      if (request.partitions.length !== 1) return partition;
      const ownedPaths = new Set(partition.ownedPaths);
      for (const change of changes) {
        ownedPaths.add(change.path);
        if (change.previousPath !== undefined) ownedPaths.add(change.previousPath);
      }
      return { ...partition, ownedPaths: [...ownedPaths].sort() };
    });
    return planPathPartitionInvalidation({ partitions, changes });
  }

  public async updatePartitions(request: {
    readonly basePartitions: readonly AdapterPartitionView[];
    readonly plan: AdapterInvalidationPlan;
    readonly changes: readonly AdapterPathChange[];
    readonly changedArtifacts: readonly ArtifactInput[];
    readonly configRevision: ConfigRevision;
    readonly context: Readonly<Record<string, unknown>>;
  }): Promise<AdapterPartitionUpdateResult> {
    if (!request.plan.complete) {
      return updateResult({
        replacements: [],
        tombstones: [],
        coverage: {
          state: 'partial',
          eligibleArtifacts: request.plan.changedPaths.length,
          processedArtifacts: 0,
          skippedArtifacts: 0,
          failedArtifacts: request.plan.changedPaths.length,
          limitations: [{ code: 'unmatched_changed_path' }],
        },
        diagnostics: [
          diagnostic('error', 'Changed paths could not be assigned to one package partition.'),
        ],
      });
    }
    if (request.plan.invalidatedPartitionKeys.length === 0) {
      return updateResult({
        replacements: [],
        tombstones: [],
        coverage: {
          state: 'complete',
          eligibleArtifacts: 0,
          processedArtifacts: 0,
          skippedArtifacts: 0,
          failedArtifacts: 0,
          limitations: [],
        },
        diagnostics: [],
      });
    }
    if (
      request.basePartitions.length !== 1 ||
      request.plan.invalidatedPartitionKeys.length !== 1 ||
      request.basePartitions[0]?.partitionKey !== request.plan.invalidatedPartitionKeys[0]
    ) {
      return updateResult({
        replacements: [],
        tombstones: [],
        coverage: {
          state: 'partial',
          eligibleArtifacts: request.plan.invalidatedPartitionKeys.length,
          processedArtifacts: 0,
          skippedArtifacts: 0,
          failedArtifacts: request.plan.invalidatedPartitionKeys.length,
          limitations: [{ code: 'incompatible_partition_set' }],
        },
        diagnostics: [
          diagnostic('error', 'TypeScript incremental updates require one package partition.'),
        ],
      });
    }
    let state: TypeScriptSemanticState;
    try {
      state = cloneState(decodeState(request.basePartitions[0]!.payload));
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
        diagnostics: [diagnostic('error', 'Persisted TypeScript partition state is invalid.')],
      });
    }

    const expectedHeadPaths = new Set<RepoPath>();
    for (const change of request.changes) {
      if (relevantPath(change.path)) removeStatePath(state, change.path);
      if (
        change.kind !== 'copied' &&
        change.previousPath !== undefined &&
        relevantPath(change.previousPath)
      ) {
        removeStatePath(state, change.previousPath);
      }
      if (change.kind !== 'deleted' && relevantPath(change.path)) {
        expectedHeadPaths.add(change.path);
      }
    }
    const suppliedPaths = new Set<RepoPath>();
    for (const artifact of request.changedArtifacts) {
      if (!relevantPath(artifact.path)) continue;
      suppliedPaths.add(artifact.path);
      addArtifactToState(state, artifact);
    }
    for (const path of expectedHeadPaths) {
      if (!suppliedPaths.has(path)) {
        state.failures.set(path, { path, reason: 'missing_changed_blob' });
      }
    }
    const replacement = buildPartition(state, request.configRevision, request.context);
    return updateResult({
      replacements: [replacement],
      tombstones: [],
      coverage: replacement.extraction.coverage,
      diagnostics: replacement.extraction.diagnostics,
    });
  }

  public async materializePartitions(request: {
    readonly partitions: readonly AdapterPartitionView[];
    readonly configRevision: ConfigRevision;
    readonly context: Readonly<Record<string, unknown>>;
  }) {
    if (request.partitions.length !== 1) {
      throw new AdapterValidationError(
        'incompatible_partition_set',
        'TypeScript extraction materialization requires one package partition.',
      );
    }
    return materializeState(
      decodeState(request.partitions[0]!.payload),
      request.configRevision,
      request.context,
    );
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
      let compatibility: ContractChange['compatibility'] = 'unknown';
      if (complete) {
        compatibility =
          before === undefined
            ? 'compatible'
            : after === undefined
              ? 'breaking'
              : changedCompatibility(before, after);
      }
      changes.push({
        contractKind: 'typescript_symbol',
        canonicalKey: key,
        changeKind:
          before === undefined
            ? 'export_added'
            : after === undefined
              ? 'export_removed'
              : 'export_changed',
        compatibility,
        activation: 'on_upgrade',
        ...(before === undefined ? {} : { baseShapeHash: before.shapeHash }),
        ...(after === undefined ? {} : { headShapeHash: after.shapeHash }),
        coverageDependencies: ['base.package_exports', 'head.package_exports', 'typescript.ast'],
        remedy: {
          kind: 'preserve_or_version_public_api',
          text: 'Preserve the prior exported shape or publish and coordinate an intentional package upgrade.',
        },
        differ: differMetadata(),
      });
    }
    return finalizeDiff({
      schema: 'reverb.adapter-diff',
      schemaVersion: '1.0',
      adapterId: manifest.id,
      adapterVersion: manifest.version,
      identityVersion: manifest.identityVersion,
      changes,
      coverage: {
        state: complete ? 'complete' : 'partial',
        eligibleArtifacts: keys.length,
        processedArtifacts: changes.length,
        skippedArtifacts: keys.length - changes.length,
        failedArtifacts: 0,
        limitations: complete ? [] : [{ code: 'incomplete_input' }],
      },
      diagnostics: complete
        ? []
        : [diagnostic('warning', 'Incomplete extraction coverage makes compatibility unknown.')],
    });
  }
}

export const typeScriptAdapter = new TypeScriptContractAdapter();
