import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import {
  commitSha,
  contentHash,
  hashCanonical,
  repoPath,
  treeHash,
  type BlobResult,
  type CommitDescriptor,
  type CommitSha,
  type DiffEntry,
  type DiffEntryKind,
  type DiffManifest,
  type RepoPath,
  type RepositoryDescriptor,
  type RepositoryStableId,
  type TreeEntry,
  type TreeManifest,
} from '@yanibhq/reverb-domain';
import {
  portFailure,
  portSuccess,
  type PortResult,
  type RepositoryReader,
} from '@yanibhq/reverb-application';

interface GitOutput {
  readonly stdout: Uint8Array;
  readonly truncated: boolean;
}

interface RepositoryBinding {
  readonly path: string;
  readonly displayName: string;
  readonly defaultBranch?: string;
}

export interface LocalGitReaderOptions {
  readonly timeoutMs?: number;
  readonly maximumTreeBytes?: number;
}

const sourceFailure = (code: string, safeMessage: string, retryable = false) =>
  portFailure({
    kind: 'incomplete_provider_data',
    code,
    safeMessage,
    retryable,
  });

async function runGit(
  cwd: string,
  argv: readonly string[],
  timeoutMs: number,
  maximumOutputBytes: number,
): Promise<PortResult<GitOutput>> {
  return new Promise((resolveResult) => {
    const child = spawn('git', ['--no-pager', ...argv], {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
      },
    });
    const chunks: Buffer[] = [];
    let length = 0;
    let truncated = false;
    let settled = false;
    const finish = (result: PortResult<GitOutput>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(result);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      if (truncated) return;
      const remaining = maximumOutputBytes - length;
      if (chunk.length > remaining) {
        if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
        length += Math.max(remaining, 0);
        truncated = true;
        child.kill('SIGKILL');
      } else {
        chunks.push(chunk);
        length += chunk.length;
      }
    });
    child.stderr.on('data', () => {
      // Git stderr can contain repository paths or refs and is intentionally not retained.
    });
    child.on('error', () => {
      finish(
        portFailure({
          kind: 'infrastructure',
          code: 'git_unavailable',
          safeMessage: 'Git could not be executed.',
          retryable: false,
        }),
      );
    });
    child.on('close', (code) => {
      if (truncated) {
        finish(portSuccess({ stdout: Buffer.concat(chunks), truncated: true }));
      } else if (code === 0) {
        finish(portSuccess({ stdout: Buffer.concat(chunks), truncated: false }));
      } else {
        finish(sourceFailure('git_command_failed', 'Git could not resolve the requested source.'));
      }
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(
        portFailure({
          kind: 'infrastructure',
          code: 'git_timeout',
          safeMessage: 'Git exceeded its execution budget.',
          retryable: true,
        }),
      );
    }, timeoutMs);
    timer.unref();
  });
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function statusKind(status: string): DiffEntryKind | null {
  switch (status[0]) {
    case 'A':
      return 'added';
    case 'M':
      return 'modified';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'T':
      return 'type_changed';
    default:
      return null;
  }
}

export class LocalGitRepositoryReader implements RepositoryReader {
  readonly #repositories: ReadonlyMap<RepositoryStableId, RepositoryBinding>;
  readonly #timeoutMs: number;
  readonly #maximumTreeBytes: number;

  public constructor(
    repositories: ReadonlyMap<RepositoryStableId, RepositoryBinding>,
    options: LocalGitReaderOptions = {},
  ) {
    this.#repositories = repositories;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#maximumTreeBytes = options.maximumTreeBytes ?? 64 * 1024 * 1024;
  }

  async #root(id: RepositoryStableId): Promise<PortResult<RepositoryBinding & { path: string }>> {
    const binding = this.#repositories.get(id);
    if (!binding) {
      return portFailure({
        kind: 'not_found',
        code: 'unknown_repository',
        safeMessage: 'Repository is not configured.',
        retryable: false,
      });
    }
    try {
      return portSuccess({ ...binding, path: await realpath(resolve(binding.path)) });
    } catch {
      return sourceFailure('repository_unreadable', 'Repository root cannot be resolved.');
    }
  }

  public async resolveRepository(
    id: RepositoryStableId,
  ): Promise<PortResult<RepositoryDescriptor>> {
    const root = await this.#root(id);
    if (!root.ok) return root;
    const top = await runGit(
      root.value.path,
      ['rev-parse', '--show-toplevel'],
      this.#timeoutMs,
      16_384,
    );
    if (!top.ok) return top;
    try {
      const resolvedTop = await realpath(decodeText(top.value.stdout).trim());
      if (resolvedTop !== root.value.path) {
        return sourceFailure(
          'repository_root_mismatch',
          'Configured path is not the Git repository root.',
        );
      }
      return portSuccess({
        id,
        displayName: root.value.displayName || basename(root.value.path),
        ...(root.value.defaultBranch ? { defaultBranch: root.value.defaultBranch } : {}),
      });
    } catch {
      return sourceFailure('repository_unreadable', 'Repository metadata is invalid.');
    }
  }

  public async resolveCommit(
    id: RepositoryStableId,
    ref: string,
  ): Promise<PortResult<CommitDescriptor>> {
    const root = await this.#root(id);
    if (!root.ok) return root;
    if (ref.includes('\0') || ref.startsWith('-') || ref.length > 512) {
      return sourceFailure('invalid_ref', 'Git ref is invalid.');
    }
    const commit = await runGit(
      root.value.path,
      ['rev-parse', '--verify', `${ref}^{commit}`],
      this.#timeoutMs,
      256,
    );
    if (!commit.ok) return commit;
    const shaText = decodeText(commit.value.stdout).trim();
    const tree = await runGit(
      root.value.path,
      ['show', '-s', '--format=%T', shaText],
      this.#timeoutMs,
      256,
    );
    if (!tree.ok) return tree;
    try {
      return portSuccess({
        repositoryId: id,
        sha: commitSha(shaText),
        treeHash: treeHash(decodeText(tree.value.stdout).trim()),
      });
    } catch {
      return sourceFailure('invalid_git_object', 'Git returned a malformed object identity.');
    }
  }

  public async listTree(id: RepositoryStableId, sha: CommitSha): Promise<PortResult<TreeManifest>> {
    const root = await this.#root(id);
    if (!root.ok) return root;
    const commit = await this.resolveCommit(id, sha);
    if (!commit.ok) return commit;
    const output = await runGit(
      root.value.path,
      ['ls-tree', '-r', '-z', '--long', sha],
      this.#timeoutMs,
      this.#maximumTreeBytes,
    );
    if (!output.ok) return output;
    const entries: TreeEntry[] = [];
    const limitations: TreeManifest['limitations'][number][] = [];
    try {
      for (const record of decodeText(output.value.stdout).split('\0')) {
        if (!record) continue;
        const tab = record.indexOf('\t');
        if (tab < 0) throw new Error('Malformed tree record');
        const metadata = record.slice(0, tab).trim().split(/\s+/);
        const path = repoPath(record.slice(tab + 1));
        const [mode, type, objectId, sizeText] = metadata;
        if (!mode || !type || !objectId || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(objectId)) {
          throw new Error('Malformed tree metadata');
        }
        const kind =
          mode === '160000' || type === 'commit'
            ? 'submodule'
            : mode === '120000'
              ? 'symlink'
              : 'blob';
        const size = sizeText && /^\d+$/.test(sizeText) ? Number(sizeText) : undefined;
        entries.push({ path, mode, kind, objectId, ...(size === undefined ? {} : { size }) });
      }
    } catch {
      return sourceFailure('incomplete_tree', 'Git tree output could not be parsed.');
    }
    if (output.value.truncated) limitations.push({ code: 'incomplete_tree' });
    return portSuccess({
      repositoryId: id,
      commitSha: sha,
      treeHash: commit.value.treeHash,
      entries: entries.sort((left, right) => left.path.localeCompare(right.path)),
      complete: !output.value.truncated,
      limitations,
    });
  }

  public async readBlob(
    id: RepositoryStableId,
    sha: CommitSha,
    path: RepoPath,
    maximumBytes: number,
  ): Promise<PortResult<BlobResult>> {
    const root = await this.#root(id);
    if (!root.ok) return root;
    repoPath(path);
    const listing = await runGit(
      root.value.path,
      ['ls-tree', '-z', '--long', sha, '--', path],
      this.#timeoutMs,
      16_384,
    );
    if (!listing.ok) return listing;
    let text: string;
    try {
      text = decodeText(listing.value.stdout).replace(/\0$/, '');
    } catch {
      return sourceFailure('missing_blob', 'Blob metadata is invalid.');
    }
    const tab = text.indexOf('\t');
    const metadata = tab >= 0 ? text.slice(0, tab).trim().split(/\s+/) : [];
    const objectId = metadata[2];
    if (!objectId || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(objectId)) {
      return sourceFailure('missing_blob', 'Blob does not exist at the requested commit.');
    }
    const blob = await runGit(
      root.value.path,
      ['cat-file', 'blob', objectId],
      this.#timeoutMs,
      maximumBytes,
    );
    if (!blob.ok) return blob;
    return portSuccess({
      path,
      bytes: blob.value.stdout,
      complete: !blob.value.truncated,
      truncated: blob.value.truncated,
      sourceBlobId: objectId,
      limitations: blob.value.truncated ? [{ code: 'source_truncated', scope: path }] : [],
    });
  }

  public async compare(
    id: RepositoryStableId,
    base: CommitSha,
    head: CommitSha,
  ): Promise<PortResult<DiffManifest>> {
    const root = await this.#root(id);
    if (!root.ok) return root;
    const output = await runGit(
      root.value.path,
      ['diff', '--name-status', '-z', '--find-renames', '--find-copies', base, head, '--'],
      this.#timeoutMs,
      this.#maximumTreeBytes,
    );
    if (!output.ok) return output;
    const numstat = await runGit(
      root.value.path,
      ['diff', '--numstat', '-z', base, head, '--'],
      this.#timeoutMs,
      this.#maximumTreeBytes,
    );
    if (!numstat.ok) return numstat;
    const headTree = await this.listTree(id, head);
    if (!headTree.ok) return headTree;
    const baseTree = await this.listTree(id, base);
    if (!baseTree.ok) return baseTree;
    const headEntries = new Map(headTree.value.entries.map((entry) => [entry.path, entry]));
    const baseEntries = new Map(baseTree.value.entries.map((entry) => [entry.path, entry]));
    const fields = decodeText(output.value.stdout).split('\0');
    const entries: DiffEntry[] = [];
    try {
      const binaryByPath = new Map<RepoPath, boolean>();
      const numstatFields = decodeText(numstat.value.stdout).split('\0');
      for (let index = 0; index < numstatFields.length; ) {
        const header = numstatFields[index++];
        if (!header) continue;
        const firstTab = header.indexOf('\t');
        const secondTab = firstTab < 0 ? -1 : header.indexOf('\t', firstTab + 1);
        if (firstTab < 0 || secondTab < 0) throw new Error('Malformed numstat record');
        const added = header.slice(0, firstTab);
        const deleted = header.slice(firstTab + 1, secondTab);
        const inlinePath = header.slice(secondTab + 1);
        const binary = added === '-' || deleted === '-';
        if (inlinePath) {
          binaryByPath.set(repoPath(inlinePath), binary);
        } else {
          index += 1; // Previous path for a rename/copy.
          const nextPath = numstatFields[index++];
          if (!nextPath) throw new Error('Malformed rename numstat record');
          binaryByPath.set(repoPath(nextPath), binary);
        }
      }
      for (let index = 0; index < fields.length; ) {
        const status = fields[index++];
        if (!status) continue;
        const kind = statusKind(status);
        if (!kind) throw new Error('Unsupported Git diff status');
        if (kind === 'renamed' || kind === 'copied') {
          const previousPath = repoPath(fields[index++] ?? '');
          const path = repoPath(fields[index++] ?? '');
          const similarity = Number(status.slice(1));
          entries.push({
            kind,
            path,
            previousPath,
            ...(Number.isFinite(similarity) ? { similarity } : {}),
            binary: binaryByPath.get(path) ?? 'unknown',
            submodule: headEntries.get(path)?.kind === 'submodule',
          });
        } else {
          const path = repoPath(fields[index++] ?? '');
          const sourceEntry = kind === 'deleted' ? baseEntries.get(path) : headEntries.get(path);
          entries.push({
            kind,
            path,
            binary: binaryByPath.get(path) ?? 'unknown',
            submodule: sourceEntry?.kind === 'submodule',
          });
        }
      }
    } catch {
      return sourceFailure('incomplete_tree', 'Git diff output could not be parsed.');
    }
    const complete =
      !output.value.truncated &&
      !numstat.value.truncated &&
      headTree.value.complete &&
      baseTree.value.complete;
    const sorted = entries.sort((left, right) => left.path.localeCompare(right.path));
    return portSuccess({
      repositoryId: id,
      baseSha: base,
      headSha: head,
      entries: sorted,
      complete,
      renameBasis: 'git_similarity',
      limitations: complete ? [] : [{ code: 'incomplete_tree' }],
      manifestHash: contentHash(hashCanonical({ base, head, entries: sorted, complete })),
    });
  }
}
