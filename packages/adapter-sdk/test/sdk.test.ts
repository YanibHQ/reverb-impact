import {
  adapterId,
  configRevision,
  contentHash,
  hashCanonical,
  repoPath,
} from '@yanibhq/reverb-domain';
import { describe, expect, it } from 'vitest';

import {
  AdapterValidationError,
  canonicalContractKey,
  createAdmissionReport,
  finalizeExtraction,
  validateAdapterManifest,
  verifyIdentityRoundTrip,
  type AdapterManifest,
} from '../src/index.js';

const hash = contentHash(`sha256:${'1'.repeat(64)}`);
const revision = configRevision(`cfg_sha256:${'2'.repeat(64)}`);

function manifest(): AdapterManifest {
  return {
    schema: 'reverb.adapter-manifest',
    schemaVersion: '1.0',
    id: adapterId('test.adapter'),
    version: '1.2.3',
    identityVersion: 1,
    contractKinds: ['typescript_symbol'],
    capabilityTiers: [{ input: 'fixture', tier: 'preview' }],
    evidenceStrata: [
      {
        id: 'fixture',
        family: 'exact_symbol',
        requiredEvidence: ['fixture'],
        promotionState: 'UNMEASURED',
      },
    ],
    externalTools: [],
    limitations: [],
    resourceBudget: {
      timeoutMs: 1,
      memoryMiB: 1,
      maximumInputBytes: 1,
      maximumOutputBytes: 1,
      maximumItems: 1,
    },
    maintainer: 'tests',
  };
}

describe('adapter SDK invariants', () => {
  it('validates closed manifests and rejects promoted unmeasured strata', () => {
    expect(validateAdapterManifest(manifest())).toEqual(manifest());
    const invalid = {
      ...manifest(),
      evidenceStrata: [{ ...manifest().evidenceStrata[0]!, promotionState: 'MEASURED' }],
    };
    expect(() => validateAdapterManifest(invalid as AdapterManifest)).toThrow(
      AdapterValidationError,
    );
  });

  it('distinguishes a complete empty result from a failed extraction', () => {
    const common = {
      schema: 'reverb.adapter-extraction' as const,
      schemaVersion: '1.0' as const,
      adapterId: manifest().id,
      adapterVersion: manifest().version,
      identityVersion: 1,
      configRevision: revision,
      definitions: [],
      references: [],
      diagnostics: [],
      sourceFingerprint: hash,
    };
    const empty = finalizeExtraction({
      ...common,
      coverage: {
        state: 'complete',
        eligibleArtifacts: 1,
        processedArtifacts: 1,
        skippedArtifacts: 0,
        failedArtifacts: 0,
        limitations: [],
      },
    });
    const failed = finalizeExtraction({
      ...common,
      coverage: {
        state: 'failed',
        eligibleArtifacts: 1,
        processedArtifacts: 0,
        skippedArtifacts: 0,
        failedArtifacts: 1,
        limitations: [{ code: 'parse_failure' }],
      },
    });
    expect(empty.coverage.state).toBe('complete');
    expect(failed.coverage.state).toBe('failed');
    expect(empty.outputHash).not.toBe(failed.outputHash);
  });

  it('sorts extraction output before hashing', () => {
    const item = (key: string) => ({
      contractKind: 'typescript_symbol' as const,
      canonicalKey: key,
      displayName: key,
      path: repoPath(`${key}.ts`),
      contentHash: hash,
      shapeHash: contentHash(hashCanonical({ key })),
      shape: { key },
      extractorId: manifest().id,
      extractorVersion: manifest().version,
      identityVersion: 1,
      configRevision: revision,
      evidenceStratum: 'fixture',
    });
    const make = (definitions: ReturnType<typeof item>[]) =>
      finalizeExtraction({
        schema: 'reverb.adapter-extraction',
        schemaVersion: '1.0',
        adapterId: manifest().id,
        adapterVersion: manifest().version,
        identityVersion: 1,
        configRevision: revision,
        definitions,
        references: [],
        coverage: {
          state: 'complete',
          eligibleArtifacts: 1,
          processedArtifacts: 1,
          skippedArtifacts: 0,
          failedArtifacts: 0,
          limitations: [],
        },
        diagnostics: [],
        sourceFingerprint: hash,
      });
    expect(make([item('b'), item('a')]).outputHash).toBe(make([item('a'), item('b')]).outputHash);
    expect(() =>
      make([{ ...item('a'), shapeHash: contentHash(`sha256:${'9'.repeat(64)}`) }]),
    ).toThrowError(/shape hash/i);
  });

  it('canonicalizes producer and consumer identities identically', () => {
    const canonicalize = (value: Readonly<Record<string, string>>) =>
      canonicalContractKey('fixture', [
        { name: 'package', value: value.package! },
        { name: 'symbol', value: value.symbol! },
      ]);
    expect(
      verifyIdentityRoundTrip(
        canonicalize,
        { package: '@scope/api', symbol: 'Pet' },
        { symbol: 'Pet', package: '@scope/api' },
      ),
    ).toBe('fixture:%40scope%2Fapi#Pet');
  });

  it('keeps admission reports unmeasured and non-deliverable', () => {
    const report = createAdmissionReport({
      manifest: manifest(),
      demand: 'fixture',
      identitySummary: 'fixture',
      compatibilitySummary: 'fixture',
      evidenceRendering: 'fixture',
      checks: [{ id: 'corpus', state: 'pass', evidence: 'synthetic only' }],
      realLabelledCorpusState: 'available',
    });
    expect(report).toMatchObject({ promotionState: 'UNMEASURED', deliveryReady: false });
  });
});
