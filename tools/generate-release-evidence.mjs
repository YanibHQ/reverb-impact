import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageDirectory = resolve(root, 'artifacts/packages');
const workspaceManifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const releaseMetadata = JSON.parse(
  await readFile(resolve(root, 'docs/compatibility/release-metadata.json'), 'utf8'),
);

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

const archives = (await readdir(packageDirectory)).filter((name) => name.endsWith('.tgz')).sort();
const packages = [];
for (const archive of archives) {
  const path = resolve(packageDirectory, archive);
  const manifest = JSON.parse(
    execFileSync('tar', ['-xOf', path, 'package/package.json'], { encoding: 'utf8' }),
  );
  if (manifest.version !== workspaceManifest.version) {
    throw new Error(`${archive} does not match release version ${workspaceManifest.version}.`);
  }
  packages.push({
    name: manifest.name,
    version: manifest.version,
    archive: basename(archive),
    sha256: sha256(await readFile(path)),
  });
}

const schemaFiles = (await readdir(resolve(root, 'schemas')))
  .filter((name) => name.endsWith('.schema.json'))
  .sort();
const schemas = [];
for (const file of schemaFiles) {
  const bytes = await readFile(resolve(root, 'schemas', file));
  const schema = JSON.parse(bytes.toString('utf8'));
  schemas.push({ file, id: schema.$id, sha256: sha256(bytes) });
}

const sbomPath = resolve(root, 'artifacts/sbom.cdx.json');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const sourceTreeState = execFileSync('git', ['status', '--porcelain'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
  ? 'dirty'
  : 'clean';
const pnpmVersion = execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim();
const evidence = {
  schema: 'reverb.release-provenance',
  schemaVersion: '1.0',
  packageVersion: workspaceManifest.version,
  releaseStatus: releaseMetadata.release_status,
  sourceCommit,
  sourceTreeState,
  generatedAt: new Date().toISOString(),
  toolchain: {
    node: process.version,
    pnpm: pnpmVersion,
    packageManager: workspaceManifest.packageManager,
  },
  verification: [
    'pnpm run ci',
    'bounded comparative and release benchmarks',
    'packed v0.4 host compile',
    'packed v2 host compile',
    'packed root import smoke',
    'packed CLI version smoke',
    'SHA-256 package checksums',
    'CycloneDX SBOM',
  ],
  packages,
  schemas,
  sbom: {
    file: 'sbom.cdx.json',
    sha256: sha256(await readFile(sbomPath)),
  },
  publication: {
    npm: false,
    githubRelease: false,
    container: false,
  },
};

await writeFile(
  resolve(root, 'artifacts/release-provenance.json'),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
process.stdout.write(
  `Wrote release provenance for ${packages.length} packages and ${schemas.length} schemas.\n`,
);
