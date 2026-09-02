import {
  adapterId,
  configRevision,
  contentHash,
  canPromoteAnalyzedHeadTree,
  generationId,
  materializeOverlayArtifacts,
  overlayId,
  repoPath,
  resolveOverlayArtifact,
  treeHash,
  type FileArtifact,
} from '../src/index.js';
import { describe, expect, it } from 'vitest';

const generation = generationId('gen_01990f64-0000-7000-8000-000000000001');
const config = configRevision(
  'cfg_sha256:2222222222222222222222222222222222222222222222222222222222222222',
);
const basePath = repoPath('src/base.ts');
const artifact: FileArtifact = {
  generationId: generation,
  path: basePath,
  sourceBlobId: 'a'.repeat(40),
  contentHash: contentHash(
    'sha256:3333333333333333333333333333333333333333333333333333333333333333',
  ),
  size: 10,
  language: 'typescript',
  classification: 'source',
  parseState: 'parsed',
  parserId: adapterId('reverb.file-metadata'),
  parserVersion: '1.0.0',
  configRevision: config,
};

describe('overlay lookup', () => {
  it('distinguishes base, head replacement, tombstone, and missing', () => {
    const base = new Map([[basePath, artifact]]);
    expect(resolveOverlayArtifact(basePath, base, new Map()).state).toBe('base');

    const id = overlayId('ovl_01990f64-0000-7000-8000-000000000001');
    const replacementPath = repoPath('src/head.ts');
    const { generationId: _generation, ...replacement } = artifact;
    void _generation;
    expect(
      resolveOverlayArtifact(
        replacementPath,
        base,
        new Map([
          [
            replacementPath,
            { overlayId: id, path: replacementPath, kind: 'replacement', artifact: replacement },
          ],
        ]),
      ).state,
    ).toBe('head');
    expect(
      resolveOverlayArtifact(
        basePath,
        base,
        new Map([[basePath, { overlayId: id, path: basePath, kind: 'tombstone' }]]),
      ).state,
    ).toBe('deleted');
    expect(resolveOverlayArtifact(repoPath('missing.ts'), base, new Map()).state).toBe('missing');
  });

  it('promotes an analyzed head only when the actual merge tree is identical', () => {
    const analyzed = treeHash('a'.repeat(40));
    expect(canPromoteAnalyzedHeadTree(analyzed, treeHash('a'.repeat(40)))).toBe(true);
    expect(canPromoteAnalyzedHeadTree(analyzed, treeHash('b'.repeat(40)))).toBe(false);
  });

  it('materializes a deterministic logical head from base metadata and overlay entries', () => {
    const headGeneration = generationId('gen_01990f64-0000-7000-8000-000000000002');
    const id = overlayId('ovl_01990f64-0000-7000-8000-000000000002');
    const addedPath = repoPath('src/added.ts');
    const { generationId: _generation, ...replacement } = {
      ...artifact,
      path: addedPath,
      sourceBlobId: 'b'.repeat(40),
    };
    void _generation;
    const materialized = materializeOverlayArtifacts(
      headGeneration,
      [artifact],
      [
        { overlayId: id, path: basePath, kind: 'tombstone' },
        { overlayId: id, path: addedPath, kind: 'replacement', artifact: replacement },
      ],
    );

    expect(materialized).toEqual([
      expect.objectContaining({
        generationId: headGeneration,
        path: addedPath,
        sourceBlobId: 'b'.repeat(40),
      }),
    ]);
  });

  it('rejects malformed or duplicate overlay replacements', () => {
    const headGeneration = generationId('gen_01990f64-0000-7000-8000-000000000003');
    const id = overlayId('ovl_01990f64-0000-7000-8000-000000000003');
    const malformed = { overlayId: id, path: basePath, kind: 'replacement' as const };
    expect(() => materializeOverlayArtifacts(headGeneration, [artifact], [malformed])).toThrow(
      /same path/,
    );
    expect(() =>
      materializeOverlayArtifacts(
        headGeneration,
        [artifact],
        [
          { overlayId: id, path: basePath, kind: 'tombstone' },
          { overlayId: id, path: basePath, kind: 'tombstone' },
        ],
      ),
    ).toThrow(/duplicate paths/);
  });
});
