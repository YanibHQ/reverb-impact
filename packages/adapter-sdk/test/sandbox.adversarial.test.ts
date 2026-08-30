import { contentHash } from '@yanibhq/reverb-domain';
import { describe, expect, it } from 'vitest';

import {
  AdapterValidationError,
  DeclaredExternalDiffer,
  type AdapterSandboxRequest,
  type AdapterSandboxRunner,
  type ExternalToolDeclaration,
} from '../src/index.js';

const tool: ExternalToolDeclaration = {
  id: 'fixture',
  version: '1.0.0',
  digest: contentHash(`sha256:${'a'.repeat(64)}`),
  license: 'Apache-2.0',
  network: false,
};

function differ(
  response: Awaited<ReturnType<AdapterSandboxRunner['run']>>,
  capture: AdapterSandboxRequest[] = [],
) {
  const sandbox: AdapterSandboxRunner = {
    async run(request) {
      capture.push(request);
      return response;
    },
  };
  return new DeclaredExternalDiffer(tool, sandbox, {
    timeoutMs: 100,
    memoryMiB: 64,
    maximumOutputBytes: 1024,
    exitMap: { compatible: [0], breaking: [100], unknown: [2] },
    category: 'fixture',
  });
}

const good = `blob:sha256:${'b'.repeat(64)}`;

describe('external differ sandbox boundary', () => {
  it('passes argv structurally with no shell, network, writable input, or ambient environment', async () => {
    const requests: AdapterSandboxRequest[] = [];
    const result = await differ(
      {
        ok: true,
        value: {
          exitCode: 0,
          stdout: new TextEncoder().encode('{}'),
          stderrCode: null,
          timedOut: false,
          outputTruncated: false,
        },
      },
      requests,
    ).run(['breaking', '/inputs/head; touch /tmp/pwned'], [good]);
    expect(result.state).toBe('compatible');
    expect(requests[0]).toMatchObject({
      argv: ['breaking', '/inputs/head; touch /tmp/pwned'],
      network: false,
      readOnlyInputs: true,
      scratchOutput: true,
      environment: {},
    });
  });

  it.each(['../../secret', 'https://example.test/schema', 'blob:sha256:not-a-hash'])(
    'rejects an unsafe differ input reference: %s',
    async (reference) => {
      await expect(
        differ({
          ok: false,
          failure: { kind: 'x', code: 'x', safeMessage: 'x', retryable: false },
        }).run(['diff'], [reference]),
      ).rejects.toThrow(AdapterValidationError);
    },
  );

  it('maps timeout, truncation, and unmapped exits to tool failure', async () => {
    const base = {
      exitCode: 7,
      stdout: new Uint8Array(),
      stderrCode: null,
      timedOut: false,
      outputTruncated: false,
    };
    await expect(
      differ({ ok: true, value: { ...base, timedOut: true } }).run(['diff'], [good]),
    ).resolves.toMatchObject({ state: 'tool_failure', failureCode: 'tool_timeout' });
    await expect(
      differ({ ok: true, value: { ...base, outputTruncated: true } }).run(['diff'], [good]),
    ).resolves.toMatchObject({ state: 'tool_failure', failureCode: 'tool_output_truncated' });
    await expect(differ({ ok: true, value: base }).run(['diff'], [good])).resolves.toMatchObject({
      state: 'tool_failure',
      failureCode: 'unmapped_tool_exit',
    });
  });
});
