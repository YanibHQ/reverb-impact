import { canonicalContractKey } from '@yanibhq/reverb-adapter-sdk';

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
