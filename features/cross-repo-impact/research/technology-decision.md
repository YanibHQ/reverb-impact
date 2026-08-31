# Technology and Indexing Decision

**Status:** Adopted for implementation planning  
**Decision date:** 2026-08-28  
**Revisit:** after Phase 003 scale and precision measurements

## Decision summary

Build Reverb as a TypeScript/Node.js 24 LTS pnpm monorepo with a pure domain layer, port-driven application layer, adapter SDK, local CLI/reference host, and hosted GitHub/PostgreSQL adapter. Use two indexing lanes:

1. **Baseline lane:** safe parsing of checked-out source and specifications without executing repository code.
2. **Precision lane:** optional CI-produced SCIP or other trusted build artifacts uploaded by the repository’s own workflow.

Store canonical records in SQLite locally and PostgreSQL 18 for the hosted reference. Use ordinary indexed adjacency tables and recursive CTEs. Do not require a graph database, vector database, search cluster, message broker, or LLM for v1.

## Why TypeScript

This is a product-integration choice, not a claim that TypeScript parsers are inherently superior.

- Yanib is TypeScript and is the first intended host in the Yanib product family.
- GitHub App, webhook, check-run and package-distribution work has strong Node support.
- The core domain is schemas, deterministic transformations and orchestration rather than CPU-heavy compiler construction.
- External semantic tools can be invoked through versioned adapter processes or consumed as artifacts.
- One implementation language reduces package/protocol drift before a second host proves the boundary.

Native or language-specific extractors remain separate adapter processes where appropriate. The public wire protocol prevents the runtime choice from becoming a language-support constraint.

## Package topology

The detailed release topology lives in [packaging.md](../packaging.md). The architectural units are:

```text
packages/domain       pure values, identity, changes, evidence, policy inputs
packages/protocol     JSON Schema and versioned wire values
packages/application  use cases using ports; no provider/storage imports
packages/adapter-sdk  extractor/join/differ contracts and fixtures
packages/index-ts     TypeScript/npm extractor
packages/index-openapi
packages/index-protobuf
packages/store-sqlite
packages/store-postgres
packages/host-git
packages/host-github
packages/cli
packages/testkit
```

Published libraries use the personally owned `@yanib/reverb-*` scope. Publisher ownership and
package-name availability were verified before version `0.1.0`; `reverb-impact` is the unscoped CLI
distribution.

## Canonical indexing model

The index is not an undifferentiated embedding store. It consists of immutable, addressable facts:

- repository generation and exact source ref;
- file identity, content digest, language and parse status;
- contract definitions and stable contract keys;
- consumer references and stable reference identities;
- manifests, resolved packages and provenance;
- service/resource registry identities and validity intervals;
- adapter and identity-function versions;
- coverage records for every expected input partition;
- tombstones/invalidations created by later complete generations;
- derived candidate edges and impact occurrences.

Source snippets are evidence payloads with retention and authorization controls, not part of stable identity.

## Baseline extraction lane

The baseline worker:

- receives a read-only source snapshot;
- has no provider token or organization credentials;
- cannot access the network;
- does not run install scripts, builds, tests, generators or repository binaries;
- validates archive roots, paths, symlinks, sizes and decompression limits;
- pins parser and external differ versions;
- emits only schema-valid facts and coverage records;
- runs with CPU, memory, file-count and time limits.

Tree-sitter is suitable for resilient syntax extraction and changed-file parsing; its official project describes incremental concrete syntax trees and broad grammar support ([tree-sitter/tree-sitter](https://github.com/tree-sitter/tree-sitter)). TypeScript’s compiler API is used where symbol/export resolution needs language semantics. Neither provides cross-repository identity on its own.

## Precision-artifact lane

Some exact references require repository-specific compilation, dependency resolution or generated code. Reverb does not execute that build in its multi-tenant parser. Instead, an opt-in repository workflow may upload:

- a SCIP index;
- compiler symbol graph;
- resolved dependency graph;
- generated API descriptor set;
- focused build/test result tied to a commit.

SCIP is a language-agnostic code-indexing protocol intended for definitions, references and documentation ([scip-code/scip](https://github.com/scip-code/scip)). Reverb consumes the artifact; it does not reimplement language indexers. Uploads are content-addressed, authenticated to the repository and commit, size-limited, schema-validated and treated as untrusted input.

Absence of a precision artifact is a coverage fact. It does not automatically prevent exact positives from the baseline lane, and it cannot be converted into a clean negative.

## Change overlay

For a pull request:

1. Resolve and persist provider repository ID, base SHA, head SHA, merge-base policy and PR occurrence.
2. Reuse or build the immutable base generation.
3. Extract changed head files plus tombstones for deletions/renames.
4. Materialize a logical head generation as base facts plus overlay replacements/tombstones.
5. Recompute adapter partitions whose identity or imports can be affected transitively.
6. Diff base/head contract definitions using the adapter’s semantic differ.
7. Join changes against selected consumer generations.
8. Persist coverage, candidates and policy output atomically.

Incremental and clean full analysis must produce the same canonical facts after normalization. This is a phase-exit property, not an optimization hope.

## Initial contract adapters

| Adapter | Producer artifact | Consumer artifact | Semantic source | Initial delivery class |
| --- | --- | --- | --- | --- |
| TypeScript/npm | package exports and public symbols | resolved imports/references plus manifest/lock provenance | TypeScript compiler semantics and Reverb rules | Preview until calibrated |
| OpenAPI | path/method/operation/schema definitions | generated client symbol or resolved operation reference | pinned external OpenAPI differ plus Reverb mapping | Preview until calibrated |
| Protobuf/gRPC | descriptor messages/services/fields | generated or SCIP reference tied to package/service | pinned `buf` compatibility rules | Preview until calibrated |

Framework HTTP routes, GraphQL operations, messaging schemas/topics, database schemas, environment keys, Terraform modules and more package ecosystems enter only through the adapter admission gate. Adapter count is not a success metric.

## Integrate mature tools

Use mature outputs rather than creating competing implementations:

- SCIP for portable symbol occurrence data;
- `buf` for Protobuf compatibility policy;
- `oasdiff` or an equivalently evaluated OpenAPI differ;
- GraphQL Inspector if/when GraphQL is admitted;
- Bazel/Nx/Pants/Turborepo build graphs as optional declared evidence;
- ecosystem package managers/lockfiles for version resolution.

Every integration is pinned, sandboxed where it parses untrusted data, license-reviewed, and wrapped by golden fixtures. Reverb owns canonical identity, coverage, evidence provenance, cross-repository joining and delivery policy.

## Storage decision

### Local reference

SQLite provides one-file installation, transactions and reproducible fixtures. Large optional artifacts live in a content-addressed directory next to the database. The local CLI can analyse co-located or explicitly fetched repositories without a service.

### Hosted reference

PostgreSQL stores organization, repository membership, generations, facts, edges, runs, labels, policies and audit records. Object storage may hold large SCIP/source artifacts with tenant-scoped keys and deletion propagation.

Adjacency queries are bounded to a configured workspace and small path depth. PostgreSQL indexes plus recursive CTEs are sufficient until measurement proves otherwise. A graph database adds a second authorization, backup, consistency and deletion system; it is rejected for v1.

### Search and vectors

Exact/canonical identifiers, normalized symbols, routes and schema keys use relational indexes and optional PostgreSQL text/trigram search for exploration. Embeddings may later retrieve explanation context but are sensitive derived data and never create an edge. No vector service is required.

## Queue and orchestration

The core defines job, cancellation, checkpoint and idempotency ports. The reference hosted implementation may begin with a PostgreSQL-backed job table and workers. Add a dedicated broker only when observed throughput, retry isolation or latency requires it. Provider delivery keys and analysis run keys are deterministic.

## Compatibility and versioning

Every canonical record names:

- protocol schema version;
- adapter name/version;
- identity-function version;
- semantic differ/version/ruleset;
- policy revision;
- source repository/ref/generation;
- analysis time and occurrence.

Identity-version changes trigger explicit migration/re-index planning. They do not silently remap stored findings. Public schemas support the current and previous major during a documented transition.

## Rejected alternatives

| Alternative | Reason rejected now | Revisit signal |
| --- | --- | --- |
| Python-first engine | Adds host/protocol boundary before core semantics are proven; no decisive parsing advantage for the chosen adapters. | A required ecosystem tool cannot be safely or efficiently integrated as a process. |
| Rust-first engine | Strong isolation/performance, but higher product and adapter iteration cost for this team. | Profiling shows parsing/graph core dominates and Node workers cannot meet budget. |
| Neo4j/graph service | Extra authorization, operations and consistency surface without measured need. | Postgres traversal misses a published SLO at representative scale. |
| Elasticsearch/OpenSearch | Duplicated tenant/deletion/backup surface; exact keys dominate v1. | Evidence exploration cannot meet a measured user task with Postgres search. |
| Vector-first index | Similarity is not contract identity or consumer proof. | A retrieval-only feature shows value without becoming finding authority. |
| Run every repository build centrally | Supply-chain, secret, network and cost risk. | None for untrusted hosted parsing; use repository-owned CI artifacts. |
| LLM agent as detector | Non-deterministic, hard to cover/reproduce, vulnerable to prompt injection. | May assist explanation/adjudication but still cannot originate edges. |
| Implement build systems/differs | Large vanity surface with no direct product advantage. | Only if an essential semantic gap has no maintained tool and evaluation justifies it. |

## Measurement-triggered revisit

At Phase 003, record:

- repositories, files, facts and edges per workspace distribution;
- full and incremental indexing latency/cost;
- PR overlay latency;
- top graph queries and p50/p95/p99 latency;
- Postgres table/index/storage growth;
- cache hit rates and invalidation causes;
- adapter failure/coverage distribution;
- operational incidents and tenant-isolation tests.

Change infrastructure only for a named violated requirement. The architecture deliberately keeps stores and providers behind ports so a justified change is possible without changing canonical semantics.

---

# Extraction spine — measured decisions

Verified 2026-08-28 against live registries and APIs. Benchmarks are single-machine measurements
(Node v25.2.1, darwin arm64); no published native-versus-WASM comparison was found, so treat the
timings as datapoints rather than literature.

## D-19 — `web-tree-sitter` (WASM), not the native binding

**Measured**, 600 real `.ts`/`.tsx` files, 4.76 MB:

| | parse | throughput | `tags.scm` query | captures |
| :-- | --: | --: | --: | --: |
| native `tree-sitter` | 854 ms | 5.58 MB/s | 161 ms | 6,644 |
| `web-tree-sitter` | 1,163 ms | 4.09 MB/s | 132 ms | 6,644 |

WASM is **1.36× slower to parse**, comparable on query, and produces **identical captures**.

The install story decides it. The native binding (`tree-sitter@0.25.1`, last tagged 2026-01-06,
subsequent commits CI-only) is in peer-dependency conflict with most current grammars — **four of
the eight languages in the required set exclude it**:

| grammar | npm latest | peer range | works with 0.25.1 |
| :-- | :-- | :-- | :-: |
| typescript | 0.23.2 | `^0.21.0` | no |
| java | 0.23.5 | `^0.21.1` | no |
| ruby | 0.23.1 | `^0.21.1` | no |
| php | 0.24.2 | `^0.22.4` | no |
| javascript, python, go, c-sharp | 0.25.x / 0.23.5 | `^0.25.0` | yes |

A plain install fails outright with `Conflicting peer dependency: tree-sitter@0.21.1`. Every added
grammar re-rolls that dice, and `--legacy-peer-deps` means shipping a tool that requires a flag.
Native prebuilds also cover six platforms with **no linux-musl**, so Alpine CI compiles from source.

Loading cost at scale is not a concern: `Parser.init()` in 5 ms, **all 15 grammars loaded in 29 ms**
for 22.8 MB of `.wasm`, 85 MB RSS. Lazy-load per language and it is roughly 2 ms each.

For a tool whose wall-clock is dominated by git and network I/O, a 1.36× parse penalty against zero
install risk is not a close call.

## D-20 — Grammars from the official per-grammar npm packages; never `tree-sitter-wasms`

Each `tree-sitter-<lang>` package ships everything needed in one artifact:

```
tree-sitter-python/
  prebuilds/{darwin,linux,win32}-{arm64,x64}/tree-sitter-python.node
  tree-sitter-python.wasm          ← loadable directly by web-tree-sitter
  queries/highlights.scm  queries/tags.scm
```

**`tree-sitter-wasms` is broken for this use.** Tested against web-tree-sitter 0.26.13: **all 15
grammars fail to load**, with an empty error message. The package is built from 0.20.x-era grammars
(its devDependencies pin `tree-sitter-c@^0.20.7`), and 0.25+ supports parser ABI 13–15 with older
dynamic-linking wasm formats incompatible even at nominally matching ABI.

Verified working — `Language.load` plus compiling each language's own `tags.scm`:

```
c abi15 · c-sharp abi15 · cpp abi14 · go abi15 · java abi14 · javascript abi15
php abi15 (×2) · python abi15 · ruby abi14 · rust abi14 · scala abi14 · typescript abi14 (+tsx)
→ 14 grammar + tags.scm pairs working
kotlin — no wasm, no tags.scm in the npm package     swift — no wasm (tags.scm present)
```

Kotlin and Swift need `tree-sitter build --wasm` and vendored queries. Neither is in the required
set.

## D-21 — Write our own import/export queries; `tags.scm` cannot supply them

**The decisive finding.** `tags.scm` was checked in all 13 languages: **no language's `tags.scm`
captures imports or exports.** They capture definitions and some references, and nothing else.

Extracting the edge that carries the cross-repository signal requires a query we write:

```scheme
(import_statement
  (import_clause (named_imports (import_specifier name:(identifier)@sym)))
  source:(string(string_fragment)@mod))
```

That yields the module specifiers and the imported binding names. `tags.scm` captured none of them.
(Field order in the pattern must match tree order or the query does not compile.)

Two further irregularities make a normalization layer mandatory regardless:

- **TypeScript's `tags.scm` is 8 patterns covering type-level declarations only** — no
  `class_declaration`, no `function_declaration`, no `reference.call`. It is meant to be
  **concatenated with JavaScript's**, which was verified to compile against the TS grammar and to
  yield the full vocabulary.
- **Capture names differ across languages** — `reference.call` in Python, Go, Java, Ruby and PHP;
  `reference.send` in C#; absent in TypeScript alone.

So Repowise's 19 hand-written `.scm` files are not a stylistic preference. They are forced, and
copying that decision is correct.

## D-22 — SCIP is not the spine

Three independent reasons, in descending order of weight.

**The symbol string embeds the package version, so the cross-repository join fails by
construction.** The grammar is
`<scheme> ' ' <manager> ' ' <package-name> ' ' <version> ' ' <descriptor>+`, and matching is plain
string equality. `scip-typescript` mints the version from the nearest `package.json`
(`src/Packages.ts`), so a producer publishing `@org/sdk@1.4.0` emits
`… npm @org/sdk 1.4.0 …` while a consumer resolving `1.2.0` emits `… npm @org/sdk 1.2.0 …` — same
symbol, different strings, no match. Sourcegraph reconciles this in its backend, not in the format.

The design intent is explicitly the opposite — `DESIGN.md` lists *"Adding cross-repo navigation
support should be easy"* and documents `external_symbols` for exactly this — which is why the
version component is worth stating precisely rather than dismissing SCIP as unsuited.

**It inverts the cost model from parse-per-repository to build-per-repository.** A consumer must
have dependencies installed or TypeScript cannot resolve the import at all and the symbol degrades
to unresolved.

**The two most relevant indexers are stale**, by default-branch commit (`pushed_at` is misleading,
counting bot branches):

| indexer | last default-branch commit |
| :-- | :-- |
| scip-java, scip-go, scip-ruby | 2026-08-20 / 2026-08-13 / 2026-07-02 |
| scip-dotnet, scip-php (third-party), scip-clang | 2026-05-27 / 2026-04-27 / 2026-03-24 |
| **scip-typescript** | **2025-10-03** (~11 months) |
| **scip-python** | **2025-09-05** (~12 months) |

Governance did improve: a vendor-neutral `scip-code` organization was created 2026-01-09.

**LSIF is confirmed dead** — SCIP's `DESIGN.md`: *"LSIF support has since been fully deprecated and
removed."* `sourcegraph/lsif-node` is archived, last commit 2022-07-18.

SCIP remains correct as the **opt-in precision lane** for repositories whose own CI already
produces an index, where version normalization is our glue rather than our foundation.

## D-23 — The reframe: this is a package-boundary problem, not symbol resolution

The question is whether a diff changes something another repository depends on. That dependency
lives at the **package boundary**, and at that boundary the consumer's source already names both
sides:

```ts
import { createClient } from '@org/sdk'
```

Both the package and the symbol are syntactic facts, extractable at high confidence with a
four-line query. Full resolution buys the *interior* of the producer — whether `createClient`
re-exports something else, whether a change three layers down reaches it — which is real, and is
exactly what the opt-in precision lane is scoped to.

Honest limit: for **Python and Ruby**, where imports are dynamic and "exported surface" is a weaker
concept than in TypeScript, Go or Java, syntactic edges will be materially noisier. Ship those with
visibly lower confidence and gate them off rather than let them set the tool's reputation.

## D-24 — Package-to-repository provenance ladder

A recorded rung per edge, not a boolean:

1. **`org-manifest`** — a `package.json#name` found in a repository we indexed. Highest, and the
   only rung that covers unpublished and private packages. We are already cloning every repository,
   so this is the primary source; the registry is the fallback.
2. **`registry-repository`** — the npm registry `repository.url` plus `directory`. Verified live to
   survive publish and to carry monorepo paths (`@aws-sdk/client-s3` →
   `aws/aws-sdk-js-v3`, `clients/client-s3`). It is **optional** in the npm specification, so it is
   best-effort.
3. **`heuristic`** — name-to-repository-slug guessing. **Suppressed, not emitted at low
   confidence.**

Workspace members are the easy case the registry cannot help with: resolve `workspaces` globs plus
`pnpm-workspace.yaml` and `lerna.json`, and any dependency matching a member is intra-repository.
Where a name is both a workspace member and a published package, prefer the workspace edge.

## D-25 — Version-blind edges with version annotation

A consumer pinned at `1.2.0` against a producer at `1.4.0` may or may not be affected. Three
options, and the middle one is right:

- Version-exact matching drops real edges — the SCIP failure mode above.
- Ignoring versions over-reports against consumers that will never take the change.
- **Record the edge on `(package, symbol)` and record the consumer's resolved version separately**,
  then report: *"three repositories import `createClient`; two are on ≥1.4.0, one is pinned at
  1.2.0."*

Read the pin from the lockfile, falling back to the declared range. Every ecosystem needs this
(`go.mod`, `poetry.lock`, `pom.xml`, `Gemfile.lock`, `composer.lock`, `*.csproj`).

## D-26 — SQLite via `better-sqlite3`, keyed on git blob SHAs

`node:sqlite` is capable but is **Stability 1.2 — Release Candidate** as of Node 25.7.0 and is
still moving, with features landing across 24.9, 24.10, 25.5, 25.8 and 26.1. For a CLI running on
whatever Node a user has, `better-sqlite3@13` gives one behaviour across versions. Revisit when it
is stable in an LTS. DuckDB is the wrong shape — this workload is many small point lookups and
incremental upserts, not analytical scans.

**Key on git blob SHAs, never on mtime.** Aider's repo-map keys its cache on filename plus mtime,
which in CI — where every clone is fresh — is a 100% miss rate. Git is already a Merkle tree:

- file-level extraction keyed on **blob SHA** → identical files across repositories (vendored code,
  generated clients) deduplicate for free;
- repository rollups keyed on **tree SHA** → an unchanged HEAD costs one lookup;
- the work list is `git diff --name-only <last_indexed> <head>`.

Store cross-repository edges as a **derived projection** rebuildable from file facts, so a resolver
bug is a re-derivation rather than a re-clone of three hundred repositories.

Aider also wraps every cache access in error handling with cache recreation and an in-memory
fallback. That is scar tissue from real corruption reports; budget for it.

## The objection that survives

Two objections to this spine have answers. The third does not, and it should shape sequencing.

**"A per-language `.scm` file is a detector pack that drifts."** Answered by making packs
declarative and contract-checked rather than trusted: a registry stating which edge kinds each pack
may emit and at what band, so a pack cannot claim a kind it did not declare and confidence stays a
lookup. Plus a golden corpus per language so a grammar bump that renames nodes fails a test instead
of silently emitting fewer edges.

**"Syntactic edges are guesses."** Answered by D-23 for the package boundary, conceded for Python
and Ruby.

**The one that stands: the AST layer is roughly 30% of this tool.** The manifest and lockfile layer
— seven ecosystems of dependency graphs, version ranges, workspaces, private registries — is the
majority of the work, and none of it is tree-sitter's problem. Choosing the parsing spine is the
easy decision. **Validate the manifest layer against a real organization before committing to seven
languages.**

Coverage remains the part that cannot be retrofitted: if a grammar upgrade breaks one pack's import
query, that repository's edges go *missing*, and a missing edge is indistinguishable from "nothing
depends on this" — failing silent and reassuring. Coverage must be tracked separately from
confidence from day one, and "no downstream impact" must be unrenderable when a pack did not run.
