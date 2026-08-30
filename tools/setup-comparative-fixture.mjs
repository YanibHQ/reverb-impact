import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = process.argv[2];
const mode = process.argv[3];
if (root === undefined || (mode !== 'base' && mode !== 'head')) {
  process.stderr.write('Usage: node tools/setup-comparative-fixture.mjs <root> <base|head>\n');
  process.exitCode = 2;
} else {
  const producer = resolve(root, 'producer');
  const consumer = resolve(root, 'consumer');
  const unrelated = resolve(root, 'unrelated-consumer');
  const git = (cwd, ...argv) => exec('git', argv, { cwd, encoding: 'utf8' });
  if (mode === 'base') {
    await Promise.all(
      [producer, consumer, unrelated].map((path) => mkdir(path, { recursive: true })),
    );
    for (const path of [producer, consumer, unrelated]) {
      await git(path, 'init', '-b', 'main');
      await git(path, 'config', 'user.email', 'fixture@example.test');
      await git(path, 'config', 'user.name', 'Fixture');
    }
    await writeFile(
      resolve(producer, 'package.json'),
      JSON.stringify({ name: '@fixture/api', exports: './index.ts' }),
    );
    await writeFile(
      resolve(producer, 'index.ts'),
      "export function x(value: string): string { return value; }\nexport function y(): string { return 'y'; }\n",
    );
    await writeFile(
      resolve(producer, 'server.ts'),
      "import express from 'express';\nconst app = express();\napp.get('/pets/:id', (_request, response) => response.json({id: '1'}));\n",
    );
    await writeFile(
      resolve(consumer, 'package.json'),
      JSON.stringify({ name: '@fixture/web', dependencies: { '@fixture/api': '1.0.0' } }),
    );
    await writeFile(
      resolve(consumer, 'client.ts'),
      "import { x } from '@fixture/api';\nexport const value = x('fixture');\nexport const pet = fetch('https://api.fixture.test/pets/1');\n",
    );
    await writeFile(
      resolve(unrelated, 'package.json'),
      JSON.stringify({ name: '@fixture/worker', dependencies: { '@fixture/api': '1.0.0' } }),
    );
    await writeFile(
      resolve(unrelated, 'worker.ts'),
      "import { y } from '@fixture/api';\nexport const value = y();\n",
    );
    for (const path of [producer, consumer, unrelated]) {
      await git(path, 'add', '--all');
      await git(path, 'commit', '-m', 'comparative base');
    }
    process.stdout.write(
      `${JSON.stringify({
        producer_base_sha: (await git(producer, 'rev-parse', 'HEAD')).stdout.trim(),
        consumer_sha: (await git(consumer, 'rev-parse', 'HEAD')).stdout.trim(),
        unrelated_consumer_sha: (await git(unrelated, 'rev-parse', 'HEAD')).stdout.trim(),
      })}\n`,
    );
  } else {
    const packageJson = await readFile(resolve(producer, 'package.json'), 'utf8');
    await writeFile(resolve(producer, 'package.json'), packageJson);
    await writeFile(resolve(producer, 'index.ts'), "export function y(): string { return 'y'; }\n");
    await writeFile(
      resolve(producer, 'server.ts'),
      "import express from 'express';\nexport const app = express();\n",
    );
    await git(producer, 'add', '--all');
    await git(producer, 'commit', '-m', 'remove x and GET pets contract');
    process.stdout.write(
      `${JSON.stringify({ producer_head_sha: (await git(producer, 'rev-parse', 'HEAD')).stdout.trim() })}\n`,
    );
  }
}
