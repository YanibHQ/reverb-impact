# Next-generation security and consent

This document extends the existing [security model](../cross-repo-impact/security.md). Existing
rules remain normative.

## Scope is a security boundary

A consumer allowlist is not a presentation filter. Membership, authorization, and consent are
resolved before generation selection, source access, evidence queries, retrieval, or model calls.
Ports receive a scoped read capability and fail closed when a requested repository is not included.
Tests use stores/readers that throw and record a canary if an unselected repository is touched.

The result may state that requested entries were unauthorized or unavailable only through bounded,
non-identifying coverage reasons. It must not reveal names, counts, graph edges, or existence of
repositories outside the selected scope.

## Sensitive new inputs

- Event destinations and infrastructure topology may reveal business relationships.
- Database/table/column identities may reveal data models.
- Routes and service aliases may reveal private endpoints.
- Configuration and secret *references* may reveal operational controls.
- Helm/Terraform state and live provider APIs may contain secrets and are not input by default.

Adapters parse untrusted static artifacts inside the existing sandbox. They never execute templates,
application code, package scripts, Terraform, Helm plugins, or provider CLIs; they never contact
brokers, databases, clusters, registries, secret stores, or cloud control planes.

## Secrets

Secret values are never collected. Recognized secret references are represented by a typed provider
kind and a salted/qualified identifier hash unless policy explicitly permits a display-safe name.
Environment values, `.tfvars`, Kubernetes Secret payloads, process environments, credentials, and
state files are excluded or redacted before parsing and covered by telemetry canaries.

## AI and retrieval

Reasoning requires separate host declarations for model capability, data-region/retention policy,
repository consent, and the requested analysis. Prompt injection is treated as untrusted source text.

- Retrieval is limited to exact evidence handles inside the resolved analysis scope.
- Query and result counts, bytes, snippets, tokens, and time are bounded.
- Provider credentials exist only in the host adapter and never in parser/storage records.
- Prompts omit tokens, secret values, unrelated paths, comments, and raw provider payloads.
- Responses are data, validated against a closed schema; they cannot invoke tools or widen retrieval.
- Citations must resolve to supplied authorized evidence and are rechecked before persistence.
- Provider/model/template/retrieval versions and a redacted input hash are recorded.
- Failure, timeout, refusal, malformed output, or revoked consent changes no deterministic finding.
- Deletion removes retained prompts/responses, cached retrieval material, embeddings if enabled, and
  derived hypotheses, subject to the accurately documented backup/provider retention policy.

Reasoning telemetry contains closed failure/count/latency fields only. It never contains prompts,
responses, repository/service/contract identifiers, source, snippets, or nearest-neighbor text.

## Infrastructure permissions

This feature adds no provider write permission. Static Terraform/Kubernetes/Helm parsing needs only
the existing authorized source read. Live state, broker, database, cluster, secret, and cloud API
credentials are explicitly out of scope. Existing GitHub check writes remain separately authorized
and disabled by default.
