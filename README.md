<p align="center">
  <img src="docs/assets/reverb-logo.png" alt="Reverb logo: an R-shaped evidence graph emitting traceable impact signals" width="180" />
</p>

<h1 align="center">Reverb</h1>

Reverb is an evidence-first engine that answers one question before a pull request merges:

> Which code in this repository—or another repository in the same engineering workspace—can this change affect, and what evidence supports that claim?

Reverb is a standalone public project owned and published by the `YanibHQ` organization. Its core,
hosts, storage, CLI, schemas, tests, and release process live entirely in this repository and do not
read or modify Yanib. Any future product integration uses the public host boundary.

## Status

**Phases 000–006 implemented as a standalone local release candidate.** The project constitution, immutable repository index,
local Git/SQLite host, versioned adapters, temporal evidence graph, exact PR analyzer, local finding
preview, append-only reviews, suppressions, corpus/evaluation machinery, and frozen policy simulator
are implemented, together with the standalone PostgreSQL/GitHub reference-host boundary,
whole-audience disclosure projection, accessible detail/review surface, advisory check planner, and
hard-disabled writer. Public root APIs, schema/storage compatibility metadata, host conformance v1,
an independent minimal host, self-host/extension guides, and a reproducible release benchmark are
also implemented. Every adapter evidence stratum remains `UNMEASURED`; persisted findings are
preview-only and no external delivery is authorized or publicly released.

The Phase 003 comparison executed Repowise 0.46.0 at
`0847cbff32c0c113ad46e2699ae87a795238d431` on 2026-08-28. Repowise correctly linked the same
removed package symbol to its consumer, so Reverb records parity on that fixture and does not claim
to be “Repowise, but cross-repo.” Its intended contribution is a narrower PR-time evidence
protocol:

- repository membership obtained from a GitHub App installation, without requiring co-located checkouts;
- immutable base and head index generations, with a pull-request overlay rather than “previous local scan versus current local scan”;
- contract changes joined to exact downstream uses, with every finding carrying inspectable producer and consumer evidence;
- coverage, freshness, and abstention represented separately from confidence;
- a measured promotion path from preview to an advisory check, per contract kind and evidence class;
- separate permissions for indexing, disclosure, and writing a check;
- a host-neutral Apache-2.0 core intended to be embedded by products such as Yanib.

## Documentation map

| Document | Purpose |
| --- | --- |
| [Feature overview](features/cross-repo-impact/README.md) | Product boundary, users, scenarios, phases, and definition of done |
| [Shared specification](features/cross-repo-impact/spec.md) | Invariants, functional and non-functional requirements, success criteria |
| [Architecture](features/cross-repo-impact/architecture.md) | Components, data flow, data model, indexing and PR-overlay algorithms |
| [Implementation plan](features/cross-repo-impact/plan.md) | Decisions, sequencing, technology choices, risks, and verification strategy |
| [Implementation tasks](features/cross-repo-impact/tasks.md) | Traceable build checklist and release gates |
| [API contracts](features/cross-repo-impact/api.md) | Library, CLI, JSON, webhook, and reference-host interfaces |
| [Security and privacy](features/cross-repo-impact/security.md) | Trust model, consent, isolation, disclosure, retention, and abuse cases |
| [Packaging and adoption](features/cross-repo-impact/packaging.md) | Public packages, license, compatibility, extension SDK, and Yanib integration |
| [Research](features/cross-repo-impact/research/) | Repowise teardown, prior art, taxonomy, evaluation protocol, and paper plan |
| [Phases](features/cross-repo-impact/phases/) | Phase-level specifications, plans, and executable task lists |
| [Phase 000 verification](docs/verification/phase-000.md) | Local constitution/release evidence and remaining external controls |
| [Phase 001 verification](docs/verification/phase-001.md) | Indexing, equivalence, conformance, adversarial, and CLI evidence |
| [Phase 002 verification](docs/verification/phase-002.md) | Adapter identity, compatibility, sandbox, determinism, admission, and license evidence |
| [Phase 003 verification](docs/verification/phase-003.md) | Temporal graph, exact PR analysis, findings, local CLI, conformance, and safety evidence |
| [Phase 003 comparison](docs/verification/phase-003-comparison.md) | Current Repowise/reduced baselines and continue/interoperate decision |
| [Phase 004 verification](docs/verification/phase-004.md) | Reviews, suppressions, corpus/evaluation, policy replay, and remain-preview decision |
| [Phase 005 verification](docs/verification/phase-005.md) | PostgreSQL/GitHub host, disclosure, check safety, shadow evidence, and external rollout gate |
| [Phase 006 verification](docs/verification/phase-006.md) | Public APIs, compatibility, three-host conformance, standalone adoption, and release limitations |
| [Public package API](docs/api/public-packages.md) | Supported root entry points, errors, states, and host responsibilities |
| [Compatibility](docs/compatibility/versioning.md) | Package/schema/storage/adapter upgrade, re-index, and calibration policy |
| [Self-hosting](docs/operations/self-host.md) | Local and hosted install, backup, upgrade, incident, and disable guidance |
| [Label handbook](docs/evaluation/label-handbook.md) | Closed three-axis labels, reasons, adjudication, and corpus rules |
| [Adapter lifecycle](docs/adapters/lifecycle.md) | Versioning, artifact behavior, pinned tool inventory, and preview admission reports |

## Intended first release

The first release is deliberately smaller than the full taxonomy:

1. a deterministic repository snapshot format;
2. an adapter SDK plus TypeScript package, OpenAPI/HTTP, and Protobuf/gRPC adapters;
3. cross-repository producer-to-consumer joins for an explicitly configured workspace;
4. local CLI analysis and a GitHub App reference host;
5. preview-only findings until a human-labelled corpus promotes an evidence class;
6. advisory checks only—never merge-blocking.

GraphQL, messaging, shared database schemas, environment/config keys, Terraform, and additional languages enter through the same adapter admission gate after the first vertical slice is measured.

## Project identity

- **Product name:** Reverb
- **GitHub organization:** `YanibHQ`
- **Repository:** `YanibHQ/reverb-impact`
- **CLI binary:** `reverb`
- **Package scope:** `@yanibhq/reverb-*`
- **Code license:** Apache-2.0
- **Planned benchmark/data license:** a separately reviewed permissive data license; private partner data is never published by default

The repository name is intentionally more specific than the product name. “Reverb” is memorable but not unique enough to be a safe unscoped package name. Publishing and trademark availability remain Phase 000 checks.

## Non-goals

Reverb is not a general code-chat product, service catalog, developer portal, graph visualizer, autonomous fixer, or universal semantic search engine. Embeddings may support operator search later; they are not evidence for an impact finding.

Reverb does not execute repository code. It parses source and declaration files, consumes pre-generated indexes where available, and runs any third-party differ in a network-denied, resource-bounded sandbox.

## Reading order for implementers

Read the [shared specification](features/cross-repo-impact/spec.md), then the [architecture](features/cross-repo-impact/architecture.md), then start at [Phase 001](features/cross-repo-impact/phases/001-repository-index/). Do not start with a detector: stable identity, immutable generations, coverage, and the host ports are the foundation every detector relies on.
