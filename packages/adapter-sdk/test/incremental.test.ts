import { repoPath } from '@yanib/reverb-domain';
import { describe, expect, it } from 'vitest';

import { planPathPartitionInvalidation } from '../src/index.js';

describe('incremental adapter invalidation', () => {
  it('walks reverse dependency closure from directly changed partitions', () => {
    const plan = planPathPartitionInvalidation({
      partitions: [
        {
          partitionKey: 'module:leaf',
          ownedPaths: [repoPath('src/leaf.ts')],
          dependencyKeys: [],
        },
        {
          partitionKey: 'module:barrel',
          ownedPaths: [repoPath('src/index.ts')],
          dependencyKeys: ['module:leaf'],
        },
        {
          partitionKey: 'module:stable',
          ownedPaths: [repoPath('src/stable.ts')],
          dependencyKeys: [],
        },
      ],
      changes: [{ kind: 'modified', path: repoPath('src/leaf.ts') }],
    });

    expect(plan).toMatchObject({
      directPartitionKeys: ['module:leaf'],
      dependentPartitionKeys: ['module:barrel'],
      invalidatedPartitionKeys: ['module:barrel', 'module:leaf'],
      unmatchedPaths: [],
      complete: true,
    });
  });

  it('fails closed for unowned additions and rename destinations', () => {
    const plan = planPathPartitionInvalidation({
      partitions: [
        {
          partitionKey: 'package:root',
          ownedPaths: [repoPath('src/old.ts')],
          dependencyKeys: [],
        },
      ],
      changes: [
        {
          kind: 'renamed',
          path: repoPath('src/new.ts'),
          previousPath: repoPath('src/old.ts'),
        },
        { kind: 'added', path: repoPath('src/added.ts') },
      ],
    });

    expect(plan.directPartitionKeys).toEqual(['package:root']);
    expect(plan.unmatchedPaths).toEqual(['src/added.ts', 'src/new.ts']);
    expect(plan.complete).toBe(false);
  });

  it('rejects ambiguous duplicate partition identities', () => {
    expect(() =>
      planPathPartitionInvalidation({
        partitions: [
          { partitionKey: 'duplicate', ownedPaths: [], dependencyKeys: [] },
          { partitionKey: 'duplicate', ownedPaths: [], dependencyKeys: [] },
        ],
        changes: [],
      }),
    ).toThrow(/unique/);
  });
});
