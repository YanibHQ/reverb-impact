# Platform Limits — GitHub

**Status:** Reference — verified against official documentation 2026-08-28; measurements noted as such

Facts that constrain the design. Two of them decide architecture rather than tuning.

## The two that decide architecture

### 1. `GITHUB_TOKEN` cannot read a second repository

An Actions `GITHUB_TOKEN` is scoped to **one repository**, at 1,000 requests/hour per repository. It
can never read the other 299. So a cross-repository tool needs a GitHub App installation token or a
personal token **regardless of workflow trigger**.

That combines badly with `pull_request_target`, which is the only trigger giving a fork-originated
pull request access to secrets. Credentials capable of reading the whole organization would sit in a
runner executing a job an attacker can influence:

> The `pull_request_target` and `workflow_run` workflow triggers, when used with the checkout of an
> untrusted pull request, expose the repository to security compromises.

> Workflows that use these triggers must not explicitly check out untrusted code, including from
> pull request forks or from repositories that are not under your control.

Three shapes, in descending safety:

1. **Server-side GitHub App** — webhook to our infrastructure, Check Run back. Organization-wide
   credentials never touch a runner. The only design where a malicious pull request cannot reach the
   token.
2. **`pull_request` plus `workflow_run`** — the untrusted job builds an artifact with no secrets, a
   separate privileged job mints the App token and posts the check. GitHub's own recommended
   privilege separation.
3. **`pull_request_target` with no checkout of pull-request code** — one careless
   `actions/checkout` with `ref: github.event.pull_request.head.sha` away from organization-wide
   compromise.

**This is why the reference host is a server-side App and not an Action.**

### 2. A pull-request job cannot refresh the shared index

Actions cache scoping, from the documentation: a cache created by a `pull_request` run "can only be
restored by re-runs of the pull request. It cannot be restored by the base branch or other pull
requests." Only `push`, `workflow_dispatch`, `repository_dispatch`, `delete`, `registry_package`,
`page_build` and `schedule` can write the default-branch cache.

So an Action-based deployment must **build the index on a scheduled or push job on the default
branch** and let pull-request jobs restore it read-only. Combined with a **10 GB cache limit per
repository** and **14 GB of runner disk**, that is the real index size budget for the CI lane.

## Rate limits

| Limit | Value |
| :-- | :-- |
| App installation, base | 5,000 req/hr |
| Scaling | +50/hr per repository above 20 repos; +50/hr per user above 20 users |
| **Ceiling** | **12,500 req/hr** (15,000 for a GHEC organization) |
| Concurrent requests | 100 |
| REST points/minute | 900 |
| GraphQL points/minute | 2,000 |
| Content-creating requests | 80/min, 500/hr |
| `GITHUB_TOKEN` in Actions | 1,000 req/hr **per repository** |

Point costs: REST `GET`/`HEAD`/`OPTIONS` = 1, mutating verbs = 5; GraphQL query = 1, mutation = 5.
GraphQL caps at 500,000 nodes per call with `first`/`last` limited to 100.

**At 300 repositories you are simply at the 12,500/hour ceiling** — both readings of the scaling
formula overshoot it. The per-minute secondary limit is not binding: 900 GET-points/minute is 54,000
per hour, four times the cap. **The hourly ceiling is the only constraint that matters, and the
100-way concurrency is ours to use.**

Installation tokens expire after one hour and can be **down-scoped at mint time** via `repositories`
and `permissions` body parameters — never up-scoped past what the installation was granted. That is
the mechanism for least-privilege per analysis run.

## Permissions

| Need | Permission | Level |
| :-- | :-- | :-- |
| Read file contents organization-wide | Repository → Contents | read |
| List installation repositories | Repository → Metadata (mandatory) | read |
| Read pull requests and changed files | Repository → Pull requests | read |
| Create and update check runs | Repository → Checks | **write** |
| Read organization membership | Organization → Members | read |

Checks is the only write, which makes the consent story clean: reading a repository requires
Contents, and writing a finding onto a pull request requires Checks. They are separately grantable,
which is what INV-2 needs.

## Fetching source for ~300 repositories

**Measured 2026-08-28** on an authenticated user-to-server token:

```
10 × GET /repos/{o}/{r}/tarball  → rate-limit delta: 0
 3 × GET /repos/{o}/{r}          → rate-limit delta: 6
```

The 302 from `api.github.com` returned `x-ratelimit-remaining` **unchanged**, redirecting to
`codeload.github.com`. **Archive downloads do not decrement the core REST rate limit.** This is not
documented — it is a measurement, and **UNVERIFIED for installation tokens**, though there is no
reason to expect a difference. Do not build a design that only works if it stays true.

| Method | Requests for 300 repos | Rate-limit cost | Content? | Notes |
| :-- | :-- | :-- | :-- | :-- |
| **Tarball / zipball** | 300 | **0 (measured)** | everything | private-repo redirect URLs expire in 5 minutes |
| Git Trees `?recursive=1` | 300–600 | 300–600 pts | **paths only** | truncates at **100,000 entries or 7 MB**, sets `truncated: true` |
| `GET /contents/{path}` | 1 per file | catastrophic | yes | ≤1 MB base64; **1,000-file cap per directory** |
| `git clone --filter=blob:none --depth=1` | 0 REST | 0 REST | lazily | Git protocol, outside REST limits; no documented quota (UNVERIFIED) |

**Two-tier recommendation.** Use Trees `?recursive=1` for the path manifest at one request per
repository, decide which files the index actually needs — manifests, IDL, route files — then take
the **tarball** for full content since it costs nothing, or a **blobless clone** where incremental
re-indexing across runs matters, because a tarball carries no history and no cheap delta.

Never use the Contents API for bulk indexing: 2,000 files × 300 repositories is 600,000 requests,
roughly 48 hours at the ceiling.

## The compare endpoint

**The 300-file cap is current**, verbatim from today's documentation:

> The list of changed files is only shown on the first page of results, and it includes up to 300
> changed files for the entire comparison.

> When calling this endpoint without any paging parameter (per_page or page), the returned list is
> limited to 250 commits, and the last commit in the list is the most recent of the entire
> comparison.

- Three-dot merge-base semantics, returned in **chronological** order.
- `status` is `diverged | ahead | behind | identical`, with `ahead_by` / `behind_by`.
- **Pagination does not raise the file cap** — paging returns more commits, and files disappear
  after page one. For more than 300 files on a pull request use `GET /pulls/{n}/files`, which
  returns **up to 3,000 files**, 30 per page by default and 100 maximum.
- `patch` omission is documented only for binary files. **The byte threshold at which `patch` is
  dropped for large text files is UNVERIFIED** — not in the documentation.
- **Force-push behaviour is UNVERIFIED.** Not documented. Expect that comparing against a base SHA
  orphaned by a force-push can 404 once the object is collected. Design for `synchronize` events
  carrying a new `before` SHA, and treat a 404 as "re-index from scratch" rather than an error.

## Check runs

`conclusion` values — **`neutral` confirmed present**: `action_required`, `cancelled`, `failure`,
`neutral`, `success`, `skipped`, `stale`, `timed_out`.

| Field | Limit |
| :-- | :-- |
| `annotations` per request | **50** |
| `annotations[].message` / `.raw_details` | 64 KB |
| `annotations[].title` | 255 chars |
| `actions` | max **3**; label 20 chars, description 40, identifier 20 |
| `output.title` / `.summary` / `.text` | **UNVERIFIED — no limit stated.** The widely-repeated 65,535 figure is not in GitHub's documentation |

Updating via `PATCH` with a `conclusion` **automatically sets `status` to `completed`**. Exceeding 50
annotations needs repeated PATCHes; the total per run is UNVERIFIED. Actions' own annotation
rendering is separately capped at 10 warnings and 10 errors per step.

## Hosted runners

| | Public repos | Private repos |
| :-- | :-- | :-- |
| Linux x64 | 4 CPU, 16 GB, 14 GB SSD | 2 CPU, 8 GB, 14 GB SSD |
| macOS arm64 | 3 CPU, 7 GB, 14 GB SSD | same |

Job execution caps at **6 hours** hosted, 5 days self-hosted. Cache entries unused for more than
**7 days** are evicted; over quota, oldest last-access first. Artifact and log retention defaults to
90 days.

**No published throughput figures exist for organization-scale code indexing**, from GitHub or
independently. This has to be measured.

## Open items

- Check-run `output` size limits — genuinely undocumented; measure before relying on long bodies.
- The `patch` omission threshold for large text diffs.
- Force-push and orphaned-base behaviour on `compare`.
- Tarball zero-rate-limit under an installation token.
- Organization-scale indexing throughput.
