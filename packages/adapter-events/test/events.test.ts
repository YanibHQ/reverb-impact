import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import type { ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import {
  EVENTS_ADAPTER_MANIFEST,
  EVENTS_ADMISSION_REPORT,
  eventAdapter,
  eventDestinationKey,
  eventPayloadSchemaKey,
} from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'7'.repeat(64)}`);

function artifact(path: string, text: string): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'source',
  };
}

function eventManifest(bindings: string): string {
  return `
schema: reverb.events
schemaVersion: '1.0'
${bindings.trim().length === 0 ? 'bindings: []' : `bindings:\n${bindings}`}
`;
}

const producerBinding = `
  - role: producer
    provider: kafka
    brokerNamespace: prod-cluster
    destination: orders.created
    destinationKind: topic
    delivery: at_least_once
    ordering: partition_ordered
    payloadSchema:
      id: order-created-v1
      schema:
        type: object
        required: [id]
        properties:
          id: { type: string }
          note: { type: string }
`;

const consumerBinding = `
  - role: consumer
    provider: kafka
    brokerNamespace: prod-cluster
    destination: orders.created
    destinationKind: topic
    payloadSchema:
      id: order-created-v1
`;

describe('event and queue adapter', () => {
  it('joins manifest producers and consumers through exact destination and payload identities', async () => {
    const result = await eventAdapter.extract({
      artifacts: [
        artifact('producer/events.yaml', eventManifest(producerBinding)),
        artifact('consumer/events.yaml', eventManifest(consumerBinding)),
      ],
      configRevision: revision,
      context: {},
    });
    const destinationKey = eventDestinationKey({
      provider: 'kafka',
      brokerNamespace: 'prod-cluster',
      destinationKind: 'topic',
      destination: 'orders.created',
    });
    expect(result.coverage).toMatchObject({ state: 'complete', eligibleArtifacts: 2 });
    expect(result.definitions.map((value) => value.canonicalKey)).toEqual([
      destinationKey,
      eventPayloadSchemaKey({ destinationKey, schemaId: 'order-created-v1' }),
    ]);
    expect(result.references.map((value) => value.canonicalKey)).toEqual([
      destinationKey,
      eventPayloadSchemaKey({ destinationKey, schemaId: 'order-created-v1' }),
    ]);
    expect(result.definitions.every((value) => value.extractionVersion === '1')).toBe(true);
  });

  it('extracts literal Kafka, SQS, SNS, and Pub/Sub backend bindings without network access', async () => {
    const result = await eventAdapter.extract({
      artifacts: [
        artifact(
          'src/bindings.ts',
          `
kafka.send({ topic: 'orders.created', messages: [] });
kafka.subscribe({ topic: 'orders.created' });
new SendMessageCommand({ QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456/orders' });
new ReceiveMessageCommand({ QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456/orders' });
new PublishCommand({ TopicArn: 'arn:aws:sns:us-east-1:123456:orders' });
new SubscribeCommand({ TopicArn: 'arn:aws:sns:us-east-1:123456:orders' });
pubsub.topic('orders').publishMessage({ json: event });
pubsub.topic('orders').subscription('worker');
`,
        ),
      ],
      configRevision: revision,
      context: {
        brokerNamespaces: { kafka: 'prod-cluster', gcp_pubsub: 'project-prod' },
      },
    });
    expect(result.coverage.state).toBe('complete');
    expect(result.definitions).toHaveLength(4);
    expect(result.references).toHaveLength(4);
    expect(new Set(result.definitions.map((value) => value.canonicalKey))).toEqual(
      new Set(result.references.map((value) => value.canonicalKey)),
    );
  });

  it('classifies removed fields and destinations as breaking', async () => {
    const base = await eventAdapter.extract({
      artifacts: [artifact('events.yaml', eventManifest(producerBinding))],
      configRevision: revision,
      context: {},
    });
    const head = await eventAdapter.extract({
      artifacts: [
        artifact(
          'events.yaml',
          eventManifest(producerBinding.replace('          note: { type: string }\n', '')),
        ),
      ],
      configRevision: revision,
      context: {},
    });
    const changed = await eventAdapter.diff({ base, head, configRevision: revision, context: {} });
    expect(changed.changes).toContainEqual(
      expect.objectContaining({
        contractKind: 'event.payload_schema',
        changeKind: 'payload_schema_changed',
        compatibility: 'breaking',
      }),
    );

    const empty = await eventAdapter.extract({
      artifacts: [artifact('events.yaml', eventManifest(''))],
      configRevision: revision,
      context: {},
    });
    const removed = await eventAdapter.diff({
      base,
      head: empty,
      configRevision: revision,
      context: {},
    });
    expect(removed.changes).toContainEqual(
      expect.objectContaining({
        contractKind: 'event.destination',
        changeKind: 'destination_removed',
        compatibility: 'breaking',
      }),
    );
  });

  it('keeps dynamic destinations unresolved, bounded, and partial', async () => {
    const secretExpression = 'process.env.SECRET_TOPIC';
    const input = artifact(
      'events.yaml',
      eventManifest(`
  - role: consumer
    provider: kafka
    brokerNamespace: prod-cluster
    destinationExpression: ${secretExpression}
`),
    );
    const result = await eventAdapter.extract({
      artifacts: [input],
      configRevision: revision,
      context: {},
    });
    const partitioned = await eventAdapter.buildPartitions({
      artifacts: [input],
      configRevision: revision,
      context: {},
    });
    expect(result.coverage).toMatchObject({
      state: 'partial',
      limitations: [{ code: 'dynamic_destination' }],
    });
    expect(result.references[0]).toMatchObject({ unresolvedReason: 'dynamic_destination' });
    expect(JSON.stringify(result)).not.toContain(secretExpression);
    expect(JSON.stringify(partitioned)).not.toContain(secretExpression);
  });

  it('keeps mixed literal and dynamic source bindings explicitly partial', async () => {
    const result = await eventAdapter.extract({
      artifacts: [
        artifact('src/literal.ts', "kafka.send({ topic: 'orders.created', messages: [] });"),
        artifact('src/dynamic.ts', 'kafka.send({ topic: topicFromEnvironment, messages: [] });'),
      ],
      configRevision: revision,
      context: { brokerNamespaces: { kafka: 'prod-cluster' } },
    });
    expect(result.definitions).toHaveLength(1);
    expect(result.coverage).toMatchObject({
      state: 'partial',
      eligibleArtifacts: 2,
      processedArtifacts: 2,
      limitations: [{ code: 'unresolved_source_binding', scope: 'src/dynamic.ts' }],
    });
  });

  it('keeps the new package non-deliverable until measured admission', () => {
    expect(EVENTS_ADAPTER_MANIFEST).toMatchObject({
      schemaVersion: '2.0',
      family: 'events',
      externalTools: [],
    });
    expect(EVENTS_ADMISSION_REPORT).toMatchObject({
      promotionState: 'UNMEASURED',
      deliveryReady: false,
      realLabelledCorpusState: 'absent',
    });
  });
});
