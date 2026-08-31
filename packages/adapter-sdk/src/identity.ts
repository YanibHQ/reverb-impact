import { canonicalJson, contentHash, hashCanonical } from '@yanib/reverb-domain';

import { AdapterValidationError } from './validation.js';

export function canonicalIdentitySegment(value: string, name: string): string {
  const normalized = value.normalize('NFC').trim();
  if (normalized.length === 0 || normalized.length > 512 || normalized.includes('\0')) {
    throw new AdapterValidationError('invalid_identity', `${name} is not a bounded identity.`);
  }
  return encodeURIComponent(normalized);
}

export function canonicalContractKey(
  scheme: string,
  segments: readonly { readonly name: string; readonly value: string }[],
): string {
  const prefix = canonicalIdentitySegment(scheme.toLowerCase(), 'Identity scheme');
  return `${prefix}:${segments
    .map((segment) => canonicalIdentitySegment(segment.value, segment.name))
    .join('#')}`;
}

export function canonicalShape(value: Readonly<Record<string, unknown>>): {
  readonly shape: Readonly<Record<string, unknown>>;
  readonly shapeHash: ReturnType<typeof contentHash>;
} {
  JSON.parse(canonicalJson(value));
  return { shape: value, shapeHash: contentHash(hashCanonical(value)) };
}
