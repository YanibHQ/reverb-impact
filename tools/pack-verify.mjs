import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { pnpmExecFileSync } from './run-pnpm.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const destination = resolve(root, 'artifacts/packages');
const workspaceManifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const packageDirectories = (
  await readdir(resolve(root, 'packages'), { withFileTypes: true })
).filter((entry) => entry.isDirectory());
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

pnpmExecFileSync(
  ['--recursive', '--filter', './packages/**', 'pack', '--pack-destination', destination],
  { cwd: root, stdio: 'inherit' },
);

const archives = (await readdir(destination)).filter((name) => name.endsWith('.tgz')).sort();
if (archives.length === 0) throw new Error('No package archives were produced.');
if (archives.length !== packageDirectories.length) {
  throw new Error(
    `Expected ${packageDirectories.length} package archives but produced ${archives.length}.`,
  );
}

const checksums = [];
for (const archive of archives) {
  const listing = execFileSync('tar', ['-tzf', archive], {
    cwd: destination,
    encoding: 'utf8',
  });
  const entries = listing.split('\n');
  if (entries.some((entry) => entry.endsWith('.tsbuildinfo'))) {
    throw new Error(`${archive} contains private compiler build metadata.`);
  }
  for (const required of ['package/package.json', 'package/README.md', 'package/LICENSE']) {
    if (!entries.includes(required)) throw new Error(`${archive} is missing ${required}.`);
  }
  const packedManifest = JSON.parse(
    execFileSync('tar', ['-xOf', archive, 'package/package.json'], {
      cwd: destination,
      encoding: 'utf8',
    }),
  );
  if (packedManifest.version !== workspaceManifest.version) {
    throw new Error(
      `${archive} version differs from workspace version ${workspaceManifest.version}.`,
    );
  }
  if (packedManifest.publishConfig?.access !== 'public') {
    throw new Error(`${archive} is not configured for public npm access.`);
  }
  if (packedManifest.publishConfig?.provenance !== true) {
    throw new Error(`${archive} does not require npm provenance for trusted-publisher releases.`);
  }
  for (const dependencyGroup of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'devDependencies',
  ]) {
    for (const [name, version] of Object.entries(packedManifest[dependencyGroup] ?? {})) {
      if (String(version).startsWith('workspace:')) {
        throw new Error(`${archive} retains workspace protocol dependency ${name}.`);
      }
      if (name.startsWith('@yanib/reverb-') && version !== workspaceManifest.version) {
        throw new Error(`${archive} has mismatched internal dependency ${name}@${version}.`);
      }
    }
  }
  const bytes = await readFile(resolve(destination, archive));
  checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${basename(archive)}`);
}
await writeFile(resolve(root, 'artifacts/packages/SHA256SUMS'), `${checksums.join('\n')}\n`);
process.stdout.write(`Packed and checksummed ${archives.length} release packages.\n`);
