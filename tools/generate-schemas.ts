import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { format } from 'prettier';

import { FOUNDATION_SCHEMAS } from '../packages/schema/src/foundation.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.yanibhq.dev/reverb/project/v1.json',
  title: 'Reverb project metadata',
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'schema_version', 'product', 'repository'],
  properties: {
    schema: { const: 'reverb.project' },
    schema_version: { const: '1.0' },
    product: { const: 'Reverb' },
    repository: { const: 'YanibHQ/reverb-impact' },
  },
} as const;
const outputs = [{ file: 'reverb-project.schema.json', schema }, ...FOUNDATION_SCHEMAS] as const;

if (!process.argv.includes('--write') && !process.argv.includes('--check')) {
  process.stderr.write('Use --write or --check.\n');
  process.exitCode = 2;
} else {
  let stale = false;
  for (const output of outputs) {
    const target = resolve(root, 'schemas', output.file);
    const serialized = await format(JSON.stringify(output.schema), {
      parser: 'json',
      printWidth: 100,
    });
    if (process.argv.includes('--write')) {
      await writeFile(target, serialized);
      process.stdout.write(`Wrote ${target}\n`);
      continue;
    }
    let actual = '';
    try {
      actual = await readFile(target, 'utf8');
    } catch {
      // The comparison below emits the stable remediation.
    }
    stale ||= actual !== serialized;
  }
  if (process.argv.includes('--check')) {
    if (stale) {
      process.stderr.write('Generated schemas are stale. Run pnpm schema:generate.\n');
      process.exitCode = 1;
    } else {
      process.stdout.write('Generated schemas are current.\n');
    }
  }
}
