import {
  ReverbError,
  createReviewEvent,
  type ReviewEvent,
  type SuppressionRule,
} from '@yanibhq/reverb-domain';

import { portFailure, portSuccess } from './ports.js';
import type { EvidenceGraphStore, PortResult, ReviewEvaluationStore } from './ports.js';

export interface RecordReviewInput {
  readonly review: Omit<ReviewEvent, 'schema' | 'schemaVersion' | 'outputHash'>;
  readonly suppression?: SuppressionRule;
}

export class RecordReview {
  public constructor(
    private readonly evidence: EvidenceGraphStore,
    private readonly reviews: ReviewEvaluationStore,
  ) {}

  public async execute(input: RecordReviewInput): Promise<PortResult<ReviewEvent>> {
    const found = await this.evidence.findFinding(
      input.review.workspaceId,
      input.review.findingFingerprint,
    );
    if (!found.ok) return portFailure(found.failure);
    if (found.value.finding.id !== input.review.findingOccurrenceId) {
      return portFailure({
        kind: 'conflict',
        code: 'immutable_occurrence_mismatch',
        safeMessage: 'The review occurrence does not match the persisted structural finding.',
        retryable: false,
      });
    }
    const finding = found.value.finding;
    if (
      input.review.versions.producerGenerationId !== finding.edge.producerGenerationId ||
      input.review.versions.consumerGenerationId !== finding.edge.consumerGenerationId ||
      input.review.versions.evidenceStratum !== finding.edge.stratumKey
    ) {
      return portFailure({
        kind: 'conflict',
        code: 'review_evidence_version_mismatch',
        safeMessage: 'The review version stamp does not match the immutable finding evidence.',
        retryable: false,
      });
    }
    const history = await this.reviews.listReviews(
      input.review.workspaceId,
      input.review.findingFingerprint,
    );
    if (!history.ok) return portFailure(history.failure);
    const previous = [...history.value]
      .filter((value) => value.findingOccurrenceId === input.review.findingOccurrenceId)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .at(-1);
    if (
      input.suppression !== undefined &&
      (input.review.suppressionRuleId !== input.suppression.id ||
        input.suppression.workspaceId !== input.review.workspaceId)
    ) {
      return portFailure({
        kind: 'conflict',
        code: 'review_suppression_mismatch',
        safeMessage:
          'The review and optional suppression must reference each other in one workspace.',
        retryable: false,
      });
    }
    try {
      const event = createReviewEvent(input.review, previous);
      const stored = await this.reviews.appendReview({
        event,
        ...(input.suppression === undefined ? {} : { suppression: input.suppression }),
      });
      return stored.ok ? portSuccess(event) : portFailure(stored.failure);
    } catch (error) {
      return portFailure({
        kind: 'domain',
        code: error instanceof ReverbError ? error.code : 'invalid_review',
        safeMessage: error instanceof ReverbError ? error.message : 'Review validation failed.',
        retryable: false,
      });
    }
  }
}
