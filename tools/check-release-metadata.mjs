import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { OPENAPI_ADAPTER_MANIFEST } from '../packages/adapter-openapi/dist/index.js';
import { PROTOBUF_ADAPTER_MANIFEST } from '../packages/adapter-protobuf/dist/index.js';
import { TYPESCRIPT_ADAPTER_MANIFEST } from '../packages/adapter-typescript/dist/index.js';
import { SCHEMA_COMPATIBILITY } from '../packages/schema/dist/index.js';
import { POSTGRES_MIGRATIONS } from '../packages/storage-postgres/dist/index.js';
import { SQLITE_SCHEMA_VERSION } from '../packages/storage-sqlite/dist/index.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceManifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const metadata = JSON.parse(
  await readFile(resolve(root, 'docs/compatibility/release-metadata.json'), 'utf8'),
);
const failures = [];
if (metadata.package_version !== workspaceManifest.version) {
  failures.push('release metadata package version differs from the workspace version');
}
if (!['pre_v1_release_candidate', 'pre_v1_published'].includes(metadata.release_status)) {
  failures.push('release metadata has an unsupported pre-v1 release status');
}
if ((metadata.release_status === 'pre_v1_published') !== (metadata.publication.npm === true)) {
  failures.push('release metadata npm publication flag differs from its release status');
}
if (metadata.schema.current_version !== SCHEMA_COMPATIBILITY.currentVersion) {
  failures.push('release metadata schema version is stale');
}
if (
  JSON.stringify(metadata.schema.supported_majors) !==
  JSON.stringify(SCHEMA_COMPATIBILITY.supportedMajors)
) {
  failures.push('release metadata supported schema majors are stale');
}
if (metadata.storage.sqlite_migration !== SQLITE_SCHEMA_VERSION) {
  failures.push('release metadata SQLite migration is stale');
}
if (metadata.storage.postgres_migration !== POSTGRES_MIGRATIONS.at(-1)?.version) {
  failures.push('release metadata PostgreSQL migration is stale');
}
const expectedAdapters = [
  OPENAPI_ADAPTER_MANIFEST,
  PROTOBUF_ADAPTER_MANIFEST,
  TYPESCRIPT_ADAPTER_MANIFEST,
]
  .map((manifest) => ({
    id: manifest.id,
    version: manifest.version,
    identity_version: manifest.identityVersion,
  }))
  .sort((left, right) => left.id.localeCompare(right.id));
const actualAdapters = [...metadata.adapters].sort((left, right) =>
  left.id.localeCompare(right.id),
);
if (JSON.stringify(actualAdapters) !== JSON.stringify(expectedAdapters)) {
  failures.push('release metadata adapter/identity versions are stale');
}
for (const directory of await readdir(resolve(root, 'packages'), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const manifest = JSON.parse(
    await readFile(resolve(root, 'packages', directory.name, 'package.json'), 'utf8'),
  );
  if (manifest.version !== metadata.package_version) {
    failures.push(`${manifest.name}: package version differs from release metadata`);
  }
}
if (
  metadata.reindex.required !== true ||
  JSON.stringify(metadata.reindex.adapter_ids) !==
    JSON.stringify(['reverb.openapi', 'reverb.typescript']) ||
  metadata.calibration.reset_strata.length !== 0
) {
  failures.push('release metadata does not declare the OpenAPI/TypeScript re-index boundary');
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Release migration/re-index/identity/calibration metadata is current.\n');
}
