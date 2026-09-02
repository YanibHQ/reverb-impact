import { canonicalContractKey } from '@yanib/reverb-adapter-sdk';

export const HTTP_METHODS = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export function httpRouteKey(input: {
  readonly serviceId: string;
  readonly method: HttpMethod;
  readonly routeTemplate: string;
}): string {
  return canonicalContractKey('http-route-v1', [
    { name: 'Service identity', value: input.serviceId },
    { name: 'Method', value: input.method },
    { name: 'Route template', value: input.routeTemplate },
  ]);
}
