import { describe, it } from 'vitest';

import {
  InMemoryEvidenceGraphStore,
  InMemoryGenerationStore,
  runEvidenceGraphStoreConformance,
  runGenerationStoreConformance,
  runReviewStoreConformance,
} from '../src/index.js';
import type { EvidenceGraphStore, GenerationStore } from '@yanibhq/reverb-application';

describe('in-memory generation store conformance', () => {
  it('passes lifecycle, atomicity, selection, and overlay cases', async () => {
    await runGenerationStoreConformance(() => ({
      store: new InMemoryGenerationStore(),
      close() {},
    }));
  });
});

describe('in-memory review store conformance', () => {
  it('passes append, supersession, suppression, and audit cases', async () => {
    await runReviewStoreConformance(() => ({
      store: new InMemoryEvidenceGraphStore(),
      close() {},
    }));
  });
});

describe('in-memory evidence graph store conformance', () => {
  it('passes temporal observation, query, invalidation, and supersession cases', async () => {
    await runEvidenceGraphStoreConformance(() => {
      const generations = new InMemoryGenerationStore();
      const evidence = new InMemoryEvidenceGraphStore();
      const store = new Proxy(generations as GenerationStore & EvidenceGraphStore, {
        get(target, property) {
          const owner = property in target ? target : evidence;
          const value = Reflect.get(owner, property, owner) as unknown;
          return typeof value === 'function' ? value.bind(owner) : value;
        },
      });
      return {
        store,
        close: () => undefined,
      };
    });
  });
});
