import { createAdmissionReportV2 } from '@yanib/reverb-adapter-sdk';

import { DATABASE_ADAPTER_MANIFEST } from './manifest.js';

export const DATABASE_ADMISSION_REPORT = createAdmissionReportV2({
  manifest: DATABASE_ADAPTER_MANIFEST,
  demand: 'Shared database impact from migrations and backend query consumers.',
  identitySummary:
    'Database namespace, schema, table, column, and enum names with PostgreSQL identifier folding.',
  compatibilitySummary:
    'Table/column/enum removal and bounded type, nullability, and enum-value changes are classified without a database connection.',
  evidenceRendering:
    'Exact producer and consumer paths, ranges, immutable hashes, versions, activation, coverage, and rollout remedy.',
  dependenciesAndLicenses: [],
  checks: [
    { id: 'adversarial_fixtures', state: 'pass', evidence: 'Package adversarial suite' },
    { id: 'determinism', state: 'pass', evidence: 'Repeated extraction conformance test' },
    { id: 'identity_round_trip', state: 'pass', evidence: 'SQL and ORM identity fixtures' },
    { id: 'real_labelled_corpus', state: 'not_measured', evidence: 'No approved corpus yet' },
  ],
});
