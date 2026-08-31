import { createAdmissionReport } from '@yanib/reverb-adapter-sdk';

import { OPENAPI_ADAPTER_MANIFEST } from './manifest.js';

export const OPENAPI_ADMISSION_REPORT = createAdmissionReport({
  manifest: OPENAPI_ADAPTER_MANIFEST,
  demand: 'Cross-repository HTTP API operation changes represented by OpenAPI 3.0 and 3.1.',
  identitySummary:
    'Registry service ID plus exact operationId; path and method remain a separate preview lane.',
  compatibilitySummary: 'A digest-pinned, network-denied oasdiff process determines compatibility.',
  evidenceRendering:
    'Operation, source location, activation timing, coverage dependencies, and remedy.',
  dependenciesAndLicenses: ['yaml@2.8.3: ISC', 'oasdiff@1.28.0: Apache-2.0'],
  checks: [
    { id: 'adversarial_fixtures', state: 'pass', evidence: 'Package adversarial suite' },
    { id: 'determinism', state: 'pass', evidence: 'Repeated extraction conformance test' },
    { id: 'identity_round_trip', state: 'pass', evidence: 'Producer/consumer identity test' },
    { id: 'real_labelled_corpus', state: 'not_measured', evidence: 'No approved corpus yet' },
  ],
});
