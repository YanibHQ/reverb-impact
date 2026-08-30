export interface DescriptorMethod {
  readonly packageName: string;
  readonly serviceName: string;
  readonly methodName: string;
  readonly shape: Readonly<Record<string, unknown>>;
}

export interface DescriptorField {
  readonly packageName: string;
  readonly messageName: string;
  readonly fieldName: string;
  readonly fieldNumber: number;
  readonly shape: Readonly<Record<string, unknown>>;
}

export interface ParsedDescriptorSet {
  readonly methods: readonly DescriptorMethod[];
  readonly fields: readonly DescriptorField[];
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function list(
  object: Readonly<Record<string, unknown>>,
  camel: string,
  snake: string,
): readonly unknown[] {
  const value = object[camel] ?? object[snake];
  return Array.isArray(value) ? value : [];
}

function string(object: Readonly<Record<string, unknown>>, camel: string, snake = camel): string {
  const value = object[camel] ?? object[snake];
  return typeof value === 'string' ? value : '';
}

function boolean(object: Readonly<Record<string, unknown>>, camel: string, snake: string): boolean {
  return (object[camel] ?? object[snake]) === true;
}

function number(object: Readonly<Record<string, unknown>>, name: string): number | undefined {
  const value = object[name];
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function parseMessages(
  packageName: string,
  parents: readonly string[],
  rawMessages: readonly unknown[],
  fields: DescriptorField[],
  counter: { value: number },
  maximumItems: number,
): void {
  for (const rawMessage of rawMessages) {
    if (!record(rawMessage)) throw new Error('invalid_descriptor_message');
    const name = string(rawMessage, 'name');
    if (name.length === 0) throw new Error('invalid_descriptor_message_name');
    const messageName = [...parents, name].join('.');
    const reservedRanges = list(rawMessage, 'reservedRange', 'reserved_range');
    const reservedNames = list(rawMessage, 'reservedName', 'reserved_name');
    for (const rawField of list(rawMessage, 'field', 'field')) {
      if (!record(rawField)) throw new Error('invalid_descriptor_field');
      const fieldName = string(rawField, 'name');
      const fieldNumber = number(rawField, 'number');
      if (fieldName.length === 0 || fieldNumber === undefined)
        throw new Error('invalid_descriptor_field');
      counter.value += 1;
      if (counter.value > maximumItems) throw new Error('descriptor_item_limit');
      fields.push({
        packageName,
        messageName,
        fieldName,
        fieldNumber,
        shape: {
          name: fieldName,
          number: fieldNumber,
          type: rawField.type ?? null,
          typeName: string(rawField, 'typeName', 'type_name'),
          label: rawField.label ?? null,
          jsonName: string(rawField, 'jsonName', 'json_name'),
          proto3Optional: boolean(rawField, 'proto3Optional', 'proto3_optional'),
          oneofIndex: rawField.oneofIndex ?? rawField.oneof_index ?? null,
          messageReservedRanges: reservedRanges,
          messageReservedNames: reservedNames,
        },
      });
    }
    parseMessages(
      packageName,
      [...parents, name],
      list(rawMessage, 'nestedType', 'nested_type'),
      fields,
      counter,
      maximumItems,
    );
  }
}

export function parseDescriptorSetJson(
  text: string,
  maximumItems: number,
): ParsedDescriptorSet | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!record(value) || !Array.isArray(value.file)) return null;
  const methods: DescriptorMethod[] = [];
  const fields: DescriptorField[] = [];
  const counter = { value: 0 };
  for (const rawFile of value.file) {
    if (!record(rawFile)) throw new Error('invalid_file_descriptor');
    const packageName = string(rawFile, 'package');
    for (const rawService of list(rawFile, 'service', 'service')) {
      if (!record(rawService)) throw new Error('invalid_descriptor_service');
      const serviceName = string(rawService, 'name');
      if (serviceName.length === 0) throw new Error('invalid_descriptor_service_name');
      for (const rawMethod of list(rawService, 'method', 'method')) {
        if (!record(rawMethod)) throw new Error('invalid_descriptor_method');
        const methodName = string(rawMethod, 'name');
        if (methodName.length === 0) throw new Error('invalid_descriptor_method_name');
        counter.value += 1;
        if (counter.value > maximumItems) throw new Error('descriptor_item_limit');
        methods.push({
          packageName,
          serviceName,
          methodName,
          shape: {
            inputType: string(rawMethod, 'inputType', 'input_type'),
            outputType: string(rawMethod, 'outputType', 'output_type'),
            clientStreaming: boolean(rawMethod, 'clientStreaming', 'client_streaming'),
            serverStreaming: boolean(rawMethod, 'serverStreaming', 'server_streaming'),
          },
        });
      }
    }
    parseMessages(
      packageName,
      [],
      list(rawFile, 'messageType', 'message_type'),
      fields,
      counter,
      maximumItems,
    );
  }
  return {
    methods: methods.sort((left, right) =>
      `${left.packageName}\0${left.serviceName}\0${left.methodName}`.localeCompare(
        `${right.packageName}\0${right.serviceName}\0${right.methodName}`,
      ),
    ),
    fields: fields.sort((left, right) =>
      `${left.packageName}\0${left.messageName}\0${left.fieldNumber}`.localeCompare(
        `${right.packageName}\0${right.messageName}\0${right.fieldNumber}`,
      ),
    ),
  };
}
