import { mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import {
  createRegistrySnapshot,
  enumValue,
  instant,
  REPOSITORY_ACTIONS,
  repoPath,
  repositoryStableId,
  SERVICE_ALIAS_KINDS,
  sha256Text,
  workspaceId,
  type ConsentGrant,
  type RegistrySnapshot,
  type RepositoryMembership,
  type RepositoryStableId,
  type ServiceAlias,
  type ServiceIdentity,
} from '@yanib/reverb-domain';
import { parseDocument, stringify } from 'yaml';

import { createSystemId, systemInstant } from './system.js';

const MAXIMUM_CONFIG_BYTES = 1_048_576;
const KNOWN_KEYS = new Set([
  'schema',
  'schema_version',
  'workspace',
  'revision',
  'repositories',
  'services',
  'aliases',
  'consents',
]);

interface WorkspaceConfigDocument extends Record<string, unknown> {
  readonly schema: 'reverb.workspace-registry';
  readonly schema_version: '1.0';
  readonly workspace: { readonly id: string; readonly name: string };
  readonly revision: {
    readonly sequence: number;
    readonly id: string;
    readonly config_revision: string;
    readonly created_at: string;
    readonly created_by: string;
    readonly source: string;
    readonly reason: string;
    readonly config_hash: string;
  };
  readonly repositories: readonly {
    readonly id: string;
    readonly alias: string;
    readonly path?: string;
    readonly default_branch: string;
    readonly collections: readonly string[];
    readonly selected: boolean;
    readonly consent_revision: string;
  }[];
  readonly services: readonly ServiceIdentity[];
  readonly aliases: readonly ServiceAlias[];
  readonly consents: readonly ConsentGrant[];
}

export interface LoadedWorkspace {
  readonly root: string;
  readonly name: string;
  readonly snapshot: RegistrySnapshot;
}

function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${name} must be an object.`);
}

function parseConfig(text: string): WorkspaceConfigDocument {
  if (Buffer.byteLength(text) > MAXIMUM_CONFIG_BYTES)
    throw new Error('Workspace config exceeds its size limit.');
  for (const line of text.split('\n')) {
    const indentation = line.match(/^ */)?.[0].length ?? 0;
    if (indentation > 128) throw new Error('Workspace config exceeds its nesting limit.');
  }
  const document = parseDocument(text, {
    prettyErrors: false,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) throw new Error('Workspace config is malformed.');
  const value: unknown = document.toJS({ maxAliasCount: 0 });
  assertObject(value, 'Workspace config');
  if (value.schema !== 'reverb.workspace-registry')
    throw new Error('Workspace schema is unsupported.');
  if (value.schema_version !== '1.0') throw new Error('Workspace schema major is unsupported.');
  return value as WorkspaceConfigDocument;
}

function toSnapshot(document: WorkspaceConfigDocument): RegistrySnapshot {
  const extensions = Object.fromEntries(
    Object.entries(document).filter(([key]) => !KNOWN_KEYS.has(key)),
  );
  const repositories: RepositoryMembership[] = document.repositories.map((repository) => ({
    repositoryId: repositoryStableId(repository.id),
    alias: repository.alias,
    ...(repository.path ? { rootPath: repository.path } : {}),
    defaultBranch: repository.default_branch,
    collections: [...repository.collections],
    selected: repository.selected,
    consentRevision: repository.consent_revision,
  }));
  const services = document.services.map((service) => ({
    ...service,
    repositoryId: repositoryStableId(String(service.repositoryId)),
    rootPath: repoPath(String(service.rootPath)),
    validFrom: instant(String(service.validFrom)),
    ...(service.validUntil ? { validUntil: instant(String(service.validUntil)) } : {}),
  }));
  const aliases = document.aliases.map((alias) => ({
    ...alias,
    kind: enumValue(SERVICE_ALIAS_KINDS, String(alias.kind), 'ServiceAliasKind'),
    ...(alias.pathPrefix ? { pathPrefix: repoPath(String(alias.pathPrefix)) } : {}),
    validFrom: instant(String(alias.validFrom)),
    ...(alias.validUntil ? { validUntil: instant(String(alias.validUntil)) } : {}),
  }));
  const consents = document.consents.map((consent) => ({
    ...consent,
    repositoryId: repositoryStableId(String(consent.repositoryId)),
    action: enumValue(REPOSITORY_ACTIONS, String(consent.action), 'RepositoryAction'),
  }));
  const snapshot = createRegistrySnapshot({
    workspaceId: workspaceId(document.workspace.id),
    sequence: document.revision.sequence,
    createdAt: instant(document.revision.created_at),
    createdBy: document.revision.created_by,
    source: document.revision.source,
    reason: document.revision.reason,
    repositories,
    services,
    aliases,
    consents,
    extensions,
  });
  if (
    snapshot.revision.revision !== document.revision.id ||
    snapshot.revision.configRevision !== document.revision.config_revision ||
    snapshot.revision.configHash !== document.revision.config_hash
  ) {
    throw new Error('Workspace revision hashes do not match its content.');
  }
  return snapshot;
}

function toDocument(name: string, snapshot: RegistrySnapshot): WorkspaceConfigDocument {
  return {
    ...snapshot.extensions,
    schema: 'reverb.workspace-registry',
    schema_version: '1.0',
    workspace: { id: snapshot.revision.workspaceId, name },
    revision: {
      sequence: snapshot.revision.sequence,
      id: snapshot.revision.revision,
      config_revision: snapshot.revision.configRevision,
      created_at: snapshot.revision.createdAt,
      created_by: snapshot.revision.createdBy,
      source: snapshot.revision.source,
      reason: snapshot.revision.reason,
      config_hash: snapshot.revision.configHash,
    },
    repositories: snapshot.repositories.map((repository) => ({
      id: repository.repositoryId,
      alias: repository.alias,
      ...(repository.rootPath ? { path: repository.rootPath } : {}),
      default_branch: repository.defaultBranch,
      collections: [...repository.collections],
      selected: repository.selected,
      consent_revision: repository.consentRevision,
    })),
    services: snapshot.services,
    aliases: snapshot.aliases,
    consents: snapshot.consents,
  };
}

async function writeAtomic(path: string, contents: string): Promise<void> {
  const temporary = `${path}.${createSystemId('tmp')}`;
  await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
}

export async function localRepositoryId(path: string): Promise<RepositoryStableId> {
  const canonical = await realpath(resolve(path));
  return repositoryStableId(`local:${sha256Text(canonical)}`);
}

export class LocalWorkspaceConfig {
  public static async initialize(
    rootInput: string,
    options: { readonly name?: string; readonly actor?: string } = {},
  ): Promise<LoadedWorkspace> {
    const root = await realpath(resolve(rootInput));
    const metadataRoot = resolve(root, '.reverb');
    const configPath = resolve(metadataRoot, 'workspace.yaml');
    try {
      await stat(configPath);
      throw new Error('A Reverb workspace already exists at this path.');
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('A Reverb workspace')) throw error;
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    await mkdir(resolve(metadataRoot, 'registry'), { recursive: true, mode: 0o700 });
    await mkdir(resolve(metadataRoot, 'objects'), { recursive: true, mode: 0o700 });
    const now = systemInstant();
    const id = workspaceId(createSystemId('wsp', now));
    const repositoryId = await localRepositoryId(root);
    const snapshot = createRegistrySnapshot({
      workspaceId: id,
      sequence: 1,
      createdAt: now,
      createdBy: options.actor ?? 'local-user',
      source: 'reverb init',
      reason: 'initialize workspace',
      repositories: [
        {
          repositoryId,
          alias: basename(root),
          rootPath: root,
          defaultBranch: 'main',
          collections: ['default'],
          selected: true,
          consentRevision: 'local-default-v1',
        },
      ],
    });
    const loaded = { root, name: options.name ?? basename(root), snapshot };
    await LocalWorkspaceConfig.write(loaded);
    return loaded;
  }

  public static async load(start: string): Promise<LoadedWorkspace> {
    let current = resolve(start);
    while (true) {
      const configPath = resolve(current, '.reverb/workspace.yaml');
      try {
        const text = await readFile(configPath, 'utf8');
        const document = parseConfig(text);
        return { root: current, name: document.workspace.name, snapshot: toSnapshot(document) };
      } catch (error) {
        if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error;
      }
      const parent = dirname(current);
      if (parent === current) throw new Error('No Reverb workspace was found.');
      current = parent;
    }
  }

  public static async write(workspace: LoadedWorkspace): Promise<void> {
    const metadataRoot = resolve(workspace.root, '.reverb');
    const registryRoot = resolve(metadataRoot, 'registry');
    await mkdir(registryRoot, { recursive: true, mode: 0o700 });
    const document = toDocument(workspace.name, workspace.snapshot);
    const yaml = stringify(document, { lineWidth: 100, sortMapEntries: true });
    const history = JSON.stringify(document, null, 2) + '\n';
    const historyPath = resolve(registryRoot, `${workspace.snapshot.revision.revision}.json`);
    try {
      await stat(historyPath);
    } catch {
      await writeFile(historyPath, history, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    }
    await writeAtomic(resolve(metadataRoot, 'workspace.yaml'), yaml);
  }

  public static async addRepository(
    workspace: LoadedWorkspace,
    path: string,
    alias: string,
    actor = 'local-user',
  ): Promise<LoadedWorkspace> {
    if (workspace.snapshot.repositories.some((repository) => repository.alias === alias)) {
      throw new Error('Repository alias already exists.');
    }
    const rootPath = await realpath(resolve(path));
    const repositoryId = await localRepositoryId(rootPath);
    const now = systemInstant();
    const snapshot = createRegistrySnapshot({
      workspaceId: workspace.snapshot.revision.workspaceId,
      sequence: workspace.snapshot.revision.sequence + 1,
      createdAt: now,
      createdBy: actor,
      source: 'reverb workspace add',
      reason: 'add repository membership',
      repositories: [
        ...workspace.snapshot.repositories,
        {
          repositoryId,
          alias,
          rootPath,
          defaultBranch: 'main',
          collections: ['default'],
          selected: true,
          consentRevision: `local-${now}`,
        },
      ],
      services: workspace.snapshot.services,
      aliases: workspace.snapshot.aliases,
      consents: workspace.snapshot.consents,
      extensions: workspace.snapshot.extensions,
    });
    const updated = { ...workspace, snapshot };
    await LocalWorkspaceConfig.write(updated);
    return updated;
  }

  public static async removeRepository(
    workspace: LoadedWorkspace,
    alias: string,
    actor = 'local-user',
  ): Promise<LoadedWorkspace> {
    const repositories = workspace.snapshot.repositories.filter(
      (repository) => repository.alias !== alias,
    );
    if (repositories.length === workspace.snapshot.repositories.length) {
      throw new Error('Repository alias does not exist.');
    }
    const retainedIds = new Set(repositories.map((repository) => repository.repositoryId));
    const services = workspace.snapshot.services.filter((service) =>
      retainedIds.has(service.repositoryId),
    );
    const serviceIds = new Set(services.map((service) => service.id));
    const now = systemInstant();
    const snapshot = createRegistrySnapshot({
      workspaceId: workspace.snapshot.revision.workspaceId,
      sequence: workspace.snapshot.revision.sequence + 1,
      createdAt: now,
      createdBy: actor,
      source: 'reverb workspace remove',
      reason: 'remove repository membership',
      repositories,
      services,
      aliases: workspace.snapshot.aliases.filter((entry) => serviceIds.has(entry.serviceId)),
      consents: workspace.snapshot.consents.filter((entry) => retainedIds.has(entry.repositoryId)),
      extensions: workspace.snapshot.extensions,
    });
    const updated = { ...workspace, snapshot };
    await LocalWorkspaceConfig.write(updated);
    return updated;
  }

  public static async addService(
    workspace: LoadedWorkspace,
    input: {
      readonly id: string;
      readonly repositoryAlias: string;
      readonly rootPath: string;
      readonly environment: string;
      readonly owner: string;
      readonly actor?: string;
    },
  ): Promise<LoadedWorkspace> {
    const repository = workspace.snapshot.repositories.find(
      (candidate) => candidate.alias === input.repositoryAlias,
    );
    if (repository === undefined) throw new Error('Repository alias does not exist.');
    if (workspace.snapshot.services.some((service) => service.id === input.id)) {
      throw new Error('Service ID already exists.');
    }
    const now = systemInstant();
    const snapshot = createRegistrySnapshot({
      workspaceId: workspace.snapshot.revision.workspaceId,
      sequence: workspace.snapshot.revision.sequence + 1,
      createdAt: now,
      createdBy: input.actor ?? 'local-user',
      source: 'reverb registry service add',
      reason: 'add service identity',
      repositories: workspace.snapshot.repositories,
      services: [
        ...workspace.snapshot.services,
        {
          id: input.id,
          repositoryId: repository.repositoryId,
          rootPath: repoPath(input.rootPath),
          environment: input.environment,
          owner: input.owner,
          validFrom: now,
        },
      ],
      aliases: workspace.snapshot.aliases,
      consents: workspace.snapshot.consents,
      extensions: workspace.snapshot.extensions,
    });
    const updated = { ...workspace, snapshot };
    await LocalWorkspaceConfig.write(updated);
    return updated;
  }

  public static async addServiceAlias(
    workspace: LoadedWorkspace,
    input: {
      readonly serviceId: string;
      readonly kind: string;
      readonly value: string;
      readonly environment: string;
      readonly owner: string;
      readonly pathPrefix?: string;
      readonly actor?: string;
    },
  ): Promise<LoadedWorkspace> {
    if (!workspace.snapshot.services.some((service) => service.id === input.serviceId)) {
      throw new Error('Service ID does not exist.');
    }
    const now = systemInstant();
    const snapshot = createRegistrySnapshot({
      workspaceId: workspace.snapshot.revision.workspaceId,
      sequence: workspace.snapshot.revision.sequence + 1,
      createdAt: now,
      createdBy: input.actor ?? 'local-user',
      source: 'reverb registry alias add',
      reason: 'add explicit service alias',
      repositories: workspace.snapshot.repositories,
      services: workspace.snapshot.services,
      aliases: [
        ...workspace.snapshot.aliases,
        {
          serviceId: input.serviceId,
          kind: enumValue(SERVICE_ALIAS_KINDS, input.kind, 'ServiceAliasKind'),
          value: input.value,
          ...(input.pathPrefix === undefined ? {} : { pathPrefix: repoPath(input.pathPrefix) }),
          environment: input.environment,
          provenance: 'operator',
          source: 'reverb registry alias add',
          owner: input.owner,
          validFrom: now,
        },
      ],
      consents: workspace.snapshot.consents,
      extensions: workspace.snapshot.extensions,
    });
    const updated = { ...workspace, snapshot };
    await LocalWorkspaceConfig.write(updated);
    return updated;
  }

  public static repositoryBindings(
    workspace: LoadedWorkspace,
  ): ReadonlyMap<RepositoryStableId, { path: string; displayName: string; defaultBranch: string }> {
    return new Map(
      workspace.snapshot.repositories.map((repository) => [
        repository.repositoryId,
        {
          path: repository.rootPath ?? workspace.root,
          displayName: repository.alias,
          defaultBranch: repository.defaultBranch,
        },
      ]),
    );
  }
}
