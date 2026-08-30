import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { HOST_CONFORMANCE_VERSION } from '../packages/testkit/dist/index.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const path = resolve(root, 'docs/compatibility/host-capabilities.json');
const document = JSON.parse(await readFile(path, 'utf8'));

const fail = (message) => {
  throw new Error(`Invalid host capability declaration: ${message}`);
};

if (document.document_schema !== 'reverb.host-capability-declarations') fail('wrong schema');
if (document.schema_version !== '1.0') fail('wrong document schema version');
if (document.conformance_version !== HOST_CONFORMANCE_VERSION) {
  fail(`expected conformance ${HOST_CONFORMANCE_VERSION}`);
}
if (!Array.isArray(document.hosts) || document.hosts.length < 2)
  fail('at least two hosts required');

const hostIds = new Set();
for (const host of document.hosts) {
  if (typeof host.host_id !== 'string' || host.host_id.trim().length === 0) fail('missing host ID');
  if (hostIds.has(host.host_id)) fail(`duplicate host ID ${host.host_id}`);
  hostIds.add(host.host_id);
  if (!['durable', 'ephemeral'].includes(host.persistence)) {
    fail(`${host.host_id} has invalid persistence`);
  }
  if (!['local_git', 'github_exact_git', 'injected', 'none'].includes(host.source)) {
    fail(`${host.host_id} has invalid source`);
  }
  if (!['github_advisory', 'projection_only', 'none'].includes(host.external_delivery)) {
    fail(`${host.host_id} has invalid external delivery`);
  }
  for (const field of ['reviews', 'disclosure_projection', 'deletion_propagation']) {
    if (typeof host[field] !== 'boolean') fail(`${host.host_id} has invalid ${field}`);
  }
  if (!Array.isArray(host.unsupported_optional_ports)) {
    fail(`${host.host_id} must list unsupported optional ports`);
  }
}

process.stdout.write(
  `Host capabilities verified: ${document.hosts.length} hosts at conformance ${HOST_CONFORMANCE_VERSION}.\n`,
);
