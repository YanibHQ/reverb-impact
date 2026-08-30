import type { PromotionRecord, RepositoryStableId, WorkspaceId } from '@yanibhq/reverb-domain';

export type HostedCapability = 'read' | 'parser' | 'model' | 'write';

export interface HostedKillSwitchSnapshot {
  readonly readDisabled: boolean;
  readonly parserDisabled: boolean;
  readonly modelDisabled: boolean;
  readonly writeDisabled: boolean;
}

export class HostedOperationalControls {
  #switches: HostedKillSwitchSnapshot = {
    readDisabled: false,
    parserDisabled: false,
    modelDisabled: true,
    writeDisabled: true,
  };
  readonly #advisory = new Set<string>();

  public snapshot(): HostedKillSwitchSnapshot {
    return { ...this.#switches };
  }

  public setDisabled(capability: HostedCapability, disabled: boolean): void {
    this.#switches = { ...this.#switches, [`${capability}Disabled`]: disabled };
  }

  public enableAdvisory(input: {
    readonly workspaceId: WorkspaceId;
    readonly repositoryId: RepositoryStableId;
    readonly stratumKey: string;
    readonly promotion: PromotionRecord;
  }): void {
    if (
      input.promotion.stratumKey !== input.stratumKey ||
      input.promotion.state !== 'PROMOTED' ||
      input.promotion.decision !== 'promote'
    ) {
      throw new Error('Advisory delivery requires a current promoted stratum record.');
    }
    this.#advisory.add(
      `${input.workspaceId}\0${input.repositoryId}\0${input.stratumKey}\0${input.promotion.outputHash}`,
    );
  }

  public disableAdvisory(input: {
    readonly workspaceId: WorkspaceId;
    readonly repositoryId: RepositoryStableId;
    readonly stratumKey: string;
  }): number {
    let removed = 0;
    for (const key of this.#advisory) {
      if (key.startsWith(`${input.workspaceId}\0${input.repositoryId}\0${input.stratumKey}\0`)) {
        this.#advisory.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  public isAdvisoryEnabled(input: {
    readonly workspaceId: WorkspaceId;
    readonly repositoryId: RepositoryStableId;
    readonly promotion: PromotionRecord;
  }): boolean {
    return (
      !this.#switches.writeDisabled &&
      input.promotion.state === 'PROMOTED' &&
      this.#advisory.has(
        `${input.workspaceId}\0${input.repositoryId}\0${input.promotion.stratumKey}\0${input.promotion.outputHash}`,
      )
    );
  }

  public applyPromotionDecision(input: {
    readonly workspaceId: WorkspaceId;
    readonly repositoryId: RepositoryStableId;
    readonly promotion: PromotionRecord;
  }): void {
    if (input.promotion.state !== 'PROMOTED') {
      this.disableAdvisory({
        workspaceId: input.workspaceId,
        repositoryId: input.repositoryId,
        stratumKey: input.promotion.stratumKey,
      });
    }
  }
}

export class DeliveryOwnershipRegistry {
  readonly #owners = new Map<string, string>();

  public claim(input: {
    readonly installationId: number;
    readonly repositoryExternalId: number;
    readonly checkName: string;
    readonly owner: string;
  }): void {
    if (input.checkName.trim().length === 0 || input.owner.trim().length === 0) {
      throw new Error('Delivery ownership requires a check name and owner.');
    }
    const key = `${input.installationId}\0${input.repositoryExternalId}\0${input.checkName}`;
    const existing = this.#owners.get(key);
    if (existing !== undefined && existing !== input.owner) {
      throw new Error(
        `Check delivery is already owned by ${existing}; duplicate writers are forbidden.`,
      );
    }
    this.#owners.set(key, input.owner);
  }

  public owner(input: {
    readonly installationId: number;
    readonly repositoryExternalId: number;
    readonly checkName: string;
  }): string | null {
    return (
      this.#owners.get(
        `${input.installationId}\0${input.repositoryExternalId}\0${input.checkName}`,
      ) ?? null
    );
  }
}

export type HostedTelemetryEvent =
  | {
      readonly type: 'webhook_received';
      readonly event: 'installation' | 'repositories' | 'push' | 'pull_request' | 'check_action';
      readonly duplicate: boolean;
      readonly durationMs: number;
    }
  | {
      readonly type: 'hosted_job_completed';
      readonly kind: 'scope' | 'source' | 'index' | 'analysis' | 'purge' | 'reconcile';
      readonly outcome: 'complete' | 'partial' | 'failed' | 'superseded' | 'timeout';
      readonly durationMs: number;
      readonly costMicrounits: number;
    }
  | {
      readonly type: 'delivery_projection';
      readonly mode: 'shadow' | 'write' | 'no_write';
      readonly conclusion: 'success' | 'neutral' | 'skipped';
      readonly findingCount: number;
      readonly redactionCount: number;
      readonly durationMs: number;
    };

const TELEMETRY_PROPERTIES = new Set([
  'type',
  'event',
  'duplicate',
  'durationMs',
  'kind',
  'outcome',
  'costMicrounits',
  'mode',
  'conclusion',
  'findingCount',
  'redactionCount',
]);

export class AllowlistedHostedTelemetry {
  readonly #sink: (event: HostedTelemetryEvent) => void;

  public constructor(sink: (event: HostedTelemetryEvent) => void) {
    this.#sink = sink;
  }

  public emit(event: HostedTelemetryEvent): void {
    const unexpected = Object.keys(event).filter((key) => !TELEMETRY_PROPERTIES.has(key));
    if (unexpected.length > 0) throw new Error('Hosted telemetry contains a forbidden property.');
    this.#sink(Object.freeze({ ...event }));
  }
}
