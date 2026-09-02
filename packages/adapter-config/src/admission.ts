import { createAdmissionReportV2 } from '@yanib/reverb-adapter-sdk';
import { CONFIG_ADAPTER_MANIFEST } from './manifest.js';

export const CONFIG_ADMISSION_REPORT = createAdmissionReportV2({
  manifest: CONFIG_ADAPTER_MANIFEST,
  demand: 'Configuration, feature-flag, and value-free secret-reference impact.',
  identitySummary:
    'Configuration namespace plus literal key, with salted provider-qualified secret hashes.',
  compatibilitySummary:
    'Removal is breaking; additions are compatible; activation remains explicit.',
  evidenceRendering:
    'Exact paths, ranges, immutable hashes, versions, coverage, and value-free secret identity.',
  dependenciesAndLicenses: [],
  checks: [
    {
      id: 'adversarial_fixtures',
      state: 'pass',
      evidence: 'Package adversarial and secret canary suite',
    },
    { id: 'determinism', state: 'pass', evidence: 'Repeated extraction conformance test' },
    {
      id: 'identity_round_trip',
      state: 'pass',
      evidence: 'Declaration and read identity fixtures',
    },
    { id: 'real_labelled_corpus', state: 'not_measured', evidence: 'No approved corpus yet' },
  ],
});
