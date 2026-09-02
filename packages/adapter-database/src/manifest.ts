import { adapterId } from '@yanib/reverb-domain';
import { validateAdapterManifestV2, type AdapterManifestV2 } from '@yanib/reverb-adapter-sdk';

export const DATABASE_ADAPTER_MANIFEST: AdapterManifestV2 = validateAdapterManifestV2({
  schema: 'reverb.adapter-manifest',
  schemaVersion: '2.0',
  id: adapterId('reverb.database'),
  family: 'database',
  version: '0.1.0',
  extractionVersion: '1',
  identityVersion: 1,
  partitioningVersion: 1,
  compatibilityVersion: '1',
  contractKinds: ['database.table', 'database.column', 'database.enum'],
  capabilityTiers: [
    { input: 'bounded PostgreSQL DDL and migrations', tier: 'contract_grade' },
    { input: 'literal SQL, Prisma schema, and Prisma client query', tier: 'structural' },
  ],
  evidenceStrata: [
    {
      id: 'sql_schema',
      family: 'exact_schema',
      requiredEvidence: ['database namespace', 'schema', 'literal DDL identity'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'sql_query',
      family: 'fallback_identity',
      requiredEvidence: ['database namespace', 'literal table', 'recognized query form'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'prisma_metadata',
      family: 'exact_schema',
      requiredEvidence: ['database namespace', 'model/table mapping', 'field mapping'],
      promotionState: 'UNMEASURED',
    },
    {
      id: 'prisma_query',
      family: 'fallback_identity',
      requiredEvidence: ['database namespace', 'configured model mapping', 'literal client method'],
      promotionState: 'UNMEASURED',
    },
  ],
  externalTools: [],
  limitations: [
    'Initial SQL parsing supports bounded PostgreSQL DDL and literal DML forms only.',
    'Dynamic SQL, stored procedures, generated migrations, and unresolved connection aliases remain partial coverage.',
    'Prisma client calls require immutable model-to-table mappings in adapter context.',
  ],
  resourceBudget: {
    timeoutMs: 10_000,
    memoryMiB: 256,
    maximumInputBytes: 8 * 1024 * 1024,
    maximumOutputBytes: 8 * 1024 * 1024,
    maximumItems: 100_000,
  },
  maintainer: 'YanibHQ/reverb-impact maintainers',
});
