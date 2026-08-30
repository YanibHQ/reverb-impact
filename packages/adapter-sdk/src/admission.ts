import { contentHash, hashCanonical } from '@yanibhq/reverb-domain';

import type { AdapterAdmissionReport, AdapterManifest, AdmissionCheck } from './types.js';
import { validateAdapterManifest } from './validation.js';

export interface CreateAdmissionReportInput {
  readonly manifest: AdapterManifest;
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

export function createAdmissionReport(input: CreateAdmissionReportInput): AdapterAdmissionReport {
  const manifest = validateAdapterManifest(input.manifest);
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
    dependenciesAndLicenses:
      input.dependenciesAndLicenses ??
      manifest.externalTools.map((tool) => `${tool.id}@${tool.version}: ${tool.license}`),
    limitations: manifest.limitations,
    maintainer: manifest.maintainer,
    checks: [...input.checks].sort((left, right) => left.id.localeCompare(right.id)),
    realLabelledCorpusState: input.realLabelledCorpusState ?? ('absent' as const),
    promotionState: 'UNMEASURED' as const,
    deliveryReady: false as const,
  };
  return { ...withoutHash, outputHash: contentHash(hashCanonical(withoutHash)) };
}
