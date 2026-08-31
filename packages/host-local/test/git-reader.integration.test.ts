import { execFile } from 'node:child_process';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { commitSha, repoPath, repositoryStableId } from '@yanib/reverb-domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalGitRepositoryReader } from '../src/index.js';

const exec = promisify(execFile);
let root = '';
const repositoryId = repositoryStableId(
  'local:sha256:1111111111111111111111111111111111111111111111111111111111111111',
);

async function git(...argv: string[]): Promise<string> {
  const result = await exec('git', argv, { cwd: root, encoding: 'utf8' });
  return result.stdout.trim();
}

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'reverb-git-reader-'));
  await git('init', '-b', 'main');
  await git('config', 'user.email', 'fixture@example.test');
  await git('config', 'user.name', 'Fixture');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function reader(): LocalGitRepositoryReader {
  return new LocalGitRepositoryReader(
    new Map([[repositoryId, { path: root, displayName: 'fixture', defaultBranch: 'main' }]]),
  );
}

describe('local exact Git reader', () => {
  it('lists exact trees, records symlinks without following them, and bounds blobs', async () => {
    await writeFile(resolve(root, 'source.ts'), 'export const value = 1;\n');
    await writeFile(resolve(root, 'large.ts'), 'x'.repeat(100));
    await symlink('/etc/passwd', resolve(root, 'outside-link'));
    await git('add', '--all');
    await git('commit', '-m', 'first');
    const sha = commitSha(await git('rev-parse', 'HEAD'));

    const source = reader();
    const descriptor = await source.resolveRepository(repositoryId);
    expect(descriptor.ok).toBe(true);
    const tree = await source.listTree(repositoryId, sha);
    expect(tree.ok).toBe(true);
    if (!tree.ok) return;
    expect(tree.value.complete).toBe(true);
    expect(tree.value.entries.find((entry) => entry.path === 'outside-link')?.kind).toBe('symlink');

    const blob = await source.readBlob(repositoryId, sha, repoPath('large.ts'), 10);
    expect(blob.ok).toBe(true);
    if (blob.ok) {
      expect(blob.value.complete).toBe(false);
      expect(blob.value.truncated).toBe(true);
      expect(blob.value.bytes).toHaveLength(10);
    }
  });

  it('returns a complete add/delete/rename diff with a stable hash', async () => {
    await writeFile(resolve(root, 'rename.ts'), 'export const renamed = true;\n');
    await writeFile(resolve(root, 'delete.ts'), 'export const deleted = true;\n');
    await git('add', '--all');
    await git('commit', '-m', 'base');
    const base = commitSha(await git('rev-parse', 'HEAD'));

    await git('mv', 'rename.ts', 'renamed.ts');
    await rm(resolve(root, 'delete.ts'));
    await writeFile(resolve(root, 'added.ts'), 'export const added = true;\n');
    await writeFile(resolve(root, 'binary.bin'), Uint8Array.from([0, 1, 2, 3]));
    await git('add', '--all');
    await git('commit', '-m', 'head');
    const head = commitSha(await git('rev-parse', 'HEAD'));

    const source = reader();
    const first = await source.compare(repositoryId, base, head);
    const second = await source.compare(repositoryId, base, head);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.complete).toBe(true);
    expect(first.value.manifestHash).toBe(second.value.manifestHash);
    expect(first.value.entries.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(['added', 'deleted', 'renamed']),
    );
    expect(first.value.entries.find((entry) => entry.path === 'binary.bin')?.binary).toBe(true);
  });
});
