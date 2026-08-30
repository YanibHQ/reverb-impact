import type {
  FindingFingerprint,
  FindingOccurrence,
  RepositoryStableId,
  ReviewEvent,
  SuppressionRule,
  WorkspaceId,
} from '@yanibhq/reverb-domain';
import type {
  AuthorizationPort,
  EvidenceGraphStore,
  PortResult,
  RecordReviewInput,
  ReviewEvaluationStore,
  Subject,
} from '@yanibhq/reverb-application';
import { RecordReview, portFailure, portSuccess } from '@yanibhq/reverb-application';

export interface FindingDetailProjection {
  readonly schema: 'reverb.finding-detail';
  readonly schemaVersion: '1.0';
  readonly fingerprint: FindingFingerprint;
  readonly occurrenceId: string;
  readonly producer: {
    readonly repositoryId: RepositoryStableId;
    readonly baseSha: string;
    readonly headSha: string;
  };
  readonly consumer?: {
    readonly repositoryId?: RepositoryStableId;
    readonly commitSha?: string;
    readonly path?: string;
    readonly range?: FindingOccurrence['edge']['reference']['range'];
  };
  readonly contract?: {
    readonly kind: FindingOccurrence['change']['contractKind'];
    readonly key: string;
    readonly changeKind: string;
  };
  readonly evidence: {
    readonly stratum: string;
    readonly basis: string;
    readonly producerGenerationId: string;
    readonly consumerGenerationId: string;
  };
  readonly coverageDependencies: readonly string[];
  readonly remedy: FindingOccurrence['remedy'];
  readonly policy: { readonly revision: string; readonly deliveryDecision: string };
  readonly accessibility: {
    readonly keyboardOperable: true;
    readonly stateText: string;
    readonly colorOnlyState: false;
  };
  readonly omittedFields: readonly string[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderFindingDetailHtml(
  detail: FindingDetailProjection,
  reviewAction: string,
): string {
  const contract = detail.contract
    ? `<section aria-labelledby="contract-heading"><h2 id="contract-heading">Contract</h2><dl><dt>Kind</dt><dd>${escapeHtml(detail.contract.kind)}</dd><dt>Identity</dt><dd><code>${escapeHtml(detail.contract.key)}</code></dd><dt>Change</dt><dd>${escapeHtml(detail.contract.changeKind)}</dd></dl></section>`
    : '';
  const consumer = detail.consumer
    ? `<section aria-labelledby="consumer-heading"><h2 id="consumer-heading">Authorized consumer evidence</h2><dl>${detail.consumer.repositoryId ? `<dt>Repository</dt><dd>${escapeHtml(detail.consumer.repositoryId)}</dd>` : ''}${detail.consumer.commitSha ? `<dt>Exact commit</dt><dd><code>${escapeHtml(detail.consumer.commitSha)}</code></dd>` : ''}${detail.consumer.path ? `<dt>Path</dt><dd><code>${escapeHtml(detail.consumer.path)}</code></dd>` : ''}</dl></section>`
    : '<p>Consumer details are omitted because current authorization does not permit them.</p>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reverb finding detail</title></head>
<body><main><h1>Cross-repository impact detail</h1>
<p role="status"><strong>State:</strong> ${escapeHtml(detail.accessibility.stateText)}</p>
<p>This finding is advisory and does not control merge eligibility.</p>
<section aria-labelledby="producer-heading"><h2 id="producer-heading">Producer</h2><dl><dt>Repository</dt><dd>${escapeHtml(detail.producer.repositoryId)}</dd><dt>Base commit</dt><dd><code>${escapeHtml(detail.producer.baseSha)}</code></dd><dt>Head commit</dt><dd><code>${escapeHtml(detail.producer.headSha)}</code></dd></dl></section>
${contract}${consumer}
<section aria-labelledby="evidence-heading"><h2 id="evidence-heading">Evidence and coverage</h2><dl><dt>Evidence stratum</dt><dd>${escapeHtml(detail.evidence.stratum)}</dd><dt>Evidence basis</dt><dd>${escapeHtml(detail.evidence.basis)}</dd><dt>Coverage dependencies</dt><dd>${escapeHtml(detail.coverageDependencies.join(', '))}</dd></dl></section>
<section aria-labelledby="remedy-heading"><h2 id="remedy-heading">Remedy</h2><p>${escapeHtml(detail.remedy.text)}</p></section>
<form method="post" action="${escapeHtml(reviewAction)}"><fieldset><legend>Record review</legend><label for="review-note">Review note</label><textarea id="review-note" name="note"></textarea><button type="submit">Submit append-only review</button></fieldset></form>
</main></body></html>`;
}

function hidden(): PortResult<never> {
  return portFailure({
    kind: 'not_found',
    code: 'not_found',
    safeMessage: 'Resource not found.',
    retryable: false,
  });
}

export class AuthenticatedFindingDetailService {
  readonly #evidence: EvidenceGraphStore;
  readonly #authorization: AuthorizationPort;

  public constructor(evidence: EvidenceGraphStore, authorization: AuthorizationPort) {
    this.#evidence = evidence;
    this.#authorization = authorization;
  }

  public async get(input: {
    readonly workspaceId: WorkspaceId;
    readonly producerRepositoryId: RepositoryStableId;
    readonly fingerprint: FindingFingerprint;
    readonly viewer: Subject;
  }): Promise<PortResult<FindingDetailProjection>> {
    const producerRead = await this.#authorization.authorizeRepositoryUse(
      input.viewer,
      'source.read',
      input.producerRepositoryId,
    );
    if (!producerRead.ok || !producerRead.value.allowed) return hidden();
    const found = await this.#evidence.findFinding(input.workspaceId, input.fingerprint);
    if (!found.ok || found.value.analysis.producerRepositoryId !== input.producerRepositoryId) {
      return hidden();
    }
    const finding = found.value.finding;
    const consumerRead = await this.#authorization.authorizeRepositoryUse(
      input.viewer,
      'source.read',
      finding.edge.consumerRepositoryId,
    );
    const disclosure = await this.#authorization.projectDisclosure({
      workspaceId: input.workspaceId,
      destinationRepositoryId: input.producerRepositoryId,
      audience: 'personalized',
      viewer: input.viewer,
      requestedFields: ['repository_identity', 'contract_identity', 'location'],
    });
    if (!disclosure.ok) return hidden();
    const allowed = new Set(disclosure.value.allowedFields);
    const canReadConsumer = consumerRead.ok && consumerRead.value.allowed;
    return portSuccess({
      schema: 'reverb.finding-detail',
      schemaVersion: '1.0',
      fingerprint: finding.fingerprint,
      occurrenceId: finding.id,
      producer: {
        repositoryId: found.value.analysis.producerRepositoryId,
        baseSha: found.value.analysis.pullRequest.baseSha,
        headSha: found.value.analysis.pullRequest.headSha,
      },
      ...(canReadConsumer && allowed.has('repository_identity')
        ? {
            consumer: {
              repositoryId: finding.edge.consumerRepositoryId,
              ...(finding.consumer.commitSha === undefined
                ? {}
                : { commitSha: finding.consumer.commitSha }),
              ...(allowed.has('location')
                ? {
                    path: finding.edge.reference.path,
                    ...(finding.edge.reference.range === undefined
                      ? {}
                      : { range: finding.edge.reference.range }),
                  }
                : {}),
            },
          }
        : {}),
      ...(allowed.has('contract_identity')
        ? {
            contract: {
              kind: finding.change.contractKind,
              key: finding.change.canonicalKey,
              changeKind: finding.change.changeKind,
            },
          }
        : {}),
      evidence: {
        stratum: finding.edge.stratumKey,
        basis: finding.edge.basis,
        producerGenerationId: finding.edge.producerGenerationId,
        consumerGenerationId: finding.edge.consumerGenerationId,
      },
      coverageDependencies: finding.coverageDependencies,
      remedy: finding.remedy,
      policy: {
        revision: found.value.analysis.policyRevision,
        deliveryDecision: finding.delivery.decision,
      },
      accessibility: {
        keyboardOperable: true,
        stateText: `${finding.claims.edge}; ${finding.claims.impact}; ${finding.claims.action}`,
        colorOnlyState: false,
      },
      omittedFields: disclosure.value.omittedFields,
    });
  }
}

export class AuthorizedReviewService {
  readonly #evidence: EvidenceGraphStore;
  readonly #reviews: ReviewEvaluationStore;
  readonly #authorization: AuthorizationPort;

  public constructor(
    evidence: EvidenceGraphStore,
    reviews: ReviewEvaluationStore,
    authorization: AuthorizationPort,
  ) {
    this.#evidence = evidence;
    this.#reviews = reviews;
    this.#authorization = authorization;
  }

  public async record(input: {
    readonly subject: Subject;
    readonly producerRepositoryId: RepositoryStableId;
    readonly review: RecordReviewInput['review'];
    readonly suppression?: SuppressionRule;
  }): Promise<PortResult<ReviewEvent>> {
    const current = await this.#authorization.authorizeRepositoryUse(
      input.subject,
      'evidence.consume',
      input.producerRepositoryId,
    );
    if (!current.ok || !current.value.allowed) {
      return portFailure({
        kind: 'authorization_denied',
        code: 'review_unauthorized',
        safeMessage: 'Review is not authorized.',
        retryable: false,
      });
    }
    return new RecordReview(this.#evidence, this.#reviews).execute({
      review: input.review,
      ...(input.suppression === undefined ? {} : { suppression: input.suppression }),
    });
  }
}
