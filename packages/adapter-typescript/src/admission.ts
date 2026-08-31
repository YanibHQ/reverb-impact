import { createAdmissionReport } from '@yanib/reverb-adapter-sdk';

import { TYPESCRIPT_ADAPTER_MANIFEST } from './manifest.js';

export const TYPESCRIPT_ADMISSION_REPORT = createAdmissionReport({
  manifest: TYPESCRIPT_ADAPTER_MANIFEST,
  demand: 'Cross-repository npm package public API and consumer import changes.',
  identitySummary: 'Registry, package, public subpath, type/value space, and exported symbol.',
  compatibilitySummary:
    'Conservative structural rules for removals, overloads, parameters, and complex shapes.',
  evidenceRendering:
    'Export identity, source location, package activation timing, coverage, and remedy.',
  dependenciesAndLicenses: ['typescript@5.9.2: Apache-2.0'],
  checks: [
    { id: 'adversarial_fixtures', state: 'pass', evidence: 'Package adversarial suite' },
    { id: 'determinism', state: 'pass', evidence: 'Repeated extraction conformance test' },
    { id: 'identity_round_trip', state: 'pass', evidence: 'Export/import identity tests' },
    { id: 'real_labelled_corpus', state: 'not_measured', evidence: 'No approved corpus yet' },
  ],
});
