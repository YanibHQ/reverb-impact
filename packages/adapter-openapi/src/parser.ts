import { parseDocument } from 'yaml';

export interface ParsedOpenApiDocument {
  readonly document: Readonly<Record<string, unknown>>;
  readonly remoteReferences: readonly string[];
  readonly unresolvedLocalReferences: readonly string[];
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodePointerSegment(value: string): string {
  return value.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function resolveLocalReference(
  document: Readonly<Record<string, unknown>>,
  reference: string,
): unknown | undefined {
  if (reference === '#') return document;
  if (!reference.startsWith('#/')) return undefined;
  let current: unknown = document;
  for (const segment of reference.slice(2).split('/').map(decodePointerSegment)) {
    if (!record(current) || !Object.hasOwn(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

function inspectReferences(
  document: Readonly<Record<string, unknown>>,
  maximumItems: number,
): { readonly remote: string[]; readonly unresolved: string[] } {
  const remote = new Set<string>();
  const unresolved = new Set<string>();
  const pending: unknown[] = [document];
  const seen = new Set<object>();
  let visited = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current !== 'object' || current === null || seen.has(current)) continue;
    seen.add(current);
    visited += 1;
    if (visited > maximumItems * 20) throw new Error('document_item_limit');
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    const object = current as Readonly<Record<string, unknown>>;
    if (typeof object.$ref === 'string') {
      if (object.$ref.startsWith('#')) {
        if (resolveLocalReference(document, object.$ref) === undefined) unresolved.add(object.$ref);
      } else {
        remote.add(object.$ref);
      }
    }
    pending.push(...Object.values(object));
  }
  return { remote: [...remote].sort(), unresolved: [...unresolved].sort() };
}

export function parseOpenApiDocument(
  text: string,
  maximumItems: number,
): ParsedOpenApiDocument | null {
  const parsed = parseDocument(text, {
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
  });
  if (parsed.errors.length > 0) throw new Error('invalid_openapi_document');
  const value: unknown = parsed.toJS({ maxAliasCount: 0 });
  if (
    !record(value) ||
    typeof value.openapi !== 'string' ||
    !/^3\.(?:0|1)(?:\.|$)/.test(value.openapi)
  ) {
    return null;
  }
  if (!record(value.paths)) throw new Error('missing_openapi_paths');
  const references = inspectReferences(value, maximumItems);
  return {
    document: value,
    remoteReferences: references.remote,
    unresolvedLocalReferences: references.unresolved,
  };
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return record(value);
}
