import { canonicalJson } from '@yanib/reverb-domain';

import type { AdapterExtractionResultV2, ContractAdapterV2, ExtractRequestV2 } from './types-v2.js';
import { AdapterValidationError } from './validation.js';
import { validateAdapterManifestV2 } from './validation-v2.js';

export interface DeterminismReportV2 {
  readonly stable: boolean;
  readonly outputHash: AdapterExtractionResultV2['outputHash'];
  readonly byteLength: number;
}

export async function verifyExtractionDeterminismV2(
  adapter: ContractAdapterV2,
  request: ExtractRequestV2,
): Promise<DeterminismReportV2> {
  validateAdapterManifestV2(adapter.manifest);
  const first = await adapter.extract(request);
  const second = await adapter.extract(request);
  const firstJson = canonicalJson(first);
  const secondJson = canonicalJson(second);
  if (firstJson !== secondJson || first.outputHash !== second.outputHash) {
    throw new AdapterValidationError(
      'nondeterministic_output',
      'Repeated v2 extraction produced different canonical output.',
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
