import {
  adapterId,
  configRevision,
  contentHash,
  repoPath,
  type AdapterFamilyV2,
} from '@yanib/reverb-domain';
import { describe, expect, it } from 'vitest';

import {
  canonicalShape,
  finalizeExtractionV2,
  validateAdapterManifest,
  validateAdapterManifestV2,
  type AdapterManifestV2,
  type AdapterValidationError,
} from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'1'.repeat(64)}`);
const hash = contentHash(`sha256:${'2'.repeat(64)}`);

function manifest(family: AdapterFamilyV2 = 'events'): AdapterManifestV2 {
  return {
    schema: 'reverb.adapter-manifest',
    schemaVersion: '2.0',
    id: adapterId('reverb.events'),
    family,
    version: '0.5.0',
    extractionVersion: '1',
    identityVersion: 1,
    partitioningVersion: 1,
    compatibilityVersion: '1',
    contractKinds: ['event.destination', 'event.payload_schema'],
    capabilityTiers: [{ input: 'event manifest', tier: 'contract_grade' }],
    evidenceStrata: [
      {
        id: 'event_manifest',
        family: 'exact_schema',
        requiredEvidence: ['literal destination'],
        promotionState: 'UNMEASURED',
      },
    ],
    externalTools: [],
    limitations: ['Dynamic destination expressions remain unresolved.'],
    resourceBudget: {
      timeoutMs: 1_000,
      memoryMiB: 128,
      maximumInputBytes: 1_024,
      maximumOutputBytes: 4_096,
      maximumItems: 100,
    },
    maintainer: 'YanibHQ/reverb-impact maintainers',
  };
}

describe('adapter SDK v2 protocol', () => {
  it('accepts new v2 kinds without changing the v1 manifest validator', () => {
    expect(validateAdapterManifestV2(manifest())).toEqual(manifest());
    expect(() => validateAdapterManifest(manifest() as never)).toThrowError(
      expect.objectContaining<Partial<AdapterValidationError>>({
        code: 'unsupported_manifest_schema',
      }),
    );
    expect(() =>
      validateAdapterManifestV2({
        ...manifest(),
        contractKinds: ['database.table'],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AdapterValidationError>>({ code: 'invalid_manifest' }),
    );
  });

  it('requires all evidence version stamps to match the extraction', () => {
    const shape = canonicalShape({ provider: 'kafka', destination: 'orders' });
    const input = {
      schema: 'reverb.adapter-extraction' as const,
      schemaVersion: '2.0' as const,
      family: 'events' as const,
      adapterId: adapterId('reverb.events'),
      adapterVersion: '0.5.0',
      extractionVersion: '1',
      identityVersion: 1,
      partitioningVersion: 1,
      compatibilityVersion: '1',
      configRevision: revision,
      definitions: [
        {
          contractKind: 'event.destination' as const,
          canonicalKey: 'event:kafka#prod#topic#orders',
          displayName: 'orders',
          path: repoPath('events.yaml'),
          contentHash: hash,
          ...shape,
          extractorId: adapterId('reverb.events'),
          extractorVersion: '0.5.0',
          extractionVersion: '1',
          identityVersion: 1,
          partitioningVersion: 1,
          compatibilityVersion: '1',
          configRevision: revision,
          evidenceStratum: 'event_manifest',
        },
      ],
      references: [],
      coverage: {
        state: 'complete' as const,
        eligibleArtifacts: 1,
        processedArtifacts: 1,
        skippedArtifacts: 0,
        failedArtifacts: 0,
        limitations: [],
      },
      diagnostics: [],
      sourceFingerprint: hash,
    };
    expect(finalizeExtractionV2(input).schemaVersion).toBe('2.0');
    expect(() =>
      finalizeExtractionV2({
        ...input,
        definitions: [{ ...input.definitions[0]!, extractionVersion: '2' }],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AdapterValidationError>>({
        code: 'incompatible_output_version',
      }),
    );
    expect(() =>
      finalizeExtractionV2({
        ...input,
        references: [
          {
            contractKind: 'event.destination',
            canonicalKey: 'event:kafka#prod#topic#orders',
            unresolvedReason: 'must_not_coexist',
            path: repoPath('consumer.ts'),
            contentHash: hash,
            extractorId: adapterId('reverb.events'),
            extractorVersion: '0.5.0',
            extractionVersion: '1',
            identityVersion: 1,
            partitioningVersion: 1,
            compatibilityVersion: '1',
            configRevision: revision,
            evidenceStratum: 'event_manifest',
            activation: 'on_deploy',
          } as never,
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AdapterValidationError>>({ code: 'invalid_output' }),
    );
  });
});
