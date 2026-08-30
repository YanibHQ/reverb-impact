# Prior Art

**Status:** dated landscape review  
**Review date:** 2026-08-28  
**Scope:** systems relevant to pre-merge, cross-repository consumer impact; negative claims are intentionally qualified.

## Revised conclusion

This is not an empty field. Repowise already implements broad local cross-repository contract linking and PR-oriented risk. DepRadar already studies PR/commit-time downstream-client impact in a specialized domain. Pact proves pre-merge provider/consumer verification when consumers publish contracts. Monorepo build systems solve affectedness when every consumer shares a graph. Schema differs solve compatibility without identifying real consumers.

Reverb’s defensible question is narrower:

> Can a provider-hosted, multi-contract analyzer join exact PR changes to structurally proven consumers at recorded repository snapshots, abstain when relevant coverage is incomplete, disclose results safely across unequal ACLs, and deliver materially better actionable precision than simpler fanout/search methods?

The answer is a hypothesis until evaluated.

## Capability map

| System family | Pre-merge | Consumer-aware | Cross-repo | Semantic compatibility | Main reduction/limit |
| --- | :---: | :---: | :---: | :---: | --- |
| Repowise workspace | yes | yes | yes | partial by contract kind | local workspace/current scan semantics; different governance/licensing boundary |
| DepRadar | yes | yes | yes | domain-specific | deep-learning defect trigger conditions |
| Pact/Pact Broker | yes | yes | yes | interactions in published contracts | consumers must author/publish contracts |
| `buf breaking`, OpenAPI/GraphQL/API differs | yes | no | artifact can live anywhere | yes/partial | no proof of actual consumer |
| Bazel/Buck2/Nx/Pants affected graph | yes | yes within graph | normally one workspace/graph | no API semantics | declared build graph and shared revision context |
| CodeQL multi-repo variant analysis | not normally PR consumer impact | no dependency semantics | yes | query-dependent | security/research query over selected default-branch databases |
| Runtime/deployment telemetry | often after merge/deploy | yes | yes | observes behavior | late signal; environment dependent |
| Large-scale code indexes (Glean/Kythe/SCIP) | building block | references available | possible | no by themselves | index/protocol, not complete impact policy |

This table is a problem decomposition, not a leaderboard. Support depth varies by contract and release.

## Nearest current product: Repowise

Repowise’s current workspace documentation describes multiple repositories, API contract extraction, provider-consumer matching, breaking-change guard and cross-repository impact workflows ([official workspace documentation](https://github.com/repowise-dev/repowise/blob/main/docs/scale/WORKSPACES.md)).

Consequences:

- delete every “Repowise is single-repo” statement;
- do not present blast radius or cross-repo linking as novel;
- benchmark exact shared strata rather than comparing marketing feature lists;
- make exact base/head and consumer snapshot semantics observable;
- make coverage, labels, abstention and ACL projection first-class;
- preserve a stop/reposition gate if those additions do not create measured user value.

The [pinned teardown](repowise-teardown.md) records observed revision, current limits, licensing and comparison protocol.

## Three common reductions

### One build graph

Google TAP, Bazel affected tests, Meta Buck2 change detection, Nx and Pants can traverse reverse dependencies before merge when all relevant targets share declared graph semantics. This is powerful and exact for the graph it has.

It misses polyrepo runtime contracts that are not build dependencies: independently deployed HTTP services, broker topics, physical databases, environment keys, public packages at different versions, and consumers outside the build workspace.

Reverb should ingest these graphs when available. It should not reimplement their schedulers.

### Producer artifact versus previous artifact

Tools such as `buf breaking`, `oasdiff`, GraphQL Inspector, .NET ApiCompat, Java binary-compatibility tools and model-specific differs identify compatibility changes precisely for supported semantics. They intentionally do not know which concrete repositories or call sites consume the contract.

Reverb wraps/pins their results and adds consumer identity, version/activation timing, coverage and policy. Reimplementing mature differs would create breadth without product value.

### Consumer declaration or observation

Pact verifies published consumer expectations against providers and can make deployment decisions before release. Runtime telemetry and deployment orchestration observe actual clients/environments, often later.

Pact’s explicit participation produces strong evidence but coverage equals adoption. Reverb tests whether repository source/build artifacts can supply useful evidence without requiring a second hand-authored contract. That inference is fallible, so calibration and abstention are central rather than optional.

## Google systems

- **TAP:** selects and runs tests transitively affected by a change inside Google’s shared build/repository environment. It finds failing tests, not arbitrary cross-repository API consumers.
- **Tricorder:** integrates program-analysis results into code review and includes affected-target information. Its deployment supports review-time placement and non-blocking informational analyzers, but it is not the same cross-repository contract problem.
- **Rosie/large-scale changes:** coordinate migrations after a change strategy is known; they are execution systems rather than breakage discovery.
- **Kythe:** supplies language-agnostic code-index/cross-reference schemas and services; it is a building block.

The transferable lesson is that affectedness becomes actionable when attached to a specific introduced change and remedy. A raw downstream count is insufficient.

## Meta systems

- **Buck2 change detection:** computes affected targets inside a build graph.
- **Infer:** differential static analysis placed in code review. Published deployment experience shows that workflow placement can materially change action rate even when analysis is unchanged. The evidence is based on a particular organization/sample and does not prove dashboards universally fail.
- **Zoncolan:** uses category-specific destinations: direct diff comments for high-signal classes, expert queues for others, and later analysis. This motivates per-stratum promotion rather than one global threshold.
- **Glean:** incremental multi-language code indexing with definitions/references and dependency/impact use cases. It is infrastructure on which impact products can be built.
- **SCARF:** consumer/dependency-aware large-scale deletion/deprecation planning across data sources, focused on current-state migration rather than an arbitrary PR overlay.

The summarized sources and boundaries are in [verified-citations.md](verified-citations.md).

## Microsoft and GitHub systems

- **CodeQL multi-repository variant analysis:** applies a query across many prebuilt repository databases. It demonstrates cross-repository query orchestration, but is not dependency-aware PR impact analysis and normally targets selected default-branch databases.
- **PublicApiAnalyzers/.NET ApiCompat:** make public API changes explicit in producer CI, with no concrete downstream consumer proof.
- **GitHub Checks/code scanning:** useful delivery/export surfaces with repository-scoped static output. They do not solve cross-repo authorization or finding semantics.
- **SARIF:** portable result export, not a canonical Reverb protocol because its standardized model does not capture Reverb’s coverage/evidence/authorization semantics. Producer-defined property bags are possible but not interoperable.

## Consumer-driven contracts

Pact is the strongest counterexample to “consumer awareness is impossible.” Consumers publish interactions; providers verify against them; broker matrices support release decisions.

Comparison:

| Pact-like model | Reverb hypothesis |
| --- | --- |
| Explicit consumer-authored interaction | Extracted structural consumer artifact |
| Coverage equals participating contracts | Coverage recorded from supported/parsed source and artifacts |
| High authority for recorded interaction | Evidence varies; weak classes abstain/preview |
| Verification can gate deployment | Reference Reverb remains advisory |
| Contract broker is shared coordination store | Repository index and temporal graph are shared store |

Reverb should ingest consumer contracts as high-authority evidence when available rather than compete with them.

## Compatibility tools

Initial Reverb adapters intentionally use mature semantics:

- Protobuf/gRPC: pinned `buf` compatibility policy;
- OpenAPI: pinned `oasdiff` or an equivalently evaluated tool plus Reverb operation/consumer mapping;
- TypeScript/npm: compiler/package-export semantics and resolved imports.

Potential later integrations include GraphQL Inspector, JVM/.NET/Rust API compatibility tools and schema-migration linters. Admission depends on a concrete design partner, canonical identity, consumer proof, coverage contract, remedy and evaluation—not tool availability alone.

## Code indexes and protocols

- **SCIP:** language-agnostic symbol/index protocol for definitions and references. Reverb may consume repository-owned SCIP artifacts.
- **Kythe:** graph schema and indexing ecosystem for cross-language code navigation.
- **Glean:** fact-based code indexing and query system.
- **LSIF:** earlier code-intelligence interchange relevant to repository navigation.

These systems can prove reference relationships for supported languages. They do not by themselves establish semantic breakage, activation timing, workspace permission or PR delivery policy.

## Academic work

### DepRadar

DepRadar is the closest published research identified. It analyzes library changes against downstream deep-learning clients using coordinated agents/trigger reasoning. Its official ICSE 2026 page and paper are linked in the [paper plan](research-paper.md).

It prevents a “first cross-repo PR impact” claim. Reverb can still test contributions around multiple contract forms, exact temporal repository state, structural joins, explicit coverage/abstention, ACL-safe product delivery and a different evaluation corpus.

### Ecosystem/API breakage studies

Historical ecosystem research studies API-breaking-change prevalence and downstream impact across repositories. This establishes that cross-project effect analysis long predates Reverb, even when studies are retrospective rather than PR-time product systems.

### Repair and migration systems

Client migration, automated repair and large-scale change systems address what to do after incompatibility is known. Their transformations/remedies are relevant future inputs, but detection and repair should remain separate claims.

### Just-in-time defect prediction

JIT defect prediction estimates whether a change is likely defect-prone from historical/process/code features. It is a useful methodological neighbor but answers a different question from “which named consumer contract is affected?” A probability of defect is not consumer evidence.

## Delivery evidence

The Infer experience supports showing high-signal findings while the author already has change context. It does not justify the absolute phrase “dashboards are where findings go to be ignored.” Expert-owned review queues can be effective, and Reverb needs a dashboard for preview, adjudication, coverage and restricted details.

The resulting product policy is:

- dashboard/preview first for measurement and expert review;
- PR advisory for promoted evidence strata;
- restricted consumer detail behind authenticated authorization;
- never blocking in the reference product;
- workflow action reported separately from correctness.

## Research gap, stated defensibly

As of the review date, the team did not identify a public system or study that documents all of the following as one evaluated method:

1. multiple general software-contract kinds;
2. exact PR base/head plus contemporaneous consumer revisions;
3. structural cross-repository consumer proof;
4. proposition-specific analysis coverage and selective abstention;
5. static-output disclosure across unequal repository ACLs;
6. append-only multi-axis labels and no-finding audits;
7. a reusable permissively licensed host-neutral core.

This is a dated, scoped search conclusion, not proof of nonexistence and not itself novelty. A systematic search must be refreshed before publication.

## What this survey changes

1. Reverb is not “Repowise but cross-repo”; exact PR semantics, governance, authorization and embedding are the proposed wedge.
2. Cross-repository and PR-time are not novelty claims by themselves.
3. Existing build graphs, code indexes, differs and consumer contracts are inputs/baselines, not components to rebuild.
4. The initial slice favors high-authority identity/compatibility lanes over maximal adapter breadth.
5. Preview and PR delivery serve different users; neither is universally superior.
6. Every headline metric must include coverage, selection and label denominators.
7. Phase 003 contains a stop/reposition decision if the remaining boundary has no measured advantage.

## Source discipline

See [verified-citations.md](verified-citations.md) for primary links and corrections. Product behavior changes quickly; record exact versions in any evaluation. Claims about internal proprietary systems are limited to published sources and should not be generalized beyond their reported setting.
