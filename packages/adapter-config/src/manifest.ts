import { adapterId } from '@yanib/reverb-domain';
import { validateAdapterManifestV2, type AdapterManifestV2 } from '@yanib/reverb-adapter-sdk';

export const CONFIG_ADAPTER_MANIFEST: AdapterManifestV2 = validateAdapterManifestV2({
  schema: 'reverb.adapter-manifest',
  schemaVersion: '2.0',
  id: adapterId('reverb.configuration'),
  family: 'configuration',
  version: '0.1.0',
  extractionVersion: '1',
  identityVersion: 1,
  partitioningVersion: 1,
  compatibilityVersion: '1',
  contractKinds: ['configuration.key', 'configuration.feature_flag'],
  capabilityTiers: [
    { input: 'value-free environment templates and explicit declarations', tier: 'structural' },
    {
      input: 'literal environment, config, feature-flag, and secret-reference reads',
      tier: 'structural',
    },
  ],
  evidenceStrata: [
    {
      id: 'configuration_declaration',
      family: 'exact_schema',
      requiredEvidence: ['configuration namespace', 'literal key', 'value-free declaration'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'configuration_read',
      family: 'fallback_identity',
      requiredEvidence: ['configuration namespace', 'literal key', 'recognized read form'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'secret_reference',
      family: 'fallback_identity',
      requiredEvidence: ['configuration namespace', 'provider kind', 'salted identifier hash'],
      promotionState: 'UNMEASURED',
    },
  ],
  externalTools: [],
  limitations: [
    'Secret values and value-bearing environment files are excluded before parsing.',
    'Secret identifiers require a host salt and are persisted only as provider-qualified HMACs.',
    'Computed keys and unsupported provider resolution remain partial coverage.',
  ],
  resourceBudget: {
    timeoutMs: 10_000,
    memoryMiB: 256,
    maximumInputBytes: 8 * 1024 * 1024,
    maximumOutputBytes: 8 * 1024 * 1024,
    maximumItems: 100_000,
  },
  maintainer: 'YanibHQ/reverb-impact maintainers',
});
