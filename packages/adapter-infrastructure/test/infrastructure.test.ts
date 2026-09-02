import {
  canonicalJson,
  configRevision,
  contentHash,
  repoPath,
  sha256Bytes,
} from '@yanib/reverb-domain';
import type { ArtifactInput } from '@yanib/reverb-adapter-sdk';
import { describe, expect, it } from 'vitest';

import {
  INFRASTRUCTURE_ADAPTER_MANIFEST,
  infrastructureAdapter,
  infrastructureEndpointKey,
  infrastructureOutputKey,
  infrastructureServiceKey,
} from '../src/index.js';

const revision = configRevision(`cfg_sha256:${'1'.repeat(64)}`);
const context = {
  infrastructureEnvironment: 'production',
  infrastructureServiceScope: 'payments',
  helmValues: { serviceName: 'billing', servicePort: 8080 },
  terraformRemoteStates: {
    platform: { environment: 'production', serviceScope: 'platform' },
  },
} as const;

function artifact(
  path: string,
  text: string,
  classification: ArtifactInput['classification'] = 'source',
): ArtifactInput {
  const bytes = new TextEncoder().encode(text);
  return {
    path: repoPath(path),
    contentHash: contentHash(sha256Bytes(bytes)),
    bytes,
    classification,
  };
}

const service = `apiVersion: v1
kind: Service
metadata:
  name: billing
spec:
  ports:
    - port: 8080
      protocol: TCP
`;
const ingress = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: public
spec:
  rules:
    - http:
        paths:
          - backend:
              service:
                name: billing
                port:
                  number: 8080
`;

describe('infrastructure adapter', () => {
  it('joins Kubernetes Service definitions to Ingress service and endpoint references', async () => {
    const result = await infrastructureAdapter.extract({
      artifacts: [artifact('k8s/service.yaml', service), artifact('k8s/ingress.yaml', ingress)],
      configRevision: revision,
      context,
    });
    const serviceKey = infrastructureServiceKey({
      environment: 'production',
      serviceScope: 'payments',
      serviceName: 'billing',
    });
    const endpointKey = infrastructureEndpointKey({
      serviceKey,
      port: '8080',
      protocol: 'TCP',
    });
    expect(result.coverage.state).toBe('complete');
    expect(result.definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalKey: serviceKey,
          evidenceStratum: 'kubernetes_manifest',
        }),
        expect.objectContaining({ canonicalKey: endpointKey, activation: 'on_deploy' }),
      ]),
    );
    expect(result.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canonicalKey: serviceKey }),
        expect.objectContaining({ canonicalKey: endpointKey }),
      ]),
    );
  });

  it('extracts workload and container identities without conflating their kinds', async () => {
    const deployment = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: billing
spec:
  template:
    spec:
      containers:
        - name: api
          image: example.invalid/billing:latest
`;
    const result = await infrastructureAdapter.extract({
      artifacts: [artifact('kubernetes/deployment.yaml', deployment)],
      configRevision: revision,
      context,
    });
    expect(result.definitions.map((item) => item.canonicalKey)).toEqual(
      expect.arrayContaining([
        infrastructureServiceKey({
          environment: 'production',
          serviceScope: 'payments',
          serviceName: 'deployment/billing',
          identityKind: 'workload',
        }),
        infrastructureServiceKey({
          environment: 'production',
          serviceScope: 'payments',
          serviceName: 'billing/api',
          identityKind: 'container',
        }),
      ]),
    );
  });

  it('renders only declared scalar Helm values and keeps template offsets', async () => {
    const template = `apiVersion: v1
kind: Service
metadata:
  name: {{ .Values.serviceName }}
spec:
  ports:
    - port: {{ .Values.servicePort }}
`;
    const result = await infrastructureAdapter.extract({
      artifacts: [artifact('templates/service.yaml', template)],
      configRevision: revision,
      context,
    });
    expect(result.coverage.state).toBe('complete');
    expect(result.definitions).toHaveLength(2);
    expect(
      result.definitions.find((item) => item.contractKind === 'infrastructure.service'),
    ).toMatchObject({
      evidenceStratum: 'helm_rendered_manifest',
      range: { startLine: 4 },
    });
  });

  it('resolves Terraform outputs through an explicitly declared remote-state scope', async () => {
    const producer = `output "service_url" {
  value = "https://billing.internal"
}`;
    const consumer = `locals {
  billing_url = data.terraform_remote_state.platform.outputs.service_url
}`;
    const producerResult = await infrastructureAdapter.extract({
      artifacts: [artifact('terraform/outputs.tf', producer)],
      configRevision: revision,
      context: { infrastructureEnvironment: 'production', infrastructureServiceScope: 'platform' },
    });
    const consumerResult = await infrastructureAdapter.extract({
      artifacts: [artifact('terraform/consumer.tf', consumer)],
      configRevision: revision,
      context,
    });
    const key = infrastructureOutputKey({
      environment: 'production',
      serviceScope: 'platform',
      outputName: 'service_url',
    });
    expect(producerResult.definitions).toContainEqual(
      expect.objectContaining({ canonicalKey: key }),
    );
    expect(consumerResult.references).toContainEqual(
      expect.objectContaining({ canonicalKey: key }),
    );
  });

  it('marks removals breaking and additions compatible only with complete coverage', async () => {
    const base = await infrastructureAdapter.extract({
      artifacts: [artifact('k8s/service.yaml', service)],
      configRevision: revision,
      context,
    });
    const head = await infrastructureAdapter.extract({
      artifacts: [artifact('k8s/other.yaml', service.replaceAll('billing', 'ledger'))],
      configRevision: revision,
      context,
    });
    const diff = await infrastructureAdapter.diff({
      base,
      head,
      configRevision: revision,
      context,
    });
    expect(diff.changes.filter((item) => item.compatibility === 'breaking')).toHaveLength(2);
    expect(diff.changes.filter((item) => item.compatibility === 'compatible')).toHaveLength(2);
  });

  it('reports missing scope, unresolved templates and remote-state aliases as partial', async () => {
    const result = await infrastructureAdapter.extract({
      artifacts: [
        artifact('k8s/service.yaml', service),
        artifact(
          'charts/billing/templates/unknown.yaml',
          service.replace('billing', '{{ include "billing.fullname" . }}'),
        ),
        artifact(
          'terraform/consumer.tf',
          'value = data.terraform_remote_state.unknown.outputs.service_url',
        ),
      ],
      configRevision: revision,
      context: {},
    });
    expect(result.coverage.state).toBe('partial');
    expect(result.coverage.limitations.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'infrastructure_scope_missing',
        'helm_template_unresolved',
        'terraform_remote_state_alias_unresolved',
      ]),
    );
  });

  it('does not treat unrelated YAML as infrastructure and excludes generated infrastructure', async () => {
    const result = await infrastructureAdapter.extract({
      artifacts: [
        artifact('.github/workflows/ci.yaml', 'name: CI\non:\n  push:\n'),
        artifact('generated/k8s/service.yaml', service, 'generated'),
      ],
      configRevision: revision,
      context,
    });
    expect(result.coverage).toMatchObject({
      state: 'partial',
      eligibleArtifacts: 1,
      limitations: [expect.objectContaining({ code: 'generated_infrastructure_excluded' })],
    });
  });

  it('declares no execution tools and remains preview-only', () => {
    expect(INFRASTRUCTURE_ADAPTER_MANIFEST).toMatchObject({
      family: 'infrastructure',
      externalTools: [],
      evidenceStrata: expect.arrayContaining([
        expect.objectContaining({ promotionState: 'UNMEASURED' }),
      ]),
    });
    expect(canonicalJson(INFRASTRUCTURE_ADAPTER_MANIFEST)).not.toContain('provider credential');
  });
});
