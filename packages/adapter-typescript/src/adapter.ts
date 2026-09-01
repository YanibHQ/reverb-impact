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
  assertComparableExtractions,
  canonicalShape,
  finalizeDiff,
  finalizeExtraction,
  type AdapterCoverage,
  type AdapterDiffResult,
  type ArtifactInput,
  type ContractAdapter,
  type ContractChange,
  type ContractDefinition,
  type ContractReference,
  type DiffRequest,
  type DifferMetadata,
  type ExtractRequest,
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

function packageMetadata(artifacts: readonly ArtifactInput[]): PackageMetadata | undefined {
  const candidates = artifacts.filter((artifact) => artifact.path.endsWith('package.json'));
  for (const artifact of candidates) {
    try {
      const raw: unknown = JSON.parse(decoder.decode(artifact.bytes));
      if (!record(raw) || typeof raw.name !== 'string' || raw.name.trim().length === 0) continue;
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
    } catch {
      continue;
    }
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
    let unresolved = module.unresolvedExports;
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
  request: ExtractRequest,
  modules: ReadonlyMap<string, ParsedTypeScriptModule>,
  metadata: PackageMetadata | undefined,
  registry: string,
): { readonly values: readonly ContractReference[]; readonly dynamic: number } {
  const values: ContractReference[] = [];
  const locked = lockedPackages(request.context);
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
          configRevision: request.configRevision,
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
        configRevision: request.configRevision,
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

function sourceFingerprint(request: ExtractRequest, registry: string): ContentHash {
  const safeEntrypoints = (
    Array.isArray(request.context.entrypoints)
      ? request.context.entrypoints.flatMap((item) => {
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
      entrypoints: safeEntrypoints,
      lockedPackages: [...lockedPackages(request.context)].sort(),
    }),
  );
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

export class TypeScriptContractAdapter implements ContractAdapter {
  public readonly manifest = manifest;

  public async extract(request: ExtractRequest) {
    const modules = new Map<string, ParsedTypeScriptModule>();
    const diagnostics: BoundedDiagnostic[] = [];
    let eligible = 0;
    let processed = 0;
    let failed = 0;
    for (const artifact of request.artifacts) {
      if (
        !TS_PATH.test(artifact.path) ||
        artifact.classification === 'vendored' ||
        artifact.classification === 'test'
      )
        continue;
      eligible += 1;
      if (artifact.bytes.byteLength > manifest.resourceBudget.maximumInputBytes) {
        failed += 1;
        diagnostics.push(
          diagnostic('error', 'TypeScript input exceeds the declared byte limit.', artifact.path),
        );
        continue;
      }
      try {
        const parsed = parseTypeScriptModule(artifact, decoder.decode(artifact.bytes));
        if (parsed.parseErrors > 0) {
          failed += 1;
          diagnostics.push(
            diagnostic('error', 'TypeScript input contains syntax errors.', artifact.path),
          );
        } else {
          processed += 1;
          modules.set(artifact.path, parsed);
        }
      } catch {
        failed += 1;
        diagnostics.push(
          diagnostic('error', 'TypeScript input could not be parsed safely.', artifact.path),
        );
      }
    }
    const metadata = packageMetadata(request.artifacts);
    const registry = contextString(request.context, 'packageRegistry') ?? 'npm';
    const publicEntrypoints = entrypoints(request.context, metadata, modules);
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
            configRevision: request.configRevision,
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
    const imported = references(request, modules, metadata, registry);
    if (imported.dynamic > 0) {
      diagnostics.push(
        diagnostic(
          'warning',
          'Dynamic or namespace imports were retained as unresolved references.',
        ),
      );
    }
    const partial = failed > 0 || unresolvedExports > 0 || imported.dynamic > 0;
    const state: AdapterCoverage['state'] =
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
      configRevision: request.configRevision,
      definitions: [...definitions.values()],
      references: imported.values,
      coverage: {
        state,
        eligibleArtifacts: eligible,
        processedArtifacts: processed,
        skippedArtifacts: 0,
        failedArtifacts: failed,
        limitations: [
          ...(unresolvedExports > 0 ? [{ code: 'unresolved_public_export' }] : []),
          ...(imported.dynamic > 0 ? [{ code: 'dynamic_or_reflective_use' }] : []),
        ],
      },
      diagnostics,
      sourceFingerprint: sourceFingerprint(request, registry),
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
