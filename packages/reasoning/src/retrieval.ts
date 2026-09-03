import {
  assertScopedRepositoryRead,
  contentHash,
  hashCanonical,
  type IndexedContractChangeV2,
  type IndexedContractDefinitionV2,
  type IndexedContractReferenceV2,
  type ScopedReadCapability,
} from '@yanib/reverb-domain';

import type {
  ReasoningContextV1,
  ReasoningEvidenceHandleV1,
  RetrievedReasoningEvidenceV1,
} from './protocol.js';

function citationId(input: Omit<ReasoningEvidenceHandleV1, 'citationId'>): string {
  return `cit_${hashCanonical(input)}`;
}

export function planReasoningEvidenceV1(input: {
  readonly capability: ScopedReadCapability;
  readonly changes: readonly IndexedContractChangeV2[];
  readonly definitions: readonly IndexedContractDefinitionV2[];
  readonly references: readonly IndexedContractReferenceV2[];
  readonly maximumItems: number;
}): readonly ReasoningEvidenceHandleV1[] {
  const maximumItems = Math.max(0, input.maximumItems);
  if (maximumItems < 2) return [];
  const selectedChanges = input.changes.slice(0, maximumItems);
  for (const change of selectedChanges)
    assertScopedRepositoryRead(input.capability, change.workspaceId, change.producerRepositoryId);
  const changedKeys = new Set(selectedChanges.map((change) => change.canonicalKey));
  const producers: ReasoningEvidenceHandleV1[] = [];
  const consumers: ReasoningEvidenceHandleV1[] = [];
  for (const definition of input.definitions.slice(0, maximumItems)) {
    if (!changedKeys.has(definition.canonicalKey) || definition.range === undefined) continue;
    assertScopedRepositoryRead(input.capability, definition.workspaceId, definition.repositoryId);
    const handle = {
      origin: 'changed_definition' as const,
      side: 'producer' as const,
      workspaceId: definition.workspaceId,
      repositoryId: definition.repositoryId,
      generationId: definition.generationId,
      commitSha: definition.commitSha,
      path: definition.path,
      range: definition.range,
      contentHash: definition.contentHash,
    };
    producers.push({ ...handle, citationId: citationId(handle) });
  }
  for (const reference of input.references.slice(0, maximumItems)) {
    const related =
      (reference.canonicalKey !== undefined && changedKeys.has(reference.canonicalKey)) ||
      (reference.canonicalKey === undefined &&
        selectedChanges.some((change) => change.family === reference.family));
    if (!related || reference.range === undefined) continue;
    assertScopedRepositoryRead(input.capability, reference.workspaceId, reference.repositoryId);
    const handle = {
      origin: 'deterministic_neighbor' as const,
      side: 'consumer' as const,
      workspaceId: reference.workspaceId,
      repositoryId: reference.repositoryId,
      generationId: reference.generationId,
      commitSha: reference.commitSha,
      path: reference.path,
      range: reference.range,
      contentHash: reference.contentHash,
    };
    consumers.push({ ...handle, citationId: citationId(handle) });
  }
  const uniqueProducers = [
    ...new Map(producers.map((handle) => [handle.citationId, handle])).values(),
  ].sort((left, right) => left.citationId.localeCompare(right.citationId));
  const uniqueConsumers = [
    ...new Map(consumers.map((handle) => [handle.citationId, handle])).values(),
  ].sort((left, right) => left.citationId.localeCompare(right.citationId));
  if (uniqueProducers.length === 0 || uniqueConsumers.length === 0) return [];
  return [
    uniqueProducers[0]!,
    uniqueConsumers[0]!,
    ...uniqueProducers.slice(1),
    ...uniqueConsumers.slice(1),
  ].slice(0, maximumItems);
}

export function minimizeReasoningExcerptV1(excerpt: string, maximumBytes: number): string {
  const uncommented = excerpt
    .slice(0, Math.max(0, maximumBytes))
    .normalize('NFC')
    .replaceAll('\0', '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:\/\/|#|\/\*|\*|<!--|--)/.test(line))
    .join('\n');
  const redacted = uncommented
    .replace(
      /\b(password|passwd|secret|token|private[_-]?key|api[_-]?key)\b\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,
      '$1=[REDACTED]',
    )
    .replace(/\b[A-Za-z0-9+/_=-]{40,}\b/g, '[REDACTED]');
  const encoded = new TextEncoder().encode(redacted);
  if (encoded.byteLength <= maximumBytes) return redacted;
  return new TextDecoder()
    .decode(encoded.slice(0, Math.max(0, maximumBytes)))
    .replace(/\uFFFD$/u, '');
}

export function materializeReasoningContextV1(input: {
  readonly capability: ScopedReadCapability;
  readonly expected: readonly ReasoningEvidenceHandleV1[];
  readonly retrieved: readonly unknown[];
  readonly maximumBytes: number;
}): { readonly context: readonly ReasoningContextV1[]; readonly sourceBytes: number } {
  const expected = new Map(input.expected.map((handle) => [handle.citationId, handle]));
  const context: ReasoningContextV1[] = [];
  let sourceBytes = 0;
  for (const item of input.retrieved) {
    if (
      typeof item !== 'object' ||
      item === null ||
      Array.isArray(item) ||
      !('citationId' in item) ||
      typeof item.citationId !== 'string' ||
      !('excerpt' in item) ||
      typeof item.excerpt !== 'string'
    )
      continue;
    const retrieved = item as unknown as RetrievedReasoningEvidenceV1;
    const handle = expected.get(retrieved.citationId);
    const { excerpt: _excerpt, ...receivedHandle } = retrieved;
    void _excerpt;
    if (handle === undefined || hashCanonical(handle) !== hashCanonical(receivedHandle)) continue;
    assertScopedRepositoryRead(input.capability, retrieved.workspaceId, retrieved.repositoryId);
    const remaining = Math.max(0, input.maximumBytes - sourceBytes);
    if (remaining === 0) break;
    const excerpt = minimizeReasoningExcerptV1(retrieved.excerpt, remaining);
    const bytes = new TextEncoder().encode(excerpt).byteLength;
    if (bytes === 0) continue;
    sourceBytes += bytes;
    context.push({ ...handle, excerpt, excerptHash: contentHash(hashCanonical({ excerpt })) });
  }
  return { context, sourceBytes };
}
