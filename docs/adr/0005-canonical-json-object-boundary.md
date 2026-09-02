# ADR 0005 — Canonical JSON object boundary

**Status:** Accepted  
**Date:** 2026-09-01

## Context

Canonical JSON is the input to Reverb's content hashes, stable identities, idempotency keys, and
equality checks. Its public runtime boundary accepts `unknown`, while its declared data model
contains only JSON scalars, arrays, and string-keyed records.

The original normalizer treated every JavaScript object as a JSON record. Non-JSON objects without
enumerable properties, including `Date`, `Map`, `Set`, and `RegExp`, consequently normalized to the
same `{}` value. Its ordinary object accumulator also interpreted an own `__proto__` JSON member as
a prototype mutation, dropping that valid member and giving it the same hash as an empty object.

## Decision

- Arrays continue to normalize recursively in source order.
- Object values must use `Object.prototype` or a null prototype. Other object types fail with the
  existing `invalid_schema` domain error before hashing.
- The normalizer builds records with a null prototype so every valid string key, including
  `__proto__`, is retained as data.
- Key sorting, number normalization, cycle rejection, and SHA-256 encoding remain unchanged.

## Consequences

- Distinct supported JSON objects no longer collapse because of prototype setter behavior.
- Unsupported runtime objects fail closed instead of receiving misleading canonical identities.
- Ordinary object literals, parsed JSON, frozen records, and null-prototype records remain
  supported.
- Callers with class instances or other rich objects must project them to explicit JSON values
  before canonicalization.

## Rejected alternatives

- Honor `toJSON`: rejected because user-defined conversion can be stateful and makes the identity
  boundary less explicit.
- Coerce known built-ins such as `Date` and `Map`: rejected because Reverb's canonical schema has no
  tagged representation for them.
- Keep an ordinary output object and special-case `__proto__`: rejected because a null-prototype
  accumulator handles all string keys uniformly.
