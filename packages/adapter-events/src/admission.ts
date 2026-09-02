import { createAdmissionReportV2 } from '@yanib/reverb-adapter-sdk';

import { EVENTS_ADAPTER_MANIFEST } from './manifest.js';

export const EVENTS_ADMISSION_REPORT = createAdmissionReportV2({
  manifest: EVENTS_ADAPTER_MANIFEST,
  demand: 'Backend-to-backend event and queue impact across Kafka, SQS/SNS, and Pub/Sub.',
  identitySummary:
    'Provider, broker namespace, destination kind, literal destination, and optional payload schema ID.',
  compatibilitySummary:
    'Destination removal and bounded payload-schema changes are classified without network access.',
  evidenceRendering:
    'Exact producer and consumer source locations, immutable content hashes, versions, activation, coverage, and remedy.',
  dependenciesAndLicenses: ['yaml@2.8.3: ISC'],
  checks: [
    { id: 'adversarial_fixtures', state: 'pass', evidence: 'Package adversarial suite' },
    { id: 'determinism', state: 'pass', evidence: 'Repeated extraction conformance test' },
    { id: 'identity_round_trip', state: 'pass', evidence: 'Provider identity fixture matrix' },
    { id: 'real_labelled_corpus', state: 'not_measured', evidence: 'No approved corpus yet' },
  ],
});
