import { canonicalContractKey } from '@yanib/reverb-adapter-sdk';

export const EVENT_PROVIDERS = ['kafka', 'aws_sqs', 'aws_sns', 'gcp_pubsub'] as const;
export type EventProvider = (typeof EVENT_PROVIDERS)[number];

export const EVENT_DESTINATION_KINDS = ['topic', 'queue', 'subscription'] as const;
export type EventDestinationKind = (typeof EVENT_DESTINATION_KINDS)[number];

export function eventDestinationKey(input: {
  readonly provider: EventProvider;
  readonly brokerNamespace: string;
  readonly destinationKind: EventDestinationKind;
  readonly destination: string;
}): string {
  return canonicalContractKey('event-destination-v1', [
    { name: 'Provider', value: input.provider },
    { name: 'Broker namespace', value: input.brokerNamespace },
    { name: 'Destination kind', value: input.destinationKind },
    { name: 'Destination', value: input.destination },
  ]);
}

export function eventPayloadSchemaKey(input: {
  readonly destinationKey: string;
  readonly schemaId: string;
}): string {
  return canonicalContractKey('event-payload-schema-v1', [
    { name: 'Destination identity', value: input.destinationKey },
    { name: 'Schema ID', value: input.schemaId },
  ]);
}
