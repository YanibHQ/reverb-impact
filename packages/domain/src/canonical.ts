import { createHash } from 'node:crypto';

import { ReverbError } from './errors.js';

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

function normalize(value: unknown, seen: Set<object>): CanonicalJsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ReverbError(
        'invalid_schema',
        'Canonical JSON does not support non-finite numbers.',
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new ReverbError('invalid_schema', 'Canonical JSON is cyclic.');
    seen.add(value);
    const output = value.map((item) => normalize(item, seen));
    seen.delete(value);
    return output;
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(object);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ReverbError('invalid_schema', 'Canonical JSON objects must be plain records.');
    }
    if (seen.has(object)) throw new ReverbError('invalid_schema', 'Canonical JSON is cyclic.');
    seen.add(object);
    const output = Object.create(null) as Record<string, CanonicalJsonValue>;
    for (const key of Object.keys(object).sort()) {
      const child = object[key];
      if (child === undefined) {
        throw new ReverbError('invalid_schema', 'Canonical JSON does not support undefined.', {
          key,
        });
      }
      output[key] = normalize(child, seen);
    }
    seen.delete(object);
    return output;
  }
  throw new ReverbError('invalid_schema', 'Value cannot be represented as canonical JSON.');
}

export function canonicalizeJson(value: unknown): CanonicalJsonValue {
  return normalize(value, new Set<object>());
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

export function sha256Bytes(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function sha256Text(value: string): string {
  return sha256Bytes(new TextEncoder().encode(value));
}

export function hashCanonical(value: unknown): string {
  return sha256Text(canonicalJson(value));
}

export function hashLengthPrefixed(parts: readonly string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    const bytes = Buffer.from(part, 'utf8');
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64BE(BigInt(bytes.length));
    hash.update(length);
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}
