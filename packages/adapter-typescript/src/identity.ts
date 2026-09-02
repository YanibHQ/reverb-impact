import { posix } from 'node:path';

import { canonicalContractKey } from '@yanib/reverb-adapter-sdk';

export type TypeScriptSymbolSpace = 'type' | 'value';

export function normalizeNpmSubpath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '.') return '.';
  return `./${trimmed
    .replace(/^\.\//, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '')}`;
}

export function typeScriptSymbolKey(
  registry: string,
  packageName: string,
  subpath: string,
  space: TypeScriptSymbolSpace,
  symbol: string,
): string {
  return canonicalContractKey('typescript', [
    { name: 'Package registry', value: registry.toLowerCase() },
    { name: 'Package name', value: packageName.toLowerCase() },
    { name: 'Package subpath', value: normalizeNpmSubpath(subpath) },
    { name: 'Symbol space', value: space },
    { name: 'Symbol', value: symbol },
  ]);
}

export function normalizeTypeScriptModulePath(value: string): string {
  const normalized = posix
    .normalize(value.trim().replace(/^\.\//, ''))
    .replace(/^(?:\.\.\/)+/, '')
    .replace(/(?:\.d)?\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/, '')
    .replace(/\/index$/, '')
    .replace(/^\/+|\/+$/g, '');
  return normalized.length === 0 || normalized === '.' ? '.' : `./${normalized}`;
}

/**
 * Repository-scoped identities deliberately cannot join across repositories.
 * They model exact static dependencies between modules in one source tree;
 * package-public identities above remain the cross-repository join surface.
 */
export function typeScriptRepositorySymbolKey(
  repositoryScope: string,
  modulePath: string,
  space: TypeScriptSymbolSpace,
  symbol: string,
): string {
  return canonicalContractKey('typescript-repository', [
    { name: 'Repository scope', value: repositoryScope },
    { name: 'Module path', value: normalizeTypeScriptModulePath(modulePath) },
    { name: 'Symbol space', value: space },
    { name: 'Symbol', value: symbol },
  ]);
}

export function parseNpmSpecifier(specifier: string): {
  readonly packageName: string;
  readonly subpath: string;
} | null {
  if (
    specifier.length === 0 ||
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('node:')
  ) {
    return null;
  }
  const segments = specifier.split('/');
  const scoped = specifier.startsWith('@');
  const packageLength = scoped ? 2 : 1;
  if (
    segments.length < packageLength ||
    segments.slice(0, packageLength).some((part) => part === '')
  ) {
    return null;
  }
  return {
    packageName: segments.slice(0, packageLength).join('/'),
    subpath: normalizeNpmSubpath(segments.slice(packageLength).join('/')),
  };
}
