# repowise — Teardown

**Status:** Historical reference — read from source at `repowise-dev/repowise@67ef518`
(2026-08-28)

> Current-behavior correction (2026-08-28): the Phase 003 comparison executed Repowise 0.46.0 at
> `0847cbff32c0c113ad46e2699ae87a795238d431`. On the shared fixture it resolved an exact
> TypeScript package-symbol contract, reported its consumer file, and produced a breaking-change
> record after the provider update. The older “PR analysis is file-level” and related positioning
> below describe the earlier pinned audit and must not be presented as current behavior. See the
> [comparative report](../../../docs/verification/phase-003-comparison.md).

`github.com/repowise-dev/repowise` is public, AGPL-3.0, Python 3.11+, v0.46.0. Roughly 302k lines,
1,015 test files, 56 Alembic migrations, weekly releases. The organization was created 2026-03-29,
so the project is about five months old. One dominant contributor (1,010 commits; the next is
150).

Everything below was read from source. Items marked **[inferred]** were not directly confirmed.

## The finding that changes the brief

**repowise already does cross-repository analysis.** Roughly 300KB across 18 modules in
`packages/core/src/repowise/core/workspace/`, including a cross-repository system graph, contract
extraction, breaking-change detection, blast radius, and architecture conformance rules.

"Like repowise, but cross-repo" is therefore not an available position. The gap is narrower,
real, and stated at the end of this document.

## What it is

Its own framing (`README.md:126-135`):

> Every question your agent asks about a repository has an answer that could have been computed
> ahead of time. *Who calls this function? What breaks if I change it? Why is it written this way?
> Which files are actually dangerous?* Without an index, the agent rediscovers that answer on every
> task: grep, read, re-read, forget.

The load-bearing architectural claim, which the code backs: **graph, git, health, change risk,
tests, dead code and PR review make zero LLM calls.** Prose is the only model-dependent layer and
it is optional — `repowise init` works with no API key, rendering the wiki from Jinja templates.

`init` produces a `.repowise/` directory: a 36-table SQLite database, a LanceDB vector directory, a
JSON knowledge graph, and a generated wiki. On `django/django` that is a 90,477-edge graph, 3,392
wiki pages and 5,317 health findings — 367s without prose, 1,058s with.

## Architecture, in the order it matters for us

### Parsing: tree-sitter only

Verified by grep — **zero** hits for `ctags`, `lsp`, `language server`, `gopls`, `tsserver`,
`clangd` anywhere in core, cli or server. One `.scm` query file per language, 19 of them:

```
c cpp csharp dart go java javascript kotlin luau pascal php python
ruby rust scala shell swift tsx typescript
```

Plus `sqlglot` for SQL, and `tree-sitter-html`/`tree-sitter-svelte` used only to *locate* `<script>`
blocks in `.vue`/`.svelte`, whose contents are then parsed with the TypeScript grammar. There are 51
language specs but only 19 parse to a full AST; the rest degrade to import-graph-only or
git-history-only.

**This is a direct answer to our own parser question**: a production system covering 35 languages
at five quality tiers, on tree-sitter alone, with no language server anywhere.

### The graph: closed vocabularies, held shut by tests

```python
EdgeType = Literal[
    "imports", "defines", "calls", "has_method", "extends", "implements",
    "method_implements", "dispatches_to", "co_changes", "framework",
    "framework_binds", "reads", "dynamic_uses", "dynamic_imports",
    "dynamic_url_route", "type_use", "references",
]
```

A test AST-walks every `add_edge` call and fails on any literal not in the `Literal`. The recorded
rationale is worth carrying over verbatim:

> A declared-but-never-emitted member is what let a dozen consumers each write a set against a type
> that does not exist, and an emitted-but-undeclared type is what made every one of those sets
> silently incomplete.

Rather than each consumer re-deriving "what counts as a dependency", there are **named views** —
`FILE_DEPENDENCY_EDGE_TYPES`, `SYMBOL_USE_EDGE_TYPES`, `REACHABILITY_USE_EDGE_TYPES` and others.
The comment records the mess this replaced: thirteen modules with private sets, no two identical,
three of them testing a bare `"dynamic"` that no producer emits — matching none of the 6,153 real
`dynamic_*` edges.

### Confidence: 29 named resolution origins, fixed per origin

The most transferable idea in the project.

```python
ResolutionOrigin = Literal[
    "same_file",       # 0.95 — defined in the calling file
    "enclosing_class", # 0.95
    "same_package",    # 0.90 — Go/JVM sibling file, no import needed
    "import_scoped",   # 0.90
    "package_alias",   # 0.88 — Go pkg.Func
    "import_merged",   # 0.85 — in *some* imported file; which one is unattributed
    "receiver_global", # 0.75
    "global_unique",   # 0.50 — the name is unique repo-wide. A guess.
    ...                # + 12 receiver-typing, 4 return-type, 2 inherited
]
```

> An edge is not a fact. `global_unique` binds a name to the only symbol carrying it anywhere in
> the repo, which is a guess; `same_file` is a certainty. Both used to reach a consumer as an
> unlabelled arrow, so an agent reading a flow could not tell which it was looking at.

`NULL` means "predates this vocabulary", explicitly not "unknown origin". Because origin maps
one-to-one onto confidence, the origin distribution and the confidence histogram are two views of
one dataset — which makes the stamping auditable.

This is the same rule as [`../spec.md`](../spec.md) INV-3, arrived at independently: **confidence is
a lookup keyed by how the edge was derived, never a per-edge judgement.**

### Incrementality, and its cliff

The parse cache is keyed by `(relative path, content hash)` under a parser fingerprint combining the
compiled `.scm` sources, a schema version, and **the field shape of every dataclass** — so adding a
field to `Symbol` invalidates automatically. The fingerprint deliberately excludes the package
version, so unrelated releases keep the cache warm. It is **HMAC-sealed**, because "the cache lives
inside the indexed repo and is attacker-writable."

The cliff (`pipeline/incremental.py:50`): the update path always re-walks and re-hashes every file,
and cache misses parse **serially on one core**. Since any `.scm` or dataclass change invalidates
globally, a routine upgrade can turn the next `update` on a large repository into a single-core full
parse. Documented, not fixed.

### Retrieval: three legs, RRF-fused, deliberately asymmetric

Full-text (SQLite FTS5), vector (LanceDB), and a **structural symbol index** queried with SQL rather
than vectors. Fusion is reciprocal rank fusion with `_RRF_K = 60` for the two page legs and
`_SYMBOL_LEG_RRF_K = 180` for the symbol leg, so it contributes less at every rank:

> Fusing it at k=60 like the others gave one lexical symbol match the same weight as a page two
> independent retrievers ranked first... measured on the 99-question eval it pushed the correct
> `distill/skeleton.py` out of the served five in favour of a same-named React component.

**[Inferred]** no ANN index is ever created in LanceDB — greps for `create_index`, `IVF_PQ`,
`num_partitions` and `nprobes` hit only Alembic SQL — so vector search is an exhaustive scan. That
is consistent with the cold-versus-warm latency the MCP layer budgets for (6.3s and 13.4s cold
against 0.19s warm) and is the likely real ceiling on a large wiki.

### The unit of retrieval is a generated page, not code

repowise does **not** chunk or embed source code. It generates a wiki — eleven page types — and
embeds the pages. The LanceDB schema holds `page_id`, `vector`, `title`, `page_type`, `target_path`
and a 2,000-character `content_snippet`. No code, no chunk text.

There is an explicit deterministic tier with no model call at all, and its template header states
the design rule plainly:

> Written for retrieval as much as for reading: the page names its own symbols, its neighbours' file
> paths and its layer in full, because those are the identifiers a question embeds near. Nobody
> reads a file page end to end, so where readability and retrieval disagree, retrieval wins.

## Cross-repository: what actually exists

A **workspace** is a directory containing `.repowise-workspace.yaml` listing member repositories by
**relative filesystem path** and alias, with free-form tags used by conformance rules.

Each repository keeps its own index. There is no merged database — `cross_repo.py:6-8`: *"No new DB
tables — all cross-repo data lives in `.repowise-workspace/cross_repo_edges.json`."* Four JSON
artifacts sit on top: `system_graph.json`, `cross_repo_edges.json`, `contracts.json`,
`breaking_changes.json`.

**The hinge that makes one repository reference another's entities** is worth understanding, because
it is elegant:

```python
# Node-id prefix ingestion gives an import target it could not resolve inside
# the repo — a third-party package or a sibling workspace repo.
EXTERNAL_PREFIX = "external:"
```

Single-repository ingestion parks every unresolvable import under `external:<name>`. The workspace
pass re-reads those nodes across members and resolves the ones naming a sibling. That is what turns
N isolated graphs into one estate graph, and it costs nothing at single-repo index time.

The system graph is **service-granular, not repository-granular**:

> * **Nodes are services**, not repos. A monorepo with three service boundaries yields three nodes.
> * **Edges are typed and honest.** Every edge carries its `kind` (http / grpc / event / package /
>   co_change / db), `match_type` (exact / candidate / manual / inferred), a `confidence`, a
>   `weight`, and `contract_refs` back-pointers so any consumer can drill from an edge to its
>   evidence.
> * Edge direction is uniform: **source depends on / calls target.**

Contracts come from **source extraction**, not spec ingestion — `workspace/extractors/http/` has 21
modules covering aspnet, django, express, fastapi, go, jaxrs, laravel, next_app, rust_axum, spring
and others. Breaking-change detection uses two plugin registries with rules including
`removed_endpoint`, `removed_field`, `field_type_changed`, `field_number_changed` and
`field_required`.

## Where it stops — the five gaps

Each is stated by repowise's own code or documentation, not inferred by us.

### 1. PR analysis is file-level, not symbol-level

The only line-to-symbol function is `_find_enclosing_symbol`, and all three of its callers are
ingestion-time call-site attribution. None runs at diff time. The code says so:

```python
# tool_risk/directives.py:468-471
# "may", not "will": this is a reverse-import reachability walk over a file
# list, and get_risk is never given a diff, so nothing here knows whether the
# symbol an importer uses actually changed.
```

`docs/agent/MCP_TOOLS.md` records renaming `will_break` to `may_break` because "the old name
promised a precision the analyzer does not have."

**This is the central gap.** A file-level blast radius answers "something in a file you depend on
changed", which fires on most pull requests and is the signal Google shipped as informational with
no "Please fix" button ([`prior-art.md`](prior-art.md)). Contract-level is a different claim.

### 2. The PR bot is closed and hosted

Verified exhaustively: `.github/workflows/` contains only ci, docs and publish. The server's webhook
router handles **`push` only** — no `pull_request` branch, no comment posting, no `GITHUB_TOKEN`
anywhere. `docs/architecture/ARCHITECTURE.md:190-191` describes `integrations/github-action/` and
`integrations/github-app/`; **neither directory exists.** What ships open is the engine
(`repowise risk main..HEAD`, `get_risk`, `POST /{repo_id}/blast-radius`) plus a *skill* file telling
an agent to run `gh pr diff` and call it.

### 3. The workspace requires local checkouts

Members are relative filesystem paths in a YAML file. There is no org-wide discovery, no GitHub App
installation, no notion of a repository the operator has not cloned next to the others. Workspace
updates run at four concurrent processes, `spawn`-only because `lance` is not fork-safe.

### 4. Breaking-change coverage is thin where it matters most

Stated in their own honest coverage note: *"Field-level breaking diffs currently require a gRPC
schema; HTTP supports endpoint-level removal detection."* So the most common cross-service contract
gets removal detection only — no signature change, no required-field addition, no response-shape
narrowing. And nothing wraps `oasdiff`, `buf breaking` or `graphql-inspector`, all of which already
classify these correctly ([`contract-taxonomy.md`](contract-taxonomy.md)).

### 5. No finding-level feedback loop

Suppression is configuration only — `.riskignore`, `.repowiseIgnore`, `exclude_patterns`. There is
no human decision recorded against a finding, no label captured, and therefore no way for the system
to measure or improve its own precision from use.

## Where its rigour exceeds ours, and should be copied

Recording this plainly, because the parts worth taking are the parts that are hard.

- **Fitted, not chosen, weights.** Health scoring was calibrated offline against a 13-repository,
  5-language defect corpus (830 files, 216 bug-fix-bearing), each file scored at a pre-window commit
  to prevent leakage, with leave-one-repository-out validation. Several intuitive detectors were
  **floored to 0.5** when they failed under that control — one is labelled in the source as "the
  HEAD-leakage hero."
- **A model that publishes its own thin margin.** Change risk is L2-logistic over Kamei features,
  calibrated on 4,102 commits across 7 repositories, reporting pooled leave-one-repository-out AUC
  **0.772 against 0.766 for churn alone** — a delta of +0.0068 with a confidence interval spanning
  zero, published rather than hidden.
- **Two tiers never merged.** Test impact is `measured` or `inferred`; measured wins outright, and
  the types file states "the two are never merged and never averaged." Its published forward-walk
  measurement — 95.7% precision at 27.7% recall — comes with the rule *"Sound as a floor. Unsound as
  a quantity. No percentage may be derived from it."*
- **A capability built, measured, and deleted.** SZZ inducing-commit attribution reached 74.5%
  top-candidate precision against an 80% gate and was removed.
- **Refusal over guessing.** A test-gap finding requires all three signals to be silent, and the
  graph walk is wrapped so that a failure produces an empty set rather than an accusation.
  `missing_tests` is **withheld, not emptied**, when coverage is unusable. `fix_history` raises
  rather than returning `{}`, because "empty is indistinguishable from *this repository has never
  had a bug fix*."

That last cluster is the same principle as [`../spec.md`](../spec.md) INV-6, and repowise implements
it in more places than we currently specify.

## The benchmark, and how to read it

Headline: **call-edge precision 85.7% [81.1, 89.3] against CodeGraph's 58.6%**, over 280 graded rows
per side, sampled 30 per language per tool, seed 2026, **stratified by resolution strategy**.

The methodology is better than the category norm and they undercut their own number in four ways
worth emulating:

- *"This audit was graded by us, on both sides. That is the strongest form of a weak thing."*
  Self-graded, no third party, no inter-rater statistic. Partially rescued by a pre-registered
  compiler oracle — a Go RTA oracle over SSA and a TypeScript `tsc` oracle — which agreed with the
  hand grading to within about a point on Go. Seven of nine languages have no answer key the vendor
  did not produce.
- **Five of nine cells are ties and reported as ties.** At n=30 the interval runs about ±16 points
  near 60%, so a 20-point point-estimate gap is called a tie.
- *"Read our number the other way round: roughly fourteen percent of our call edges are wrong."*
- *"We lead no recall cell against the oracle, and lose cross-file coverage on 15 of 35 repositories
  in the same bench. A precision win is a claim about the edges a tool draws, never about how
  many."*

They also publish a case they lose: on one repository the competitor resolves 24,950 distinct call
edges to repowise's 9,486 — *"Precision is not the only reading."*

Two cautions: the bench repository has **no LICENSE file** despite badging the main repository's
licence, and the health/defect model's own AUC of 0.737 is published beside its counter-evidence —
*"not better than raw file size at discrimination — LOC-only scores 0.742."*

## Packaging

One PyPI package, `repowise`, **AGPL-3.0-or-later**, merging three `src/` roots into one wheel via
`[tool.setuptools.package-dir]`. A CLI with 41 lazily-registered commands, a local server, and an
MCP server exposing 10 of 17 tools by default. Also distributed via the VS Code Marketplace, Docker,
the MCP registry, and agent plugin directories.

**Core is not separately installable.** `packages/core/README.md` advertises `pip install
repowise-core` and "Python >= 3.11 · Apache-2.0", and `packages/core/pyproject.toml` declares that
name at version 0.1.2. **`repowise-core` returns 404 on PyPI**, and the Apache-2.0 claim contradicts
the root AGPL declaration. The per-package pyprojects exist only for the local `uv` workspace. Of
the eight packages, only the unified wheel and the VS Code extension are actually published;
`@repowise-dev/ui` 404s on npm and three others are marked private.

The open-core split is unusually clean and worth adopting as a model. From `ROADMAP.md`: *"Every
language repowise supports ships in the open-source distribution under AGPL-3.0. No language sits
behind the commercial licence, and none will."* The commercial line is hosted and enterprise
wrapping — the PR bot, compliance evidence, SSO/SCIM, SLA, indemnification.

## Documentation reliability

Eight documented claims verified as contradicted by the code, including two non-existent
directories, a non-existent `networkit` backend with a config key that appears in no Python file, a
context budget stated as 12K where the code says 48000, an MCP LRU cache that does not exist, and
two internally inconsistent benchmark row counts.

The inverse is also true and more interesting: **the source comments are unusually trustworthy** —
they carry measurements, issue numbers, rejected alternatives, and the incidents that motivated
specific constants. Read the code; treat `docs/` as a lead, not a spec.

## What Reverb differentiates on

Not "cross-repo" — that exists. Four things, each traceable to a gap above:

| Gap | Reverb's position |
| :-- | :-- |
| Blast radius is file-level, and the code says so | The unit is a **contract**: one endpoint, one exported symbol, one topic, one column. A finding names the call site, not the file |
| The PR surface is closed and hosted | The advisory check is **in the open-source distribution**, gated on measurement rather than on licence |
| Membership is local checkouts in one directory | Membership is a **GitHub App installation**, with per-repository read consent and explicit reporting of what was outside the set |
| Nothing wraps the mature differs; HTTP gets removal detection only | **Wrap `oasdiff`, `buf breaking`, `graphql-inspector`, `squawk`.** Spend the effort on the join, which is what nobody has |
| Suppression is config; no label is ever captured | A **recorded human decision per finding**, which is both the review loop and the labelled corpus that makes a precision figure sayable |

The last row is the one that compounds. repowise cannot report the precision of its cross-repository
edges on a customer's estate, because nothing captures whether a person agreed with one. That is a
product gap and, per [`research-paper.md`](research-paper.md), the research contribution as well.

## Constants worth stealing

| Constant | Value | Why it exists |
| :-- | :-- | :-- |
| Co-change file cap | 200 files/commit | 500 files × 2000 commits ≈ 250M pairs ≈ 16GB |
| Change-entropy cap | 30 files/commit | Hassan's commonly cited filter |
| Co-change decay | τ = 180 days | ~125-day half-life |
| Per-file index timeout | 45s | Releases the slot with partial data rather than hanging |
| Betweenness sampling | k=500 above 30k nodes | Seeded, over a pre-sorted node list — unseeded, entry-point order flapped between runs |
| Blame skip | files > 100KB | Ownership estimated instead |
| Parse skip | > 2MB | Non-overridable memory budget |
| Embedding batch | 16 items | A 275-page level (~560k tokens) failed as one request and *silently* lost the level's embeddings |
| MCP response budget | 8,000 tokens | Held under a 25,000 host cap at 0.6 |

There is **no repository-size or file-count refusal anywhere** — scale is bounded by memory and
time, never gated. That is a deliberate choice with a cost, and worth deciding explicitly rather
than inheriting.
