import type { FileArtifact, OverlayEntry, PullRequestOverlay } from './models.js';
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

export function canPromoteAnalyzedHeadTree(
  analyzedHeadTree: PullRequestOverlay['headTreeHash'],
  actualMergeTree: PullRequestOverlay['headTreeHash'],
): boolean {
  return analyzedHeadTree === actualMergeTree;
}
