# Reverb Security, Privacy, and Consent

**Status:** Normative threat model for implementation  
**Assumption:** repository source, diffs, manifests, indexes, comments, and adapter inputs are untrusted

## 1. Security objectives

Reverb must prevent:

1. cross-workspace or cross-repository data disclosure;
2. provider-token abuse;
3. parser/differ escape or arbitrary repository code execution;
4. a missing/failed input being presented as safety;
5. unauthorized external writes;
6. feedback or suppression poisoning;
7. source/secret leakage through logs, telemetry, embeddings, models, exports, or research artifacts;
8. stale authorization, repository membership, or graph evidence remaining silently active.

The architecture graph itself is sensitive. A private repository name, service relationship, route identity, file path, and even “one restricted consumer exists” may reveal security or business information.

## 2. Trust boundaries

```text
GitHub / local Git
  untrusted source + trusted provider identity
          |
          v
webhook receiver / source fetcher
  holds short-lived provider authority
          |
          v
durable job + artifact metadata store
  tenant/workspace isolated
          |
          v
sandboxed indexer/differ
  untrusted bytes, no provider token, no network
          |
          v
canonical findings
  full authorized internal facts
          |
          v
disclosure projector
  static audience or authenticated viewer
          |
          v
GitHub Check / API / Yanib
```

The source-fetch worker and parser worker are separate trust domains. The source-fetch worker receives just-in-time installation credentials and writes bounded blobs/artifact handles. The parser worker never receives provider credentials.

## 3. Permission model

### 3.1 Actions

| Action | Meaning | Default |
| --- | --- | --- |
| `source.read` | fetch repository contents/diffs | deny until provider grant + workspace selection |
| `derived.retain` | retain parsed/indexed artifacts | deny until workspace consent |
| `evidence.consume` | use repository artifacts as downstream evidence | deny until collection/workspace consent |
| `identity.disclose` | name repository/service elsewhere | deny |
| `contract.disclose` | reveal contract identity/edge elsewhere | deny |
| `location.disclose` | reveal path/range/snippet elsewhere | deny |
| `producer_check.write` | publish/update a check in source repo | deny until repo-level enablement and promotion |
| `consumer.write` | issue/comment/PR/notification in consumer repo | out of scope and deny |
| `evaluation.use` | include findings in human-labelled product evaluation | separate opt-in/operational basis |
| `research.use` | include data in a research study/export | separate explicit approval |

Permission records are versioned and included in the registry revision selected by analysis. Current authorization is rechecked before read and disclosure; a historical revision does not authorize a new action after revocation.

### 3.2 Collections and org-wide scope

The default workspace is an explicit repository collection. GitHub organization-wide analysis is a separate opt-in. Automatic GitHub Team synchronization is optional because it requires organization member/team permissions some operators will decline. Manual collection membership remains first-class.

### 3.3 Static versus personalized audiences

A GitHub Check is static for everyone who can read the producer repository. Reverb cannot reveal consumer details based on the current viewer.

For a static surface, disclosure succeeds only when policy can prove the fact is approved for the entire producer-repository audience. Practical v1 rules:

- public producer + private consumer: never name or count the private consumer by default;
- two private repositories: do not assume same-organization means same ACL;
- explicit repository-owner disclosure grant can approve repository/contract/location levels, but the host still confirms provider visibility policy;
- when whole-audience safety cannot be proven, omit the detail from the check and place it behind authenticated per-viewer authorization;
- aggregate redactions such as “restricted consumers exist” are configurable because even the count can leak information; safest default is omission plus a generic “some evidence may be unavailable due to permissions” limitation.

### 3.4 Disclosure algorithm

```text
input: canonical finding, destination repo/surface, current provider ACL facts,
       registry consent revision, optional authenticated viewer

1. Authorize destination write/read.
2. Determine destination audience type: static or personalized.
3. For each field class (repo, contract, location, snippet):
   a. resolve explicit disclosure grant;
   b. resolve current provider visibility/access constraints;
   c. apply destination-audience rule;
   d. reveal, redact, aggregate, or omit.
4. Validate output against forbidden canaries and field-level policy.
5. Hash and persist projection + decision reasons.
6. Re-evaluate for every render/write; do not reuse a stale authorized projection after ACL change.
```

The canonical result and each projection are separate records. A later stricter projection does not mutate history; cached views are revoked by authorization revision.

## 4. GitHub App security

### 4.1 Initial permissions

Request the minimum needed:

- metadata: read;
- contents: read;
- pull requests: read;
- checks: write only for producer repositories with delivery enabled;
- members/teams: optional for automatic collection sync.

Do not request issues, code writes, administration, actions secrets, workflow write, deployments, or organization administration in v1.

### 4.2 Token handling

- GitHub App private key resides only in the credential service/secret manager;
- installation access tokens are minted just in time, scoped to selected repositories and permissions, expire naturally, and are never persisted;
- tokens never enter parser jobs, job payloads, logs, telemetry, checkpoints, exception messages, or model calls;
- read/source fetching and checks writing use separately scoped code paths and preferably separately minted tokens;
- token material is redacted by value and by property-name allowlist.

### 4.3 Webhook validation

- validate `X-Hub-Signature-256` over the exact raw request body using constant-time comparison;
- reject missing/invalid signatures before parsing business fields;
- deduplicate `X-GitHub-Delivery` under an installation/workspace key;
- persist a bounded inbox pointer and acknowledge quickly;
- handle replay attempts idempotently;
- run reconciliation because GitHub does not automatically guarantee recovery of every failed delivery;
- retain raw payloads only for a short configured forensic period, encrypted and access-controlled.

### 4.4 Fork pull requests

Fork source is attacker-controlled. Reverb:

- does not execute build, install, test, generator, or repository scripts;
- does not pass base-repository installation credentials into the fork content sandbox;
- limits archive/tree/blob sizes and entry counts;
- validates symlinks and paths before materialization;
- disables external-reference network fetching in schemas/diff tools;
- writes only to the base repository check when policy permits;
- treats prompt text, comments, identifiers, and source as untrusted data if optional model explanation is enabled.

## 5. Parser and adapter sandbox

### 5.1 Baseline rules

- read-only materialized source or content-addressed blobs;
- private scratch directory destroyed after job;
- no network namespace/access;
- no provider, database, object-store, queue, or model credentials;
- non-root identity, minimal filesystem, seccomp/container/OS sandbox appropriate to deployment;
- CPU, wall-time, memory, output, recursion, file-size, file-count, and decompression limits;
- child-process deny by default; declared external differs only through `SandboxRunner`;
- pinned tool binary/image digest and dependency lock;
- structured bounded output parsed against schema;
- no shell string interpolation; argv arrays only;
- validate that every path resolves within the staged root and reject escaping symlinks/hardlinks.

### 5.2 External differ rules

`buf`, `oasdiff`, and future differs are classifiers, not trusted orchestration code. Each declaration specifies:

- exact version/digest and license;
- accepted input file types;
- network disabled, including external `$ref`/module resolution;
- read-only inputs and bounded output;
- timeout/resources;
- exit-code mapping that distinguishes compatible, breaking, unknown, and tool failure;
- fixture tests for malformed/adversarial input;
- version recorded on every `ContractChange`.

### 5.3 Third-party adapters

The first release supports in-tree adapters. A future external adapter system requires capability manifests, signature/provenance verification, sandbox enforcement, resource quotas, output schema validation, and no ambient application ports. Installing an npm package is not sufficient authorization to run it against private source.

## 6. Multi-tenancy and storage isolation

### 6.1 Hosted reference

Every database row, unique key, cache key, object key, job, vector, and audit event carries tenant/workspace scope. PostgreSQL Row-Level Security with `FORCE ROW LEVEL SECURITY` or an equivalent independently tested boundary is required before multi-tenant hosted claims.

Defense in depth:

- application queries require workspace-scoped value types;
- foreign keys include tenant/workspace components where appropriate;
- service role cannot bypass RLS except isolated migration/purge roles;
- background jobs set tenant context explicitly and reset it after claim;
- integration tests seed cross-tenant canaries and attempt reads, joins, exports, vectors, and deletes;
- database backups and object prefixes follow the same tenant retention/access policy.

### 6.2 Local host

Local mode is single-workspace by default. Its threat boundary is the filesystem user. SQLite and `.reverb/objects` permissions are owner-only where supported. Local mode still enforces repository disclosure in exported/static projections because outputs may be shared.

## 7. Source and derived-data retention

### 7.1 Default classes

| Data | Default posture |
| --- | --- |
| provider token | memory only; never retained |
| raw source blob fetched for parsing | deleted after derived artifact commit unless local cache explicitly enabled |
| uploaded SCIP artifact | encrypted object retention while its generation is retained |
| AST/shape/reference metadata | retained by workspace policy |
| bounded evidence snippet | avoid by default; retain hashes/ranges; generate authorized snippet on demand |
| webhook raw payload | short encrypted forensic retention |
| canonical finding/review/audit | retained by workspace audit policy |
| telemetry | identifier-free aggregate retention |
| embedding | disabled by default; if enabled, treated like source-derived sensitive data |

Embeddings are not treated as non-reversible. Research has demonstrated substantial inversion for some embedding models. They require encryption, tenant isolation, access control, provider-export consent, and deletion propagation.

### 7.2 Uninstall and authorization loss

1. mark authorization revision revoked;
2. stop new fetches and external writes;
3. invalidate cached disclosure projections;
4. remove repository from current workspace projection;
5. enqueue purge according to retention/legal policy;
6. delete source caches, artifacts, edges, findings where required, embeddings, object blobs, and derived search indexes;
7. record aggregate purge completion without sensitive identifiers in general telemetry;
8. surface purge state to authorized administrators.

Backups follow a documented expiry/cryptographic-deletion policy; “deleted” does not claim immediate removal from immutable backups unless true.

## 8. Telemetry and logging

### 8.1 Allowed dimensions

- event type/schema version;
- adapter ID/version and contract kind;
- counts, durations, sizes, cache rates;
- bounded failure/abstention reason enums;
- evidence family/stratum opaque hash where it cannot identify a customer;
- policy outcome and coverage counts;
- hosted region/deployment version.

### 8.2 Forbidden data

- tenant/workspace/repository/service names or provider IDs;
- paths, symbols, contract keys, routes, hosts, package names;
- source, snippets, diffs, comments, prompts containing source;
- tokens, secrets, environment values;
- user names/emails/provider IDs in general telemetry;
- embeddings or nearest-neighbor content;
- free-form exceptions originating from parser/source input.

Telemetry payloads use closed typed schemas and a property-name allowlist. Tests inject canary repository names, paths, routes, secrets, and prompt-injection strings and assert absence in logs, metrics, traces, exceptions, checkpoints, and analytics.

## 9. Optional AI and retrieval security

Core analysis requires no AI. If a host enables model explanation/adjudication:

- it is a separately consented data-export mode;
- minimize input to already selected bounded structural evidence;
- code/comments are quoted as data and never treated as instructions;
- model has no tools, provider token, network/browser, database write, delivery, review, suppression, or label capability;
- output is strict schema and can only explain, recommend downgrade, or abstain;
- failure/uncertainty leaves the structural result unchanged;
- record provider, model/version, prompt version, parameters, input hash, output hash, time, and data-handling mode;
- external zero-retention/DPA claims are operator policy inputs, not hardcoded assurances;
- self-hosted/local model option may be provided later;
- model output never enters ground-truth labels.

Prompt injection is therefore bounded to corrupting an optional explanation/downgrade proposal, not the edge, promotion, authorization, or check writer.

## 10. Feedback and suppression security

Threat: a PR author dismisses real findings or creates an organization-wide suppression.

Controls:

- authorization depends on scope: occurrence review may allow maintainers; repository-pair/adapter/workspace suppression needs owners/admins;
- finding evidence and adapter version are immutable references in every review;
- reviews append and supersede; no destructive update;
- workflow resolution does not become a correctness label automatically;
- broad suppressions require owner, justification, review date, and audit;
- invalidation fires on relevant source, contract identity, adapter, evidence, policy, or registry change;
- time review/expiry catches remaining staleness;
- review data cannot update calibration until it passes corpus inclusion and label-quality rules;
- anomaly monitoring flags sudden broad suppression or reviewer concentration without storing sensitive free text in telemetry.

## 11. Threat register

| Threat | Example failure | Required mitigation | Verification |
| --- | --- | --- | --- |
| cross-workspace join | same contract key links tenants | scoped keys, RLS, composite FKs | seeded isolation tests |
| static ACL leak | check names private consumer | disclosure projection for whole audience | public/private matrix tests |
| stale ACL cache | revoked user opens old detail | authorize at render time; cache revision | revocation integration test |
| confused deputy | consumer read grant used to write | separate action grants and token scopes | import/permission tests |
| token theft | parser reads installation token | fetch/parser separation, memory-only token | sandbox environment test |
| malicious syntax | parser RCE/OOM | isolation and quotas | fuzz/adversarial corpus |
| archive traversal | `../../` or symlink escape | normalized root validation | malicious archive fixtures |
| decompression bomb | huge staged input | compressed/uncompressed limits | resource tests |
| dependency confusion | package collision joins wrong repo | host/registry-qualified identity | collision fixtures |
| service alias ambiguity | `${API_URL}` resolves wrong service | explicit alias/provenance; abstain | multi-provider fixtures |
| incomplete-diff evasion | parser failure looks safe | coverage delta, neutral incomplete | failure-injection test |
| stale graph | removed consumer remains active | generation projection/tombstone/freshness | temporal tests |
| force-push race | old head overwrites check | supersession before write | concurrency test |
| feedback poisoning | author suppresses globally | scope authorization and immutable audit | authorization tests |
| model prompt injection | source asks model to leak/write | no tools/writes; data delimiters; schema | adversarial prompt suite |
| model/vendor export | source sent without consent | optional explicit mode and minimization | policy tests/audit |
| embedding inversion | vector leaks source | source-level controls and deletion | cross-tenant/delete tests |
| telemetry leak | route/path in exception | allowlist and sanitized codes | canary leak suite |
| export leak | SARIF/JSON includes restricted path | export disclosure projection | golden redaction fixtures |
| denial of service | huge PR never completes check | quotas, cancellation, hard neutral deadline | load/fault tests |
| supply-chain license | AGPL/SSPL enters image | lock, SBOM, license policy | CI dependency scan |

## 12. Privacy and research

Product evaluation and academic research are separate purposes. Research use requires:

- approved protocol/IRB or documented determination where human behaviour/feedback is collected;
- participant/operator notice and lawful basis;
- opt-out/withdrawal and retention/deletion procedure;
- prohibition on individual developer performance evaluation;
- no publication of private repo names, source, snippets, raw graph, or reversible pseudonyms;
- public benchmark manifests using upstream SHAs/fetch scripts instead of redistributing incompatible source;
- secret and personal-data scanning before artifact release;
- statement of non-shareable private data and a public executable replica;
- venue-required AI-use and data-availability disclosures.

## 13. Security release gates

Before local alpha:

- parser path/symlink/resource controls pass adversarial fixtures;
- canonical output distinguishes failure from no candidate;
- dependency licenses and SBOM generated.

Before hosted private alpha:

- webhook validation/dedupe/reconciliation tested;
- token isolation and least-permission review completed;
- storage tenant isolation and deletion propagation tested;
- no model/vector dependency required.

Before any external PR check:

- full public/private/restricted disclosure matrix passes;
- zero known disclosure defects;
- check is advisory and completes under timeout;
- preview corpus and promotion gate passed for the emitted stratum;
- red-team review covers provider tokens, fork PRs, parser sandbox, static-output leaks, feedback poisoning, and telemetry canaries.

Before public hosted GA:

- independent security assessment or equivalent review;
- incident response and vulnerability disclosure process;
- documented backup/deletion semantics;
- dependency/SBOM/signing/provenance automation;
- tested emergency disable for reads, parsers, models, and external writes independently.
