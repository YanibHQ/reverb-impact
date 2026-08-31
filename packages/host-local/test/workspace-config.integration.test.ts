import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { createRegistrySnapshot, resolveServiceAlias } from '@yanib/reverb-domain';
import { afterEach, describe, expect, it } from 'vitest';

import { LocalWorkspaceConfig } from '../src/index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('local revisioned workspace config', () => {
  it('keeps membership explicit, immutable, and reversible by a new revision', async () => {
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), 'reverb-workspace-root-'));
    const memberRoot = await mkdtemp(resolve(tmpdir(), 'reverb-workspace-member-'));
    roots.push(workspaceRoot, memberRoot);
    const initialized = await LocalWorkspaceConfig.initialize(workspaceRoot, { name: 'fixture' });
    const initialHistory = resolve(
      workspaceRoot,
      '.reverb/registry',
      `${initialized.snapshot.revision.revision}.json`,
    );
    expect(JSON.parse(await readFile(initialHistory, 'utf8'))).toMatchObject({
      revision: { sequence: 1 },
    });

    const added = await LocalWorkspaceConfig.addRepository(initialized, memberRoot, 'member');
    expect(added.snapshot.revision.sequence).toBe(2);
    expect(added.snapshot.repositories.map((entry) => entry.alias)).toContain('member');
    expect(await readFile(initialHistory, 'utf8')).toContain('"sequence": 1');

    const removed = await LocalWorkspaceConfig.removeRepository(added, 'member');
    expect(removed.snapshot.revision.sequence).toBe(3);
    expect(removed.snapshot.repositories.map((entry) => entry.alias)).not.toContain('member');
    const loaded = await LocalWorkspaceConfig.load(workspaceRoot);
    expect(loaded.snapshot.revision.revision).toBe(removed.snapshot.revision.revision);
  });

  it('round-trips unknown additive top-level fields in schema major 1', async () => {
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), 'reverb-workspace-extension-'));
    roots.push(workspaceRoot);
    const initialized = await LocalWorkspaceConfig.initialize(workspaceRoot);
    const snapshot = createRegistrySnapshot({
      workspaceId: initialized.snapshot.revision.workspaceId,
      sequence: 2,
      createdAt: initialized.snapshot.revision.createdAt,
      createdBy: 'fixture-user',
      source: 'fixture',
      reason: 'add future optional field',
      repositories: initialized.snapshot.repositories,
      extensions: {
        future_policy: { mode: 'observe', nested: { retained: true } },
      },
    });
    await LocalWorkspaceConfig.write({ ...initialized, snapshot });
    const loaded = await LocalWorkspaceConfig.load(workspaceRoot);
    expect(loaded.snapshot.extensions).toEqual({
      future_policy: { mode: 'observe', nested: { retained: true } },
    });
    await LocalWorkspaceConfig.write(loaded);
    expect((await LocalWorkspaceConfig.load(workspaceRoot)).snapshot.extensions).toEqual(
      loaded.snapshot.extensions,
    );
  });

  it('persists operator-owned services and explicit gateway aliases as new revisions', async () => {
    const workspaceRoot = await mkdtemp(resolve(tmpdir(), 'reverb-workspace-service-'));
    roots.push(workspaceRoot);
    const initialized = await LocalWorkspaceConfig.initialize(workspaceRoot);
    const repositoryAlias = initialized.snapshot.repositories[0]!.alias;
    const withService = await LocalWorkspaceConfig.addService(initialized, {
      id: 'svc.fixture',
      repositoryAlias,
      rootPath: 'src',
      environment: 'production',
      owner: 'fixture-team',
    });
    const withAlias = await LocalWorkspaceConfig.addServiceAlias(withService, {
      serviceId: 'svc.fixture',
      kind: 'host',
      value: 'api.fixture.test',
      environment: 'production',
      owner: 'fixture-team',
      pathPrefix: 'gateway/fixture',
    });
    expect(withAlias.snapshot.revision.sequence).toBe(3);
    const loaded = await LocalWorkspaceConfig.load(workspaceRoot);
    expect(
      resolveServiceAlias(loaded.snapshot, {
        kind: 'host',
        value: 'API.FIXTURE.TEST.',
        environment: 'production',
        asOf: loaded.snapshot.revision.createdAt,
        path: '/gateway/fixture/pets/1',
      }),
    ).toMatchObject({ state: 'resolved', rewrittenPath: 'pets/1' });
  });
});
