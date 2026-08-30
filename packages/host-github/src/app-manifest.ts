export const GITHUB_APP_MANIFEST = Object.freeze({
  name: 'Reverb Impact',
  url: 'https://github.com/YanibHQ/reverb-impact',
  hook_attributes: { active: true },
  redirect_url: 'https://reverb.invalid/v1/github/setup',
  public: false,
  default_permissions: {
    metadata: 'read',
    contents: 'read',
    pull_requests: 'read',
    checks: 'write',
  },
  default_events: [
    'installation',
    'installation_repositories',
    'push',
    'pull_request',
    'check_run',
  ],
} as const);

export const OPTIONAL_GITHUB_APP_PERMISSIONS = Object.freeze({ members: 'read' } as const);

export const FORBIDDEN_GITHUB_APP_PERMISSIONS = Object.freeze([
  'issues',
  'administration',
  'actions',
  'secrets',
  'workflows',
  'deployments',
  'contents:write',
] as const);

export function validateGitHubAppManifest(): void {
  const permissions = GITHUB_APP_MANIFEST.default_permissions;
  if (
    permissions.metadata !== 'read' ||
    permissions.contents !== 'read' ||
    permissions.pull_requests !== 'read' ||
    permissions.checks !== 'write'
  ) {
    throw new Error('GitHub App manifest does not match the minimum permission contract.');
  }
  const serialized = JSON.stringify(permissions);
  if (FORBIDDEN_GITHUB_APP_PERMISSIONS.some((permission) => serialized.includes(permission))) {
    throw new Error('GitHub App manifest requests a forbidden permission.');
  }
}
