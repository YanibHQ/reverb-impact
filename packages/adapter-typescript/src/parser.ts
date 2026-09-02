import { posix } from 'node:path';

import ts from 'typescript';

import { contentHash, sha256Text, type ContentHash, type RepoPath } from '@yanib/reverb-domain';
import type { ArtifactInput, SourceRange } from '@yanib/reverb-adapter-sdk';

import type { TypeScriptSymbolSpace } from './identity.js';

export interface ParsedSymbol {
  readonly name: string;
  readonly space: TypeScriptSymbolSpace;
  readonly declarationKind: string;
  readonly shape: Readonly<Record<string, unknown>>;
  readonly range: SourceRange;
  readonly path: RepoPath;
  readonly contentHash: ContentHash;
  /** Hash-only implementation evidence; source bodies are never persisted. */
  readonly implementationHash?: ContentHash;
}

export interface ReExport {
  readonly source: string;
  readonly imported?: string;
  readonly exported?: string;
  readonly typeOnly: boolean;
  readonly star: boolean;
  readonly range: SourceRange;
  readonly path: RepoPath;
  readonly contentHash: ContentHash;
}

export interface ParsedImport {
  readonly source: string;
  readonly symbol?: string;
  readonly localName?: string;
  readonly space?: TypeScriptSymbolSpace;
  readonly unresolvedReason?: string;
  readonly range: SourceRange;
}

export interface ParsedTypeScriptModule {
  readonly artifact: ArtifactInput;
  readonly symbols: readonly ParsedSymbol[];
  readonly reExports: readonly ReExport[];
  readonly imports: readonly ParsedImport[];
  readonly parseErrors: number;
}

export interface ParsedTypeScriptConfig {
  readonly path: RepoPath;
  readonly baseUrl: string;
  readonly paths: readonly {
    readonly pattern: string;
    readonly targets: readonly string[];
  }[];
}

function range(source: ts.SourceFile, node: ts.Node): SourceRange {
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const end = source.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

function normalizedText(node: ts.Node, source: ts.SourceFile): string {
  return node.getText(source).replace(/\s+/g, ' ').trim().slice(0, 16_384);
}

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
      false)
  );
}

function isDefault(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ??
      false)
  );
}

function parameterShape(parameter: ts.ParameterDeclaration, source: ts.SourceFile) {
  return {
    type: parameter.type?.getText(source).replace(/\s+/g, ' ') ?? 'unknown',
    optional: parameter.questionToken !== undefined || parameter.initializer !== undefined,
    rest: parameter.dotDotDotToken !== undefined,
  };
}

function functionShape(node: ts.FunctionDeclaration, source: ts.SourceFile) {
  return {
    parameters: node.parameters.map((parameter) => parameterShape(parameter, source)),
    returnType: node.type?.getText(source).replace(/\s+/g, ' ') ?? 'unknown',
    typeParameters: node.typeParameters?.length ?? 0,
  };
}

function implementationHash(node: ts.Node, source: ts.SourceFile): ContentHash {
  return contentHash(sha256Text(normalizedText(node, source)));
}

function declarationSymbol(
  statement: ts.Statement,
  source: ts.SourceFile,
  artifact: ArtifactInput,
): readonly ParsedSymbol[] {
  if (!isExported(statement)) return [];
  const exportedName = isDefault(statement) ? 'default' : undefined;
  if (ts.isFunctionDeclaration(statement)) {
    const name = exportedName ?? statement.name?.text;
    if (name === undefined) return [];
    return [
      {
        name,
        space: 'value',
        declarationKind: 'function',
        shape: { signature: functionShape(statement, source) },
        range: range(source, statement),
        path: artifact.path,
        contentHash: artifact.contentHash,
        ...(statement.body === undefined
          ? {}
          : { implementationHash: implementationHash(statement.body, source) }),
      },
    ];
  }
  if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
    return [
      {
        name: statement.name.text,
        space: 'type',
        declarationKind: ts.isInterfaceDeclaration(statement) ? 'interface' : 'type_alias',
        shape: { declaration: normalizedText(statement, source) },
        range: range(source, statement),
        path: artifact.path,
        contentHash: artifact.contentHash,
      },
    ];
  }
  if (ts.isClassDeclaration(statement)) {
    const name = exportedName ?? statement.name?.text;
    if (name === undefined) return [];
    const publicMembers = statement.members
      .filter(
        (member) =>
          !(ts.canHaveModifiers(member)
            ? (ts
                .getModifiers(member)
                ?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword) ?? false)
            : false),
      )
      .map((member) =>
        normalizedText(member, source)
          .replace(/\{[\s\S]*$/, '')
          .trim(),
      );
    const common = {
      name,
      declarationKind: 'class',
      shape: { members: publicMembers },
      range: range(source, statement),
      path: artifact.path,
      contentHash: artifact.contentHash,
      implementationHash: implementationHash(statement, source),
    } as const;
    return [
      { ...common, space: 'value' },
      { ...common, space: 'type' },
    ];
  }
  if (ts.isEnumDeclaration(statement)) {
    const common = {
      name: statement.name.text,
      declarationKind: 'enum',
      shape: { declaration: normalizedText(statement, source) },
      range: range(source, statement),
      path: artifact.path,
      contentHash: artifact.contentHash,
    } as const;
    return [
      { ...common, space: 'value' },
      { ...common, space: 'type' },
    ];
  }
  if (ts.isVariableStatement(statement)) {
    const symbols: ParsedSymbol[] = [];
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      symbols.push({
        name: declaration.name.text,
        space: 'value',
        declarationKind: 'variable',
        shape: {
          type: declaration.type?.getText(source).replace(/\s+/g, ' ') ?? 'inferred',
          declarationKind:
            statement.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'mutable',
        },
        range: range(source, declaration),
        path: artifact.path,
        contentHash: artifact.contentHash,
        ...(declaration.initializer === undefined
          ? {}
          : { implementationHash: implementationHash(declaration.initializer, source) }),
      });
    }
    return symbols;
  }
  return [];
}

function externalImports(source: ts.SourceFile): ParsedImport[] {
  const imports: ParsedImport[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (clause?.name !== undefined) {
        imports.push({
          source: moduleName,
          symbol: 'default',
          localName: clause.name.text,
          space: clause.isTypeOnly ? 'type' : 'value',
          range: range(source, node),
        });
      }
      if (clause?.namedBindings !== undefined) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          imports.push({
            source: moduleName,
            localName: clause.namedBindings.name.text,
            unresolvedReason: 'namespace_member_unknown',
            range: range(source, node),
          });
        } else {
          for (const element of clause.namedBindings.elements) {
            imports.push({
              source: moduleName,
              symbol: element.propertyName?.text ?? element.name.text,
              localName: element.name.text,
              space: clause.isTypeOnly || element.isTypeOnly ? 'type' : 'value',
              range: range(source, element),
            });
          }
        }
      }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      const moduleName =
        argument !== undefined && ts.isStringLiteral(argument) ? argument.text : undefined;
      const awaited = ts.isAwaitExpression(node.parent) ? node.parent : node;
      const parent = awaited.parent;
      if (
        moduleName !== undefined &&
        ts.isVariableDeclaration(parent) &&
        ts.isObjectBindingPattern(parent.name)
      ) {
        for (const element of parent.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          imports.push({
            source: moduleName,
            symbol: element.propertyName?.getText(source) ?? element.name.text,
            localName: element.name.text,
            space: 'value',
            range: range(source, element),
          });
        }
      } else {
        imports.push({
          source: moduleName ?? '*',
          unresolvedReason: 'dynamic_import',
          range: range(source, node),
        });
      }
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1
    ) {
      const argument = node.arguments[0];
      if (argument === undefined || !ts.isStringLiteral(argument)) {
        ts.forEachChild(node, visit);
        return;
      }
      const parent = node.parent;
      if (ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name)) {
        for (const element of parent.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          imports.push({
            source: argument.text,
            symbol: element.propertyName?.getText(source) ?? element.name.text,
            localName: element.name.text,
            space: 'value',
            range: range(source, element),
          });
        }
      } else {
        imports.push({
          source: argument.text,
          unresolvedReason: 'commonjs_namespace_member_unknown',
          range: range(source, node),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

export function parseTypeScriptModule(
  artifact: ArtifactInput,
  text: string,
): ParsedTypeScriptModule {
  const source = ts.createSourceFile(
    artifact.path,
    text,
    ts.ScriptTarget.Latest,
    true,
    artifact.path.endsWith('.tsx')
      ? ts.ScriptKind.TSX
      : artifact.path.endsWith('.jsx')
        ? ts.ScriptKind.JSX
        : /\.(?:js|mjs|cjs)$/.test(artifact.path)
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS,
  );
  const symbols: ParsedSymbol[] = [];
  const reExports: ReExport[] = [];
  for (const statement of source.statements) {
    symbols.push(...declarationSymbol(statement, source, artifact));
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const moduleName = statement.moduleSpecifier.text;
      if (statement.exportClause === undefined) {
        reExports.push({
          source: moduleName,
          typeOnly: statement.isTypeOnly,
          star: true,
          range: range(source, statement),
          path: artifact.path,
          contentHash: artifact.contentHash,
        });
      } else if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          reExports.push({
            source: moduleName,
            imported: element.propertyName?.text ?? element.name.text,
            exported: element.name.text,
            typeOnly: statement.isTypeOnly || element.isTypeOnly,
            star: false,
            range: range(source, element),
            path: artifact.path,
            contentHash: artifact.contentHash,
          });
        }
      }
    }
  }
  return {
    artifact,
    symbols,
    reExports,
    imports: externalImports(source),
    parseErrors: (source as ts.SourceFile & { readonly parseDiagnostics: readonly ts.Diagnostic[] })
      .parseDiagnostics.length,
  };
}

export function resolveRelativeModule(
  from: string,
  specifier: string,
  available: ReadonlySet<string>,
): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  return resolveModuleCandidate(base, available);
}

function resolveModuleCandidate(base: string, available: ReadonlySet<string>): string | undefined {
  const withoutRuntimeExtension = base.replace(/\.(?:mjs|cjs|js|jsx)$/, '');
  const candidates = [
    base,
    withoutRuntimeExtension,
    `${withoutRuntimeExtension}.ts`,
    `${withoutRuntimeExtension}.tsx`,
    `${withoutRuntimeExtension}.mts`,
    `${withoutRuntimeExtension}.cts`,
    `${withoutRuntimeExtension}.d.ts`,
    `${withoutRuntimeExtension}.js`,
    `${withoutRuntimeExtension}.jsx`,
    `${withoutRuntimeExtension}.mjs`,
    `${withoutRuntimeExtension}.cjs`,
    `${withoutRuntimeExtension}/index.ts`,
    `${withoutRuntimeExtension}/index.tsx`,
  ];
  return candidates.find((candidate) => available.has(candidate));
}

function plainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse only the path-resolution facts required for deterministic module identity. */
export function parseTypeScriptConfig(
  artifact: ArtifactInput,
  text: string,
): ParsedTypeScriptConfig | undefined {
  const parsed = ts.parseConfigFileTextToJson(artifact.path, text);
  if (parsed.error !== undefined || !plainRecord(parsed.config)) return undefined;
  const compilerOptions = parsed.config.compilerOptions;
  if (!plainRecord(compilerOptions)) return undefined;
  const rawPaths = compilerOptions.paths;
  const paths = plainRecord(rawPaths)
    ? Object.keys(rawPaths)
        .sort()
        .slice(0, 256)
        .flatMap((pattern) => {
          const rawTargets = rawPaths[pattern];
          if (pattern.length === 0 || pattern.length > 512 || !Array.isArray(rawTargets)) {
            return [];
          }
          const targets = rawTargets
            .filter((target): target is string => typeof target === 'string')
            .filter((target) => target.length > 0 && target.length <= 512)
            .slice(0, 32);
          return targets.length === 0 ? [] : [{ pattern, targets }];
        })
    : [];
  const baseUrl =
    typeof compilerOptions.baseUrl === 'string' && compilerOptions.baseUrl.length <= 512
      ? compilerOptions.baseUrl
      : '.';
  return { path: artifact.path, baseUrl, paths };
}

function patternCapture(pattern: string, specifier: string): string | undefined {
  const wildcard = pattern.indexOf('*');
  if (wildcard < 0) return pattern === specifier ? '' : undefined;
  if (pattern.indexOf('*', wildcard + 1) >= 0) return undefined;
  const prefix = pattern.slice(0, wildcard);
  const suffix = pattern.slice(wildcard + 1);
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return undefined;
  return specifier.slice(prefix.length, specifier.length - suffix.length);
}

/** Resolve a relative import or a `compilerOptions.paths` alias to an indexed module. */
export function resolveTypeScriptModule(
  from: string,
  specifier: string,
  available: ReadonlySet<string>,
  configs: readonly ParsedTypeScriptConfig[] = [],
): string | undefined {
  const relative = resolveRelativeModule(from, specifier, available);
  if (relative !== undefined) return relative;
  const applicable = [...configs]
    .filter((config) => {
      const directory = posix.dirname(config.path);
      return directory === '.' || from === directory || from.startsWith(`${directory}/`);
    })
    .sort((left, right) => {
      const depth = posix.dirname(right.path).length - posix.dirname(left.path).length;
      return depth === 0 ? left.path.localeCompare(right.path) : depth;
    });
  for (const config of applicable) {
    const configDirectory = posix.dirname(config.path);
    const baseDirectory = posix.normalize(posix.join(configDirectory, config.baseUrl));
    for (const mapping of config.paths) {
      const capture = patternCapture(mapping.pattern, specifier);
      if (capture === undefined) continue;
      for (const target of mapping.targets) {
        const mapped = target.includes('*') ? target.replace('*', capture) : target;
        const base = posix.normalize(posix.join(baseDirectory, mapped));
        if (base === '..' || base.startsWith('../') || posix.isAbsolute(base)) continue;
        const resolved = resolveModuleCandidate(base, available);
        if (resolved !== undefined) return resolved;
      }
    }
  }
  return undefined;
}
