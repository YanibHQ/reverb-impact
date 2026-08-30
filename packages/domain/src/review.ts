import { hashCanonical } from './canonical.js';
import { invariant } from './errors.js';
import { contentHash } from './values.js';
import type {
  AdapterId,
  ContentHash,
  FindingFingerprint,
  FindingOccurrenceId,
  GenerationId,
  Instant,
  PolicyRevision,
  RegistryRevision,
  ReviewEventId,
  SuppressionRuleId,
  WorkspaceId,
} from './values.js';
import type {
  ActionLabel,
  EdgeLabel,
  ImpactLabel,
  ReviewReasonCode,
  ReviewRole,
} from './vocabularies.js';

export interface ReviewActor {
  readonly id: string;
  readonly role: ReviewRole;
  readonly domainCapability: string;
  readonly detectorAuthorConflict: boolean;
}

export interface ReviewAuthorization {
  readonly revision: RegistryRevision;
  readonly authorizedAt: Instant;
  readonly permission: 'finding.review';
}

export interface ReviewVersionStamp {
  readonly producerGenerationId: GenerationId;
  readonly consumerGenerationId: GenerationId;
  readonly adapters: readonly {
    readonly id: AdapterId;
    readonly version: string;
    readonly identityVersion: number;
  }[];
  readonly evidenceStratum: string;
  readonly policyRevision: PolicyRevision;
  readonly registryRevision: RegistryRevision;
}

export interface ReviewLabels {
  readonly edge: EdgeLabel;
  readonly impact: ImpactLabel;
  readonly action: ActionLabel;
}

export interface ReviewEvent {
  readonly schema: 'reverb.review-event';
  readonly schemaVersion: '1.0';
  readonly id: ReviewEventId;
  readonly workspaceId: WorkspaceId;
  readonly findingOccurrenceId: FindingOccurrenceId;
  readonly findingFingerprint: FindingFingerprint;
  readonly actor: ReviewActor;
  readonly authorization: ReviewAuthorization;
  readonly occurredAt: Instant;
  readonly versions: ReviewVersionStamp;
  readonly labels: ReviewLabels;
  readonly reason: ReviewReasonCode;
  readonly noteHash: ContentHash;
  readonly supersedes?: ReviewEventId;
  readonly suppressionRuleId?: SuppressionRuleId;
  readonly outputHash: ContentHash;
}

export function createReviewEvent(
  input: Omit<ReviewEvent, 'schema' | 'schemaVersion' | 'outputHash'>,
  previous?: ReviewEvent,
): ReviewEvent {
  invariant(input.actor.id.trim().length > 0, 'invalid_review', 'Review actor is required.');
  invariant(
    input.actor.domainCapability.trim().length > 0,
    'invalid_review',
    'Reviewer domain capability is required.',
  );
  invariant(
    input.actor.role === 'reviewer' ||
      input.actor.role === 'repository_owner' ||
      input.actor.role === 'workspace_admin',
    'review_unauthorized',
    'Actor is not authorized to review findings.',
  );
  invariant(
    input.versions.adapters.length > 0 &&
      input.versions.adapters.every(
        (value) => value.version.trim().length > 0 && value.identityVersion >= 1,
      ),
    'invalid_review',
    'Review evidence and identity versions are required.',
  );
  invariant(
    input.versions.evidenceStratum.trim().length > 0,
    'invalid_review',
    'Review evidence stratum is required.',
  );
  if (previous === undefined) {
    invariant(
      input.supersedes === undefined,
      'invalid_review_supersession',
      'An initial review cannot supersede an absent event.',
    );
  } else {
    invariant(
      input.supersedes === previous.id &&
        input.workspaceId === previous.workspaceId &&
        input.findingOccurrenceId === previous.findingOccurrenceId &&
        input.findingFingerprint === previous.findingFingerprint,
      'invalid_review_supersession',
      'A review may supersede only the current event for the same immutable occurrence.',
    );
  }
  const canonical = {
    ...input,
    schema: 'reverb.review-event' as const,
    schemaVersion: '1.0' as const,
    versions: {
      ...input.versions,
      adapters: [...input.versions.adapters].sort((left, right) =>
        `${left.id}\0${left.version}\0${left.identityVersion}`.localeCompare(
          `${right.id}\0${right.version}\0${right.identityVersion}`,
        ),
      ),
    },
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

export interface WorkflowResolutionEvent {
  readonly kind: 'workflow_resolution';
  readonly workspaceId: WorkspaceId;
  readonly findingFingerprint: FindingFingerprint;
  readonly actorId: string;
  readonly occurredAt: Instant;
  readonly state: 'open' | 'coordinating' | 'resolved';
  readonly linkedChangeHash?: ContentHash;
}

export interface RiskAcceptanceEvent {
  readonly kind: 'risk_acceptance';
  readonly workspaceId: WorkspaceId;
  readonly findingFingerprint: FindingFingerprint;
  readonly actorId: string;
  readonly occurredAt: Instant;
  readonly reviewAt: Instant;
  readonly justificationHash: ContentHash;
}

export interface ImplicitUsefulnessEvent {
  readonly kind: 'implicit_usefulness';
  readonly workspaceId: WorkspaceId;
  readonly findingFingerprint: FindingFingerprint;
  readonly occurredAt: Instant;
  readonly signal: 'viewed' | 'clicked' | 'edited' | 'merged' | 'elapsed';
}

export function isGroundTruthRecord(
  value: ReviewEvent | WorkflowResolutionEvent | RiskAcceptanceEvent | ImplicitUsefulnessEvent,
): value is ReviewEvent {
  return 'schema' in value && value.schema === 'reverb.review-event';
}
