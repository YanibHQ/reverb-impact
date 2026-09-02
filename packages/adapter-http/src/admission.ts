import { createAdmissionReportV2 } from '@yanib/reverb-adapter-sdk';

import { HTTP_ADAPTER_MANIFEST } from './manifest.js';

export const HTTP_ADMISSION_REPORT = createAdmissionReportV2({
  manifest: HTTP_ADAPTER_MANIFEST,
  demand: 'Implicit HTTP impact when no OpenAPI contract is available.',
  identitySummary: 'Registry service identity, HTTP method, and normalized route template.',
  compatibilitySummary: 'Route removal and identity changes are classified without network access.',
  evidenceRendering:
    'Exact route and call locations, immutable hashes, versions, coverage, and remedy.',
  dependenciesAndLicenses: [],
  checks: [
    { id: 'adversarial_fixtures', state: 'pass', evidence: 'Package adversarial suite' },
    { id: 'determinism', state: 'pass', evidence: 'Repeated extraction conformance test' },
    {
      id: 'identity_round_trip',
      state: 'pass',
      evidence: 'Framework and client identity fixtures',
    },
    { id: 'real_labelled_corpus', state: 'not_measured', evidence: 'No approved corpus yet' },
  ],
});
