import { hashCanonical } from './canonical.js';
import { invariant } from './errors.js';
import { contentHash, suppressionRuleId } from './values.js';
import type {
  AdapterId,
  ContentHash,
  FindingFingerprint,
  FindingOccurrenceId,
  GenerationId,
  Instant,
  PolicyRevision,
  RegistryRevision,
  RepositoryStableId,
  StableReferenceId,
  SuppressionRuleId,
  WorkspaceId,
} from './values.js';
import type { ContractKind, ReviewRole, SuppressionScope } from './vocabularies.js';

export type SuppressionMatcher =
  | { readonly scope: 'occurrence'; readonly occurrenceId: FindingOccurrenceId }
  | { readonly scope: 'stable_finding'; readonly fingerprint: FindingFingerprint }
  | {
      readonly scope: 'contract_consumer';
      readonly contractKind: ContractKind;
      readonly canonicalContractKey: string;
      readonly consumerRepositoryId: RepositoryStableId;
    }
  | {
      readonly scope: 'repository_pair_kind';
      readonly producerRepositoryId: RepositoryStableId;
      readonly consumerRepositoryId: RepositoryStableId;
      readonly contractKind: ContractKind;
    }
  | {
      readonly scope: 'adapter_rule';
      readonly adapterId: AdapterId;
      readonly ruleId: string;
    }
  | { readonly scope: 'workspace_rule'; readonly ruleId: string };

export type SuppressionInvalidationPredicate =
  | {
      readonly kind: 'producer_code';
      readonly repositoryId: RepositoryStableId;
      readonly generationId: GenerationId;
    }
  | {
      readonly kind: 'consumer_code';
      readonly repositoryId: RepositoryStableId;
      readonly generationId: GenerationId;
    }
  | {
      readonly kind: 'consumer_reference';
      readonly stableReferenceId: StableReferenceId;
      readonly contentHash: ContentHash;
    }
  | {
      readonly kind: 'contract_shape';
      readonly contractKind: ContractKind;
      readonly canonicalContractKey: string;
      readonly shapeHash: ContentHash;
    }
  | {
      readonly kind: 'identity_version';
      readonly adapterId: AdapterId;
      readonly identityVersion: number;
    }
  | {
      readonly kind: 'adapter_version';
      readonly adapterId: AdapterId;
      readonly adapterVersion: string;
    }
  | { readonly kind: 'evidence_stratum'; readonly stratumKey: string }
  | { readonly kind: 'policy_revision'; readonly revision: PolicyRevision }
  | { readonly kind: 'registry_revision'; readonly revision: RegistryRevision };

export interface SuppressionOwner {
  readonly actorId: string;
  readonly role: ReviewRole;
  readonly authorizationRevision: RegistryRevision;
}

export interface SuppressionRule {
  readonly schema: 'reverb.suppression-rule';
  readonly schemaVersion: '1.0';
  readonly id: SuppressionRuleId;
  readonly workspaceId: WorkspaceId;
  readonly matcher: SuppressionMatcher;
  readonly owner: SuppressionOwner;
  readonly justification: string;
  readonly justificationHash: ContentHash;
  readonly createdAt: Instant;
  readonly reviewAt: Instant;
  readonly expiresAt: Instant;
  readonly invalidationPredicates: readonly SuppressionInvalidationPredicate[];
  readonly initialState: 'active';
  readonly outputHash: ContentHash;
}

export interface SuppressionStateEvent {
  readonly id: ContentHash;
  readonly workspaceId: WorkspaceId;
  readonly suppressionRuleId: SuppressionRuleId;
  readonly occurredAt: Instant;
  readonly actorId: string;
  readonly state: 'revoked' | 'renewed';
  readonly reason: string;
  readonly nextReviewAt?: Instant;
  readonly nextExpiresAt?: Instant;
}

const REQUIRED_ROLE: Readonly<Record<SuppressionScope, ReviewRole>> = {
  occurrence: 'reviewer',
  stable_finding: 'reviewer',
  contract_consumer: 'repository_owner',
  repository_pair_kind: 'repository_owner',
  adapter_rule: 'workspace_admin',
  workspace_rule: 'workspace_admin',
};

const ROLE_RANK: Readonly<Record<ReviewRole, number>> = {
  reviewer: 1,
  repository_owner: 2,
  workspace_admin: 3,
};

export function suppressionRoleAuthorized(scope: SuppressionScope, role: ReviewRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[REQUIRED_ROLE[scope]];
}

export function createSuppressionRule(
  input: Omit<
    SuppressionRule,
    'schema' | 'schemaVersion' | 'id' | 'justificationHash' | 'initialState' | 'outputHash'
  >,
): SuppressionRule {
  invariant(
    suppressionRoleAuthorized(input.matcher.scope, input.owner.role),
    'suppression_unauthorized',
    `The ${input.matcher.scope} scope requires ${REQUIRED_ROLE[input.matcher.scope]} authorization.`,
  );
  const justification = input.justification.trim();
  invariant(
    justification.length >= 8 && justification.length <= 2_000,
    'invalid_suppression',
    'A suppression requires a specific bounded justification.',
  );
  invariant(
    input.owner.actorId.trim().length > 0,
    'invalid_suppression',
    'A suppression owner is required.',
  );
  const created = new Date(input.createdAt).valueOf();
  invariant(
    new Date(input.reviewAt).valueOf() > created && new Date(input.expiresAt).valueOf() > created,
    'invalid_suppression',
    'Suppression review and fallback expiry must follow creation.',
  );
  invariant(
    input.invalidationPredicates.length > 0,
    'invalid_suppression',
    'A suppression needs at least one structural invalidation predicate.',
  );
  const justificationHash = contentHash(hashCanonical(justification));
  const identity = {
    workspaceId: input.workspaceId,
    matcher: input.matcher,
    owner: input.owner,
    justificationHash,
    createdAt: input.createdAt,
  };
  const id = suppressionRuleId(`sup_${hashCanonical(identity)}`);
  const canonical = {
    ...input,
    justification,
    schema: 'reverb.suppression-rule' as const,
    schemaVersion: '1.0' as const,
    id,
    justificationHash,
    invalidationPredicates: [...input.invalidationPredicates].sort((left, right) =>
      hashCanonical(left).localeCompare(hashCanonical(right)),
    ),
    initialState: 'active' as const,
  };
  return { ...canonical, outputHash: contentHash(hashCanonical(canonical)) };
}

export interface SuppressionCandidateContext {
  readonly workspaceId: WorkspaceId;
  readonly occurrenceId: FindingOccurrenceId;
  readonly fingerprint: FindingFingerprint;
  readonly producerRepositoryId: RepositoryStableId;
  readonly consumerRepositoryId: RepositoryStableId;
  readonly contractKind: ContractKind;
  readonly canonicalContractKey: string;
  readonly adapterId: AdapterId;
  readonly adapterRuleIds: readonly string[];
}

export interface SuppressionVersionContext {
  readonly now: Instant;
  readonly producerGenerations: Readonly<Record<string, GenerationId>>;
  readonly consumerGenerations: Readonly<Record<string, GenerationId>>;
  readonly referenceHashes: Readonly<Record<string, ContentHash>>;
  readonly contractShapeHashes: Readonly<Record<string, ContentHash>>;
  readonly identityVersions: Readonly<Record<string, number>>;
  readonly adapterVersions: Readonly<Record<string, string>>;
  readonly evidenceStrata: readonly string[];
  readonly policyRevision: PolicyRevision;
  readonly registryRevision: RegistryRevision;
}

function matcherMatches(
  matcher: SuppressionMatcher,
  candidate: SuppressionCandidateContext,
): boolean {
  switch (matcher.scope) {
    case 'occurrence':
      return matcher.occurrenceId === candidate.occurrenceId;
    case 'stable_finding':
      return matcher.fingerprint === candidate.fingerprint;
    case 'contract_consumer':
      return (
        matcher.contractKind === candidate.contractKind &&
        matcher.canonicalContractKey === candidate.canonicalContractKey &&
        matcher.consumerRepositoryId === candidate.consumerRepositoryId
      );
    case 'repository_pair_kind':
      return (
        matcher.producerRepositoryId === candidate.producerRepositoryId &&
        matcher.consumerRepositoryId === candidate.consumerRepositoryId &&
        matcher.contractKind === candidate.contractKind
      );
    case 'adapter_rule':
      return (
        matcher.adapterId === candidate.adapterId &&
        candidate.adapterRuleIds.includes(matcher.ruleId)
      );
    case 'workspace_rule':
      return candidate.adapterRuleIds.includes(matcher.ruleId);
  }
}

function invalidationReason(
  predicate: SuppressionInvalidationPredicate,
  versions: SuppressionVersionContext,
): string | undefined {
  switch (predicate.kind) {
    case 'producer_code':
      return versions.producerGenerations[predicate.repositoryId] === predicate.generationId
        ? undefined
        : 'producer_code_changed';
    case 'consumer_code':
      return versions.consumerGenerations[predicate.repositoryId] === predicate.generationId
        ? undefined
        : 'consumer_code_changed';
    case 'consumer_reference':
      return versions.referenceHashes[predicate.stableReferenceId] === predicate.contentHash
        ? undefined
        : 'consumer_reference_changed';
    case 'contract_shape':
      return versions.contractShapeHashes[
        `${predicate.contractKind}\0${predicate.canonicalContractKey}`
      ] === predicate.shapeHash
        ? undefined
        : 'contract_shape_changed';
    case 'identity_version':
      return versions.identityVersions[predicate.adapterId] === predicate.identityVersion
        ? undefined
        : 'identity_version_changed';
    case 'adapter_version':
      return versions.adapterVersions[predicate.adapterId] === predicate.adapterVersion
        ? undefined
        : 'adapter_version_changed';
    case 'evidence_stratum':
      return versions.evidenceStrata.includes(predicate.stratumKey)
        ? undefined
        : 'evidence_stratum_changed';
    case 'policy_revision':
      return versions.policyRevision === predicate.revision ? undefined : 'policy_revision_changed';
    case 'registry_revision':
      return versions.registryRevision === predicate.revision
        ? undefined
        : 'registry_revision_changed';
  }
}

export interface SuppressionResolution {
  readonly state: 'active' | 'review_due' | 'expired' | 'invalidated' | 'revoked';
  readonly reason?: string;
}

export function resolveSuppression(
  rule: SuppressionRule,
  versions: SuppressionVersionContext,
  stateEvents: readonly SuppressionStateEvent[] = [],
): SuppressionResolution {
  const latest = [...stateEvents]
    .filter((event) => event.suppressionRuleId === rule.id)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .at(-1);
  if (latest?.state === 'revoked') return { state: 'revoked', reason: latest.reason };
  const expiresAt = latest?.nextExpiresAt ?? rule.expiresAt;
  const reviewAt = latest?.nextReviewAt ?? rule.reviewAt;
  if (versions.now >= expiresAt) return { state: 'expired', reason: 'fallback_expiry_reached' };
  for (const predicate of rule.invalidationPredicates) {
    const reason = invalidationReason(predicate, versions);
    if (reason !== undefined) return { state: 'invalidated', reason };
  }
  if (versions.now >= reviewAt) return { state: 'review_due', reason: 'scheduled_review_due' };
  return { state: 'active' };
}

export interface SuppressionDecision {
  readonly suppressed: boolean;
  readonly ruleId?: SuppressionRuleId;
  readonly resolution?: SuppressionResolution;
}

export function matchSuppression(input: {
  readonly candidate: SuppressionCandidateContext;
  readonly versions: SuppressionVersionContext;
  readonly rules: readonly SuppressionRule[];
  readonly stateEvents?: readonly SuppressionStateEvent[];
}): SuppressionDecision {
  for (const rule of [...input.rules].sort((left, right) => left.id.localeCompare(right.id))) {
    if (rule.workspaceId !== input.candidate.workspaceId) continue;
    if (!matcherMatches(rule.matcher, input.candidate)) continue;
    const resolution = resolveSuppression(rule, input.versions, input.stateEvents);
    if (resolution.state === 'active') {
      return { suppressed: true, ruleId: rule.id, resolution };
    }
  }
  return { suppressed: false };
}

export function applySuppressions<Candidate extends SuppressionCandidateContext>(input: {
  readonly candidates: readonly Candidate[];
  readonly versions: SuppressionVersionContext;
  readonly rules: readonly SuppressionRule[];
  readonly stateEvents?: readonly SuppressionStateEvent[];
}): readonly { readonly candidate: Candidate; readonly decision: SuppressionDecision }[] {
  return input.candidates.map((candidate) => ({
    candidate,
    decision: matchSuppression({
      candidate,
      versions: input.versions,
      rules: input.rules,
      ...(input.stateEvents === undefined ? {} : { stateEvents: input.stateEvents }),
    }),
  }));
}

export interface SuppressionAudit {
  readonly activeByScope: Readonly<Record<SuppressionScope, number>>;
  readonly broadRuleIds: readonly SuppressionRuleId[];
  readonly anomalies: readonly {
    readonly code: 'broad_rule_concentration' | 'workspace_rule_active';
    readonly ruleIds: readonly SuppressionRuleId[];
  }[];
}

export function auditSuppressions(
  rules: readonly SuppressionRule[],
  versions: SuppressionVersionContext,
  stateEvents: readonly SuppressionStateEvent[] = [],
): SuppressionAudit {
  const active = rules.filter(
    (rule) => resolveSuppression(rule, versions, stateEvents).state === 'active',
  );
  const activeByScope = Object.fromEntries(
    (
      [
        'occurrence',
        'stable_finding',
        'contract_consumer',
        'repository_pair_kind',
        'adapter_rule',
        'workspace_rule',
      ] as const
    ).map((scope) => [scope, active.filter((rule) => rule.matcher.scope === scope).length]),
  ) as Readonly<Record<SuppressionScope, number>>;
  const broad = active.filter(
    (rule) => rule.matcher.scope === 'adapter_rule' || rule.matcher.scope === 'workspace_rule',
  );
  const workspace = broad.filter((rule) => rule.matcher.scope === 'workspace_rule');
  const anomalies: SuppressionAudit['anomalies'][number][] = [];
  if (broad.length >= 3) {
    anomalies.push({ code: 'broad_rule_concentration', ruleIds: broad.map((rule) => rule.id) });
  }
  if (workspace.length > 0) {
    anomalies.push({ code: 'workspace_rule_active', ruleIds: workspace.map((rule) => rule.id) });
  }
  return { activeByScope, broadRuleIds: broad.map((rule) => rule.id), anomalies };
}
