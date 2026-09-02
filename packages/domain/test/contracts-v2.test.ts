import { CONTRACT_KINDS, CONTRACT_KINDS_V2, NEW_CONTRACT_KINDS_V2 } from '../src/index.js';
import { describe, expect, it } from 'vitest';

describe('schema-major 2 contract vocabulary', () => {
  it('adds new families without widening the frozen v1 vocabulary', () => {
    expect(CONTRACT_KINDS).toEqual([
      'typescript_symbol',
      'openapi_operation',
      'protobuf_method',
      'protobuf_field',
    ]);
    expect(NEW_CONTRACT_KINDS_V2).toContain('event.destination');
    expect(CONTRACT_KINDS_V2).toEqual([...CONTRACT_KINDS, ...NEW_CONTRACT_KINDS_V2]);
  });
});
