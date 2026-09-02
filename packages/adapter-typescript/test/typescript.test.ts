import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import type { ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import {
  TYPESCRIPT_ADMISSION_REPORT,
  typeScriptAdapter,
  typeScriptRepositorySymbolKey,
  typeScriptSymbolKey,
} from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'f'.repeat(64)}`);

function artifact(path: string, text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: path.endsWith('.d.ts') ? 'generated' : 'source',
  };
}

function packageJson(version = '1.0.0') {
  return artifact(
    'package.json',
    JSON.stringify({
      name: '@acme/pets',
      version,
      exports: { '.': './dist/index.js', './models': { types: './dist/models.d.ts' } },
      dependencies: { '@acme/auth': '^2.0.0' },
    }),
  );
}

function producer(api: string, version = '1.0.0'): readonly ArtifactInput[] {
  return [
    packageJson(version),
    artifact(
      'src/index.ts',
      `export { getPet } from './api.js'; export type { Pet } from './models.js';`,
    ),
    artifact('src/api.ts', api),
    artifact('src/models.d.ts', 'export interface Pet { id: string }'),
    artifact('src/consumer.ts', `import { token } from '@acme/auth/session'; token();`),
    artifact('src/consumer.js', `const { token } = require('@acme/auth/session'); token();`),
  ];
}

async function extract(artifacts: readonly ArtifactInput[]) {
  return typeScriptAdapter.extract({
    artifacts,
    configRevision: revision,
    context: {
      packageRegistry: 'npm',
      lockedVersions: { '@acme/auth': '2.1.0' },
    },
  });
}

async function extractInternal(
  artifacts: readonly ArtifactInput[],
  repositoryScope = 'repo_acme_storefront',
) {
  return typeScriptAdapter.extract({
    artifacts,
    configRevision: revision,
    context: { packageRegistry: 'npm', repositoryScope },
  });
}

describe('TypeScript/npm adapter', () => {
  it('extracts barrel re-exports, subpaths, type/value spaces, and locked imports', async () => {
    const result = await extract(
      producer(`
export function getPet(id: string): string;
export function getPet(id: string, options?: { fresh: boolean }): string;
export function getPet(id: string): string { return id; }
`),
    );
    expect(result.coverage.state).toBe('complete');
    expect(result.definitions.map((value) => value.canonicalKey)).toEqual([
      typeScriptSymbolKey('npm', '@acme/pets', '.', 'type', 'Pet'),
      typeScriptSymbolKey('npm', '@acme/pets', '.', 'value', 'getPet'),
      typeScriptSymbolKey('npm', '@acme/pets', './models', 'type', 'Pet'),
    ]);
    expect(result.references).toContainEqual(
      expect.objectContaining({
        canonicalKey: typeScriptSymbolKey('npm', '@acme/auth', './session', 'value', 'token'),
        activation: 'on_upgrade',
      }),
    );
    expect(result.references).toContainEqual(
      expect.objectContaining({ path: repoPath('src/consumer.js'), activation: 'on_upgrade' }),
    );
  });

  it('keeps producer and consumer canonicalization identical', () => {
    expect(typeScriptSymbolKey('NPM', '@ACME/PETS', 'models/', 'type', 'Pet')).toBe(
      typeScriptSymbolKey('npm', '@acme/pets', './models', 'type', 'Pet'),
    );
    expect(typeScriptSymbolKey('npm', '@acme/pets', '.', 'type', 'Pet')).not.toBe(
      typeScriptSymbolKey('npm', '@acme/pets', '.', 'value', 'Pet'),
    );
  });

  it('joins repository-local relative and tsconfig-path imports to module exports', async () => {
    const result = await extractInternal([
      artifact('package.json', JSON.stringify({ name: '@acme/storefront', private: true })),
      artifact('tsconfig.json', JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } })),
      artifact(
        'lib/checkout.ts',
        `export function calculateTotal(value: number): number { return value; }`,
      ),
      artifact(
        'app/cart.ts',
        `import { calculateTotal } from '@/lib/checkout'; export const total = calculateTotal(1);`,
      ),
      artifact(
        'app/summary.ts',
        `import { calculateTotal } from '../lib/checkout.js'; export const summary = calculateTotal(2);`,
      ),
      artifact(
        'app/lazy.ts',
        `import cases from './cases.json'; export async function total() { const { calculateTotal } = await import('@/lib/checkout'); return calculateTotal(cases.length); }`,
      ),
    ]);
    const key = typeScriptRepositorySymbolKey(
      'repo_acme_storefront',
      'lib/checkout.ts',
      'value',
      'calculateTotal',
    );

    expect(result.coverage.state).toBe('complete');
    expect(result.definitions).toContainEqual(
      expect.objectContaining({ canonicalKey: key, evidenceStratum: 'internal_module_export' }),
    );
    expect(result.references.filter((reference) => reference.canonicalKey === key)).toHaveLength(3);
    expect(
      result.references
        .filter((reference) => reference.canonicalKey === key)
        .every(
          (reference) =>
            reference.evidenceStratum === 'internal_static_import' &&
            reference.activation === 'current_runtime',
        ),
    ).toBe(true);
  });

  it('keeps repository-local identities isolated between repositories', () => {
    expect(
      typeScriptRepositorySymbolKey('repo_a', 'lib/checkout.ts', 'value', 'calculateTotal'),
    ).not.toBe(
      typeScriptRepositorySymbolKey('repo_b', 'lib/checkout.ts', 'value', 'calculateTotal'),
    );
  });

  it('flags an implementation-only internal module change for immediate review', async () => {
    const fixture = (body: string) => [
      artifact('package.json', JSON.stringify({ name: '@acme/storefront', private: true })),
      artifact(
        'lib/checkout.ts',
        `export function calculateTotal(value: number): number { ${body} }`,
      ),
      artifact(
        'app/cart.ts',
        `import { calculateTotal } from '../lib/checkout'; void calculateTotal(1);`,
      ),
    ];
    const before = await extractInternal(fixture('return value;'));
    const after = await extractInternal(fixture('return value * 2;'));
    const diff = await typeScriptAdapter.diff({
      base: before,
      head: after,
      configRevision: revision,
      context: {},
    });
    const internal = diff.changes.find((change) =>
      change.canonicalKey.startsWith('typescript-repository:'),
    );

    expect(internal).toMatchObject({
      changeKind: 'module_export_changed',
      compatibility: 'potentially_breaking',
      activation: 'current_runtime',
      remedy: { kind: 'review_or_update_internal_consumers' },
    });
  });

  it('classifies a newly required parameter as breaking on upgrade', async () => {
    const before = await extract(
      producer('export function getPet(id: string): string { return id; }'),
    );
    const after = await extract(
      producer(
        'export function getPet(id: string, region: string): string { return id + region; }',
      ),
    );
    const diff = await typeScriptAdapter.diff({
      base: before,
      head: after,
      configRevision: revision,
      context: {},
    });
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({
      changeKind: 'export_changed',
      compatibility: 'breaking',
      activation: 'on_upgrade',
    });
  });

  it('does not turn a package version-only change into an API change', async () => {
    const api = 'export function getPet(id: string): string { return id; }';
    const before = await extract(producer(api, '1.0.0'));
    const after = await extract(producer(api, '1.0.1'));
    const diff = await typeScriptAdapter.diff({
      base: before,
      head: after,
      configRevision: revision,
      context: {},
    });
    expect(diff.changes).toEqual([]);
  });

  it('treats an additive overload as compatible', async () => {
    const before = await extract(
      producer('export function getPet(id: string): string { return id; }'),
    );
    const after = await extract(
      producer(`
export function getPet(id: string): string;
export function getPet(id: string, fresh?: boolean): string;
export function getPet(id: string, fresh?: boolean): string { return fresh ? id : id; }
`),
    );
    const diff = await typeScriptAdapter.diff({
      base: before,
      head: after,
      configRevision: revision,
      context: {},
    });
    expect(diff.changes[0]?.compatibility).toBe('compatible');
  });

  it('classifies an intentionally removed public export as breaking', async () => {
    const before = await extract(
      producer('export function getPet(id: string): string { return id; }'),
    );
    const after = await extract([
      packageJson(),
      artifact('src/index.ts', `export type { Pet } from './models.js';`),
      artifact('src/api.ts', 'function internalOnly(): void {} void internalOnly;'),
      artifact('src/models.d.ts', 'export interface Pet { id: string }'),
    ]);
    const diff = await typeScriptAdapter.diff({
      base: before,
      head: after,
      configRevision: revision,
      context: {},
    });
    expect(diff.changes).toContainEqual(
      expect.objectContaining({
        canonicalKey: typeScriptSymbolKey('npm', '@acme/pets', '.', 'value', 'getPet'),
        changeKind: 'export_removed',
        compatibility: 'breaking',
      }),
    );
  });

  it('returns unknown for complex type variance outside the declared subset', async () => {
    const before = await extract(
      producer('export function getPet(id: string): string { return id; }'),
    );
    const after = await extract(
      producer('export function getPet(id: string): string { return id; }').map((value) =>
        value.path === 'src/models.d.ts'
          ? artifact(
              'src/models.d.ts',
              'export interface Pet { id: string; owner: { name: string } }',
            )
          : value,
      ),
    );
    const diff = await typeScriptAdapter.diff({
      base: before,
      head: after,
      configRevision: revision,
      context: {},
    });
    const petChanges = diff.changes.filter((value) => value.canonicalKey.includes('Pet'));
    expect(petChanges).toHaveLength(2);
    expect(petChanges.every((value) => value.compatibility === 'unknown')).toBe(true);
  });

  it('extracts a JavaScript public export structurally', async () => {
    const result = await extract([
      artifact(
        'package.json',
        JSON.stringify({ name: '@acme/js-pets', exports: './src/index.js' }),
      ),
      artifact('src/index.js', 'export function listPets(limit) { return limit; }'),
    ]);
    expect(result.definitions[0]).toMatchObject({
      canonicalKey: typeScriptSymbolKey('npm', '@acme/js-pets', '.', 'value', 'listPets'),
      evidenceStratum: 'public_export',
    });
  });

  it('keeps admission synthetic and non-deliverable', () => {
    expect(TYPESCRIPT_ADMISSION_REPORT).toMatchObject({
      promotionState: 'UNMEASURED',
      deliveryReady: false,
      realLabelledCorpusState: 'absent',
    });
  });
});
