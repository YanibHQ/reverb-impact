import { createAdmissionReport } from '@yanib/reverb-adapter-sdk';

import { PROTOBUF_ADAPTER_MANIFEST } from './manifest.js';

export const PROTOBUF_ADMISSION_REPORT = createAdmissionReport({
  manifest: PROTOBUF_ADAPTER_MANIFEST,
  demand: 'Cross-repository Protobuf message and gRPC service contract changes.',
  identitySummary:
    'Qualified service/method identities and qualified message/wire-number identities.',
  compatibilitySummary:
    'A digest-pinned, network-denied Buf comparison with an explicit rule category.',
  evidenceRendering:
    'Descriptor identity, rule category, activation timing, coverage dependencies, and remedy.',
  dependenciesAndLicenses: ['buf@1.72.0: Apache-2.0'],
  checks: [
    { id: 'adversarial_fixtures', state: 'pass', evidence: 'Package adversarial suite' },
    { id: 'determinism', state: 'pass', evidence: 'Repeated extraction conformance test' },
    { id: 'identity_round_trip', state: 'pass', evidence: 'Descriptor/stub identity tests' },
    { id: 'real_labelled_corpus', state: 'not_measured', evidence: 'No approved corpus yet' },
  ],
});
