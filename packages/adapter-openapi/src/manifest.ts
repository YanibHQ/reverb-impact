import { adapterId, contentHash } from '@yanib/reverb-domain';
import { validateAdapterManifest, type AdapterManifest } from '@yanib/reverb-adapter-sdk';

export const OPENAPI_ADAPTER_MANIFEST: AdapterManifest = validateAdapterManifest({
  schema: 'reverb.adapter-manifest',
  schemaVersion: '1.0',
  id: adapterId('reverb.openapi'),
  version: '0.2.0',
  identityVersion: 1,
  contractKinds: ['openapi_operation'],
  capabilityTiers: [
    { input: 'OpenAPI 3.0/3.1 JSON or YAML with operationId', tier: 'contract_grade' },
    { input: 'OpenAPI 3.0/3.1 path and method fallback', tier: 'preview' },
  ],
  evidenceStrata: [
    {
      id: 'operation_id',
      family: 'exact_schema',
      requiredEvidence: ['registry service identity', 'operationId', 'complete extraction'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'path_method_fallback',
      family: 'fallback_identity',
      requiredEvidence: ['registry service identity', 'normalized path', 'HTTP method'],
      promotionState: 'UNMEASURED',
    },
  ],
  externalTools: [
    {
      id: 'oasdiff-linux-amd64',
      version: '1.28.0',
      digest: contentHash(
        'sha256:e0ef076f2cf953d922addc04be9c3851cf3ec18f7678d2b94d44cea23dca51b5',
      ),
      license: 'Apache-2.0',
      network: false,
    },
  ],
  limitations: [
    'Remote $ref targets are never fetched and force partial coverage.',
    'Path-and-method identities are preview-only and never merge with operationId identities.',
    'Compatibility is unknown when the pinned oasdiff invocation is unavailable or fails.',
  ],
  resourceBudget: {
    timeoutMs: 30_000,
    memoryMiB: 512,
    maximumInputBytes: 16 * 1024 * 1024,
    maximumOutputBytes: 8 * 1024 * 1024,
    maximumItems: 100_000,
  },
  maintainer: 'YanibHQ/reverb-impact maintainers',
});
