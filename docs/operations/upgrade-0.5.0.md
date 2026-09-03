# Reverb 0.5.0 host upgrade checklist

Use this checklist for any host, including a future Yanib integration. Reverb remains a standalone
package family and does not read or modify Yanib code, tables, tenancy, billing, or deployment state.

## Before upgrading

- Pin one reviewed Reverb candidate commit and all package versions to exact `0.5.0`.
- Verify package checksums, npm provenance after publication, the CycloneDX SBOM, and license/audit
  results.
- Drain or disable delivery workers and keep check/action writes off.
- Record the current registry revision, selected repositories, exact default-branch heads, and active
  generation IDs.
- Take and test a transactionally consistent PostgreSQL/SQLite and object-cache backup. Include v2
  tables in physical backup policy if reasoning/analysis history must be restorable.
- Confirm rollback can restore the pre-upgrade migration level before a 0.4 binary is restarted.

## Install and migrate

- Install the required host-neutral packages at exact `0.5.0`; do not mix Reverb minors.
- Add only the new adapter packages the host will operate. Reasoning is a separate optional package.
- Apply SQLite migration 8 or PostgreSQL migration 4 once through the owning store migration API.
- Run schema negotiation tests, the shared host/store conformance suites, and a 0.4-record read check.
- Keep the v1 analysis route available while the host adds `AnalyzePullRequestV2` explicitly.

## Configure v2 analysis

- Build one immutable registry revision containing only current workspace members and consent state.
- Require the host to pass an explicit bounded consumer allowlist. An empty list must remain
  producer-only; no graph or organization query may expand it.
- Supply stable namespaces/aliases/config revisions required by each enabled adapter.
- Create independent bootstrap, incremental, pull-request, reasoning, and delivery queues/budgets.
- Index only selected repositories. Perform an initial index for each newly enabled adapter family;
  retain existing 0.4 TypeScript/OpenAPI/Protobuf generations.
- Pass exact producer base/head and producer-as-consumer head evidence to v2 analysis.
- Treat missing/stale/unsupported/failed family coverage as partial and never as a clean result.

## Optional reasoning

- Leave the model switch off unless a provider adapter and data policy have been separately approved.
- Implement `ReasoningConsentPortV1`, `ReasoningRetrievalPortV1`, and `ReasoningPortV1` outside core.
- Enforce provider region/retention, cancellation, rate/cost limits, and repository-level model-export
  consent before retrieval.
- Propagate deletion to retrieval caches, embeddings if any, provider-retained data, and backups in
  addition to calling `purgeReasoningRunV2()`.
- Run fake-provider, cross-scope, secret, injection, timeout, refusal, malformed-output, telemetry,
  and deterministic-isolation canaries before any live experiment.

## GitHub and Yanib host boundary

- A selected-repository GitHub App needs Contents read and Metadata read for source/indexing.
- Checks write is needed only when advisory check delivery is explicitly enabled. Issues write is not
  required by Reverb core and should be added only for a separate host-owned issue workflow.
- Provision Reverb-owned PostgreSQL storage and credentials separately from Yanib application data.
- Add runtime and migration connection URLs to the deployment secret manager; never commit them.
- Implement host adapters for source acquisition, registry/consent, v2 adapter orchestration,
  coverage storage, projection, and delivery in a follow-up integration change. Installing packages
  alone does not connect them to Yanib.
- Expose repository selection and per-repository PR impact enablement through host-owned controls.

## Staged rollout

Enable independently and observe each stage before proceeding:

1. source read and exact-revision acquisition;
2. initial/incremental indexing for one preview family;
3. v2 analysis in shadow mode with an explicit allowlist;
4. host projection with no external write;
5. advisory check write for a separately promoted deterministic stratum;
6. optional action writes only after their own authorization and policy review.

Reasoning remains off unless separately approved. All new 0.5 strata begin `UNMEASURED`, so the
default outcome is preview/shadow rather than a blocking conclusion.

## Verify and roll back

- Compare v1 canonical output against the frozen 0.4 fixture with all new capabilities disabled.
- Exercise same-repository and selected cross-repository positive, partial, and scope-canary cases.
- Confirm no unselected repository source/generation/evidence/retrieval port was touched.
- Confirm a failed optional adapter/model does not remove or alter deterministic findings.
- Reconcile queued jobs, exact heads, analysis hashes, projection mode, and deletion state.
- To roll back, disable writes/model/new adapters, drain v2 workers, and restore the pre-upgrade
  database/object backup before returning to exact 0.4 packages.

Do not publish, deploy, migrate production, change GitHub App permissions, or modify Yanib as part of
repository candidate preparation. Those actions require explicit operator approval.
