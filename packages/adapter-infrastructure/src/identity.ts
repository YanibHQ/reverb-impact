import { canonicalContractKey } from '@yanib/reverb-adapter-sdk';

export type InfrastructureIdentityKind = 'service' | 'workload' | 'container';
export function infrastructureServiceKey(input: {
  readonly environment: string;
  readonly serviceScope: string;
  readonly serviceName: string;
  readonly identityKind?: InfrastructureIdentityKind;
}): string {
  return canonicalContractKey('infrastructure-service-v1', [
    { name: 'Environment', value: input.environment },
    { name: 'Service scope', value: input.serviceScope },
    { name: 'Identity kind', value: input.identityKind ?? 'service' },
    { name: 'Service name', value: input.serviceName },
  ]);
}
export function infrastructureEndpointKey(input: {
  readonly serviceKey: string;
  readonly port: string;
  readonly protocol: string;
}): string {
  return canonicalContractKey('infrastructure-endpoint-v1', [
    { name: 'Service identity', value: input.serviceKey },
    { name: 'Port', value: input.port },
    { name: 'Protocol', value: input.protocol.toUpperCase() },
  ]);
}
export function infrastructureOutputKey(input: {
  readonly environment: string;
  readonly serviceScope: string;
  readonly outputName: string;
}): string {
  return canonicalContractKey('infrastructure-output-v1', [
    { name: 'Environment', value: input.environment },
    { name: 'Service scope', value: input.serviceScope },
    { name: 'Output', value: input.outputName },
  ]);
}
