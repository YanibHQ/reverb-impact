import { canonicalContractKey } from '@yanib/reverb-adapter-sdk';

export function databaseTableKey(input: {
  readonly databaseNamespace: string;
  readonly schemaName: string;
  readonly tableName: string;
}): string {
  return canonicalContractKey('database-table-v1', [
    { name: 'Database namespace', value: input.databaseNamespace },
    { name: 'Schema', value: input.schemaName },
    { name: 'Table', value: input.tableName },
  ]);
}

export function databaseColumnKey(input: {
  readonly tableKey: string;
  readonly columnName: string;
}): string {
  return canonicalContractKey('database-column-v1', [
    { name: 'Table identity', value: input.tableKey },
    { name: 'Column', value: input.columnName },
  ]);
}

export function databaseEnumKey(input: {
  readonly databaseNamespace: string;
  readonly schemaName: string;
  readonly enumName: string;
}): string {
  return canonicalContractKey('database-enum-v1', [
    { name: 'Database namespace', value: input.databaseNamespace },
    { name: 'Schema', value: input.schemaName },
    { name: 'Enum', value: input.enumName },
  ]);
}
