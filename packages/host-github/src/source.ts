import type { RepositoryReader } from '@yanibhq/reverb-application';
import { portFailure, portSuccess } from '@yanibhq/reverb-application';
import type {
  BlobResult,
  CommitDescriptor,
  CommitSha,
  DiffManifest,
  FileArtifact,
  RepositoryDescriptor,
  RepositoryStableId,
  TreeManifest,
} from '@yanibhq/reverb-domain';

export interface GitHubReadTokenBroker {
  withReadToken<Value>(
    input: { readonly installationId: number; readonly repositoryId: RepositoryStableId },
    operation: (token: string) => Promise<Value>,
  ): Promise<Value>;
}

export interface ExactGitBackend {
  readonly comparisonBasis: 'git_exact';
  resolveRepository(token: string, repositoryId: RepositoryStableId): Promise<RepositoryDescriptor>;
  fetchExactCommit(
    token: string,
    repositoryId: RepositoryStableId,
    ref: string,
  ): Promise<CommitDescriptor>;
  listExactTree(
    token: string,
    repositoryId: RepositoryStableId,
    sha: CommitSha,
  ): Promise<TreeManifest>;
  readExactBlob(
    token: string,
    repositoryId: RepositoryStableId,
    sha: CommitSha,
    path: FileArtifact['path'],
    maximumBytes: number,
  ): Promise<BlobResult>;
  diffExactCommits(
    token: string,
    repositoryId: RepositoryStableId,
    base: CommitSha,
    head: CommitSha,
  ): Promise<DiffManifest>;
}

export class GitHubExactRepositoryReader implements RepositoryReader {
  readonly #tokens: GitHubReadTokenBroker;
  readonly #backend: ExactGitBackend;
  readonly #installations: ReadonlyMap<RepositoryStableId, number>;

  public constructor(input: {
    readonly tokens: GitHubReadTokenBroker;
    readonly backend: ExactGitBackend;
    readonly installations: ReadonlyMap<RepositoryStableId, number>;
  }) {
    if (input.backend.comparisonBasis !== 'git_exact') {
      throw new Error(
        'GitHub source backend must diff exact Git commits, not a bounded compare API.',
      );
    }
    this.#tokens = input.tokens;
    this.#backend = input.backend;
    this.#installations = input.installations;
  }

  async #read<Value>(
    repositoryId: RepositoryStableId,
    operation: (token: string) => Promise<Value>,
  ) {
    const installationId = this.#installations.get(repositoryId);
    if (installationId === undefined) {
      return portFailure({
        kind: 'authorization_denied',
        code: 'repository_not_installed',
        safeMessage: 'Repository source is not authorized.',
        retryable: false,
      });
    }
    try {
      return portSuccess(
        await this.#tokens.withReadToken({ installationId, repositoryId }, operation),
      );
    } catch {
      return portFailure({
        kind: 'incomplete_provider_data',
        code: 'exact_git_fetch_failed',
        safeMessage: 'Exact provider source could not be read.',
        retryable: true,
      });
    }
  }

  public resolveRepository(id: RepositoryStableId) {
    return this.#read(id, (token) => this.#backend.resolveRepository(token, id));
  }

  public resolveCommit(id: RepositoryStableId, ref: string) {
    return this.#read(id, (token) => this.#backend.fetchExactCommit(token, id, ref));
  }

  public listTree(id: RepositoryStableId, sha: CommitSha) {
    return this.#read(id, (token) => this.#backend.listExactTree(token, id, sha));
  }

  public readBlob(
    id: RepositoryStableId,
    sha: CommitSha,
    path: FileArtifact['path'],
    maximumBytes: number,
  ) {
    return this.#read(id, (token) =>
      this.#backend.readExactBlob(token, id, sha, path, maximumBytes),
    );
  }

  public compare(id: RepositoryStableId, base: CommitSha, head: CommitSha) {
    return this.#read(id, (token) => this.#backend.diffExactCommits(token, id, base, head));
  }
}

export interface ProviderRepositoryState {
  readonly repositoryId: RepositoryStableId;
  readonly selected: boolean;
  readonly defaultBranchHead: CommitSha;
  readonly openPullRequests: readonly {
    readonly number: number;
    readonly baseSha: CommitSha;
    readonly headSha: CommitSha;
  }[];
}

export interface ReconciliationState {
  readonly repositoryId: RepositoryStableId;
  readonly selected: boolean;
  readonly defaultBranchHead?: CommitSha;
  readonly pullRequestHeads: Readonly<Record<number, CommitSha>>;
}

export interface ReconciliationAction {
  readonly kind:
    | 'sync_scope'
    | 'index_default_branch'
    | 'analyze_pull_request'
    | 'purge_repository';
  readonly repositoryId: RepositoryStableId;
  readonly pullRequestNumber?: number;
  readonly baseSha?: CommitSha;
  readonly headSha?: CommitSha;
}

export function reconcileGitHubState(
  provider: readonly ProviderRepositoryState[],
  persisted: readonly ReconciliationState[],
): readonly ReconciliationAction[] {
  const actions: ReconciliationAction[] = [];
  const persistedByRepository = new Map(persisted.map((value) => [value.repositoryId, value]));
  for (const current of provider) {
    const previous = persistedByRepository.get(current.repositoryId);
    if (!current.selected && previous?.selected) {
      actions.push({ kind: 'purge_repository', repositoryId: current.repositoryId });
      continue;
    }
    if (current.selected !== previous?.selected) {
      actions.push({ kind: 'sync_scope', repositoryId: current.repositoryId });
    }
    if (current.selected && current.defaultBranchHead !== previous?.defaultBranchHead) {
      actions.push({
        kind: 'index_default_branch',
        repositoryId: current.repositoryId,
        headSha: current.defaultBranchHead,
      });
    }
    for (const pullRequest of current.openPullRequests) {
      if (previous?.pullRequestHeads[pullRequest.number] !== pullRequest.headSha) {
        actions.push({
          kind: 'analyze_pull_request',
          repositoryId: current.repositoryId,
          pullRequestNumber: pullRequest.number,
          baseSha: pullRequest.baseSha,
          headSha: pullRequest.headSha,
        });
      }
    }
  }
  return actions.sort((left, right) =>
    `${left.repositoryId}:${left.kind}:${left.pullRequestNumber ?? 0}`.localeCompare(
      `${right.repositoryId}:${right.kind}:${right.pullRequestNumber ?? 0}`,
    ),
  );
}
