import { adapterId } from '@yanib/reverb-domain';
import { validateAdapterManifestV2, type AdapterManifestV2 } from '@yanib/reverb-adapter-sdk';

export const EVENTS_ADAPTER_MANIFEST: AdapterManifestV2 = validateAdapterManifestV2({
  schema: 'reverb.adapter-manifest',
  schemaVersion: '2.0',
  id: adapterId('reverb.events'),
  family: 'events',
  version: '0.1.0',
  extractionVersion: '1',
  identityVersion: 1,
  partitioningVersion: 1,
  compatibilityVersion: '1',
  contractKinds: ['event.destination', 'event.payload_schema'],
  capabilityTiers: [
    { input: 'reverb.events 1.0 manifest with literal bindings', tier: 'contract_grade' },
    { input: 'supported literal Kafka/SQS/SNS/Pub/Sub source binding', tier: 'structural' },
  ],
  evidenceStrata: [
    {
      id: 'event_manifest',
      family: 'exact_schema',
      requiredEvidence: ['literal broker namespace', 'literal destination', 'binding role'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'literal_source_binding',
      family: 'fallback_identity',
      requiredEvidence: ['supported call shape', 'literal destination', 'registry namespace'],
      promotionState: 'UNMEASURED',
    },
  ],
  externalTools: [],
  limitations: [
    'Dynamic destinations and broker namespaces remain unresolved and force partial coverage.',
    'The adapter never contacts brokers, schema registries, cloud APIs, or source providers.',
    'Payload compatibility is limited to the declared bounded schema subset.',
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
