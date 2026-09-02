export interface LocatedFact {
  readonly offset: number;
  readonly length: number;
}

export interface QualifiedDatabaseName {
  readonly schemaName: string;
  readonly objectName: string;
}

export interface DatabaseColumnShape {
  readonly name: string;
  readonly dataType: string;
  readonly nullable: boolean | 'unknown';
}

export type DatabaseSchemaOperation = LocatedFact &
  (
    | {
        readonly kind: 'create_table';
        readonly target: QualifiedDatabaseName;
        readonly columns: readonly DatabaseColumnShape[];
      }
    | { readonly kind: 'drop_table'; readonly target: QualifiedDatabaseName }
    | {
        readonly kind: 'rename_table';
        readonly target: QualifiedDatabaseName;
        readonly newTarget: QualifiedDatabaseName;
      }
    | {
        readonly kind: 'add_column' | 'alter_column';
        readonly target: QualifiedDatabaseName;
        readonly column: DatabaseColumnShape;
      }
    | {
        readonly kind: 'drop_column';
        readonly target: QualifiedDatabaseName;
        readonly columnName: string;
      }
    | {
        readonly kind: 'rename_column';
        readonly target: QualifiedDatabaseName;
        readonly columnName: string;
        readonly newColumnName: string;
      }
    | {
        readonly kind: 'set_column_nullability';
        readonly target: QualifiedDatabaseName;
        readonly columnName: string;
        readonly nullable: boolean;
      }
    | {
        readonly kind: 'create_enum';
        readonly target: QualifiedDatabaseName;
        readonly values: readonly string[];
      }
    | {
        readonly kind: 'add_enum_value';
        readonly target: QualifiedDatabaseName;
        readonly value: string;
      }
    | {
        readonly kind: 'rename_enum';
        readonly target: QualifiedDatabaseName;
        readonly newTarget: QualifiedDatabaseName;
      }
    | { readonly kind: 'drop_enum'; readonly target: QualifiedDatabaseName }
  );

export interface DatabaseQueryReference extends LocatedFact {
  readonly source: 'sql_query';
  readonly role: 'reader' | 'writer';
  readonly target: QualifiedDatabaseName;
  readonly columns: readonly string[];
  readonly columnsComplete: boolean;
}

export interface PrismaModelReference extends LocatedFact {
  readonly source: 'prisma_metadata';
  readonly modelName: string;
  readonly tableName: string;
  readonly schemaName: string;
  readonly columns: readonly string[];
}

export interface PrismaEnumReference extends LocatedFact {
  readonly source: 'prisma_metadata';
  readonly enumName: string;
  readonly databaseEnumName: string;
  readonly schemaName: string;
  readonly values: readonly string[];
}

export interface PrismaClientReference extends LocatedFact {
  readonly source: 'prisma_query';
  readonly role: 'reader' | 'writer';
  readonly modelName: string;
  readonly columns: readonly string[];
  readonly columnsComplete: boolean;
}

export interface ParsedDatabaseSource {
  readonly operations: readonly DatabaseSchemaOperation[];
  readonly sqlReferences: readonly DatabaseQueryReference[];
  readonly prismaModels: readonly PrismaModelReference[];
  readonly prismaEnums: readonly PrismaEnumReference[];
  readonly prismaQueries: readonly PrismaClientReference[];
  readonly limitations: readonly string[];
  readonly probable: boolean;
}

const IDENTIFIER = '(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)';
const QUALIFIED = `(${IDENTIFIER})(?:\\s*\\.\\s*(${IDENTIFIER}))?`;

function boundedText(value: string, maximum = 512): string {
  const normalized = value.normalize('NFC').trim();
  if (normalized.length === 0 || normalized.length > maximum || normalized.includes('\0')) {
    throw new Error('invalid_database_token');
  }
  return normalized;
}

function identifier(value: string): string {
  const token = boundedText(value, 256);
  if (token.startsWith('"')) {
    if (!token.endsWith('"')) throw new Error('invalid_quoted_identifier');
    return boundedText(token.slice(1, -1).replaceAll('""', '"'), 256);
  }
  return token.toLowerCase();
}

function qualified(first: string, second: string | undefined, defaultSchema: string) {
  return second === undefined
    ? { schemaName: defaultSchema, objectName: identifier(first) }
    : { schemaName: identifier(first), objectName: identifier(second) };
}

function maskComments(text: string): string {
  return text
    .replace(/--[^\n]*/g, (value) => ' '.repeat(value.length))
    .replace(/\/\*[\s\S]*?\*\//g, (value) => value.replace(/[^\n]/g, ' '));
}

function statements(text: string): readonly LocatedFact[] {
  const result: LocatedFact[] = [];
  let start = 0;
  let quote: "'" | '"' | null = null;
  const append = (from: number, to: number) => {
    const fragment = text.slice(from, to);
    const leading = fragment.search(/\S/);
    if (leading < 0) return;
    let end = fragment.length;
    while (end > leading && /\s/.test(fragment[end - 1]!)) end -= 1;
    result.push({ offset: from + leading, length: end - leading });
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== null) {
      if (character === quote) {
        if (text[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === ';') {
      append(start, index + 1);
      start = index + 1;
    }
  }
  append(start, text.length);
  return result;
}

function splitTopLevel(value: string): readonly string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote !== null) {
      if (character === quote) {
        if (value[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function columnShape(value: string): DatabaseColumnShape | null {
  const match = value.trim().match(new RegExp(`^(${IDENTIFIER})\\s+([\\s\\S]+)$`, 'i'));
  if (match === null) return null;
  const name = identifier(match[1]!);
  if (/^(?:constraint|primary|foreign|unique|check|exclude)$/i.test(name)) return null;
  const remainder = match[2]!.trim();
  const type = remainder
    .split(
      /\s+(?=not\s+null\b|null\b|default\b|primary\s+key\b|references\b|unique\b|check\b)/i,
    )[0]!
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (type.length === 0 || type.length > 256) throw new Error('invalid_column_type');
  return {
    name,
    dataType: type,
    nullable: /\b(?:not\s+null|primary\s+key)\b/i.test(remainder)
      ? false
      : /\bnull\b/i.test(remainder)
        ? true
        : 'unknown',
  };
}

function literalList(value: string): readonly string[] {
  return splitTopLevel(value).map((item) => {
    const match = item.trim().match(/^'((?:[^']|'')*)'$/);
    if (match === null) throw new Error('invalid_enum_literal');
    return boundedText(match[1]!.replaceAll("''", "'"), 512);
  });
}

function simpleColumns(value: string): {
  readonly columns: readonly string[];
  readonly complete: boolean;
} {
  const tokens = splitTopLevel(value);
  const columns: string[] = [];
  for (const token of tokens) {
    const trimmed = token.trim();
    const match = trimmed.match(
      new RegExp(`^(?:${IDENTIFIER}\\s*\\.\\s*)?(${IDENTIFIER})(?:\\s+as\\s+${IDENTIFIER})?$`, 'i'),
    );
    if (trimmed === '*' || match === null) {
      return { columns: [], complete: false };
    }
    columns.push(identifier(match[1]!));
  }
  return { columns: [...new Set(columns)].sort(), complete: true };
}

function parseStatement(
  statement: string,
  location: LocatedFact,
  defaultSchema: string,
): {
  readonly operations: readonly DatabaseSchemaOperation[];
  readonly references: readonly DatabaseQueryReference[];
} {
  const operations: DatabaseSchemaOperation[] = [];
  const references: DatabaseQueryReference[] = [];
  let match = statement.match(
    new RegExp(
      `^\\s*create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${QUALIFIED}\\s*\\(([\\s\\S]*)\\)\\s*;?\\s*$`,
      'i',
    ),
  );
  if (match !== null) {
    operations.push({
      kind: 'create_table',
      target: qualified(match[1]!, match[2], defaultSchema),
      columns: splitTopLevel(match[3]!).flatMap((value) => {
        const parsed = columnShape(value);
        return parsed === null ? [] : [parsed];
      }),
      ...location,
    });
    return { operations, references };
  }
  match = statement.match(
    new RegExp(`^\\s*drop\\s+table\\s+(?:if\\s+exists\\s+)?${QUALIFIED}`, 'i'),
  );
  if (match !== null) {
    operations.push({
      kind: 'drop_table',
      target: qualified(match[1]!, match[2], defaultSchema),
      ...location,
    });
    return { operations, references };
  }
  match = statement.match(
    new RegExp(`^\\s*alter\\s+table\\s+(?:if\\s+exists\\s+)?${QUALIFIED}\\s+([\\s\\S]+)$`, 'i'),
  );
  if (match !== null) {
    const target = qualified(match[1]!, match[2], defaultSchema);
    const action = match[3]!.replace(/;\s*$/, '').trim();
    const add = action.match(
      new RegExp(
        `^add\\s+(?:column\\s+)?(?:if\\s+not\\s+exists\\s+)?(${IDENTIFIER})\\s+([\\s\\S]+)$`,
        'i',
      ),
    );
    const drop = action.match(
      new RegExp(`^drop\\s+(?:column\\s+)?(?:if\\s+exists\\s+)?(${IDENTIFIER})`, 'i'),
    );
    const alterType = action.match(
      new RegExp(
        `^alter\\s+(?:column\\s+)?(${IDENTIFIER})\\s+(?:type|set\\s+data\\s+type)\\s+([\\s\\S]+)$`,
        'i',
      ),
    );
    const nullability = action.match(
      new RegExp(`^alter\\s+(?:column\\s+)?(${IDENTIFIER})\\s+(set|drop)\\s+not\\s+null`, 'i'),
    );
    const renameTable = action.match(new RegExp(`^rename\\s+to\\s+(${IDENTIFIER})$`, 'i'));
    const renameColumn = action.match(
      new RegExp(`^rename\\s+(?:column\\s+)?(${IDENTIFIER})\\s+to\\s+(${IDENTIFIER})$`, 'i'),
    );
    if (renameColumn !== null) {
      operations.push({
        kind: 'rename_column',
        target,
        columnName: identifier(renameColumn[1]!),
        newColumnName: identifier(renameColumn[2]!),
        ...location,
      });
    } else if (renameTable !== null) {
      operations.push({
        kind: 'rename_table',
        target,
        newTarget: { schemaName: target.schemaName, objectName: identifier(renameTable[1]!) },
        ...location,
      });
    } else if (add !== null) {
      const column = columnShape(`${add[1]} ${add[2]}`);
      if (column !== null) operations.push({ kind: 'add_column', target, column, ...location });
    } else if (drop !== null) {
      operations.push({
        kind: 'drop_column',
        target,
        columnName: identifier(drop[1]!),
        ...location,
      });
    } else if (alterType !== null) {
      operations.push({
        kind: 'alter_column',
        target,
        column: {
          name: identifier(alterType[1]!),
          dataType: boundedText(alterType[2]!.split(/\s+using\b/i)[0]!.trim(), 256).toLowerCase(),
          nullable: 'unknown',
        },
        ...location,
      });
    } else if (nullability !== null) {
      operations.push({
        kind: 'set_column_nullability',
        target,
        columnName: identifier(nullability[1]!),
        nullable: nullability[2]!.toLowerCase() === 'drop',
        ...location,
      });
    }
    return { operations, references };
  }
  match = statement.match(
    new RegExp(`^\\s*create\\s+type\\s+${QUALIFIED}\\s+as\\s+enum\\s*\\(([\\s\\S]*)\\)`, 'i'),
  );
  if (match !== null) {
    operations.push({
      kind: 'create_enum',
      target: qualified(match[1]!, match[2], defaultSchema),
      values: literalList(match[3]!),
      ...location,
    });
    return { operations, references };
  }
  match = statement.match(
    new RegExp(
      `^\\s*alter\\s+type\\s+${QUALIFIED}\\s+add\\s+value\\s+(?:if\\s+not\\s+exists\\s+)?'((?:[^']|'')*)'`,
      'i',
    ),
  );
  if (match !== null) {
    operations.push({
      kind: 'add_enum_value',
      target: qualified(match[1]!, match[2], defaultSchema),
      value: boundedText(match[3]!.replaceAll("''", "'"), 512),
      ...location,
    });
    return { operations, references };
  }
  match = statement.match(
    new RegExp(`^\\s*alter\\s+type\\s+${QUALIFIED}\\s+rename\\s+to\\s+(${IDENTIFIER})`, 'i'),
  );
  if (match !== null) {
    const target = qualified(match[1]!, match[2], defaultSchema);
    operations.push({
      kind: 'rename_enum',
      target,
      newTarget: { schemaName: target.schemaName, objectName: identifier(match[3]!) },
      ...location,
    });
    return { operations, references };
  }
  match = statement.match(
    new RegExp(`^\\s*drop\\s+type\\s+(?:if\\s+exists\\s+)?${QUALIFIED}`, 'i'),
  );
  if (match !== null) {
    operations.push({
      kind: 'drop_enum',
      target: qualified(match[1]!, match[2], defaultSchema),
      ...location,
    });
    return { operations, references };
  }
  match = statement.match(
    new RegExp(`\\bselect\\s+([\\s\\S]{1,2048}?)\\s+from\\s+${QUALIFIED}`, 'i'),
  );
  if (match !== null) {
    const selected = simpleColumns(match[1]!);
    const joined = /\bjoin\b/i.test(statement);
    references.push({
      source: 'sql_query',
      role: 'reader',
      target: qualified(match[2]!, match[3], defaultSchema),
      columns: joined ? [] : selected.columns,
      columnsComplete: selected.complete && !joined,
      ...location,
    });
    return { operations, references };
  }
  match = statement.match(
    new RegExp(`\\binsert\\s+into\\s+${QUALIFIED}\\s*(?:\\(([^)]*)\\))?`, 'i'),
  );
  if (match !== null) {
    const selected =
      match[3] === undefined ? { columns: [], complete: false } : simpleColumns(match[3]);
    references.push({
      source: 'sql_query',
      role: 'writer',
      target: qualified(match[1]!, match[2], defaultSchema),
      columns: selected.columns,
      columnsComplete: selected.complete,
      ...location,
    });
    return { operations, references };
  }
  match = statement.match(
    new RegExp(`\\bupdate\\s+${QUALIFIED}\\s+set\\s+([\\s\\S]{1,2048})`, 'i'),
  );
  if (match !== null) {
    const assignments = splitTopLevel(match[3]!).map((value) => value.split('=')[0]!.trim());
    const selected = simpleColumns(assignments.join(','));
    references.push({
      source: 'sql_query',
      role: 'writer',
      target: qualified(match[1]!, match[2], defaultSchema),
      columns: selected.columns,
      columnsComplete: selected.complete,
      ...location,
    });
    return { operations, references };
  }
  match = statement.match(new RegExp(`\\bdelete\\s+from\\s+${QUALIFIED}`, 'i'));
  if (match !== null) {
    references.push({
      source: 'sql_query',
      role: 'writer',
      target: qualified(match[1]!, match[2], defaultSchema),
      columns: [],
      columnsComplete: false,
      ...location,
    });
  }
  return { operations, references };
}

function prismaEnums(text: string, defaultSchema: string): readonly PrismaEnumReference[] {
  const result: PrismaEnumReference[] = [];
  for (const match of text.matchAll(
    /\benum\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]{0,65536}?)\}/g,
  )) {
    const body = match[2]!;
    const enumMap = body.match(/@@map\s*\(\s*"([^"]+)"\s*\)/);
    const schemaMap = body.match(/@@schema\s*\(\s*"([^"]+)"\s*\)/);
    const values = body.split('\n').flatMap((line) => {
      const value = line
        .trim()
        .match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+@map\s*\(\s*"([^"]+)"\s*\))?\s*$/);
      return value === null ? [] : [boundedText(value[2] ?? value[1]!, 512)];
    });
    result.push({
      source: 'prisma_metadata',
      enumName: boundedText(match[1]!, 256),
      databaseEnumName: boundedText(enumMap?.[1] ?? match[1]!, 256),
      schemaName: boundedText(schemaMap?.[1] ?? defaultSchema, 256),
      values: [...new Set(values)].sort(),
      offset: match.index,
      length: match[0].length,
    });
  }
  return result;
}

function prismaModels(
  text: string,
  defaultSchema: string,
  enumNames: ReadonlySet<string>,
): readonly PrismaModelReference[] {
  const result: PrismaModelReference[] = [];
  const scalar = /^(?:String|Int|BigInt|Float|Decimal|Boolean|DateTime|Json|Bytes)$/;
  for (const match of text.matchAll(
    /\bmodel\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]{0,65536}?)\}/g,
  )) {
    const body = match[2]!;
    const tableMap = body.match(/@@map\s*\(\s*"([^"]+)"\s*\)/);
    const schemaMap = body.match(/@@schema\s*\(\s*"([^"]+)"\s*\)/);
    const columns: string[] = [];
    for (const line of body.split('\n')) {
      const field = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s+([^\s]+)([\s\S]*)$/);
      const fieldType = field?.[2]?.replace(/(?:\?|\[\])+$/, '');
      if (
        field === null ||
        field[1]!.startsWith('@@') ||
        fieldType === undefined ||
        (!scalar.test(fieldType) && !enumNames.has(fieldType))
      )
        continue;
      const mapped = field[3]!.match(/@map\s*\(\s*"([^"]+)"\s*\)/)?.[1];
      columns.push(boundedText(mapped ?? field[1]!, 256));
    }
    result.push({
      source: 'prisma_metadata',
      modelName: boundedText(match[1]!, 256),
      tableName: boundedText(tableMap?.[1] ?? match[1]!, 256),
      schemaName: boundedText(schemaMap?.[1] ?? defaultSchema, 256),
      columns: [...new Set(columns)].sort(),
      offset: match.index,
      length: match[0].length,
    });
  }
  return result;
}

function prismaQueries(text: string): readonly PrismaClientReference[] {
  const result: PrismaClientReference[] = [];
  const regex =
    /\b(?:prisma|db)\.([A-Za-z_][A-Za-z0-9_]*)\.(findMany|findUnique|findFirst|create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/g;
  for (const match of text.matchAll(regex)) {
    const tail = text.slice(match.index, match.index + 2_048);
    const select = tail.match(/\bselect\s*:\s*\{([^{}]{0,1024})\}/);
    const entries = select === null ? [] : splitTopLevel(select[1]!);
    const selectedColumns = entries.flatMap((entry) => {
      const item = entry.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*true$/);
      return item === null ? [] : [item[1]!];
    });
    const selected =
      select === null
        ? { columns: [] as readonly string[], complete: false }
        : {
            columns: [...new Set(selectedColumns)].sort(),
            complete: entries.length > 0 && selectedColumns.length === entries.length,
          };
    result.push({
      source: 'prisma_query',
      role: match[2]!.startsWith('find') ? 'reader' : 'writer',
      modelName: boundedText(match[1]!, 256),
      columns: selected.columns,
      columnsComplete: selected.complete,
      offset: match.index,
      length: match[0].length,
    });
  }
  return result;
}

export function parseDatabaseSource(
  text: string,
  options: { readonly defaultSchema: string; readonly maximumItems: number },
): ParsedDatabaseSource {
  const masked = maskComments(text);
  const operations: DatabaseSchemaOperation[] = [];
  const sqlReferences: DatabaseQueryReference[] = [];
  const limitations = new Set<string>();
  const probable =
    /\b(?:create|alter|drop)\s+(?:table|type)\b|\b(?:select|insert|update|delete)\b|\b(?:model|enum)\s+[A-Za-z_]|\b(?:prisma|db)\.[A-Za-z_]|\b(?:query|execute)\s*\(/i.test(
      masked,
    );
  if (/\b(?:create|alter)\s+(?:function|procedure)\b/i.test(masked)) {
    limitations.add('stored_procedure_unsupported');
  }
  if (
    /\$\{|\bexecute\s+(?:immediate|format)\b|\b(?:query|execute)\s*\([^)]*\+/i.test(masked) ||
    /\b(?:query|execute)\s*\(\s*(?!['"`])/i.test(masked)
  ) {
    limitations.add('dynamic_sql');
  }
  for (const location of statements(masked)) {
    const statement = masked.slice(location.offset, location.offset + location.length);
    const parsed = parseStatement(statement, location, options.defaultSchema);
    operations.push(...parsed.operations);
    sqlReferences.push(...parsed.references);
    if (operations.length + sqlReferences.length > options.maximumItems) {
      throw new Error('database_item_limit');
    }
    if (
      parsed.operations.length + parsed.references.length === 0 &&
      /\b(?:create|alter|drop)\s+(?:table|type)\b|\bselect\s+[\s\S]+\s+from\b|\binsert\s+into\b|\bupdate\s+[\s\S]+\s+set\b|\bdelete\s+from\b/i.test(
        statement,
      )
    ) {
      limitations.add('database_syntax_unresolved');
    }
  }
  const enums = prismaEnums(masked, options.defaultSchema);
  const models = prismaModels(
    masked,
    options.defaultSchema,
    new Set(enums.map((value) => value.enumName)),
  );
  const queries = prismaQueries(masked);
  if (
    operations.length + sqlReferences.length + models.length + enums.length + queries.length >
    options.maximumItems
  ) {
    throw new Error('database_item_limit');
  }
  if (probable && operations.length + sqlReferences.length + models.length + queries.length === 0) {
    limitations.add('database_syntax_unresolved');
  }
  return {
    operations,
    sqlReferences,
    prismaModels: models,
    prismaEnums: enums,
    prismaQueries: queries,
    limitations: [...limitations].sort(),
    probable,
  };
}
