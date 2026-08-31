import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  adapterId,
  configRevision,
  contentHash,
  hashCanonical,
  workspaceId,
  type FileArtifact,
} from '@yanib/reverb-domain';
import {
  portFailure,
  portSuccess,
  type ArtifactCacheKey,
  type ArtifactCachePort,
  type CachedArtifact,
  type PortResult,
} from '@yanib/reverb-application';

import { createSystemId } from './system.js';

const MAXIMUM_CACHE_ENTRY_BYTES = 64 * 1024;

function canonicalKey(key: ArtifactCacheKey): ArtifactCacheKey {
  return {
    workspaceId: workspaceId(key.workspaceId),
    sourceBlobId: key.sourceBlobId,
    indexerBundleVersion: key.indexerBundleVersion,
    parserId: adapterId(key.parserId),
    parserVersion: key.parserVersion,
    configRevision: configRevision(key.configRevision),
  };
}

function cachePath(root: string, key: ArtifactCacheKey): string {
  const digest = contentHash(hashCanonical(key)).slice('sha256:'.length);
  return resolve(root, digest.slice(0, 2), `${digest.slice(2)}.json`);
}

function decodeCachedArtifact(value: unknown, expected: ArtifactCacheKey): CachedArtifact | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { key?: ArtifactCacheKey; artifact?: Record<string, unknown> };
  if (!record.key || hashCanonical(record.key) !== hashCanonical(expected) || !record.artifact)
    return null;
  const artifact = record.artifact;
  try {
    return {
      key: canonicalKey(record.key),
      artifact: {
        sourceBlobId: String(artifact.sourceBlobId),
        ...(artifact.contentHash ? { contentHash: contentHash(String(artifact.contentHash)) } : {}),
        size: Number(artifact.size),
        language: String(artifact.language),
        classification: artifact.classification as FileArtifact['classification'],
        parseState: artifact.parseState as FileArtifact['parseState'],
        parserId: adapterId(String(artifact.parserId)),
        parserVersion: String(artifact.parserVersion),
        configRevision: configRevision(String(artifact.configRevision)),
        ...(artifact.lineCount === undefined ? {} : { lineCount: Number(artifact.lineCount) }),
      },
    };
  } catch {
    return null;
  }
}

export class LocalArtifactObjectCache implements ArtifactCachePort {
  readonly #root: string;

  public constructor(root: string) {
    this.#root = resolve(root);
  }

  public async get(key: ArtifactCacheKey): Promise<PortResult<CachedArtifact | null>> {
    const canonical = canonicalKey(key);
    const path = cachePath(this.#root, canonical);
    try {
      const metadata = await stat(path);
      if (!metadata.isFile() || metadata.size > MAXIMUM_CACHE_ENTRY_BYTES) return portSuccess(null);
      const value: unknown = JSON.parse(await readFile(path, 'utf8'));
      return portSuccess(decodeCachedArtifact(value, canonical));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return portSuccess(null);
      return portFailure({
        kind: 'infrastructure',
        code: 'cache_read_failed',
        safeMessage: 'Artifact cache could not be read.',
        retryable: true,
      });
    }
  }

  public async put(value: CachedArtifact): Promise<PortResult<void>> {
    const canonical = { ...value, key: canonicalKey(value.key) };
    const path = cachePath(this.#root, canonical.key);
    const temporary = `${path}.${createSystemId('tmp')}`;
    try {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const contents = `${JSON.stringify(canonical)}\n`;
      if (Buffer.byteLength(contents) > MAXIMUM_CACHE_ENTRY_BYTES) {
        return portFailure({
          kind: 'domain',
          code: 'cache_entry_oversized',
          safeMessage: 'Derived artifact exceeds the cache entry limit.',
          retryable: false,
        });
      }
      try {
        await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        await rename(temporary, path);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      }
      return portSuccess(undefined);
    } catch {
      return portFailure({
        kind: 'infrastructure',
        code: 'cache_write_failed',
        safeMessage: 'Artifact cache could not be written.',
        retryable: true,
      });
    }
  }
}
