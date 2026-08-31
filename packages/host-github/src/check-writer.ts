import type { CheckDeliveryPlan, ProviderAnnotation } from '@yanib/reverb-domain';

import type { HostedOperationalControls } from './controls.js';

export interface GitHubWriteTokenBroker {
  withWriteToken<Value>(
    input: { readonly installationId: number; readonly repositoryExternalId: number },
    operation: (token: string) => Promise<Value>,
  ): Promise<Value>;
}

export interface GitHubChecksClient {
  upsertCheck(input: {
    readonly token: string;
    readonly repositoryExternalId: number;
    readonly externalId?: string;
    readonly idempotencyKey: string;
    readonly name: 'Reverb Impact';
    readonly headSha: string;
    readonly conclusion: 'success' | 'neutral' | 'skipped';
    readonly title: string;
    readonly summary: string;
    readonly text: string;
    readonly annotations: readonly ProviderAnnotation[];
  }): Promise<{ readonly externalId: string }>;
}

export interface CheckWriteResult {
  readonly state:
    | 'delivered'
    | 'shadow'
    | 'disabled'
    | 'unauthorized'
    | 'superseded'
    | 'not_eligible';
  readonly externalId?: string;
  readonly requests: number;
}

function chunks<Value>(values: readonly Value[], size: number): readonly (readonly Value[])[] {
  if (values.length === 0) return [[]];
  const result: Value[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function renderSafeCheckText(plan: CheckDeliveryPlan): string {
  const projection = plan.projection;
  const findings = projection.findings.map(
    (finding, index) =>
      `${index + 1}. ${finding.summary}\n` +
      `   Evidence: ${finding.evidenceStratum} (promoted ${finding.measurement.decidedAt})\n` +
      `   Remedy: ${finding.remedy.text}`,
  );
  return [
    'This result is advisory and never blocks merge.',
    ...findings,
    ...projection.limitations.map((limitation) => `Limitation: ${limitation}`),
    `Authorized detail: ${projection.detailUrl}`,
  ]
    .join('\n\n')
    .slice(0, 60_000);
}

export class GitHubCheckWriter {
  readonly #tokens: GitHubWriteTokenBroker;
  readonly #client: GitHubChecksClient;
  readonly #controls: HostedOperationalControls;

  public constructor(input: {
    readonly tokens: GitHubWriteTokenBroker;
    readonly client: GitHubChecksClient;
    readonly controls: HostedOperationalControls;
  }) {
    this.#tokens = input.tokens;
    this.#client = input.client;
    this.#controls = input.controls;
  }

  public async write(input: {
    readonly installationId: number;
    readonly repositoryExternalId: number;
    readonly plan: CheckDeliveryPlan;
    readonly existingExternalId?: string;
    readonly reauthorize: () => Promise<boolean>;
    readonly currentHead: () => Promise<string>;
  }): Promise<CheckWriteResult> {
    if (input.plan.mode === 'shadow') return { state: 'shadow', requests: 0 };
    if (input.plan.mode !== 'write') return { state: 'not_eligible', requests: 0 };
    if (this.#controls.snapshot().writeDisabled) return { state: 'disabled', requests: 0 };
    if (!(await input.reauthorize())) return { state: 'unauthorized', requests: 0 };
    if ((await input.currentHead()) !== input.plan.projection.headSha) {
      return { state: 'superseded', requests: 0 };
    }
    const annotationBatches = chunks(input.plan.projection.annotations, 50);
    return this.#tokens.withWriteToken(
      {
        installationId: input.installationId,
        repositoryExternalId: input.repositoryExternalId,
      },
      async (token) => {
        let externalId = input.existingExternalId;
        let requests = 0;
        for (const annotations of annotationBatches) {
          const result = await this.#client.upsertCheck({
            token,
            repositoryExternalId: input.repositoryExternalId,
            ...(externalId === undefined ? {} : { externalId }),
            idempotencyKey: input.plan.projection.checkKey,
            name: 'Reverb Impact',
            headSha: input.plan.projection.headSha,
            conclusion: input.plan.projection.conclusion,
            title: input.plan.projection.title,
            summary: input.plan.projection.summary,
            text: renderSafeCheckText(input.plan),
            annotations,
          });
          externalId = result.externalId;
          requests += 1;
        }
        if (externalId === undefined)
          throw new Error('GitHub check writer returned no external ID.');
        return { state: 'delivered', externalId, requests };
      },
    );
  }
}
