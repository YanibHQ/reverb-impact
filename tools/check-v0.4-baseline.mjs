import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixturePath = resolve(root, 'features/next-generation-impact/fixtures/v0.4.0/baseline.json');
const baseline = JSON.parse(await readFile(fixturePath, 'utf8'));
const failures = [];

const hash = (value) => createHash('sha256').update(value).digest('hex');

const packageManifests = new Map();
for (const entry of await readdir(resolve(root, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifestPath = resolve(root, 'packages', entry.name, 'package.json');
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    packageManifests.set(manifest.name, manifest);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

for (const packageName of baseline.packages) {
  const manifest = packageManifests.get(packageName);
  if (!manifest) {
    failures.push(`missing v0.4 package: ${packageName}`);
    continue;
  }
  const actualRootExport = manifest.exports?.['.'];
  const expectedRootExport = baseline.requiredPackageExports['.'];
  if (
    actualRootExport?.types !== expectedRootExport.types ||
    actualRootExport?.default !== expectedRootExport.default
  ) {
    failures.push(`${packageName}: v0.4 root export changed`);
  }
}

for (const [file, expectedDigest] of Object.entries(baseline.schemas)) {
  const contents = await readFile(resolve(root, 'schemas', file));
  const actualDigest = hash(contents);
  if (actualDigest !== expectedDigest) {
    failures.push(`${file}: schema-major 1 digest changed (${actualDigest})`);
  }
}

const sqliteSource = await readFile(resolve(root, 'packages/storage-sqlite/src/store.ts'), 'utf8');
const sqliteLevels = [...sqliteSource.matchAll(/const MIGRATION_(\d{3})\s*=/g)].map((match) =>
  Number(match[1]),
);
if (Math.max(...sqliteLevels) < baseline.storage.sqliteMigrationLevel) {
  failures.push('SQLite migration history no longer contains the v0.4 migration level');
}

const postgresSource = await readFile(
  resolve(root, 'packages/storage-postgres/src/migrations.ts'),
  'utf8',
);
const postgresLevels = [...postgresSource.matchAll(/\bversion:\s*(\d+),/g)].map((match) =>
  Number(match[1]),
);
if (Math.max(...postgresLevels) < baseline.storage.postgresMigrationLevel) {
  failures.push('PostgreSQL migration history no longer contains the v0.4 migration level');
}

for (const adapter of baseline.adapters) {
  const directory = adapter.id.replace('reverb.', 'adapter-');
  const source = await readFile(resolve(root, 'packages', directory, 'src/manifest.ts'), 'utf8');
  const requiredFragments = [
    `adapterId('${adapter.id}')`,
    `version: '${adapter.version}'`,
    `identityVersion: ${adapter.identityVersion}`,
    `contractKinds: [${adapter.contractKinds.map((kind) => `'${kind}'`).join(', ')}]`,
  ];
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment))
      failures.push(`${adapter.id}: changed baseline fragment ${fragment}`);
  }
}

const valuesSource = await readFile(resolve(root, 'packages/domain/src/vocabularies.ts'), 'utf8');
for (const basis of baseline.evidenceBases) {
  if (!valuesSource.includes(`'${basis}'`)) failures.push(`missing v0.4 evidence basis: ${basis}`);
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Reverb ${baseline.release} package, schema, migration, adapter, and vocabulary baseline is intact.\n`,
  );
}
