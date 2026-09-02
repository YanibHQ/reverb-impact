import { ReverbError } from './errors.js';
import type { FileArtifact, OverlayEntry, PullRequestOverlay } from './models.js';
import type { GenerationId } from './values.js';
import type { RepoPath } from './values.js';

export type OverlayLookup =
  | { readonly state: 'head'; readonly artifact: Omit<FileArtifact, 'generationId'> }
  | { readonly state: 'base'; readonly artifact: FileArtifact }
  | { readonly state: 'deleted' }
  | { readonly state: 'missing' };

export function resolveOverlayArtifact(
  path: RepoPath,
  baseArtifacts: ReadonlyMap<RepoPath, FileArtifact>,
  overlayEntries: ReadonlyMap<RepoPath, OverlayEntry>,
): OverlayLookup {
  const overlay = overlayEntries.get(path);
  if (overlay?.kind === 'tombstone') return { state: 'deleted' };
  if (overlay?.kind === 'replacement' && overlay.artifact) {
    return { state: 'head', artifact: overlay.artifact };
  }
  const base = baseArtifacts.get(path);
  return base ? { state: 'base', artifact: base } : { state: 'missing' };
}

/**
 * Materializes the logical artifact view of a derived generation without
 * copying the base generation into storage. This operates only on persisted
 * metadata; provider source access belongs outside this domain function.
 */
export function materializeOverlayArtifacts(
  generationId: GenerationId,
  baseArtifacts: readonly FileArtifact[],
  overlayEntries: readonly OverlayEntry[],
): readonly FileArtifact[] {
  const artifacts = new Map<RepoPath, FileArtifact>();
  for (const artifact of baseArtifacts) {
    if (artifacts.has(artifact.path)) {
      throw new ReverbError('invalid_schema', 'Base generation contains duplicate paths.', {
        path: artifact.path,
      });
    }
    artifacts.set(artifact.path, {
      ...artifact,
      generationId,
      ...(artifact.generationId !== generationId
        ? { reusedFromGenerationId: artifact.generationId }
        : {}),
    });
  }

  const changedPaths = new Set<RepoPath>();
  for (const entry of overlayEntries) {
    if (changedPaths.has(entry.path)) {
      throw new ReverbError('invalid_schema', 'Overlay contains duplicate paths.', {
        path: entry.path,
      });
    }
    changedPaths.add(entry.path);
    if (entry.kind === 'tombstone') {
      artifacts.delete(entry.path);
      continue;
    }
    if (!entry.artifact || entry.artifact.path !== entry.path) {
      throw new ReverbError(
        'invalid_schema',
        'Overlay replacement must contain an artifact for the same path.',
        { path: entry.path },
      );
    }
    artifacts.set(entry.path, { ...entry.artifact, generationId });
  }

  return [...artifacts.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function canPromoteAnalyzedHeadTree(
  analyzedHeadTree: PullRequestOverlay['headTreeHash'],
  actualMergeTree: PullRequestOverlay['headTreeHash'],
): boolean {
  return analyzedHeadTree === actualMergeTree;
}
