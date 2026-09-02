import { createAdmissionReportV2 } from '@yanib/reverb-adapter-sdk';
import { INFRASTRUCTURE_ADAPTER_MANIFEST } from './manifest.js';
export const INFRASTRUCTURE_ADMISSION_REPORT = createAdmissionReportV2({
  manifest: INFRASTRUCTURE_ADAPTER_MANIFEST,
  demand: 'Static deployment, service-discovery, endpoint, and Terraform-output impact.',
  identitySummary: 'Environment, service scope, identity kind, service/port, or output name.',
  compatibilitySummary:
    'Removal is breaking; additions are compatible; deployment activation remains explicit.',
  evidenceRendering:
    'Exact static paths, ranges, immutable hashes, versions, coverage, and remedy.',
  dependenciesAndLicenses: ['yaml@2.8.3: ISC'],
  checks: [
    { id: 'adversarial_fixtures', state: 'pass', evidence: 'Package adversarial suite' },
    { id: 'determinism', state: 'pass', evidence: 'Repeated extraction conformance test' },
    { id: 'identity_round_trip', state: 'pass', evidence: 'Kubernetes/Helm/Terraform fixtures' },
    { id: 'real_labelled_corpus', state: 'not_measured', evidence: 'No approved corpus yet' },
  ],
});
