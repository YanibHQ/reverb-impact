import { execFileSync } from 'node:child_process';

/** Execute pnpm without assuming that a POSIX-style executable shim exists. */
export function pnpmExecFileSync(args, options = {}) {
  const lifecycleEntrypoint = process.env.npm_execpath;
  if (lifecycleEntrypoint) {
    return execFileSync(process.execPath, [lifecycleEntrypoint, ...args], options);
  }
  if (process.platform === 'win32') {
    return execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm', ...args], {
      ...options,
      windowsHide: true,
    });
  }
  return execFileSync('pnpm', args, options);
}
