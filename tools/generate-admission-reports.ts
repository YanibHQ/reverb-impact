import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { OPENAPI_ADMISSION_REPORT } from '../packages/adapter-openapi/src/index.js';
import { EVENTS_ADMISSION_REPORT } from '../packages/adapter-events/src/index.js';
import { DATABASE_ADMISSION_REPORT } from '../packages/adapter-database/src/index.js';
import { CONFIG_ADMISSION_REPORT } from '../packages/adapter-config/src/index.js';
import { HTTP_ADMISSION_REPORT } from '../packages/adapter-http/src/index.js';
import { INFRASTRUCTURE_ADMISSION_REPORT } from '../packages/adapter-infrastructure/src/index.js';
import { PROTOBUF_ADMISSION_REPORT } from '../packages/adapter-protobuf/src/index.js';
import { TYPESCRIPT_ADMISSION_REPORT } from '../packages/adapter-typescript/src/index.js';

const mode = process.argv[2];
if (mode !== '--check' && mode !== '--write') {
  throw new Error('Usage: generate-admission-reports.ts --check|--write');
}

const reports = new Map([
  ['configuration.json', CONFIG_ADMISSION_REPORT],
  ['database.json', DATABASE_ADMISSION_REPORT],
  ['events.json', EVENTS_ADMISSION_REPORT],
  ['http.json', HTTP_ADMISSION_REPORT],
  ['infrastructure.json', INFRASTRUCTURE_ADMISSION_REPORT],
  ['openapi.json', OPENAPI_ADMISSION_REPORT],
  ['protobuf.json', PROTOBUF_ADMISSION_REPORT],
  ['typescript.json', TYPESCRIPT_ADMISSION_REPORT],
]);
const root = resolve('docs/verification/adapters');
let stale = false;
for (const [name, report] of reports) {
  const path = resolve(root, name);
  const expected = `${JSON.stringify(report, null, 2)}\n`;
  if (mode === '--write') {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, expected, 'utf8');
    continue;
  }
  let actual = '';
  try {
    actual = await readFile(path, 'utf8');
  } catch {
    // The stale result below gives one bounded error for missing and changed files.
  }
  if (actual !== expected) {
    process.stderr.write(`Stale adapter admission report: ${name}\n`);
    stale = true;
  }
}
if (stale) process.exitCode = 1;
else
  process.stdout.write(
    `Adapter admission reports ${mode === '--write' ? 'written' : 'are current'}.\n`,
  );
