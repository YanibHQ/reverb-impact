# Contract Taxonomy

**Status:** Reference — tool links verified; items marked UNVERIFIED were not confirmed

The enumerable kinds of thing that create a dependency across a repository boundary. For each:
how a producer declares it, how a consumer uses it, the key that joins them, and what breaks.

## The finding that shapes the design

Mature compatibility tools exist for several important contract kinds, with uneven semantic
depth. Reverb should integrate those tools where they are maintained and license-compatible.
Its differentiating work is canonical identity, the producer-to-consumer join, exact temporal
snapshots, coverage and delivery governance—not reimplementing `buf breaking` or a build system.

Three consequences follow directly, and they are load-bearing for phases 002 and 003:

1. **Key quality caps recall.** A key that is not canonical on both sides — HTTP paths,
   environment variables, CLI flags — limits you to heuristic matching no matter how good the
   differ is.
2. **The consumer side is usually weaker than the producer side.** Producers often declare;
   consumers merely use. Each adapter must state exactly which consumer artifact proves use.
3. **A service/resource registry is required for identities source cannot resolve alone.** A
   versioned mapping can connect deploy units, repositories, base URLs/gateways, environment
   namespaces, database instances and broker subjects. It is not needed for every initial package
   or descriptor join, but it is mandatory before delivery for lanes that depend on it.

## Relative join evidence, ranked for planning

Scored on two axes: does the producer expose a canonical parseable identifier, and can the
consumer's use of it be proven statically and joined on the same string?

| # | Kind | Producer key | Consumer key | Planning evidence | Why |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | gRPC / protobuf | canonical | canonical | **Canonical** | Fully-qualified `pkg.Service/Method` plus field numbers; descriptors and generated stubs provide declared identities |
| 2 | GraphQL | canonical | canonical | **Canonical when operations exist** | Schema coordinates and consumer operation ASTs can scope breakage |
| 3 | Build-graph targets | canonical | canonical | **Canonical inside its graph** | Strong key but limited to declared build scope |
| 4 | Package symbols | canonical | canonical + versioned | **Strong** | Manifests/lockfiles qualify package/version while AST/SCIP identifies used symbols |
| 5 | Terraform | canonical | declared | **Strong when source/state identity is explicit** | `module.source@ref` and remote-state outputs are explicit references |
| 6 | OpenAPI / AsyncAPI | canonical (`operationId` or route identity) | canonical with codegen, else heuristic | **Conditional** | Generated clients can be strong; bare route strings degrade to HTTP heuristics |
| 7 | Custom elements / SDK | canonical manifest | tag string | **Conditional** | Manifest identity helps, but reachability/ownership still need evidence |
| 8 | Messaging | registry subject/schema | subscription/send artifact | **Conditional** | Dynamic subjects, namespaces and dead consumers require registry/coverage |
| 9 | Env vars / flags | config-declared | AST reference | **Registry-dependent** | Names are not globally scoped; deploy-unit identity is required |
| 10 | Database schema | table/column plus physical identity | ORM/SQL reference | **Registry-dependent** | Proving the same physical database and resolving dynamic SQL are hard |
| 11 | HTTP / REST | framework/spec route plus service identity | request/generated client | **Heuristic without service identity** | Mount prefixes, gateways, templates and ambiguous base URLs dominate |
| 12 | CLI flags | parser declaration | shell/process string | **Heuristic** | Consumer side is often untyped/indirect command text |

The ordering is a planning heuristic, not a calibrated score or delivery band. Actual evidence
strata are adapter/join/version specific and earn promotion from independent labels. Any row can
weaken when a required identity step is ambiguous. Service/resource registry evidence is the
main boundary between a scoped identity and an unsafe string match.

## The twelve kinds

### 1. Package symbols across a published package

**Key:** `{ecosystem}:{package}:{export-subpath}#{symbol-path}` —
`npm:@acme/sdk:./react#useSession`, `maven:com.acme:sdk#com.acme.Client#retry(int)`.

Two subtleties break naive keys. The `exports` subpath is part of identity, so moving a symbol
from `.` to `./react` is a removal at `.`. For languages with overloads the parameter type list
must be in the key, or an added overload reads as a signature change.

**Consumer signal is the strongest of all twelve.** The lockfile gives the *exact resolved
version* the consumer runs — the only kind where that is knowable. Extract the **imported binding
names**, not just the module specifier: that turns "repo B depends on `@acme/sdk`" into "repo B
uses `createClient` and `RetryPolicy`", which cuts noise by an order of magnitude.

Weaknesses: dynamic access, star imports, and barrel re-export chains.

**Breaking:** removed export; removed or renamed public method; added *required* parameter;
narrowed parameter type; widened return type; removed enum member.
**Not breaking:** added optional trailing parameter; added export; widened parameter type;
narrowed return type; internal refactor behind an unchanged signature.
**Ambiguous:** adding a required field to an interface the consumer *constructs* breaks it, while
the same field on a type it only *receives* is fine — variance depends on how each consumer uses
the type, resolvable only by analysing the consumer. Adding an enum member breaks exhaustive
switches in TypeScript and Rust and nothing elsewhere.

**False positives:** treating any `.d.ts` byte change as breaking; re-export churn; type-only
exports removed where the consumer is plain JavaScript; a lockfile pinning an old version so
today's break is not today's problem; `private: true` packages that never publish.

**Wrap:** `cargo-semver-checks` (Rust, reads rustdoc JSON so no full compile),
`golang.org/x/exp/apidiff` (Go, splits incompatible from compatible), `japicmp` (Java, jar-level,
distinguishes source from binary compatibility), Revapi (Java plus JSON/YAML), `griffe check`
(Python), `@microsoft/api-extractor` (TypeScript — produces a committed API report to diff; it is
not itself a classifier). `dependency-cruiser` for the consumer import graph.

### 2. HTTP / REST endpoints

**Key:** `{service-id}|{METHOD}|{normalized-hole-template}` — `payments-api|GET|/users/§/invoices`.

`service-id` is the load-bearing part and **cannot come from the source file**. Without it, two
services both exposing `GET /users/§` are indistinguishable.

**Producer** extraction is per framework and the mount prefix is mandatory: reading
`router.get('/users')` without `app.use('/api/v1', router)` produces a key that matches nothing.
Rails is the awkward case — `config/routes.rb` is Ruby, and `rails routes` output is the reliable
path.

**Consumer** is a string match with constant folding, and saying so plainly is the honest
position. Identify `fetch`, `axios.*`, `requests.*`, `httpx`, `HttpClient`, `RestTemplate`,
`net/http` by callee; constant-fold template literals, concatenation, `new URL(path, base)` and
module-level constants.

**Matching `/users/:id` against `` `/users/${id}` ``**, concretely:

1. Normalize both to a hole-template. Split on `/`; map `:id`, `{id}`, `<int:id>`, `[id]`, `*` to
   `§`. Strip query and fragment first, strip trailing slash, keep case.
2. Mark holes `§*` when the interpolated expression is not provably scalar — `` `/users/${path}` ``
   where `path` is `"1/posts"` eats multiple segments. Match those at lower confidence only.
3. Align on method and segment count. A consumer **literal** matching a producer `§` is a match
   (`/users/me` hits `/users/:id`) **unless** a literal route `/users/me` also exists — router
   precedence decides, and ignoring it produces a confident wrong answer.
4. Resolve the base. `fetch(\`${process.env.PAYMENTS_URL}/users/${id}\`)` joins to the payments
   repository only if `PAYMENTS_URL` maps to a service. Sources in decreasing reliability: the
   service registry; the variable's value in deploy config; a service-shaped literal; a hostname
   pattern.
5. Emit a tier, never a boolean — high (generated client joined on `operationId`, or literal path
   plus resolved base), medium (hole-template plus resolved base), low (distinctive path, base
   unresolved), suppressed (generic path, base unresolved).

**False positives:** mount prefixes; **gateway rewrites**, which static analysis cannot see and
which the registry must carry as a `path_prefix`; test fixtures — MSW, WireMock, `nock` and VCR
call sites are syntactically identical to real ones, so exclude by path *and* by callee;
third-party URLs; generic paths (`/health`, `/`, `/v1`); the same path on many services; example
URLs in documentation.

**Wrap:** nothing usable. Optic was **archived 2026-01-12** after the Optic Labs acquisition — do
not build on it. The correct strategy is to *manufacture the canonical artifact*: have each
producer emit OpenAPI (`swaggo/swag` for Go; FastAPI emits `/openapi.json` natively;
`drf-spectacular`, `springdoc-openapi`, `rswag`, `NSwag` — all UNVERIFIED except swag) and then
use kind 3's tooling. For consumer call-site extraction use a structural search engine rather than
a bespoke parser per language.

### 3. OpenAPI / AsyncAPI specifications

**Key:** `{spec-id}#{operationId}` when present — the only field the specification *intends* as a
stable identifier. Fallback `{spec-id}|{METHOD}|{path-template}`. Schema-level changes use a JSON
Pointer.

Detect by root key (`openapi:`, `swagger:`, `asyncapi:`), never by filename. Resolve `$ref` before
diffing.

**Do not invent breaking rules.** `oasdiff` ships **219 breaking rules, 29 warning-level and 266
informational**, and judges "against the API contract your OpenAPI definition declares, not
against what a particular server happens to accept" — exactly the right stance for a cross-repo
tool. Its request/response split is the useful model: the request side breaks when the server
demands *more*, the response side when it returns *less*.

**False positives:** the specification drifting from the implementation (a hand-maintained spec
is neither sound nor complete — prefer generated); `$ref` restructuring, semantically a no-op with
a large textual diff; example and description churn; server URL edits; regeneration under a
different generator version.

**Wrap:** `oasdiff` (default choice). `openapi-changes` is a strong second and is git-revision
aware — `HEAD~1:openapi.yaml` — which suits pull-request use. `@asyncapi/diff` classifies
breaking / non-breaking / **unclassified**. **Spectral is a linter, not a differ** — it validates
one document and will not tell you what changed.

### 4. gRPC / protobuf

The best-behaved contract in the taxonomy. **There are two keys and they answer different
questions:**

```
name identity : {proto.package}.{Service}/{Method}   ·   {proto.package}.{Message}.{field}
wire identity : {proto.package}.{Message}#{field_number}:{wire_type}
```

Renaming a field breaks JSON but not binary; changing a field number breaks binary. Keying only on
names silently misses the worst class of protobuf bug.

**Use buf's four categories**, a strictness ladder where passing a stricter category implies
passing every looser one:

| Category | Detects | Use when |
| :-- | :-- | :-- |
| `FILE` (strictest, default) | changes moving generated code between files | Consumers compile against generated code and file layout matters |
| `PACKAGE` | breaks per package; allows moving between files | Consumers rebuild stubs |
| `WIRE_JSON` | breaks binary **or JSON** encoding | **Connect, gRPC-Gateway, gRPC JSON** — JSON is sensitive to field *name* changes |
| `WIRE` (most lenient) | breaks binary encoding only | Pure binary gRPC, consumers regenerate freely |

For an organization-wide tool the right default is **`WIRE_JSON`** — it catches everything that
breaks a running peer — with `FILE`/`PACKAGE` only where consumers pin generated code.

**False positives:** diffing raw text instead of the descriptor set; **ignoring `reserved`**, where
a properly reserved deletion is the correct pattern rather than a break; vendored third-party
protos; generated `.pb.go` counted as source, doubling every finding.

**Wrap:** `buf breaking --against '.git#branch=main'`. `protolock` as a lockfile-based fallback.

### 5. GraphQL

**Key:** schema coordinates — `User`, `User.email`, `User.posts(first:)`. Unambiguous,
hierarchical, and what the tooling already emits. (The coordinate RFC's ratification status is
UNVERIFIED; the notation is not in doubt.)

**The consumer signal is the best of any kind here.** Operation documents and `gql` tagged
templates parse to ASTs giving the **exact set of fields the consumer selects**. That answers a
stronger question than "is this breaking?" — it answers **"is this breaking for repository B
specifically?"** Suppressing a field removal because no consumer selects it is the single largest
precision win available anywhere in this taxonomy.

`graphql-js` enumerates 16 breaking types including `FIELD_REMOVED`, `REQUIRED_ARG_ADDED`,
`TYPE_CHANGED_KIND` and `VALUE_REMOVED_FROM_ENUM`. The three-way **breaking / dangerous /
non-breaking** split exists because the middle bucket is real: adding an enum value, adding a type
to a union, changing a default.

**False positives:** flagging a removal no consumer selects (solved above); federation, where
removing a field that another subgraph `@provides` breaks composition rather than queries and a
naive per-subgraph diff misclassifies both directions; schema-printing differences between codegen
versions; internal admin schemas diffed against the public one.

**Wrap:** `graphql-inspector` — marks each change breaking, non-breaking or dangerous, and also
validates operations against a schema and computes coverage, so it already does the consumer-side
refinement. `findBreakingChanges` in `graphql-js` for the raw classifier. Apollo's **operations
checks** — which "use your graph's historical client operation data to determine whether any
clients would be negatively affected" — are the reference model for consumer-aware breaking
analysis. (`graphql-schema-diff`: UNVERIFIED, the URL 404'd.)

### 6. Async messaging

**Two independent contracts routinely conflated:** the channel name and the payload schema. They
break differently and need separate keys.

```
channel : {broker-cluster-id}|{topic|queue|subject|exchange+routing-key}
schema  : {registry-id}|{subject-name}      # TopicNameStrategy: "<topic>-value" / "<topic>-key"
webhook : {producer-service}|{event.type}
```

Under the default **TopicNameStrategy** the schema subject derives from the topic, so channel and
schema keys join automatically. Under RecordNameStrategy they do not, and the strategy must be
recorded per producer.

**The IaC declaration is a better producer signal than the code** — Terraform `aws_sns_topic`,
`confluent_kafka_topic`, Strimzi `KafkaTopic` CRDs are where the name is authoritative.

**Schema Registry compatibility modes**, precisely (AWS Glue uses `_ALL` where Confluent uses
`_TRANSITIVE`):

| Mode | Allowed | Checked against | Upgrade first |
| :-- | :-- | :-- | :-- |
| `BACKWARD` (default) | delete fields, add **optional** fields | last version | **Consumers** |
| `FORWARD` | add fields, delete **optional** fields | last version | **Producers** |
| `FULL` | add/delete **optional** fields only | last version | Any order |
| `*_TRANSITIVE` | as above | **all** previous versions | as above |
| `NONE` | anything, unchecked | — | — |

In one line each: **BACKWARD** means a consumer on the new schema can read old data, so consumers
upgrade first. **FORWARD** means a consumer on the old schema can read new data, so producers
upgrade first. **FULL** holds both directions, which is why only optional add/delete is legal.
**`_TRANSITIVE`** widens the check from the previous version to every previous version — without
it, a chain of individually-BACKWARD changes can leave v3 unable to read v1, a commonly-hit
failure.

Worked example from the Glue documentation: with `first_name, last_name, email` required and
`phone` optional under **BACKWARD**, removing required `email` **succeeds** while adding required
`zip_code` **fails**. Under **FORWARD** the direction inverts.

**Do not reimplement compatibility — call the registry.** The mode decides, not the diff.

**False positives:** dynamically composed topic names; topic constants living in a shared package
so the literal is in neither producer nor consumer file; **dead consumers** — code that subscribes
but is not deployed, where consumer-group metadata is the only reliable liveness signal and it is
runtime data; DLQ and retry topics mirroring real names; env-prefixed test topics.

**Ambiguous and important:** changing the semantics of an existing field — `amount` from cents to
dollars — is schema-identical and catastrophic.

### 7. Shared database schemas

**This is a cross-repo contract only when two or more independently-deployed units read or write
the same physical table.** Three real shapes: a shared operational database; one service writing
and another reading directly; a warehouse or dbt layer reading a service's tables, which is
extremely common and almost never tracked.

If repository A owns a database nothing else touches, migrations are **not** a cross-repo contract
and must be suppressed entirely. **Getting this gate right is most of the precision for this
kind.**

**Key:** `{database-instance-id}|{schema}.{table}[.{column}]`. The instance id resolves from
connection configuration, not from a DSN in code.

**Consumer signal** is the weak side: ORM model table mappings, raw SQL strings (parse, do not
regex), dbt `source()`/`ref()` declarations — which are excellent because they are *declared* —
and connection config pointing at the same instance.

**Breaking:** dropping a table or column another service reads; renaming a column; `NULL` →
`NOT NULL` without a default; narrowing a type; dropping an in-use enum value; changing a view's
output columns.
**Ambiguous:** adding `NOT NULL` *with* a default (safe for readers, may lock a large table);
adding a unique constraint, which fails on existing duplicates — a *data-dependent* break, not a
schema one.

**False positives:** single-owner databases, the dominant one; **expand/contract migrations**,
where the drop step lands weeks after consumers stopped reading and is correctly non-breaking
while looking identical to a reckless drop; ORM-generated tables; `users` existing in every
database; test and seed SQL.

**Wrap:** `squawk` (Postgres, Apache-2.0/MIT, downtime-oriented but large overlap).
`atlas migrate lint` covers destructive operations, breaking changes, table locks and
data-dependent changes — **but is documented as an Atlas Pro feature from v0.38+**, so verify
licensing before depending on it. `SQLGlot`'s `lineage()` for the consumer side: column-level
lineage through subqueries, CTEs, UNION and PIVOT answers "which downstream query reads
`users.email`".

### 8. Environment variables, config keys, feature flags

Environment/config references are syntactically cheap to extract but hard to scope to the correct
deploy unit and environment. Their real-world frequency and value must be measured.

**Key:** `{deploy-unit-id}|{VAR_NAME}`. The name is the only string and it is *not* globally
unique — `DATABASE_URL` means something different in every service. Without the deploy-unit id you
get a **wrong** join rather than a missing one, which is worse.

The roles invert here: the *setter* is in deploy configuration and the *reader* is in code.
Consumer extraction is unusually precise — a member expression on `process.env` is unambiguous —
and config-schema declarations (zod, envalid, pydantic-settings) give required-versus-optional for
free.

**Breaking:** code starts reading a new **required** variable with no default and the deploy
config for that unit does not set it, which crashes on boot; a variable renamed in code but not in
every deploy config; a flag key deleted while another repository still evaluates it.

**False positives:** name collisions — `PORT`, `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL` appear
everywhere, so a well-known-name suppression list is mandatory; platform-set variables
(`VERCEL_URL`, `KUBERNETES_SERVICE_HOST`, `CI`, `GITHUB_*`); test-only variables; reads in dead or
vendored code; `.env.example` drifting from real config, since it documents intent rather than
reality.

**Potential reference:** `ld-find-code-refs` is a design template worth studying — it scans a
repository for flag-key references, reports locations, prunes stale branches, and has an
**extinction** concept: a flag is extinct in a repository when references existed at some point and
were removed. That model generalizes directly to environment variables and is what makes a removal
detectable rather than merely an absence. OpenFeature makes flag keys uniform across languages.
Otherwise this requires per-language AST rules plus configuration parsers; effort is not estimated
until a concrete adapter design and fixtures exist.

### 9. Terraform module inputs and outputs

**Key:** `{module-source-url}@{ref}::output::{name}` and `::input::{var_name}`; for state,
`{backend-type}|{state-key}::outputs::{name}`.

**The consumer signal is genuinely good** because Terraform makes dependencies explicit:
`module "x" { source = "git::...//modules/vpc?ref=v1.2.0" }` is a declared, *versioned* cross-repo
dependency, and `data.terraform_remote_state.net.outputs.subnet_ids` is an explicit read.

**Breaking:** removing or renaming an output another root module reads; adding a **required**
variable; removing a variable callers set; narrowing a type constraint; raising version
constraints beyond what callers pin.
**Ambiguous:** `moved` blocks (safe with, destructive without); making an output `sensitive`,
which breaks callers that print it; changing an output's *value* while keeping name and type — a
real break no static diff sees; a contract-compatible change that forces resource replacement,
operationally breaking without being interface-breaking.

**False positives:** root modules diffed as if reusable; version pinning, so a change on `main`
affects nobody until they bump; `.tfvars`; **Terraform has no visibility modifier, so everything
looks public** — a naming convention or `terraform-docs` marker is needed to separate private
locals from public surface.

**Wrap:** `terraform-config-inspect` — HashiCorp's own library extracting variables, outputs,
resources, provider requirements and module calls without running Terraform, as a Go library and a
JSON CLI. Write only the diff. `terraform-docs` for stable snapshots. No dedicated module
breaking-change differ found (UNVERIFIED that none exists).

### 10. CLI commands and flags

**Key:** `{binary}::{subcommand path}::--{flag}`. The binary name is the join anchor and collides
with unrelated tools of the same name.

**The consumer side is string matching in shell, and that is the honest ceiling.** CI workflow
`run:` steps, Makefile recipes, Dockerfile `RUN`/`CMD`, `package.json` scripts. Defeated by
variable-held commands (`$TOOL build`), wrapper scripts, `xargs`, aliases, `npx pkg@version`, and
flags read from a config file instead of argv.

**Breaking:** removing or renaming a command or flag; removing a short alias; boolean flag
becoming value-taking; adding a required flag or positional; reordering positionals; **changing an
exit code** — a contract CI scripts depend on that nobody documents.
**Ambiguous:** changing stdout formatting, which breaks anything piping to `grep` or `jq` and is
otherwise invisible.

**Wrap:** none found (UNVERIFIED that none exists). The pragmatic build is the api-extractor
pattern — snapshot `--help` or the parser's introspection into a committed manifest and diff that.

### 11. Public web and SDK surfaces

Four sub-kinds with different key quality.

| Sub-kind | Producer | Consumer | Key |
| :-- | :-- | :-- | :-- |
| Custom elements | `customElements.define('yanib-changelog', X)` — one unmissable call; attributes via `observedAttributes` or a manifest | `<yanib-changelog slug="…">` — a tag string, but **globally unique by spec** (must contain a hyphen, must not be re-registered) | **Excellent** |
| React components | package exports plus prop types | JSX usage and props actually passed | Good |
| MCP tools | the tool name in registration / `tools/list` | often **no static consumer at all** | Producer good, consumer absent |
| Webhook payloads | the `event.type` set and the serializer | receiver's `switch (event.type)` and field accesses | Medium |

**Breaking:** a changed `customElements.define` name — every existing embed goes inert **silently**,
because an unknown custom element renders as an empty inline box with no console error; removed
observed attribute or slot; removed `::part()`; added required prop; renamed MCP tool; removed
webhook event type or payload field.
**Ambiguous:** internal DOM structure changes, which break consumers reaching in with descendant
selectors — not contract, practically breaking.

**The one kind where the consumer may be outside the organization entirely** — a customer's site
embedding a script tag. The consumer index is therefore fundamentally incomplete, and the correct
policy is to treat **any removal on this surface as breaking** regardless of whether an internal
consumer is found.

**Wrap:** `@custom-elements-manifest/analyzer` — emit `custom-elements.json` on both sides and diff
the JSON, which converts a heuristic surface into a structural one. `api-extractor` for React
props. (`react-docgen`: UNVERIFIED.)

### 12. Build-graph targets

Exact, tool-computed affectedness from a git range. Inside one repository this is the gold
standard.

| Tool | Query |
| :-- | :-- |
| Bazel | `rdeps(universe, x[, depth])` |
| bazel-diff | `generate-hashes` at two revisions, then compare — SHA256 over all attributes and inputs |
| Nx | `nx affected` |
| Turborepo | `--filter=...[origin/main]` — `...` **before** a package means dependents, **after** means dependencies |
| Pants | `--changed-since=$MERGE_BASE --changed-dependents=transitive` |

**What they miss — the reason this project exists:**

1. **They stop at the repository boundary.** Every one computes affectedness within one workspace.
2. **Only declared dependencies.** Two services in the same Bazel workspace that talk over HTTP
   have **zero** build-graph edge.
3. **Lockfile over-approximation.** Nx marks *all* projects affected when lock files change by
   default; Pants documents that it does not understand transitive third-party dependencies in
   this context.
4. **Blast radius.** Nx notes that modifying a widely-used project "might end up running tasks for
   almost all the projects in the workspace" — correct, and useless as a signal.
5. **Non-source inputs** — environment, secrets, infra config — are outside the hashed input set,
   so a config-only change reads as affecting nothing.

**Use them as a component, not a competitor:** run the in-repo tool to get affected targets in
repository A, then use kinds 1–11 to cross the boundary.

## Staged implementation decision

The original breadth-first v1 proposal mixed strong schema/symbol lanes with heuristic HTTP,
database, environment and messaging joins. It also contained unsupported frequency and effort
estimates. The adopted plan is precision-first and has three initial adapters:

1. **TypeScript/npm public symbols.** Package exports on the producer; resolved import/symbol and
   manifest/lock provenance on the consumer. Report upgrade-time versus immediate risk explicitly.
2. **OpenAPI operations.** Path/method/operation/schema change semantics from a pinned differ;
   consumer proof from a generated client or a resolved operation reference. Bare route strings
   with ambiguous bases remain preview-only.
3. **Protobuf/gRPC.** Descriptor identity and pinned `buf` compatibility semantics; generated or
   SCIP references on consumers. Strong canonical identity makes this more suitable for an early
   measured slice than low-authority environment/database inference.

Admission candidates after the vertical slice:

- GraphQL operations when a design partner and persisted/generated operation evidence exist;
- framework HTTP routes after service registry and base/gateway resolution are measured;
- messaging schemas/topics when broker/subject namespace and consumer subscription evidence are
  explicit;
- more package ecosystems through their own resolution and compatibility semantics.

Later/high-risk inference lanes:

- physical database schemas, requiring instance/database/schema identity and rollout timing;
- environment/config keys, requiring deploy-unit/environment ownership and activation semantics;
- Terraform modules/resources, requiring state/provider/module identity;
- arbitrary CLI strings and dynamic runtime coupling, which may remain indefinitely deferred.

Build graphs are integrated as evidence, never reimplemented. Every adapter must define canonical
identity, producer and consumer artifacts, compatibility semantics, activation timing, coverage,
remedy, evaluation stratum, owner and licensing before delivery.

The service/resource registry is still cross-cutting, but initial package and descriptor lanes do
not all depend on it. Phase 003 owns versioned repository, deploy-unit, package, base URL/gateway,
broker and physical-resource mappings with provenance and validity intervals.

## Ground truth and evaluation

No one signal is universal ground truth.

- Wrapped-tool fixtures and controlled mutations validate compatibility semantics and controlled
  recall; they do not estimate real-world precision or the cross-repository join.
- Historical public/private PRs provide realistic cases, but merge, SemVer, revert, CI failure,
  hotfix and incident linkage are noisy candidate signals that require independent review.
- Executable consumer replays provide strong evidence for exercised paths; unrelated build
  failures remain indeterminate.
- Forward shadow audits reduce historical reconstruction ambiguity.
- Probability-sampled no-finding PRs are required to estimate false omissions/recall.

The canonical labels are separate edge, impact and action axes with two independent reviewers and
adjudication. Metrics include correctness, analysis/selection/label coverage, alerts per 1,000
eligible PRs, latency and burden. Full procedure and promotion thresholds are in
[`evaluation-protocol.md`](evaluation-protocol.md) and
[`false-positive-design.md`](false-positive-design.md).

## Repository moves and archived projects

Worth recording, because stale links here become stale dependencies later.

- **`oasdiff` moved** from `Tufin/oasdiff` to `oasdiff/oasdiff`.
- **`graphql-inspector` moved** from `kamilkisiela/graphql-inspector` to
  `graphql-hive/graphql-inspector`.
- **Optic was archived 2026-01-12** following the Optic Labs acquisition by Atlassian. It was the
  obvious thing to wrap for HTTP spec-versus-traffic verification and is no longer available.
- **`atlas migrate lint` is Pro-gated from v0.38+.** Verify licensing before depending on it;
  `squawk` is the permissive alternative for Postgres.
