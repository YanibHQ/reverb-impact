import { parseDocument } from 'yaml';

import {
  EVENT_DESTINATION_KINDS,
  EVENT_PROVIDERS,
  type EventDestinationKind,
  type EventProvider,
} from './identity.js';

export interface EventPayloadSchema {
  readonly id: string;
  readonly schema?: Readonly<Record<string, unknown>>;
}

export interface EventBinding {
  readonly role: 'producer' | 'consumer';
  readonly provider: EventProvider;
  readonly brokerNamespace?: string;
  readonly destinationKind: EventDestinationKind;
  readonly destination?: string;
  readonly destinationExpression?: string;
  readonly payloadSchema?: EventPayloadSchema;
  readonly delivery?: 'at_most_once' | 'at_least_once' | 'exactly_once' | 'unknown';
  readonly ordering?: 'ordered' | 'unordered' | 'partition_ordered' | 'unknown';
}

export interface EventManifestDocument {
  readonly bindings: readonly EventBinding[];
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bounded(value: unknown, name: string, maximum = 512): string {
  if (typeof value !== 'string') throw new Error(`invalid_${name}`);
  const normalized = value.normalize('NFC').trim();
  if (normalized.length === 0 || normalized.length > maximum || normalized.includes('\0')) {
    throw new Error(`invalid_${name}`);
  }
  return normalized;
}

function optionalBounded(value: unknown, name: string): string | undefined {
  return value === undefined ? undefined : bounded(value, name);
}

function member<Value extends string>(
  value: unknown,
  values: readonly Value[],
  name: string,
): Value {
  if (typeof value !== 'string' || !values.includes(value as Value)) {
    throw new Error(`invalid_${name}`);
  }
  return value as Value;
}

const SCHEMA_KEYS = new Set([
  'type',
  'format',
  'properties',
  'required',
  'items',
  'additionalProperties',
  'enum',
  'oneOf',
  'anyOf',
  'allOf',
]);

function normalizeSchema(value: unknown, budget: { remaining: number }): unknown {
  budget.remaining -= 1;
  if (budget.remaining < 0) throw new Error('schema_item_limit');
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return bounded(value, 'schema_value', 2_048);
  if (Array.isArray(value)) return value.map((item) => normalizeSchema(item, budget));
  if (!record(value)) throw new Error('invalid_payload_schema');
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (!SCHEMA_KEYS.has(key)) continue;
    if (key === 'properties') {
      if (!record(value[key])) throw new Error('invalid_payload_schema_properties');
      const properties: Record<string, unknown> = {};
      for (const propertyName of Object.keys(value[key]).sort()) {
        const name = bounded(propertyName, 'schema_property', 512);
        properties[name] = normalizeSchema(value[key][propertyName], budget);
      }
      normalized[key] = properties;
    } else {
      normalized[key] = normalizeSchema(value[key], budget);
    }
  }
  return normalized;
}

function payloadSchema(value: unknown, maximumItems: number): EventPayloadSchema | undefined {
  if (value === undefined) return undefined;
  if (!record(value)) throw new Error('invalid_payload_schema');
  const id = bounded(value.id, 'payload_schema_id');
  if (value.schema === undefined) return { id };
  const schema = normalizeSchema(value.schema, { remaining: maximumItems });
  if (!record(schema)) throw new Error('invalid_payload_schema');
  return { id, schema };
}

function binding(value: unknown, maximumItems: number): EventBinding {
  if (!record(value)) throw new Error('invalid_event_binding');
  const role = member(value.role, ['producer', 'consumer'] as const, 'binding_role');
  const provider = member(value.provider, EVENT_PROVIDERS, 'event_provider');
  const defaultKind =
    provider === 'aws_sqs'
      ? 'queue'
      : provider === 'gcp_pubsub' && role === 'consumer'
        ? 'subscription'
        : 'topic';
  const destinationKind =
    value.destinationKind === undefined
      ? defaultKind
      : member(value.destinationKind, EVENT_DESTINATION_KINDS, 'destination_kind');
  const destination = optionalBounded(value.destination, 'destination');
  const destinationExpression = optionalBounded(
    value.destinationExpression,
    'destination_expression',
  );
  if ((destination === undefined) === (destinationExpression === undefined)) {
    throw new Error('destination_must_be_literal_or_expression');
  }
  const brokerNamespace = optionalBounded(value.brokerNamespace, 'broker_namespace');
  const delivery =
    value.delivery === undefined
      ? undefined
      : member(
          value.delivery,
          ['at_most_once', 'at_least_once', 'exactly_once', 'unknown'] as const,
          'delivery',
        );
  const ordering =
    value.ordering === undefined
      ? undefined
      : member(
          value.ordering,
          ['ordered', 'unordered', 'partition_ordered', 'unknown'] as const,
          'ordering',
        );
  const parsedPayloadSchema = payloadSchema(value.payloadSchema, maximumItems);
  return {
    role,
    provider,
    destinationKind,
    ...(brokerNamespace === undefined ? {} : { brokerNamespace }),
    ...(destination === undefined ? {} : { destination }),
    ...(destinationExpression === undefined ? {} : { destinationExpression }),
    ...(parsedPayloadSchema === undefined ? {} : { payloadSchema: parsedPayloadSchema }),
    ...(delivery === undefined ? {} : { delivery }),
    ...(ordering === undefined ? {} : { ordering }),
  };
}

export function parseEventManifest(
  text: string,
  maximumItems: number,
): EventManifestDocument | null {
  const probable = /(?:^|\n)\s*["']?schema["']?\s*:\s*["']?reverb\.events["']?/.test(text);
  let value: unknown;
  try {
    const parsed = parseDocument(text, { prettyErrors: false, strict: true, uniqueKeys: true });
    if (parsed.errors.length > 0) throw new Error('invalid_event_manifest');
    value = parsed.toJS({ maxAliasCount: 0 });
  } catch (error) {
    if (probable) throw error;
    return null;
  }
  if (!record(value) || value.schema !== 'reverb.events') return null;
  if (value.schemaVersion !== '1.0' || !Array.isArray(value.bindings)) {
    throw new Error('unsupported_event_manifest');
  }
  if (value.bindings.length > maximumItems) throw new Error('event_binding_limit');
  return { bindings: value.bindings.map((item) => binding(item, maximumItems)) };
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return record(value);
}
