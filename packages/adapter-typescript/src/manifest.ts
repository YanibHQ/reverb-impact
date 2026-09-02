import { adapterId } from '@yanib/reverb-domain';
import { validateAdapterManifest, type AdapterManifest } from '@yanib/reverb-adapter-sdk';

export const TYPESCRIPT_ADAPTER_MANIFEST: AdapterManifest = validateAdapterManifest({
  schema: 'reverb.adapter-manifest',
  schemaVersion: '1.0',
  id: adapterId('reverb.typescript'),
  version: '0.3.0',
  identityVersion: 1,
  contractKinds: ['typescript_symbol'],
  capabilityTiers: [
    { input: 'npm package exports with TypeScript source or declarations', tier: 'contract_grade' },
    { input: 'npm package exports with JavaScript source', tier: 'structural' },
    { input: 'static ESM/CommonJS named imports', tier: 'structural' },
    {
      input: 'repository-scoped TypeScript modules with relative or tsconfig-path imports',
      tier: 'structural',
    },
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
    {
      id: 'internal_module_export',
      family: 'exact_symbol',
      requiredEvidence: ['repository scope', 'resolved module path', 'exported symbol shape'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'internal_static_import',
      family: 'exact_symbol',
      requiredEvidence: ['repository scope', 'resolved module path', 'imported symbol'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'internal_dynamic_import',
      family: 'fallback_identity',
      requiredEvidence: ['repository-local import pattern', 'source location'],
      promotionState: 'UNMEASURED',
    },
  ],
  externalTools: [],
  limitations: [
    'Computed exports, reflective access, and namespace-member selection remain unresolved.',
    'Complex type-system compatibility is conservative and may be potentially breaking or unknown.',
    'Package export targets that cannot be mapped to supplied source artifacts force partial coverage.',
    'Repository-local analysis resolves static named imports only; computed and namespace member use remains preview evidence.',
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
