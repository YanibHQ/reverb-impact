# Reverb Packaging, Licensing, and Adoption

**Decision:** standalone clean-room public project owned by `YanibHQ`  
**Product name:** Reverb  
**Repository:** `YanibHQ/reverb-impact`  
**CLI:** `reverb`  
**Planned code license:** Apache-2.0

## 1. Why a separate project

Reverb's index, adapter protocol, temporal graph, evaluation corpus, GitHub host, and wire schemas are reusable infrastructure. Shipping them inside Yanib would couple a general engine to one SaaS database, release train, tenancy model, and UI. A separate project gives:

- independent versioning and public contribution;
- clean host ports and conformance tests;
- use without Yanib;
- a stable dependency Yanib can upgrade deliberately;
- a public reproducibility artifact for research;
- a licensing boundary suitable for embedding.

## 2. Repowise reuse decision

Repowise is a mandatory benchmark and prior-art source, not an implementation dependency.

Verified current facts:

- root distribution is AGPL-3.0-or-later and commercial embedding terms are offered;
- it already implements local cross-repository workspaces, contract extraction/linking, blast radius, and a breaking-change guard;
- current workspace limitations and behavior are documented in [research/repowise-teardown.md](research/repowise-teardown.md).

Decision:

- Reverb is implemented clean-room from this specification and primary protocol/tool documentation;
- no Repowise source is copied, translated, adapted, or linked into Apache-2.0 packages;
- public behavior may be used to design interoperability fixtures and an evaluation baseline;
- provenance/origin notes are recorded for nontrivial algorithms and third-party tools;
- any future Repowise artifact importer is optional and consumes documented exported data at arm's length after a license review;
- this is engineering policy, not legal advice; counsel reviews final distribution and trademarks.

Rejected alternatives:

| Alternative | Why rejected now |
| --- | --- |
| fork/extend Repowise | license and broad product surface conflict with an embeddable focused core; current feature may still be a better choice for some users |
| commercial Repowise license inside Yanib | could be rational, but does not create the requested public independent project or paper artifact |
| consume Repowise internals | unstable coupling and license ambiguity; no independent core |
| build generic codebase intelligence competitor | vanity duplication; Reverb stays PR-impact focused |
| only extend Yanib declarations | cannot infer consumer call sites or support other hosts |

## 3. Naming

“Reverb” remains the product name and folder codename. It is not safe as an unqualified publisher name: existing software and packages use it, including DeepMind's Reverb ecosystem.

Before first public publish:

- search GitHub organizations/repositories;
- search npm, PyPI, crates.io, Docker Hub/GHCR namespaces;
- search domains and social handles;
- perform a basic trademark/product-category review;
- record the result in an ADR.

Until then:

- repository: `YanibHQ/reverb-impact`;
- npm scope: `@yanib/reverb-*` (personally owned and verified for the first public release);
- CLI distribution package: `reverb-impact` with binary `reverb`;
- container: `ghcr.io/yanibhq/reverb-impact`;
- protocol identifiers use `reverb.*`, which are internal schema names rather than a registry claim.

If clearance fails, rename before `1.0.0`; schemas reserve aliases so the codename does not become a compatibility trap.

## 4. License strategy

### 4.1 Code

Apache-2.0 is selected because it:

- permits internal, hosted, and commercial embedding;
- includes an express patent grant;
- supports Yanib and third-party developer-platform integration;
- is compatible with SCIP's protocol licensing and common permissive parser/tool foundations;
- differentiates the adoption boundary from AGPL/commercial-only embedding.

The project does not add a source-available or open-core restriction to the engine. A future hosted business may sell operations/support without making core language support proprietary.

### 4.2 Data and documentation

- documentation: Apache-2.0 with code unless a separate docs notice is selected;
- public benchmark annotations: choose and record a data license compatible with source-project terms and labeler consent;
- public source is referenced by repository/commit and fetched by scripts rather than redistributed where licenses differ;
- private partner cases are not included in the public dataset by default;
- paper text follows publisher terms; preprint and artifact licenses are recorded separately.

### 4.3 Dependency policy

Allowed by default: permissive licenses approved by policy, including MIT, BSD, ISC, Apache-2.0, and PostgreSQL License.

Review required: weak copyleft libraries, grammar-specific licenses, native binaries, model weights, datasets, and tools with dual/community editions.

Forbidden from default distributable code/image without explicit legal ADR: AGPL, SSPL, BSL restrictions incompatible with distribution/host goals, unknown licenses, and copied source whose provenance is unclear.

CI produces:

- dependency lockfiles;
- SPDX/CycloneDX SBOM;
- license inventory for JavaScript packages, native tools, tree-sitter grammars, containers, SCIP indexers, and model weights;
- vulnerability scan;
- signed release provenance and checksums;
- a failure when a forbidden/unknown license enters the default graph.

## 5. Monorepo packages

| Package | Purpose | Runtime dependencies allowed |
| --- | --- | --- |
| `@yanib/reverb-domain` | pure values and algorithms | small validation/hash utilities only; no I/O clients |
| `@yanib/reverb-application` | use cases over ports | domain, schema, port interfaces |
| `@yanib/reverb-schema` | generated JSON Schema/types | no runtime or minimal validator |
| `@yanib/reverb-adapter-sdk` | adapter manifest/contracts/test harness | domain/schema |
| `@yanib/reverb-adapter-typescript` | TS/npm definitions/references/diffs | TypeScript compiler API, manifest/lock parsers |
| `@yanib/reverb-adapter-openapi` | OpenAPI operations and compatibility wrapper | safe parser, pinned external differ integration |
| `@yanib/reverb-adapter-protobuf` | Protobuf/gRPC definitions/references/diffs | descriptor parser, pinned `buf` integration |
| `@yanib/reverb-storage-sqlite` | local persistence/job implementation | SQLite driver/migrations |
| `@yanib/reverb-storage-postgres` | hosted persistence/job implementation | PostgreSQL driver/migrations |
| `@yanib/reverb-host-local` | Git/filesystem source and local registry | Git process adapter, filesystem |
| `@yanib/reverb-host-github` | app/webhook/source/check adapter | GitHub SDK/web framework |
| `@yanib/reverb-testkit` | conformance fixtures and fake ports | domain/application/schema |
| `reverb-impact` | CLI composition | local host, adapters, SQLite |

Optional model/vector integration lives in separate packages and is absent from the CLI/default host dependency graph.

## 6. Repository layout

```text
reverb-impact/
  .github/
  docs/
    adr/
    operations/
  features/cross-repo-impact/       # this specification set
  packages/
  schemas/
  fixtures/
    organizations/
    adapters/
    adversarial/
  corpora/
    manifests/                      # no private source
    labels/
  tools/
  LICENSE
  NOTICE
  SECURITY.md
  CONTRIBUTING.md
  CODE_OF_CONDUCT.md
  GOVERNANCE.md
  CHANGELOG.md
  package.json
  pnpm-workspace.yaml
```

## 7. Toolchain

- TypeScript in strict mode;
- Node 24 LTS runtime baseline;
- pnpm workspaces with a frozen lockfile;
- JSON Schema generated and diff-checked in CI;
- formatter/linter/typecheck/unit/integration/conformance/license/SBOM jobs;
- PostgreSQL 18 for hosted integration tests;
- SQLite for local integration tests;
- pinned external tools run through the sandbox test harness;
- container images pinned by digest in release workflows.

Exact library versions are chosen and locked during Phase 001, not frozen in the feature document before code exists.

## 8. Compatibility policy

### 8.1 Before 1.0

- packages may make breaking changes in minor releases;
- schema majors still change explicitly so fixtures and external prototypes do not silently break;
- every release includes migration and re-index requirements;
- deprecated package APIs survive at least one minor where practical.

### 8.2 At and after 1.0

- semantic versioning for packages;
- stable public imports only through documented package entry points;
- schema major compatibility window of current plus previous major in hosts;
- storage migrations support the documented oldest upgrade version;
- adapter identity-version changes include a re-index/re-key plan and reset calibration;
- host conformance suite is versioned; a host declares the suite version it passes.

## 9. Deployment forms

### 9.1 Local CLI

```bash
npx reverb-impact init .
npx reverb-impact index
npx reverb-impact analyze --repo api --base main --head HEAD
```

Core analysis works offline after repositories and external tool images/binaries are available. No API key or hosted account is required.

### 9.2 Self-hosted reference service

Minimum deployment:

- Reverb web/API process;
- Reverb worker process (same codebase/image, different command);
- PostgreSQL 18;
- optional object storage only when large artifact retention is enabled.

Docker Compose is the development/reference deployment. Kubernetes charts are deferred until a real operator needs them; YAML volume is not product capability.

### 9.3 Embedded host

A host imports domain/application/schema packages or invokes a sidecar/API. It supplies ports for repository reads, generations/evidence, registry, authorization, jobs/cancellation, clock, sandbox, delivery, blobs, and telemetry.

## 10. Extension model

### 10.1 Contract adapters

First-party in-tree adapters set the trust and test model. External adapters later require:

- manifest and schema validation;
- fixture, determinism, identity, coverage, adversarial, and resource tests;
- license/SBOM declaration;
- capability sandbox;
- publisher/signature/provenance;
- preview-only state until separately calibrated.

### 10.2 Host adapters

Host adapters implement ports and pass `@yanib/reverb-testkit`. They do not fork domain logic. GitLab/Bitbucket are deferred until GitHub semantics and the provider-neutral DTOs are stable.

### 10.3 Artifact import/export

SCIP import is a precision input. SARIF is an export. A future Repowise importer or Glean/SCIP bridge is optional and must preserve source provenance, evidence kind, coverage semantics, and license boundary; imported “confidence” never automatically maps to a promoted Reverb stratum.

## 11. Yanib adoption path

### Step 1 — shadow API consumer

Yanib submits a known repository set and PR base/head to a Reverb local/self-hosted instance. It stores only `analysis_id`, schema version, state, counts, and authorized projections. No customer-visible effect.

### Step 2 — preview inside Yanib

Yanib renders Reverb preview findings in its existing surface workspace. Reverb's edge/impact/action labels map to a dedicated Reverb finding-review subject; they are not forced into `CapabilityChange` review rows.

### Step 3 — policy and existing declarations

Yanib exports `.yanib.yml`/`ConsumerDeclaration` relationships as `declared_context` with provenance. They can support routing and service identity but cannot independently satisfy structural finding evidence.

### Step 4 — delivery ownership

One system owns the external GitHub Check. Recommended default: Reverb produces an authorized projection; Yanib's host adapter writes it through Yanib's provider/consent infrastructure. Duplicate check writers are forbidden.

### Step 5 — labelled feedback

Yanib sends append-only review events through the SDK. Reverb never reads or writes Yanib tables directly. Research-use permission remains separate.

## 12. Public project governance

`binaydhakal` owns the initial repository, GitHub App namespace, release signing identity and
security contact; npm user `yanib` owns the public package scope. Reverb remains a standalone
codebase: Yanib product changes do not silently change Reverb’s protocol, and Reverb releases do
not directly modify Yanib production tables or workflows.

Before accepting adapters from multiple organizations:

- document maintainer/committer roles and security response;
- require DCO or CLA decision and record it;
- add RFC/ADR process for schema, identity, evidence, and permission changes;
- require two reviewers for security/identity/compatibility changes;
- publish supported capability tiers and calibrated strata, not marketing-only language counts;
- publish deprecation and end-of-support windows;
- keep benchmark methods, losing baselines, and limitations visible.

## 13. Release gates

### `0.1.0` developer preview

- packages build and publish under cleared scope;
- local Git/SQLite host indexes/analyzes golden fixtures;
- initial adapter SDK and one adapter lane;
- schema and host conformance v1;
- Apache/NOTICE/SBOM/provenance in place.

### `0.5.0` private organization preview

- three initial adapters;
- GitHub/Postgres host;
- workspace/service registry and authorization model;
- shadow checks, review/evaluation, policy simulation;
- no external check enabled by default.

### `1.0.0`

- at least one evidence stratum promoted on current human-labelled data;
- advisory check and disclosure matrix production-verified;
- local and hosted hosts pass conformance;
- schema/version/migration policy active;
- security review and purge/incident procedures complete;
- public benchmark/artifact and honest comparison with Repowise/baselines;
- Yanib integration guide validated; the first Yanib rollout remains independently gated.

---

# Licensing — the argument behind Apache-2.0

Verified against license texts and adoption history, 2026-08-28. This section exists because the
choice is close to free now and expensive later, which makes it a decision made once.

## The options

| License | OSI | May a hosted competitor run it? | Converts to open? | Operative restriction |
| :-- | :-: | :-- | :-- | :-- |
| MIT | yes | anything | n/a | none |
| **Apache-2.0** | yes | anything | n/a | none; adds an express patent grant and termination |
| AGPL-3.0 | yes | **yes**, but must publish modifications to network users | n/a | §13 |
| BUSL-1.1 | no | no, per the Additional Use Grant | **≤4 years**, to a GPL-compatible license | non-production use by default |
| Elastic License 2.0 | no | **no** | **never** | no hosted or managed service |
| FSL-1.1 | no | **no** | **2 years**, to Apache-2.0 or MIT | no "Competing Use" |
| Fair Source | — | umbrella term, not a license | — | covers FSL, FCL, BUSL |

## Does AGPL's network clause even trigger for a tool that runs in someone's CI?

**Almost never**, and this is the finding that removes AGPL from consideration on its merits rather
than on taste.

AGPL-3.0 §13:

> Notwithstanding any other provision of this License, **if you modify the Program**, your modified
> version must prominently offer all users **interacting with it remotely through a computer
> network** (if your version supports such interaction) an opportunity to receive the Corresponding
> Source of your version…

And §0:

> **Mere interaction with a user through a computer network, with no transfer of a copy, is not
> conveying.**

Two conjunctive conditions: **the program was modified**, and **third parties interact with the
modified version remotely**. A tool running unmodified inside a customer's own runner satisfies
neither — nothing is conveyed, and CI is the licensee running the program privately, which §2
permits unconditionally.

**So for the primary use case AGPL is functionally MIT.** It imposes no obligation on the customer
and extracts no reciprocity.

What it actually does, honestly:

1. **It stops a hosted competitor keeping their fork private.** Real, and the only thing it does
   that a permissive license does not.
2. **It does not stop them hosting it.** A cloud vendor could run the indexer as a service tomorrow
   and comply by publishing a diff. If preventing hosted competition were the goal, FSL, BUSL or
   ELv2 are the instruments; AGPL is not.
3. **It is a sales instrument, not a legal one.** Enterprise legal departments carry blanket AGPL
   bans, so companies buy a commercial license to make the question disappear — even when, per the
   above, they would owe nothing. That is the actual revenue mechanism behind "AGPL or commercial".
4. **That same fear is a distribution tax.** Google's public policy is that AGPL code *must not* be
   used at Google, extending to not installing AGPL programs on Google machines without explicit
   authorization. For a tool whose adoption path is an engineer running `npm i` and then advocating
   internally, a ban at the largest engineering organizations hits the top of the funnel — and it
   lands hardest on exactly the several-hundred-repository organizations this is built for.

## What the relicensing history shows

| Date | Event | Outcome |
| :-- | :-- | :-- |
| 2023-08-10 | HashiCorp moves to BUSL-1.1 | **Forked within 15 days** → OpenTofu under the Linux Foundation |
| 2023-11-17 | Sentry moves BUSL → FSL, and authors it — change date "two years… half the BSL default" | Positive; FSL became the reference license for the category |
| 2024-03 | Redis moves to SSPL/RSALv2 | **Valkey fork**; Redis later conceded the change "hurt our relationship with the Redis community" |
| 2024-08-29 | Elastic **re-adds AGPL**, reasoning that "Amazon is fully invested in their fork" | The restrictive license did not prevent the fork — it caused it |
| 2025-05-01 | Redis 8 **adds AGPLv3** and moves Stack features into core | Reversal completed |
| 2024–2025 | Fair Source adoption grows: Typebot, Qlty, Pythagora, Chartbrew, Tuist, Sourcebot, Liquibase | Steady, no forks at that scale |

The pattern: **every relicensing away from open source that got forked involved a project with a
large pre-existing dependent ecosystem, and two of the three walked it back.** Projects that started
Fair Source have not been forked. Restrictive licensing is nearly free at day zero and extremely
expensive later.

## The decision

**Apache-2.0**, on the reasoning that the moat is not the analysis.

The detectors are inferable from their own output, and gating them kills the adoption loop that
makes the tool worth anything. Apache adds a patent grant MIT lacks — which matters to enterprise
legal — and sits on every corporate allowlist.

**The realistic alternative is FSL-1.1-Apache-2.0**, and it is worth stating fairly rather than
dismissing. Its Permitted Purposes explicitly include "your internal use and access", so every
legitimate customer running it in their own CI is unrestricted; the restriction lands only on
someone reselling it. For a CI tool that targeting is far better than AGPL's, and the two-year
Apache conversion answers the fork-risk objection that cost HashiCorp Terraform. The cost is that it
is not OSI-approved, so some procurement processes treat it as proprietary.

**BUSL and ELv2 are both rejected** — four years reads as proprietary and carries reputational
baggage, and ELv2 never converts at all.

## What the closed part is, if there is one

Not the analysis. The natural closed part is **the persistent, warm, incrementally-maintained index
and the identity layer deciding who may see which repository's symbols.**

The reasoning is structural. An Action is stateless: every run either rebuilds the index — against a
6-hour job cap, 14 GB of disk, and a 10 GB cache a pull-request job cannot even write
([`research/platform-limits.md`](research/platform-limits.md)) — or fetches it from something that
persisted it. That something is a service. It has marginal cost, it must stay fresh, it must
authenticate, and it must enforce per-repository access control across an organization. None of that
is available to a forked CLI.

Three things sit naturally on the closed side: the persistent cross-repository index with
incremental update; cross-boundary resolution, which requires holding data from many repositories at
once and is a permission problem rather than an analysis problem; and the contractual layer — SLA,
indemnification, compliance evidence — which is uncopyable by construction.

The honest inverse: **the CLI, the detectors, the language support and the on-disk index format
should all be open**, because a closed index format is the one thing that would make a team distrust
the tool with their source.

## Contribution licensing — do this on day one

Repowise's `CONTRIBUTING.md` states that contributions "will be licensed under the AGPL-3.0
license". That is inbound-equals-outbound. It is **not** a CLA and **not** a relicensing grant,
which means that project cannot unilaterally relicense contributed code, and cannot cleanly offer a
proprietary commercial license over any file a third party has touched. With an active contributor
funnel, a dual-license claim gets more encumbered with every merge.

**If a commercial license is ever intended, the CLA or DCO-plus-relicensing-grant has to exist from
the first external contribution.** Retrofitting one means chasing every past contributor.

This is a reading of license text, not legal advice; get counsel before relying on it.

## Publish pipeline — copy Changesets'

Given that this tool asks organizations to trust it with organization-wide read, the release
pipeline is part of the security story. Changesets' `publish.yml` is the template:

- `permissions: {}` at workflow level, with each job declaring its own minimal grants.
- **npm trusted publishing via OIDC** (`id-token: write`) — no long-lived npm token.
- A **GitHub App token** via `actions/create-github-app-token`, requesting only
  `permission-contents: write` and `permission-pull-requests: write`.
- Every third-party action **pinned to a full commit SHA**.
- `skip-cache: true` on every job, commented to avoid cache-poisoning.
- A four-job split — select-mode → version | pack → publish — with the publish step gated on a
  protected environment.

## Package topology, from comparable repositories

Read live from Vitest, Changesets, ast-grep and Biome:

- **Naming:** unscoped CLI plus scoped libraries — `npm i -g reverb` reads better than
  `npm i -g @reverb/cli`, and the scope stays available for everything else. This is the
  Vitest/Biome shape rather than Changesets', which scopes everything.
- **Split:** Changesets is the model. `@changesets/cli` is a thin shell over roughly twelve sibling
  packages joined by `workspace:^`, each separately importable and versioned. The same decomposition
  applies here: the graph builder, the diff parser and the host adapter each want their own cadence,
  and people will want the index library without the CLI.
- **Versioning:** per-package independent, not lockstep. Vitest bumps everything to one version,
  which is right when the packages are one product; a library other people consume needs semver
  independent of the CLI's.
- **Native binaries, if a compiled core ever appears:** the now-standard dispatcher pattern — one
  package declaring per-platform packages as `optionalDependencies` pinned to the same exact
  version, each carrying `os` and `cpu` fields. Ship **musl variants** (Biome does, ast-grep does
  not) because Alpine is common in CI images, which is where this runs. Set
  `publishConfig.provenance: true`.
