import { pnpmExecFileSync } from './run-pnpm.mjs';

const output = pnpmExecFileSync(['licenses', 'list', '--json', '--prod'], {
  encoding: 'utf8',
});
const inventory = JSON.parse(output);
const denied = /\b(AGPL|SSPL|BUSL|BSL|UNKNOWN|UNLICENSED)\b/i;
const failures = [];

function visit(value, path = []) {
  if (
    typeof value === 'string' &&
    path.at(-1)?.toLowerCase().includes('license') &&
    denied.test(value)
  ) {
    failures.push(`${path.join('.')}: ${value}`);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, [...path, String(index)]));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
  }
}

visit(inventory);
if (failures.length > 0) {
  process.stderr.write(
    `Forbidden or unknown production dependency licenses:\n${failures.join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write('Production dependency licenses satisfy the default policy.\n');
}
