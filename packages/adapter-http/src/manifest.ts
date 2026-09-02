import { adapterId } from '@yanib/reverb-domain';
import { validateAdapterManifestV2, type AdapterManifestV2 } from '@yanib/reverb-adapter-sdk';

export const HTTP_ADAPTER_MANIFEST: AdapterManifestV2 = validateAdapterManifestV2({
  schema: 'reverb.adapter-manifest',
  schemaVersion: '2.0',
  id: adapterId('reverb.implicit-http'),
  family: 'implicit_http',
  version: '0.1.0',
  extractionVersion: '1',
  identityVersion: 1,
  partitioningVersion: 1,
  compatibilityVersion: '1',
  contractKinds: ['http.route'],
  capabilityTiers: [
    { input: 'Express, Fastify, and Hono literal route registrations', tier: 'structural' },
    { input: 'fetch, axios, and configured client literal calls', tier: 'structural' },
  ],
  evidenceStrata: [
    {
      id: 'framework_route',
      family: 'fallback_identity',
      requiredEvidence: ['configured service identity', 'literal method', 'normalized route'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'literal_http_call',
      family: 'fallback_identity',
      requiredEvidence: ['registry-resolved service alias', 'literal method', 'bounded URL'],
      promotionState: 'UNMEASURED',
    },
  ],
  externalTools: [],
  limitations: [
    'Initial route parsing supports bounded Express, Fastify, and Hono registration forms.',
    'Dynamic hosts, arbitrary URL construction, runtime registration, and proxy rewrites remain partial coverage.',
    'Relative client calls require immutable client-to-service mappings in adapter context.',
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
