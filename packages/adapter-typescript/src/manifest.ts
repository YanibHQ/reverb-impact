import { adapterId } from '@yanibhq/reverb-domain';
import { validateAdapterManifest, type AdapterManifest } from '@yanibhq/reverb-adapter-sdk';

export const TYPESCRIPT_ADAPTER_MANIFEST: AdapterManifest = validateAdapterManifest({
  schema: 'reverb.adapter-manifest',
  schemaVersion: '1.0',
  id: adapterId('reverb.typescript'),
  version: '0.1.0',
  identityVersion: 1,
  contractKinds: ['typescript_symbol'],
  capabilityTiers: [
    { input: 'npm package exports with TypeScript source or declarations', tier: 'contract_grade' },
    { input: 'npm package exports with JavaScript source', tier: 'structural' },
    { input: 'static ESM/CommonJS named imports', tier: 'structural' },
    { input: 'dynamic or namespace imports', tier: 'preview' },
  ],
  evidenceStrata: [
    {
      id: 'public_export',
      family: 'exact_symbol',
      requiredEvidence: ['npm registry', 'package name', 'public subpath', 'symbol space'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'static_import',
      family: 'exact_symbol',
      requiredEvidence: ['npm package specifier', 'imported symbol', 'manifest or lock evidence'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'dynamic_import',
      family: 'fallback_identity',
      requiredEvidence: ['bounded import pattern', 'source location'],
      promotionState: 'UNMEASURED',
    },
  ],
  externalTools: [],
  limitations: [
    'Computed exports, reflective access, and namespace-member selection remain unresolved.',
    'Complex type-system compatibility is conservative and may be potentially breaking or unknown.',
    'Package export targets that cannot be mapped to supplied source artifacts force partial coverage.',
  ],
  resourceBudget: {
    timeoutMs: 20_000,
    memoryMiB: 512,
    maximumInputBytes: 16 * 1024 * 1024,
    maximumOutputBytes: 8 * 1024 * 1024,
    maximumItems: 150_000,
  },
  maintainer: 'YanibHQ/reverb-impact maintainers',
});
