import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import type { ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import {
  DATABASE_ADAPTER_MANIFEST,
  DATABASE_ADMISSION_REPORT,
  databaseAdapter,
  databaseColumnKey,
  databaseEnumKey,
  databaseTableKey,
} from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'3'.repeat(64)}`);
const context = { databaseNamespace: 'billing-primary', sqlDialect: 'postgresql' } as const;

function artifact(
  path: string,
  text: string,
  classification: ArtifactInput['classification'] = 'source',
): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification,
  };
}

const schema = `
CREATE TYPE public.account_status AS ENUM ('active', 'disabled');
CREATE TABLE public.accounts (
  id uuid NOT NULL,
  email text NOT NULL,
  status public.account_status NULL,
  PRIMARY KEY (id)
);
`;

describe('shared database adapter', () => {
  it('extracts PostgreSQL table, column, and enum definitions with canonical identities', async () => {
    const result = await databaseAdapter.extract({
      artifacts: [artifact('migrations/001_schema.sql', schema)],
      configRevision: revision,
      context,
    });
    const tableKey = databaseTableKey({
      databaseNamespace: 'billing-primary',
      schemaName: 'public',
      tableName: 'accounts',
    });
    expect(result.coverage).toMatchObject({ state: 'complete', eligibleArtifacts: 1 });
    expect(result.definitions.map((value) => value.canonicalKey)).toEqual([
      databaseColumnKey({ tableKey, columnName: 'email' }),
      databaseColumnKey({ tableKey, columnName: 'id' }),
      databaseColumnKey({ tableKey, columnName: 'status' }),
      databaseEnumKey({
        databaseNamespace: 'billing-primary',
        schemaName: 'public',
        enumName: 'account_status',
      }),
      tableKey,
    ]);
    expect(result.definitions.every((value) => value.range?.startLine !== undefined)).toBe(true);
  });

  it('extracts literal SQL reads and writes down to bounded column references', async () => {
    const result = await databaseAdapter.extract({
      artifacts: [
        artifact(
          'src/account-store.ts',
          `
await client.query('SELECT id, email FROM public.accounts WHERE id = $1');
await client.query('INSERT INTO public.accounts (id, email) VALUES ($1, $2)');
`,
        ),
      ],
      configRevision: revision,
      context,
    });
    expect(result.coverage.state).toBe('complete');
    expect(
      result.references.filter((value) => value.contractKind === 'database.table'),
    ).toHaveLength(2);
    expect(
      result.references.filter((value) => value.contractKind === 'database.column'),
    ).toHaveLength(4);
    expect(result.references.every((value) => value.evidenceStratum === 'sql_query')).toBe(true);
  });

  it('maps Prisma metadata and client calls to the same database identities', async () => {
    const result = await databaseAdapter.extract({
      artifacts: [
        artifact(
          'prisma/schema.prisma',
          `
model Account {
  id String @id @db.Uuid
  email String
  displayName String @map("display_name")
  @@map("accounts")
  @@schema("public")
}
`,
        ),
        artifact(
          'src/accounts.ts',
          'await prisma.account.findMany({ select: { id: true, email: true } });',
        ),
      ],
      configRevision: revision,
      context: {
        ...context,
        prismaModels: { account: { table: 'accounts', schema: 'public' } },
      },
    });
    const tableKey = databaseTableKey({
      databaseNamespace: 'billing-primary',
      schemaName: 'public',
      tableName: 'accounts',
    });
    expect(result.coverage.state).toBe('complete');
    expect(result.references).toContainEqual(
      expect.objectContaining({ contractKind: 'database.table', canonicalKey: tableKey }),
    );
    expect(result.references).toContainEqual(
      expect.objectContaining({
        contractKind: 'database.column',
        canonicalKey: databaseColumnKey({ tableKey, columnName: 'display_name' }),
      }),
    );
    expect(new Set(result.references.map((value) => value.evidenceStratum))).toEqual(
      new Set(['prisma_metadata', 'prisma_query']),
    );
  });

  it('maps Prisma enum metadata and enum-typed columns to database identities', async () => {
    const result = await databaseAdapter.extract({
      artifacts: [
        artifact(
          'prisma/schema.prisma',
          `
enum AccountStatus {
  active
  disabled
  @@map("account_status")
  @@schema("public")
}

model Account {
  id String @id @db.Uuid
  status AccountStatus
  @@map("accounts")
  @@schema("public")
}
`,
        ),
      ],
      configRevision: revision,
      context,
    });
    const tableKey = databaseTableKey({
      databaseNamespace: 'billing-primary',
      schemaName: 'public',
      tableName: 'accounts',
    });
    expect(result.coverage.state).toBe('complete');
    expect(result.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalKey: databaseColumnKey({ tableKey, columnName: 'status' }),
        }),
        expect.objectContaining({
          canonicalKey: databaseEnumKey({
            databaseNamespace: 'billing-primary',
            schemaName: 'public',
            enumName: 'account_status',
          }),
        }),
      ]),
    );
  });

  it('uses configured Prisma field mappings for client-only evidence', async () => {
    const result = await databaseAdapter.extract({
      artifacts: [
        artifact(
          'src/accounts.ts',
          'await prisma.account.findMany({ select: { displayName: true } });',
        ),
      ],
      configRevision: revision,
      context: {
        ...context,
        prismaModels: {
          account: {
            table: 'accounts',
            schema: 'public',
            columns: { displayName: 'display_name' },
          },
        },
      },
    });
    const tableKey = databaseTableKey({
      databaseNamespace: 'billing-primary',
      schemaName: 'public',
      tableName: 'accounts',
    });
    expect(result.references).toContainEqual(
      expect.objectContaining({
        canonicalKey: databaseColumnKey({ tableKey, columnName: 'display_name' }),
      }),
    );
  });

  it('classifies destructive migrations and enum expansion conservatively', async () => {
    const base = await databaseAdapter.extract({
      artifacts: [artifact('migrations/001_schema.sql', schema)],
      configRevision: revision,
      context,
    });
    const head = await databaseAdapter.extract({
      artifacts: [
        artifact('migrations/001_schema.sql', schema),
        artifact(
          'migrations/002_change.sql',
          `
ALTER TABLE public.accounts DROP COLUMN email;
ALTER TYPE public.account_status ADD VALUE 'pending';
`,
        ),
      ],
      configRevision: revision,
      context,
    });
    const diff = await databaseAdapter.diff({ base, head, configRevision: revision, context });
    expect(diff.changes).toContainEqual(
      expect.objectContaining({
        contractKind: 'database.column',
        changeKind: 'column_removed',
        compatibility: 'breaking',
      }),
    );
    expect(diff.changes).toContainEqual(
      expect.objectContaining({
        contractKind: 'database.enum',
        changeKind: 'enum_changed',
        compatibility: 'potentially_breaking',
      }),
    );
  });

  it('models table, column, and enum renames as old removals plus new additions', async () => {
    const base = await databaseAdapter.extract({
      artifacts: [artifact('migrations/001_schema.sql', schema)],
      configRevision: revision,
      context,
    });
    const head = await databaseAdapter.extract({
      artifacts: [
        artifact('migrations/001_schema.sql', schema),
        artifact(
          'migrations/002_rename.sql',
          `
ALTER TABLE public.accounts RENAME COLUMN email TO email_address;
ALTER TABLE public.accounts RENAME TO customer_accounts;
ALTER TYPE public.account_status RENAME TO customer_status;
`,
        ),
      ],
      configRevision: revision,
      context,
    });
    expect(head.coverage.state).toBe('complete');
    expect(head.definitions.map((value) => value.displayName)).toEqual(
      expect.arrayContaining([
        'public.customer_accounts',
        'public.customer_accounts.email_address',
        'public.customer_status',
      ]),
    );
    const diff = await databaseAdapter.diff({ base, head, configRevision: revision, context });
    expect(diff.changes.map((value) => value.changeKind)).toEqual(
      expect.arrayContaining([
        'table_removed',
        'table_added',
        'column_removed',
        'column_added',
        'enum_removed',
        'enum_added',
      ]),
    );
  });

  it('distinguishes widening, narrowing, and required-column compatibility', async () => {
    const base = await databaseAdapter.extract({
      artifacts: [
        artifact(
          'migrations/001.sql',
          'CREATE TABLE public.metrics (small_value smallint NULL, label varchar(32) NULL);',
        ),
      ],
      configRevision: revision,
      context,
    });
    const widened = await databaseAdapter.extract({
      artifacts: [
        artifact(
          'migrations/001.sql',
          'CREATE TABLE public.metrics (small_value bigint NULL, label text NULL, required text NOT NULL);',
        ),
      ],
      configRevision: revision,
      context,
    });
    const wideningDiff = await databaseAdapter.diff({
      base,
      head: widened,
      configRevision: revision,
      context,
    });
    expect(
      wideningDiff.changes.find((value) => value.changeKind === 'column_changed'),
    ).toMatchObject({ compatibility: 'compatible' });
    expect(
      wideningDiff.changes.find(
        (value) =>
          value.changeKind === 'column_added' && value.compatibility === 'potentially_breaking',
      ),
    ).toBeDefined();
    const narrowed = await databaseAdapter.diff({
      base: widened,
      head: base,
      configRevision: revision,
      context,
    });
    expect(narrowed.changes).toContainEqual(
      expect.objectContaining({ changeKind: 'column_changed', compatibility: 'breaking' }),
    );
  });

  it('preserves exact multi-line source coordinates', async () => {
    const result = await databaseAdapter.extract({
      artifacts: [artifact('migrations/001.sql', `\n\n${schema.trim()}\n`)],
      configRevision: revision,
      context,
    });
    expect(result.definitions).not.toHaveLength(0);
    expect(
      result.definitions.find((value) => value.contractKind === 'database.enum')?.range?.startLine,
    ).toBe(3);
    expect(
      result.definitions.find((value) => value.contractKind === 'database.table')?.range?.startLine,
    ).toBe(4);
  });

  it('reports dynamic SQL, unresolved aliases, unsupported dialects, and generated migrations as gaps', async () => {
    const dynamic = await databaseAdapter.extract({
      artifacts: [artifact('src/query.ts', 'client.query(`SELECT * FROM ${tableName}`);')],
      configRevision: revision,
      context,
    });
    expect(dynamic.coverage).toMatchObject({
      state: 'partial',
      limitations: expect.arrayContaining([expect.objectContaining({ code: 'dynamic_sql' })]),
    });
    const missingAlias = await databaseAdapter.extract({
      artifacts: [artifact('migrations/001.sql', schema)],
      configRevision: revision,
      context: {},
    });
    expect(missingAlias.coverage).toMatchObject({
      state: 'partial',
      limitations: [{ code: 'database_namespace_missing' }],
    });
    const unsupported = await databaseAdapter.extract({
      artifacts: [artifact('migrations/001.sql', schema)],
      configRevision: revision,
      context: { ...context, sqlDialect: 'mysql' },
    });
    expect(unsupported.coverage.state).toBe('partial');
    const generated = await databaseAdapter.extract({
      artifacts: [artifact('migrations/generated.sql', schema, 'generated')],
      configRevision: revision,
      context,
    });
    expect(generated.coverage).toMatchObject({
      state: 'partial',
      limitations: [{ code: 'generated_migration_excluded' }],
    });
  });

  it('keeps the package preview-only until measured admission', () => {
    expect(DATABASE_ADAPTER_MANIFEST).toMatchObject({
      schemaVersion: '2.0',
      family: 'database',
      externalTools: [],
    });
    expect(DATABASE_ADMISSION_REPORT).toMatchObject({
      promotionState: 'UNMEASURED',
      deliveryReady: false,
    });
  });
});
