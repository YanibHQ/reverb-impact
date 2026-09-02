import { adapterId } from '@yanib/reverb-domain';
import { validateAdapterManifestV2, type AdapterManifestV2 } from '@yanib/reverb-adapter-sdk';
export const INFRASTRUCTURE_ADAPTER_MANIFEST: AdapterManifestV2 = validateAdapterManifestV2({
  schema: 'reverb.adapter-manifest',
  schemaVersion: '2.0',
  id: adapterId('reverb.infrastructure'),
  family: 'infrastructure',
  version: '0.1.0',
  extractionVersion: '1',
  identityVersion: 1,
  partitioningVersion: 1,
  compatibilityVersion: '1',
  contractKinds: ['infrastructure.service', 'infrastructure.endpoint', 'infrastructure.output'],
  capabilityTiers: [
    { input: 'static Kubernetes manifests and bounded Helm values', tier: 'structural' },
    { input: 'static Terraform service, output, and remote-state forms', tier: 'structural' },
  ],
  evidenceStrata: [
    {
      id: 'kubernetes_manifest',
      family: 'exact_schema',
      requiredEvidence: ['environment', 'service scope', 'static manifest identity'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'helm_rendered_manifest',
      family: 'fallback_identity',
      requiredEvidence: ['declared Helm values', 'static rendered identity'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'terraform_configuration',
      family: 'fallback_identity',
      requiredEvidence: ['environment', 'service scope', 'bounded HCL identity'],
      promotionState: 'UNMEASURED',
    },
  ],
  externalTools: [],
  limitations: [
    'Helm supports only declared scalar .Values substitutions; templates are never executed.',
    'Terraform state, plans, variable values, modules, provider APIs, and commands are excluded.',
    'Unknown templates, dynamic names, and runtime controller mutations remain partial coverage.',
  ],
  resourceBudget: {
    timeoutMs: 10000,
    memoryMiB: 256,
    maximumInputBytes: 8 * 1024 * 1024,
    maximumOutputBytes: 8 * 1024 * 1024,
    maximumItems: 100000,
  },
  maintainer: 'YanibHQ/reverb-impact maintainers',
});
