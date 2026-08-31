import { canonicalContractKey } from '@yanib/reverb-adapter-sdk';

const PATH_PARAMETER = /\{[^{}]+\}/g;

export function normalizeOpenApiPath(value: string): string {
  const normalized = value
    .trim()
    .replace(/\/{2,}/g, '/')
    .replace(PATH_PARAMETER, '{}');
  return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

export function openApiOperationKey(serviceId: string, operationId: string): string {
  return canonicalContractKey('openapi', [
    { name: 'Service ID', value: serviceId },
    { name: 'Operation ID', value: operationId },
  ]);
}

export function openApiFallbackKey(serviceId: string, method: string, path: string): string {
  return canonicalContractKey('openapi-path', [
    { name: 'Service ID', value: serviceId },
    { name: 'HTTP method', value: method.toLowerCase() },
    { name: 'OpenAPI path', value: normalizeOpenApiPath(path) },
  ]);
}
