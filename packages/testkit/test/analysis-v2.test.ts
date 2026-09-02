import {
  canonicalJson,
  finalizeAnalysisCoverageV2,
  finalizeAnalysisResultV2,
  finalizeRepositoryAnalysisCoverageV2,
  type AnalysisResultV2,
} from '@yanib/reverb-domain';
import { describe, expect, it } from 'vitest';

import { analysisResultV2Fixture } from '../src/index.js';

function withoutHash<Value extends { readonly outputHash: unknown }>(value: Value) {
  const { outputHash: _outputHash, ...input } = value;
  void _outputHash;
  return input;
}

describe('analysis result v2 invariants', () => {
  it('reproduces the same canonical result from canonical inputs', () => {
    const fixture = analysisResultV2Fixture();
    expect(canonicalJson(finalizeAnalysisResultV2(withoutHash(fixture)))).toBe(
      canonicalJson(fixture),
    );
  });

  it('cannot present partial repository coverage as complete', () => {
    const fixture = analysisResultV2Fixture();
    const repository = fixture.coverage.repositories[0]!;
    const partialRepository = finalizeRepositoryAnalysisCoverageV2({
      ...withoutHash(repository),
      selectionState: 'stale',
      freshnessAgeMs: 1,
    });
    const partialCoverage = finalizeAnalysisCoverageV2({
      scope: fixture.scope,
      enabledFamilies: [],
      repositories: [partialRepository],
    });
    expect(() =>
      finalizeAnalysisResultV2({
        ...withoutHash(fixture),
        coverage: partialCoverage,
        state: 'complete',
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_schema' }));
  });

  it('cannot replace deterministic findings or duplicate an execution lane', () => {
    const fixture = analysisResultV2Fixture();
    expect(() =>
      finalizeAnalysisResultV2({
        ...withoutHash(fixture),
        deterministicFindings: [
          { fingerprint: 'fnd_untrusted_replacement' },
        ] as unknown as AnalysisResultV2['deterministicFindings'],
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_schema' }));
    expect(() =>
      finalizeAnalysisResultV2({
        ...withoutHash(fixture),
        executionBudgets: [fixture.executionBudgets[0]!, fixture.executionBudgets[0]!],
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_schema' }));
  });
});
