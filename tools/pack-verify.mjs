import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const destination = resolve(root, 'artifacts/packages');
await mkdir(destination, { recursive: true });

execFileSync(
  'pnpm',
  ['--recursive', '--filter', './packages/**', 'pack', '--pack-destination', destination],
  { cwd: root, stdio: 'inherit' },
);

const archives = (await readdir(destination)).filter((name) => name.endsWith('.tgz')).sort();
if (archives.length === 0) throw new Error('No package archives were produced.');

const checksums = [];
for (const archive of archives) {
  const listing = execFileSync('tar', ['-tzf', resolve(destination, archive)], {
    cwd: root,
    encoding: 'utf8',
  });
  if (listing.split('\n').some((entry) => entry.endsWith('.tsbuildinfo'))) {
    throw new Error(`${archive} contains private compiler build metadata.`);
  }
  const bytes = await readFile(resolve(destination, archive));
  checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${basename(archive)}`);
}
await writeFile(resolve(root, 'artifacts/packages/SHA256SUMS'), `${checksums.join('\n')}\n`);
process.stdout.write(`Packed and checksummed ${archives.length} unpublished packages.\n`);
