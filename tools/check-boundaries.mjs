import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const domainRoot = fileURLToPath(new URL('../packages/domain/src/', import.meta.url));
const adapterRoots = [
  'adapter-sdk',
  'adapter-openapi',
  'adapter-protobuf',
  'adapter-typescript',
].map((name) => fileURLToPath(new URL(`../packages/${name}/src/`, import.meta.url)));
const githubHostRoot = fileURLToPath(new URL('../packages/host-github/src/', import.meta.url));
const forbidden = [
  '@yanibhq/reverb-application',
  '@yanibhq/reverb-host-',
  '@yanibhq/reverb-storage-',
  '@octokit/',
  'pg',
  'node:fs',
  'node:child_process',
  'node:net',
  'node:http',
  'node:https',
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}

const violations = [];
for (const file of await walk(domainRoot)) {
  const source = await readFile(file, 'utf8');
  for (const specifier of forbidden) {
    if (source.includes(`'${specifier}`) || source.includes(`"${specifier}`)) {
      violations.push(`${file}: forbidden domain dependency ${specifier}`);
    }
  }
}

const forbiddenAdapterImports = [
  '@yanibhq/reverb-application',
  '@yanibhq/reverb-storage-',
  '@yanibhq/reverb-host-',
  'node:child_process',
  'node:fs',
  'node:net',
  'node:http',
  'node:https',
  'openai',
  '@openai/',
];
for (const root of adapterRoots) {
  for (const file of await walk(root)) {
    const source = await readFile(file, 'utf8');
    for (const specifier of forbiddenAdapterImports) {
      if (source.includes(`'${specifier}`) || source.includes(`"${specifier}`)) {
        violations.push(`${file}: forbidden adapter dependency ${specifier}`);
      }
    }
  }
}

for (const file of await walk(githubHostRoot)) {
  if (file.endsWith('/check-writer.ts')) continue;
  const source = await readFile(file, 'utf8');
  for (const marker of ['@octokit/', 'GitHubChecksClient', 'withWriteToken', 'upsertCheck']) {
    if (source.includes(marker)) {
      violations.push(`${file}: provider check-write capability is confined to check-writer.ts`);
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Domain, adapter, and provider-writer dependency boundaries are clean.\n');
}
