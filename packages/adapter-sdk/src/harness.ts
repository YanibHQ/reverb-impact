import { canonicalJson } from '@yanibhq/reverb-domain';

import type { AdapterExtractionResult, ContractAdapter, ExtractRequest } from './types.js';
import { AdapterValidationError, validateAdapterManifest } from './validation.js';

export interface DeterminismReport {
  readonly stable: boolean;
  readonly outputHash: AdapterExtractionResult['outputHash'];
  readonly byteLength: number;
}

export async function verifyExtractionDeterminism(
  adapter: ContractAdapter,
  request: ExtractRequest,
): Promise<DeterminismReport> {
  validateAdapterManifest(adapter.manifest);
  const first = await adapter.extract(request);
  const second = await adapter.extract(request);
  const firstJson = canonicalJson(first);
  const secondJson = canonicalJson(second);
  if (firstJson !== secondJson || first.outputHash !== second.outputHash) {
    throw new AdapterValidationError(
      'nondeterministic_output',
      'Repeated extraction produced different canonical output.',
    );
  }
  const byteLength = Buffer.byteLength(firstJson);
  if (byteLength > adapter.manifest.resourceBudget.maximumOutputBytes) {
    throw new AdapterValidationError('output_limit', 'Adapter output exceeds its declared limit.');
  }
  if (
    first.definitions.length + first.references.length >
    adapter.manifest.resourceBudget.maximumItems
  ) {
    throw new AdapterValidationError('item_limit', 'Adapter output exceeds its item limit.');
  }
  return { stable: true, outputHash: first.outputHash, byteLength };
}

export function verifyIdentityRoundTrip(
  canonicalize: (raw: Readonly<Record<string, string>>) => string,
  producer: Readonly<Record<string, string>>,
  consumer: Readonly<Record<string, string>>,
): string {
  const producerKey = canonicalize(producer);
  const consumerKey = canonicalize(consumer);
  if (producerKey !== consumerKey) {
    throw new AdapterValidationError(
      'identity_round_trip_failed',
      'Producer and consumer identity variants do not canonicalize equally.',
    );
  }
  return producerKey;
}
