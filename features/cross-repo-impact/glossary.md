# Reverb Glossary

| Term | Definition |
| --- | --- |
| Adapter | A versioned implementation that extracts and diffs one or more contract kinds. Not a Git/storage host adapter. |
| Activation | When a compatible/incompatible producer change can affect a consumer: immediately, on deploy, publish, upgrade, regenerate, or unknown. |
| Analysis coverage | What eligible repositories, files, languages, contracts, and edges were actually analysed. |
| Analysis run | Immutable execution against exact producer base/head and selected consumer generations under registry and policy revisions. |
| Artifact | A parsed or declared fact tied to a file content hash and repository generation. |
| Candidate | A structural impact claim before delivery policy and disclosure projection. |
| Canonical contract key | Versioned identity used by both producer definitions and consumer references. |
| Compatibility | `breaking`, `potentially_breaking`, `compatible`, or `unknown` producer-change semantics. |
| Consumer generation | Exact indexed commit of a downstream repository selected for an analysis. |
| Consumer reference | Stable artifact showing code/config that uses or expects a contract. |
| Contract | A boundary independently deployed/versioned code can rely on: exported symbol, operation, method, field, topic, schema, config key, etc. |
| Contract change | Versioned comparison of a definition in base versus head, including compatibility and activation. |
| Definition | Producer-side declaration of a contract. |
| Delivery policy | Versioned rule deciding which evidence strata reach which external surfaces. |
| Disclosure projection | Audience-safe view of a canonical finding for a specific static or personalized surface. |
| Edge claim | Claim that a particular consumer reference uses a producer definition. |
| Evidence path | Required sequence of structural/registry facts connecting a change to a consumer. |
| Evidence stratum | Calibration cohort keyed by contract, language/capability, extractors, identity, join strategy, and required evidence composition. |
| Finding fingerprint | Stable consumer-specific identity of a producer change/consumer reference/policy major, excluding PR and line location. |
| Finding occurrence | One fingerprint observed in one analysis run. |
| Generation | Immutable logical index of one repository at one commit/config/indexer bundle. |
| Impact claim | Claim that a producer change affects the specific consumer use. |
| Label coverage | Fraction of sampled evaluation cases with usable independent human labels. |
| No candidate | Covered inputs produced no structural join. It is not a claim about repositories outside coverage. |
| Not analysed | Required input was unavailable, unauthorized, stale beyond policy, unsupported, or failed. |
| Overlay | Immutable head-state delta over an exact base generation for a pull request. |
| Policy revision | Versioned promotion, suppression, alert-budget, freshness, timeout, and rendering rules. |
| Primary evidence | Evidence path whose calibrated stratum controls delivery. Optional context does not alter it. |
| Registry revision | Immutable workspace membership, service identity, alias, consent, and disclosure configuration snapshot. |
| Remedy | Concrete action attached to a deliverable finding. |
| Review event | Append-only human judgement of edge, impact, and actionability plus optional workflow/suppression data. |
| Selection coverage | Fraction of structurally eligible candidates delivered after abstention and policy. |
| Service registry | Versioned mapping from repositories/deploy units to base URLs, prefixes, package/schema/broker/database identities and owners. |
| Stable consumer reference | Location-insensitive semantic identity of a call/import/operation used in the finding fingerprint. |
| Suppression | Audited, scoped, invalidatable rule affecting future delivery without deleting candidates or labels. |
| Workspace | Explicit versioned set of repositories and service identities analysed together. |
