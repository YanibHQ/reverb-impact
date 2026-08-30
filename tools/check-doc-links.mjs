import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ignored = new Set(['node_modules', '.git', 'dist', 'artifacts', '.private-research']);

async function markdownFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await markdownFiles(path)));
    else if (entry.name.endsWith('.md')) output.push(path);
  }
  return output;
}

const failures = [];
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
for (const file of await markdownFiles(root)) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(linkPattern)) {
    const target = match[1];
    if (
      !target ||
      target.startsWith('http:') ||
      target.startsWith('https:') ||
      target.startsWith('#')
    ) {
      continue;
    }
    const pathPart = decodeURIComponent(target.split('#', 1)[0]);
    if (!pathPart) continue;
    try {
      await access(resolve(dirname(file), pathPart));
    } catch {
      failures.push(`${file.slice(root.length + 1)} -> ${target}`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`Broken local documentation links:\n${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Documentation links resolve locally.\n');
}
