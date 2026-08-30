import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const listed = JSON.parse(
  execFileSync('pnpm', ['list', '--recursive', '--prod', '--depth', 'Infinity', '--json'], {
    cwd: root,
    encoding: 'utf8',
  }),
);
const components = new Map();

function collectDependency(name, dependency) {
  if (!dependency || typeof dependency !== 'object') return;
  const version = dependency.version;
  if (typeof name === 'string' && typeof version === 'string' && !version.startsWith('link:')) {
    components.set(`${name}@${version}`, {
      type: 'library',
      name,
      version,
      purl: `pkg:npm/${encodeURIComponent(name)}@${version}`,
    });
  }
  for (const [childName, child] of Object.entries(dependency.dependencies ?? {})) {
    collectDependency(childName, child);
  }
}

for (const project of listed) {
  if (typeof project.name === 'string' && typeof project.version === 'string' && !project.private) {
    components.set(`${project.name}@${project.version}`, {
      type: project.name === 'reverb-impact' ? 'application' : 'library',
      name: project.name,
      version: project.version,
      purl: `pkg:npm/${encodeURIComponent(project.name)}@${project.version}`,
    });
  }
  for (const [dependencyName, dependency] of Object.entries(project.dependencies ?? {})) {
    collectDependency(dependencyName, dependency);
  }
}

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: { type: 'application', name: 'reverb-impact', version: '0.0.0' },
    tools: { components: [{ type: 'application', name: 'reverb-sbom-generator', version: '1' }] },
  },
  components: [...components.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  ),
};

await mkdir(resolve(root, 'artifacts'), { recursive: true });
await writeFile(resolve(root, 'artifacts/sbom.cdx.json'), `${JSON.stringify(bom, null, 2)}\n`);
process.stdout.write(`Wrote CycloneDX SBOM with ${bom.components.length} components.\n`);
