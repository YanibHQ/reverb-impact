import { contentHash, hashCanonical } from '@yanib/reverb-domain';

import type { AdapterAdmissionReport, AdmissionCheck } from './types.js';
import type { AdapterManifestV2 } from './types-v2.js';
import { validateAdapterManifestV2 } from './validation-v2.js';

export interface CreateAdmissionReportV2Input {
  readonly manifest: AdapterManifestV2;
  readonly demand: string;
  readonly designPartner?: string;
  readonly identitySummary: string;
  readonly compatibilitySummary: string;
  readonly evidenceRendering: string;
  readonly latencyResourceSummary?: string;
  readonly dependenciesAndLicenses?: readonly string[];
  readonly checks: readonly AdmissionCheck[];
  readonly realLabelledCorpusState?: 'absent' | 'available';
}

export function createAdmissionReportV2(
  input: CreateAdmissionReportV2Input,
): AdapterAdmissionReport {
  const manifest = validateAdapterManifestV2(input.manifest);
  const withoutHash = {
    schema: 'reverb.adapter-admission' as const,
    schemaVersion: '1.0' as const,
    adapterId: manifest.id,
    adapterVersion: manifest.version,
    identityVersion: manifest.identityVersion,
    demand: input.demand,
    designPartner: input.designPartner ?? 'none',
    identitySummary: input.identitySummary,
    compatibilitySummary: input.compatibilitySummary,
    evidenceRendering: input.evidenceRendering,
    latencyResourceSummary:
      input.latencyResourceSummary ??
      `timeout=${manifest.resourceBudget.timeoutMs}ms memory=${manifest.resourceBudget.memoryMiB}MiB output=${manifest.resourceBudget.maximumOutputBytes}B`,
    dependenciesAndLicenses: input.dependenciesAndLicenses ?? [],
    limitations: manifest.limitations,
    maintainer: manifest.maintainer,
    checks: [...input.checks].sort((left, right) => left.id.localeCompare(right.id)),
    realLabelledCorpusState: input.realLabelledCorpusState ?? ('absent' as const),
    promotionState: 'UNMEASURED' as const,
    deliveryReady: false as const,
  };
  return { ...withoutHash, outputHash: contentHash(hashCanonical(withoutHash)) };
}
