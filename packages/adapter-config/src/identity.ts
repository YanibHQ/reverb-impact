import { createHmac } from 'node:crypto';

import { canonicalContractKey } from '@yanib/reverb-adapter-sdk';

export function configurationKey(input: {
  readonly configurationNamespace: string;
  readonly key: string;
}): string {
  return canonicalContractKey('configuration-key-v1', [
    { name: 'Configuration namespace', value: input.configurationNamespace },
    { name: 'Key', value: input.key },
  ]);
}

export function featureFlagKey(input: {
  readonly configurationNamespace: string;
  readonly key: string;
}): string {
  return canonicalContractKey('configuration-feature-flag-v1', [
    { name: 'Configuration namespace', value: input.configurationNamespace },
    { name: 'Flag', value: input.key },
  ]);
}

export function hashSecretReference(input: {
  readonly salt: string;
  readonly configurationNamespace: string;
  readonly provider: string;
  readonly identifier: string;
}): string {
  return `hmac-sha256:${createHmac('sha256', input.salt)
    .update(
      `${input.configurationNamespace.length}:${input.configurationNamespace}${input.provider.length}:${input.provider}${input.identifier.length}:${input.identifier}`,
    )
    .digest('hex')}`;
}

export function secretReferenceKey(input: {
  readonly configurationNamespace: string;
  readonly provider: string;
  readonly identifierHash: string;
}): string {
  return canonicalContractKey('configuration-secret-reference-v1', [
    { name: 'Configuration namespace', value: input.configurationNamespace },
    { name: 'Provider', value: input.provider },
    { name: 'Salted identifier hash', value: input.identifierHash },
  ]);
}
