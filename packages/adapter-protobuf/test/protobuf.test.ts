import { configRevision, contentHash, repoPath, sha256Bytes } from '@yanib/reverb-domain';
import type { AdapterSandboxRunner, ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import {
  PROTOBUF_ADMISSION_REPORT,
  protobufAdapter,
  protobufFieldWireKey,
  protobufMethodKey,
} from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'8'.repeat(64)}`);

function artifact(value: unknown, path = 'descriptor.payload'): ArtifactInput {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification: 'generated',
  };
}

function descriptor(
  field: Readonly<Record<string, unknown>> = { name: 'id', number: 1, type: 'TYPE_STRING' },
) {
  return {
    file: [
      {
        name: 'pet/v1/pet.proto',
        package: 'pet.v1',
        service: [
          {
            name: 'PetService',
            method: [
              { name: 'GetPet', inputType: '.pet.v1.GetPetRequest', outputType: '.pet.v1.Pet' },
            ],
          },
        ],
        messageType: [
          {
            name: 'Pet',
            field: [field],
            reservedRange: [{ start: 9, end: 10 }],
            reservedName: ['legacy_id'],
            nestedType: [
              { name: 'Tag', field: [{ name: 'value', number: 1, type: 'TYPE_STRING' }] },
            ],
          },
        ],
      },
    ],
  };
}

function sandbox(exitCode: number): AdapterSandboxRunner {
  return {
    async run() {
      return {
        ok: true,
        value: {
          exitCode,
          stdout: new Uint8Array(),
          stderrCode: null,
          timedOut: false,
          outputTruncated: false,
        },
      };
    },
  };
}

async function extract(value: unknown) {
  return protobufAdapter.extract({
    artifacts: [artifact(value)],
    configRevision: revision,
    context: {
      generatedStubBindings: [
        {
          kind: 'method',
          packageName: 'pet.v1',
          declaration: 'PetService',
          member: 'GetPet',
          path: 'generated/pet.ts',
        },
        {
          kind: 'field',
          packageName: 'pet.v1',
          declaration: 'Pet',
          member: 'id',
          fieldNumber: 1,
          path: 'generated/pet.ts',
        },
      ],
    },
  });
}

describe('Protobuf adapter', () => {
  it('extracts descriptor methods, wire fields, nested fields, and generated-stub references', async () => {
    const result = await extract(descriptor());
    expect(result.coverage.state).toBe('complete');
    expect(result.definitions.map((value) => value.canonicalKey)).toEqual([
      protobufFieldWireKey('pet.v1', 'Pet.Tag', 1),
      protobufFieldWireKey('pet.v1', 'Pet', 1),
      protobufMethodKey('pet.v1', 'PetService', 'GetPet'),
    ]);
    expect(result.references.map((value) => value.canonicalKey)).toEqual([
      protobufFieldWireKey('pet.v1', 'Pet', 1),
      protobufMethodKey('pet.v1', 'PetService', 'GetPet'),
    ]);
  });

  it('does not parse raw proto text as a descriptor', async () => {
    const result = await extract('syntax = "proto3"; message Pet { string id = 1; }');
    expect(result.coverage.state).toBe('unsupported');
    expect(result.definitions).toEqual([]);
  });

  it('records a configured Buf category and maps a wire-compatible rename', async () => {
    const before = await extract(descriptor());
    const after = await extract(descriptor({ name: 'pet_id', number: 1, type: 'TYPE_STRING' }));
    const result = await protobufAdapter.diff({
      base: before,
      head: after,
      configRevision: revision,
      context: {
        sandbox: sandbox(0),
        baseBlobRef: `blob:sha256:${'9'.repeat(64)}`,
        headBlobRef: `blob:sha256:${'a'.repeat(64)}`,
        breakingCategory: 'WIRE',
      },
    });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      compatibility: 'compatible',
      activation: 'on_deploy',
      differ: { category: 'WIRE', toolVersion: '1.72.0', toolLicense: 'Apache-2.0' },
    });
  });

  it('maps a reused field number to breaking only when pinned Buf reports it', async () => {
    const before = await extract(descriptor());
    const after = await extract(descriptor({ name: 'count', number: 1, type: 'TYPE_INT64' }));
    const result = await protobufAdapter.diff({
      base: before,
      head: after,
      configRevision: revision,
      context: {
        sandbox: sandbox(100),
        baseBlobRef: `blob:sha256:${'b'.repeat(64)}`,
        headBlobRef: `blob:sha256:${'c'.repeat(64)}`,
        breakingCategory: 'WIRE_JSON',
      },
    });
    expect(result.changes[0]).toMatchObject({
      compatibility: 'breaking',
      differ: { category: 'WIRE_JSON' },
    });
  });

  it('represents reserved deletion separately and delegates category semantics to Buf', async () => {
    const before = await extract(descriptor());
    const after = await extract({
      file: [
        {
          package: 'pet.v1',
          messageType: [
            {
              name: 'Pet',
              field: [],
              reservedRange: [{ start: 1, end: 2 }],
              reservedName: ['id'],
            },
          ],
        },
      ],
    });
    const result = await protobufAdapter.diff({
      base: before,
      head: after,
      configRevision: revision,
      context: {
        sandbox: sandbox(0),
        baseBlobRef: `blob:sha256:${'d'.repeat(64)}`,
        headBlobRef: `blob:sha256:${'e'.repeat(64)}`,
        breakingCategory: 'WIRE',
      },
    });
    expect(result.changes).toContainEqual(
      expect.objectContaining({
        canonicalKey: protobufFieldWireKey('pet.v1', 'Pet', 1),
        changeKind: 'declaration_removed',
        compatibility: 'compatible',
        differ: expect.objectContaining({ category: 'WIRE' }),
      }),
    );
  });

  it('keeps admission synthetic and non-deliverable', () => {
    expect(PROTOBUF_ADMISSION_REPORT).toMatchObject({
      promotionState: 'UNMEASURED',
      deliveryReady: false,
      designPartner: 'none',
    });
  });
});
