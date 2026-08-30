import { hashCanonical } from './canonical.js';
import { invariant } from './errors.js';
import type { RegistrySnapshot } from './registry.js';
import { contentHash } from './values.js';
import type { ContentHash, Instant, RepositoryStableId, WorkspaceId } from './values.js';

export interface DeclaredContextObservation {
  readonly schema: 'reverb.declared-context';
  readonly schemaVersion: '1.0';
  readonly workspaceId: WorkspaceId;
  readonly producerRepositoryId: RepositoryStableId;
  readonly consumerRepositoryId: RepositoryStableId;
  readonly serviceIdentity?: string;
  readonly contractHint?: string;
  readonly provenance: 'declared_context';
  readonly source: string;
  readonly author: string;
  readonly declarationRevision: string;
  readonly observedAt: Instant;
  readonly validUntil?: Instant;
  readonly outputHash: ContentHash;
}

export function importDeclaredContext(input: {
  readonly registry: RegistrySnapshot;
  readonly producerRepositoryId: RepositoryStableId;
  readonly consumerRepositoryId: RepositoryStableId;
  readonly serviceIdentity?: string;
  readonly contractHint?: string;
  readonly source: string;
  readonly author: string;
  readonly declarationRevision: string;
  readonly observedAt: Instant;
  readonly validUntil?: Instant;
  readonly consentGrantee: string;
}): DeclaredContextObservation {
  const members = new Set(
    input.registry.repositories
      .filter((value) => value.selected)
      .map((value) => value.repositoryId),
  );
  invariant(
    members.has(input.producerRepositoryId) && members.has(input.consumerRepositoryId),
    'unknown_repository',
    'Declared context requires explicit current workspace membership on both sides.',
  );
  const consented = [input.producerRepositoryId, input.consumerRepositoryId].every((repositoryId) =>
    input.registry.consents.some(
      (value) =>
        value.repositoryId === repositoryId &&
        value.action === 'evidence.consume' &&
        (value.grantee === input.consentGrantee || value.grantee === '*') &&
        value.decision === 'allow',
    ),
  );
  invariant(
    consented,
    'authorization_denied',
    'Declared context requires explicit evidence-consumption consent on both sides.',
  );
  invariant(
    input.source.trim().length > 0 &&
      input.author.trim().length > 0 &&
      input.declarationRevision.trim().length > 0,
    'invalid_schema',
    'Declared context requires source, author, and revision provenance.',
  );
  invariant(
    input.validUntil === undefined || input.observedAt < input.validUntil,
    'invalid_schema',
    'Declared context validity must end after observation.',
  );
  const canonical = {
    schema: 'reverb.declared-context' as const,
    schemaVersion: '1.0' as const,
    workspaceId: input.registry.revision.workspaceId,
    producerRepositoryId: input.producerRepositoryId,
    consumerRepositoryId: input.consumerRepositoryId,
    ...(input.serviceIdentity === undefined ? {} : { serviceIdentity: input.serviceIdentity }),
    ...(input.contractHint === undefined ? {} : { contractHint: input.contractHint }),
    provenance: 'declared_context' as const,
    source: input.source,
    author: input.author,
    declarationRevision: input.declarationRevision,
    observedAt: input.observedAt,
    ...(input.validUntil === undefined ? {} : { validUntil: input.validUntil }),
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

export function declaredContextActiveAt(
  observation: DeclaredContextObservation,
  at: Instant,
): boolean {
  return (
    observation.observedAt <= at &&
    (observation.validUntil === undefined || at < observation.validUntil)
  );
}
