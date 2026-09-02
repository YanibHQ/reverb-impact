import { adapterId, contentHash } from '@yanib/reverb-domain';
import { validateAdapterManifest, type AdapterManifest } from '@yanib/reverb-adapter-sdk';

export const PROTOBUF_ADAPTER_MANIFEST: AdapterManifest = validateAdapterManifest({
  schema: 'reverb.adapter-manifest',
  schemaVersion: '1.0',
  id: adapterId('reverb.protobuf'),
  version: '0.2.0',
  identityVersion: 1,
  contractKinds: ['protobuf_method', 'protobuf_field'],
  capabilityTiers: [
    { input: 'Canonical FileDescriptorSet JSON', tier: 'contract_grade' },
    { input: 'Generated-stub binding metadata without wire number', tier: 'preview' },
  ],
  evidenceStrata: [
    {
      id: 'descriptor_method',
      family: 'exact_schema',
      requiredEvidence: ['descriptor set', 'package', 'service', 'method'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'descriptor_field_wire',
      family: 'exact_schema',
      requiredEvidence: ['descriptor set', 'qualified message', 'field wire number'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'generated_name_fallback',
      family: 'fallback_identity',
      requiredEvidence: ['generated binding', 'qualified message', 'field name'],
      promotionState: 'UNMEASURED',
    },
  ],
  externalTools: [
    {
      id: 'buf-linux-x86-64',
      version: '1.72.0',
      digest: contentHash(
        'sha256:a9c6186cf6fcf062b247345e1b7b12c26f580c1b2a4bbf4d3fe080abf85ceee8',
      ),
      license: 'Apache-2.0',
      network: false,
    },
  ],
  limitations: [
    'Raw .proto text is not parsed; extraction consumes descriptor-set JSON.',
    'Compatibility is unknown when the pinned Buf invocation is unavailable or fails.',
    'The configured Buf FILE, PACKAGE, WIRE_JSON, or WIRE category is recorded per comparison.',
  ],
  resourceBudget: {
    timeoutMs: 30_000,
    memoryMiB: 512,
    maximumInputBytes: 32 * 1024 * 1024,
    maximumOutputBytes: 8 * 1024 * 1024,
    maximumItems: 150_000,
  },
  maintainer: 'YanibHQ/reverb-impact maintainers',
});
