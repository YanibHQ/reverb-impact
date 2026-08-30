import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packagesRoot = resolve(root, 'packages');
const failures = [];
for (const directory of await readdir(packagesRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const packagePath = resolve(packagesRoot, directory.name, 'package.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(packagePath, 'utf8'));
  } catch {
    continue;
  }
  const exportKeys = Object.keys(manifest.exports ?? {});
  if (exportKeys.length !== 1 || exportKeys[0] !== '.') {
    failures.push(`${manifest.name}: only the documented root export is allowed`);
  }
  const rootExport = manifest.exports?.['.'];
  if (rootExport?.types !== './dist/index.d.ts' || rootExport?.default !== './dist/index.js') {
    failures.push(`${manifest.name}: root export must use the built index entry point`);
  }
  if (JSON.stringify(manifest.files) !== JSON.stringify(['dist'])) {
    failures.push(`${manifest.name}: published files must be restricted to dist`);
  }
  if (manifest.main !== './dist/index.js' || manifest.types !== './dist/index.d.ts') {
    failures.push(`${manifest.name}: main/types do not match the public root export`);
  }
  if (manifest.license !== 'Apache-2.0')
    failures.push(`${manifest.name}: license is not Apache-2.0`);
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Public packages expose only documented root entry points.\n');
}
