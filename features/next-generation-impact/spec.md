# Next-generation impact specification

## 1. Objective

Reverb `0.5.0` must identify evidence-backed impact across five additional dependency families while
preserving `0.4.0` behavior and public contracts. The result must remain reproducible, bounded,
authorization-safe, and useful without a model provider or hosted product.

Normative words `MUST`, `MUST NOT`, `SHOULD`, and `MAY` have their RFC 2119 meanings.

## 2. Compatibility requirements

1. Existing `0.4.0` root exports MUST remain available with the same meaning and assignability.
2. Existing schema-major 1 files and canonical serialization MUST remain byte-for-byte unchanged.
3. Existing `AnalyzePullRequest` input and output behavior MUST remain unchanged.
4. New required fields or closed-vocabulary members MUST use a negotiated schema-major 2 contract.
5. Hosts MAY run v1 and v2 concurrently; refusing an unsupported major MUST use a stable error.
6. Storage migrations MUST be additive and forward-only. All `0.4.0` records remain readable.
7. Existing adapter IDs, identity versions, and evidence meanings MUST NOT change.
8. Every package in the release train MUST use one fixed `0.5.0` version.
9. With new features omitted or disabled, canonical v1 results MUST match the frozen `0.4.0`
   fixtures exactly.

## 3. Scoped analysis

The v2 host contract accepts an optional `consumerScope`.

- Omitted scope selects `legacy`, which delegates to the exact `0.4.0` selection behavior.
- Present scope selects `allowlist` and contains zero or more repository stable IDs.
- The producer is always included, regardless of whether it appears in the allowlist.
- An empty allowlist therefore means same-repository analysis only.
- IDs are normalized, deduplicated, and sorted before hashing.
- No dependency, service, organization, team, or graph traversal expands the set.
- Each selected repository must be a member of the chosen immutable registry revision and separately
  authorized for `evidence.consume` before any generation lookup or source read.
- Unselected repositories MUST NOT be read, indexed, queried for evidence, retrieved for AI, named
  in diagnostics, or exposed through counts.

The canonical scope provenance includes mode, producer ID, normalized selected IDs, registry
revision, consent revisions, authorization decision hashes, and a versioned SHA-256 scope hash.

## 4. Deterministic adapter families

Each family owns canonical identity, extraction, compatibility, activation, coverage, diagnostics,
fixtures, admission metadata, and an independent package. A finding still requires a changed
producer definition and a concrete selected-consumer reference.

### 4.1 Events and queues

Support Kafka, AWS SQS/SNS, and Google Cloud Pub/Sub configuration and source bindings. Extract
producers, consumers, broker namespace, topic/queue/subscription identities, payload schema
references, ordering/delivery declarations, and compatibility changes. Names assembled dynamically,
runtime-created destinations, framework indirection, and missing schema registries produce explicit
unknown/partial coverage.

### 4.2 Shared database and migrations

Support additive parsing of SQL migrations, schema declarations, recognized ORM metadata, and
bounded query/read/write references. Canonical identities distinguish database instance/alias,
schema, table, column, and enum. Destructive or narrowing changes are separated from activation
timing. Dynamic SQL, stored procedures outside supported dialects, generated migrations, and
unresolved connection aliases are gaps, never absence proofs.

### 4.3 HTTP without OpenAPI

Extract framework routes and client calls when an OpenAPI document is unavailable. Resolve stable
service aliases, methods, normalized route templates, bounded string composition, and framework
routing conventions. Dynamic hosts, arbitrary URL construction, runtime route registration, proxy
rewrites, and unsupported frameworks are explicit limitations. OpenAPI evidence remains a distinct,
higher-specificity lane and is not silently replaced.

### 4.4 Environment, configuration, feature flags, and secret references

Extract definitions and reads of environment/configuration keys, feature-flag identifiers, and
secret *references*. Values and secret material MUST NOT enter artifacts, telemetry, evidence,
prompts, or outputs. Identity includes a host-supplied configuration namespace and key; environment
activation remains separate. Indirect computed keys and provider-specific resolution outside the
supported adapter surface are coverage gaps.

### 4.5 Infrastructure and deployment

Support Kubernetes manifests, Helm templates within declared value bounds, Terraform configuration,
service discovery, ingress, outputs, container/service identifiers, and deployment wiring. Identities
are qualified by registry-provided environment and service scope. Arbitrary template execution,
provider network access, live-cluster reads, and `terraform apply/plan` are forbidden. Unknown
template functions/modules and runtime controller mutations are reported.

## 5. Result and evidence semantics

V2 adds new contract kinds and a separate `ai_inferred` evidence basis. Deterministic findings use
existing bases where their meaning applies or new adapter-specific exact/registry-resolved bases
defined only in v2. Every result includes:

- exact producer base/head and consumer generation identities;
- adapter, parser, identity, and compatibility versions;
- registry, consent, configuration, and scope provenance;
- per-family and per-repository coverage;
- bounded limitations for unsupported, failed, truncated, stale, or unauthorized input;
- deterministic findings and AI hypotheses as separate collections.

A partial family or repository may contribute positive evidence. It cannot support a negative
assurance claim. Result status MUST reflect the minimum coverage needed for each claim.

## 6. Optional AI reasoning

AI is disabled by default and requires an explicit host capability and policy decision. The lane:

1. receives deterministic graph seeds and a bounded retrieval budget;
2. retrieves only already-authorized artifacts inside the normalized consumer scope;
3. sends minimal, redacted context through a provider-neutral `ReasoningPort`;
4. validates a strict, versioned structured candidate result;
5. verifies every citation against the supplied evidence set;
6. emits a separately labelled hypothesis or a bounded `needs_investigation` outcome.

It MUST NOT remove, modify, reprioritize, merge into, or manufacture exact deterministic findings.
Timeouts, provider failures, invalid JSON, missing citations, policy denial, or disabled operation
leave deterministic output unchanged. Model/provider/version, prompt-template version, retrieval
policy, inputs hash, citations, latency, token accounting when available, and failure category form
the provenance record. Consent revocation and deletion propagate to prompts, caches, indexes, and
provider retention according to host policy.

## 7. Performance and boundedness

- Pull-request analysis uses exact base/head overlays and previously selected immutable consumer
  generations; it does not scan an organization.
- Indexing and PR analysis have separate declared budgets.
- Every parser and retrieval operation has file/count/byte/time/output bounds.
- Incremental results must be semantically equivalent to clean rebuilds.
- Scope size, query count, artifacts read, and bytes retrieved are observable without exposing
  repository identity.
- Exceeding a budget yields partial coverage and a stable diagnostic, not silent truncation.

## 8. Acceptance criteria

- Each adapter proves producer-to-consumer and producer-as-consumer impact with positive, negative,
  partial, adversarial, and equivalence fixtures.
- Scope enforcement is tested below CLI/UI orchestration with read canaries proving unselected
  repositories are never accessed.
- AI-off v1 outputs are canonical fixture matches against `0.4.0`.
- v1 and v2 schema negotiation, unsupported-major behavior, forward migrations, and rollback by old
  readers are tested.
- Existing CI, release verification, and all old goldens pass.
- `pnpm run ci` and `pnpm release:verify` pass from a clean checkout.
