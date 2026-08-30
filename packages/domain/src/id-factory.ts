import type { Instant } from './values.js';

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createUuidV7(now: Instant, random: Uint8Array): string {
  if (random.length < 10)
    throw new RangeError('UUIDv7 creation requires at least 10 random bytes.');
  const timestamp = BigInt(new Date(now).valueOf());
  const time = timestamp.toString(16).padStart(12, '0').slice(-12);
  const randomA = hex(random.slice(0, 2));
  const randomB = Uint8Array.from(random.slice(2, 10));
  randomB[0] = (randomB[0]! & 0x3f) | 0x80;
  const randomBHex = hex(randomB);
  return `${time.slice(0, 8)}-${time.slice(8)}-7${randomA.slice(1)}-${randomBHex.slice(0, 4)}-${randomBHex.slice(4, 16)}`;
}

export function createPrefixedUuidV7(prefix: string, now: Instant, random: Uint8Array): string {
  return `${prefix}_${createUuidV7(now, random)}`;
}
