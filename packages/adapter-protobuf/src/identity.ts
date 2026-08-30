import { canonicalContractKey } from '@yanibhq/reverb-adapter-sdk';

function qualified(packageName: string, declaration: string): string {
  return packageName.trim().length === 0 ? declaration : `${packageName}.${declaration}`;
}

export function protobufMethodKey(
  packageName: string,
  serviceName: string,
  methodName: string,
): string {
  return canonicalContractKey('protobuf-method', [
    { name: 'Qualified service', value: qualified(packageName, serviceName) },
    { name: 'Method', value: methodName },
  ]);
}

export function protobufFieldWireKey(
  packageName: string,
  messageName: string,
  fieldNumber: number | string,
): string {
  return canonicalContractKey('protobuf-field', [
    { name: 'Qualified message', value: qualified(packageName, messageName) },
    { name: 'Field wire number', value: String(fieldNumber) },
  ]);
}

export function protobufFieldNameFallbackKey(
  packageName: string,
  messageName: string,
  fieldName: string,
): string {
  return canonicalContractKey('protobuf-field-name', [
    { name: 'Qualified message', value: qualified(packageName, messageName) },
    { name: 'Field name', value: fieldName },
  ]);
}
