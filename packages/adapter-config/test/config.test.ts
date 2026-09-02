import {
  canonicalJson,
  configRevision,
  contentHash,
  repoPath,
  sha256Bytes,
} from '@yanib/reverb-domain';
import type { ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import {
  CONFIG_ADAPTER_MANIFEST,
  configAdapter,
  configurationKey,
  featureFlagKey,
} from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'6'.repeat(64)}`);
const context = {
  configurationNamespace: 'production/billing',
  secretIdentitySalt: 'fixture-only-secret-salt',
} as const;
function artifact(
  path: string,
  text: string,
  classification: ArtifactInput['classification'] = 'source',
): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification,
  };
}

describe('configuration adapter', () => {
  it('joins value-free environment definitions to literal environment reads', async () => {
    const result = await configAdapter.extract({
      artifacts: [
        artifact('.env.example', 'API_ORIGIN=https://placeholder.invalid\n'),
        artifact('src/config.ts', 'const origin = process.env.API_ORIGIN;'),
      ],
      configRevision: revision,
      context,
    });
    const key = configurationKey({
      configurationNamespace: 'production/billing',
      key: 'API_ORIGIN',
    });
    expect(result.coverage.state).toBe('complete');
    expect(result.definitions).toContainEqual(expect.objectContaining({ canonicalKey: key }));
    expect(result.references).toContainEqual(expect.objectContaining({ canonicalKey: key }));
    expect(canonicalJson(result)).not.toContain('https://placeholder.invalid');
  });

  it('extracts feature-flag definitions and reads with runtime activation', async () => {
    const result = await configAdapter.extract({
      artifacts: [
        artifact(
          'src/flags.ts',
          "defineFeatureFlag('new-checkout'); flags.isEnabled('new-checkout');",
        ),
      ],
      configRevision: revision,
      context,
    });
    const key = featureFlagKey({
      configurationNamespace: 'production/billing',
      key: 'new-checkout',
    });
    expect(result.definitions[0]).toMatchObject({
      canonicalKey: key,
      activation: 'current_runtime',
    });
    expect(result.references[0]).toMatchObject({
      canonicalKey: key,
      activation: 'current_runtime',
    });
  });

  it('hashes secret identifiers before extraction or partition persistence', async () => {
    const secretIdentifier = 'payments/production/api-key';
    const input = artifact(
      'src/secrets.ts',
      `defineSecretReference('aws-secrets-manager', '${secretIdentifier}'); secrets.get('aws-secrets-manager', '${secretIdentifier}');`,
    );
    const result = await configAdapter.extract({
      artifacts: [input],
      configRevision: revision,
      context,
    });
    const built = await configAdapter.buildPartitions({
      artifacts: [input],
      configRevision: revision,
      context,
    });
    expect(result.coverage.state).toBe('complete');
    expect(result.definitions[0]?.canonicalKey).toBe(result.references[0]?.canonicalKey);
    expect(canonicalJson(result)).not.toContain(secretIdentifier);
    expect(canonicalJson(built.partitions[0]?.payload)).not.toContain(secretIdentifier);
    expect(canonicalJson(built.partitions[0]?.payload)).toContain('hmac-sha256:');
  });

  it('treats recognized secret-bearing environment keys as hashed references', async () => {
    const keyName = 'DATABASE_PASSWORD';
    const input = artifact('.env.example', `${keyName}=placeholder-that-must-not-be-retained\n`);
    const reader = artifact('src/config.ts', `const password = process.env.${keyName};`);
    const built = await configAdapter.buildPartitions({
      artifacts: [input, reader],
      configRevision: revision,
      context,
    });
    const serialized = canonicalJson(built);
    expect(serialized).not.toContain(keyName);
    expect(serialized).not.toContain('placeholder-that-must-not-be-retained');
    expect(serialized).toContain('hmac-sha256:');
  });

  it('excludes value-bearing environment files before parsing', async () => {
    const secretValue = 'never-persist-this-value';
    const result = await configAdapter.extract({
      artifacts: [artifact('.env', `API_TOKEN=${secretValue}`)],
      configRevision: revision,
      context,
    });
    expect(result.coverage).toMatchObject({
      state: 'partial',
      limitations: [expect.objectContaining({ code: 'sensitive_configuration_values_excluded' })],
    });
    expect(canonicalJson(result)).not.toContain(secretValue);
  });

  it('reports missing namespace, missing salt, computed keys, and generated sources', async () => {
    const input = artifact(
      'src/config.ts',
      "defineSecretReference('vault', 'billing/token'); process.env[key]; flags.get(flagName);",
    );
    const result = await configAdapter.extract({
      artifacts: [input, artifact('src/generated.ts', "defineConfigKey('A');", 'generated')],
      configRevision: revision,
      context: {},
    });
    expect(result.coverage.state).toBe('partial');
    expect(result.coverage.limitations.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'configuration_namespace_missing',
        'secret_identity_salt_missing',
        'computed_configuration_key',
        'generated_configuration_excluded',
      ]),
    );
  });

  it('classifies key and flag removals as breaking when coverage is complete', async () => {
    const base = await configAdapter.extract({
      artifacts: [
        artifact(
          'src/defs.ts',
          "defineConfigKey('A'); defineConfigKey('B'); defineFeatureFlag('flag-a');",
        ),
      ],
      configRevision: revision,
      context,
    });
    const head = await configAdapter.extract({
      artifacts: [artifact('src/defs.ts', "defineConfigKey('B');")],
      configRevision: revision,
      context,
    });
    const diff = await configAdapter.diff({ base, head, configRevision: revision, context });
    expect(diff.changes.filter((item) => item.compatibility === 'breaking')).toHaveLength(2);
  });

  it('declares no provider tools and remains unmeasured', () => {
    expect(CONFIG_ADAPTER_MANIFEST).toMatchObject({
      family: 'configuration',
      externalTools: [],
      evidenceStrata: expect.arrayContaining([
        expect.objectContaining({ promotionState: 'UNMEASURED' }),
      ]),
    });
  });
});
