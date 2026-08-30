import { hashCanonical } from './canonical.js';
import type { AnalysisResult, FindingOccurrence } from './finding.js';
import { promotionVersionsEqual } from './policy.js';
import type { PromotionRecord, PromotionVersionStamp } from './policy.js';
import { contentHash } from './values.js';
import type {
  CommitSha,
  ContentHash,
  Instant,
  PolicyRevision,
  RegistryRevision,
  RepositoryStableId,
  WorkspaceId,
} from './values.js';

export type DisclosureFieldClass =
  | 'repository_identity'
  | 'contract_identity'
  | 'location'
  | 'snippet';

export interface DisclosureFact {
  readonly field: DisclosureFieldClass;
  readonly name: string;
  readonly value: string;
  readonly subjectRepositoryId: RepositoryStableId;
  readonly explicitGrant: boolean;
  readonly appCanRead: boolean;
  readonly wholeProducerAudienceCanRead: boolean;
  readonly viewerCanRead?: boolean;
}

export interface DisclosureOmission {
  readonly field: DisclosureFieldClass;
  readonly name: string;
  readonly reason:
    | 'no_explicit_grant'
    | 'app_access_denied'
    | 'whole_audience_safety_unproven'
    | 'viewer_access_denied';
}

export interface FindingDisclosureProjection {
  readonly schema: 'reverb.finding-disclosure-projection';
  readonly schemaVersion: '1.0';
  readonly workspaceId: WorkspaceId;
  readonly destinationRepositoryId: RepositoryStableId;
  readonly audience: 'static' | 'personalized';
  readonly registryRevision: RegistryRevision;
  readonly allowed: Readonly<Record<string, string>>;
  readonly omitted: readonly DisclosureOmission[];
  readonly decisionHash: ContentHash;
}

export function projectFindingDisclosure(input: {
  readonly workspaceId: WorkspaceId;
  readonly destinationRepositoryId: RepositoryStableId;
  readonly audience: 'static' | 'personalized';
  readonly registryRevision: RegistryRevision;
  readonly facts: readonly DisclosureFact[];
}): FindingDisclosureProjection {
  const allowed: Record<string, string> = {};
  const omitted: DisclosureOmission[] = [];
  for (const fact of [...input.facts].sort((left, right) =>
    `${left.field}:${left.name}`.localeCompare(`${right.field}:${right.name}`),
  )) {
    const reason = !fact.explicitGrant
      ? 'no_explicit_grant'
      : !fact.appCanRead
        ? 'app_access_denied'
        : input.audience === 'static' && !fact.wholeProducerAudienceCanRead
          ? 'whole_audience_safety_unproven'
          : input.audience === 'personalized' && !fact.viewerCanRead
            ? 'viewer_access_denied'
            : undefined;
    if (reason === undefined) allowed[fact.name] = fact.value;
    else omitted.push({ field: fact.field, name: fact.name, reason });
  }
  const canonical = {
    schema: 'reverb.finding-disclosure-projection' as const,
    schemaVersion: '1.0' as const,
    workspaceId: input.workspaceId,
    destinationRepositoryId: input.destinationRepositoryId,
    audience: input.audience,
    registryRevision: input.registryRevision,
    allowed,
    omitted,
  };
  return { ...canonical, decisionHash: contentHash(hashCanonical(canonical)) };
}

export interface ProviderAnnotation {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly message: string;
  readonly findingFingerprint: string;
}

export interface StaticFindingProjection {
  readonly fingerprint: string;
  readonly summary: string;
  readonly impact: FindingOccurrence['claims']['impact'];
  readonly activation: FindingOccurrence['change']['activation'];
  readonly evidenceStratum: string;
  readonly measurement: {
    readonly state: 'PROMOTED';
    readonly decidedAt: Instant;
    readonly actionableWilsonLower95: number;
    readonly edgeWilsonLower95: number;
  };
  readonly remedy: FindingOccurrence['remedy'];
  readonly disclosed: Readonly<Record<string, string>>;
}

export interface GitHubCheckProjection {
  readonly schema: 'reverb.github-check-projection';
  readonly schemaVersion: '1.0';
  readonly checkKey: ContentHash;
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryStableId;
  readonly pullRequestNumber: number;
  readonly headSha: CommitSha;
  readonly policyRevision: PolicyRevision;
  readonly conclusion: 'success' | 'neutral' | 'skipped';
  readonly advisory: true;
  readonly neverBlocking: true;
  readonly title: string;
  readonly summary: string;
  readonly coverage: {
    readonly analysisState: AnalysisResult['state'];
    readonly currentConsumers: number;
    readonly permissionLimitedConsumers: number;
    readonly failedConsumers: number;
    readonly abstentions: number;
  };
  readonly findings: readonly StaticFindingProjection[];
  readonly findingTotal: number;
  readonly truncatedFindingCount: number;
  readonly annotations: readonly ProviderAnnotation[];
  readonly truncatedAnnotationCount: number;
  readonly limitations: readonly string[];
  readonly detailUrl: string;
  readonly projectionHash: ContentHash;
}

export interface CheckDeliveryPlan {
  readonly mode: 'shadow' | 'write' | 'no_write';
  readonly reason:
    | 'shadow_mode'
    | 'advisory_enabled'
    | 'repository_out_of_scope'
    | 'superseded_head'
    | 'write_unauthorized'
    | 'write_kill_switch'
    | 'no_promoted_strata';
  readonly projection: GitHubCheckProjection;
}

export interface ProducerChangedLocation {
  readonly fingerprint: string;
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly exactChangedLines: readonly number[];
}

export interface CurrentDeliveryStratum {
  readonly stratumKey: string;
  readonly versions: PromotionVersionStamp;
}

function currentPromotion(
  promotions: readonly PromotionRecord[],
  stratumKey: string,
): PromotionRecord | undefined {
  return [...promotions]
    .filter((value) => value.stratumKey === stratumKey)
    .sort((left, right) => left.decidedAt.localeCompare(right.decidedAt))
    .at(-1);
}

function safeAnnotations(
  findings: readonly StaticFindingProjection[],
  locations: readonly ProducerChangedLocation[],
  limit: number,
): { readonly annotations: readonly ProviderAnnotation[]; readonly truncated: number } {
  const eligible = findings.flatMap((finding) => {
    const location = locations.find((value) => value.fingerprint === finding.fingerprint);
    if (!location || location.startLine < 1 || location.endLine < location.startLine) return [];
    const exact = new Set(location.exactChangedLines);
    if (!exact.has(location.startLine) || !exact.has(location.endLine)) return [];
    return [
      {
        path: location.path,
        startLine: location.startLine,
        endLine: location.endLine,
        message: `${finding.summary} Remedy: ${finding.remedy.text}`.slice(0, 4_096),
        findingFingerprint: finding.fingerprint,
      },
    ];
  });
  return { annotations: eligible.slice(0, limit), truncated: Math.max(0, eligible.length - limit) };
}

export function planGitHubCheck(input: {
  readonly analysis: AnalysisResult;
  readonly pullRequestNumber: number;
  readonly currentHeadSha: CommitSha;
  readonly now: Instant;
  readonly hardDeadlineAt: Instant;
  readonly repositoryInScope: boolean;
  readonly writeAuthorized: boolean;
  readonly advisoryEnabled: boolean;
  readonly writeKillSwitch: boolean;
  readonly enabledStrata: readonly string[];
  readonly currentStrata: readonly CurrentDeliveryStratum[];
  readonly promotions: readonly PromotionRecord[];
  readonly disclosures: Readonly<Record<string, FindingDisclosureProjection>>;
  readonly producerChangedLocations: readonly ProducerChangedLocation[];
  readonly detailUrl: string;
  readonly maximumFindings?: number;
  readonly maximumAnnotations?: number;
}): CheckDeliveryPlan {
  const currentStrata = new Map(input.currentStrata.map((value) => [value.stratumKey, value]));
  const promotions = new Map(
    input.enabledStrata.map((stratum) => {
      const promotion = currentPromotion(input.promotions, stratum);
      const current = currentStrata.get(stratum);
      return [
        stratum,
        promotion &&
        current &&
        promotion.state === 'PROMOTED' &&
        promotionVersionsEqual(promotion.evidence.versions, current.versions)
          ? promotion
          : undefined,
      ] as const;
    }),
  );
  const promoted = new Set(
    [...promotions.entries()]
      .filter((entry): entry is [string, PromotionRecord] => entry[1]?.state === 'PROMOTED')
      .map(([stratum]) => stratum),
  );
  const findings = input.analysis.findings.flatMap((finding): StaticFindingProjection[] => {
    if (
      finding.state === 'ABSTAINED' ||
      finding.delivery.decision === 'suppressed' ||
      !promoted.has(finding.edge.stratumKey)
    ) {
      return [];
    }
    const promotion = promotions.get(finding.edge.stratumKey);
    const disclosure = input.disclosures[finding.fingerprint];
    if (!promotion || promotion.state !== 'PROMOTED' || !disclosure) return [];
    return [
      {
        fingerprint: finding.fingerprint,
        summary: 'A promoted structural dependency may require downstream coordination.',
        impact: finding.claims.impact,
        activation: finding.change.activation,
        evidenceStratum: finding.edge.stratumKey,
        measurement: {
          state: 'PROMOTED',
          decidedAt: promotion.decidedAt,
          actionableWilsonLower95:
            promotion.evidence.metrics.actionablePrecision.wilsonOneSidedLower95,
          edgeWilsonLower95: promotion.evidence.metrics.edgePrecision.wilsonOneSidedLower95,
        },
        remedy: finding.remedy,
        disclosed: disclosure.allowed,
      },
    ];
  });
  const maximumFindings = Math.max(0, input.maximumFindings ?? 20);
  const displayedFindings = findings.slice(0, maximumFindings);
  const annotationResult = safeAnnotations(
    displayedFindings,
    input.producerChangedLocations,
    Math.max(0, input.maximumAnnotations ?? 50),
  );
  const outOfScope = !input.repositoryInScope;
  const timedOutOrIncomplete =
    input.now >= input.hardDeadlineAt ||
    input.analysis.state === 'partial' ||
    input.analysis.state === 'not_analysed';
  const conclusion: GitHubCheckProjection['conclusion'] = outOfScope
    ? 'skipped'
    : timedOutOrIncomplete || findings.length > 0
      ? 'neutral'
      : 'success';
  const coverage = {
    analysisState: input.analysis.state,
    currentConsumers: input.analysis.consumers.filter((value) => value.state === 'current').length,
    permissionLimitedConsumers: input.analysis.consumers.filter(
      (value) => value.state === 'unauthorized',
    ).length,
    failedConsumers: input.analysis.consumers.filter((value) => value.state === 'failed').length,
    abstentions: input.analysis.abstentions.length,
  };
  const limitations = [
    'Advisory only; this check never controls merge eligibility.',
    'Some evidence may be unavailable due to permissions.',
    ...(timedOutOrIncomplete ? ['Analysis was incomplete at the hard delivery deadline.'] : []),
    ...(annotationResult.truncated > 0
      ? [`${annotationResult.truncated} safe annotations omitted due to provider limits.`]
      : []),
  ];
  const checkKey = contentHash(
    hashCanonical({
      workspaceId: input.analysis.workspaceId,
      repositoryId: input.analysis.producerRepositoryId,
      pullRequestNumber: input.pullRequestNumber,
      headSha: input.analysis.pullRequest.headSha,
      policyRevision: input.analysis.policyRevision,
    }),
  );
  const canonical = {
    schema: 'reverb.github-check-projection' as const,
    schemaVersion: '1.0' as const,
    checkKey,
    workspaceId: input.analysis.workspaceId,
    repositoryId: input.analysis.producerRepositoryId,
    pullRequestNumber: input.pullRequestNumber,
    headSha: input.analysis.pullRequest.headSha,
    policyRevision: input.analysis.policyRevision,
    conclusion,
    advisory: true as const,
    neverBlocking: true as const,
    title:
      conclusion === 'skipped'
        ? 'Reverb analysis skipped'
        : timedOutOrIncomplete
          ? 'Reverb analysis incomplete'
          : findings.length === 0
            ? 'No promoted cross-repository impacts found'
            : `${findings.length} advisory cross-repository impact${findings.length === 1 ? '' : 's'}`,
    summary: `Analysed exact head ${input.analysis.pullRequest.headSha}. ${findings.length} promoted, disclosure-safe finding${findings.length === 1 ? '' : 's'} selected.`,
    coverage,
    findings: displayedFindings,
    findingTotal: findings.length,
    truncatedFindingCount: Math.max(0, findings.length - displayedFindings.length),
    annotations: annotationResult.annotations,
    truncatedAnnotationCount: annotationResult.truncated,
    limitations,
    detailUrl: input.detailUrl,
  };
  const projection = { ...canonical, projectionHash: contentHash(hashCanonical(canonical)) };
  const modeAndReason: Pick<CheckDeliveryPlan, 'mode' | 'reason'> = outOfScope
    ? { mode: 'no_write', reason: 'repository_out_of_scope' }
    : input.analysis.pullRequest.headSha !== input.currentHeadSha || !input.analysis.current
      ? { mode: 'no_write', reason: 'superseded_head' }
      : !input.writeAuthorized
        ? { mode: 'no_write', reason: 'write_unauthorized' }
        : input.writeKillSwitch
          ? { mode: 'no_write', reason: 'write_kill_switch' }
          : promoted.size === 0
            ? { mode: 'no_write', reason: 'no_promoted_strata' }
            : !input.advisoryEnabled
              ? { mode: 'shadow', reason: 'shadow_mode' }
              : { mode: 'write', reason: 'advisory_enabled' };
  return { ...modeAndReason, projection };
}
