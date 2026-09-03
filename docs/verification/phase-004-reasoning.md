# Optional reasoning verification

## Scope

This record covers the provider-neutral `@yanib/reverb-reasoning` package and its additive domain,
application, schema, storage, testkit, and documentation contracts. No live provider, credential,
network call, deployment, npm publication, production migration, or Yanib change was used.

## Security and correctness evidence

- The dependency-boundary check prevents reasoning core from importing host, storage, filesystem,
  process, network, or vendor SDK modules.
- Retrieval starts with exact changed-definition and deterministic-neighbor handles, rejects
  out-of-scope changes/definitions/references, performs one batch, and enforces artifact, source-byte,
  model-token, provider-call, storage-query, and latency limits.
- Separate reasoning-consent decisions are checked before retrieval and retained only as bounded
  revisions and hashes in run provenance.
- Evidence comments and recognizable secret assignments/tokens are removed or redacted before the
  provider boundary. Prompts, excerpts, raw responses, credentials, and secret values are not stored.
- Closed response validation rejects unknown fields, tool-like output, arbitrary provider prose,
  invalid vocabularies, excessive candidates/tokens, and producer/consumer citation mismatches.
- Optional-port absence, synchronous/async failure, malformed output, refusal, timeout, circuit
  opening, and telemetry failure preserve deterministic findings.
- Reasoning data and its canonical provenance run are persisted atomically. Purge replaces the run
  with a scrubbed tombstone and removes hypotheses and the reasoning budget from the analysis while
  retaining deterministic findings.

## Executed gates

`pnpm run ci` passed:

- 226 unit tests across 39 files;
- 84 integration tests across 17 files, including PostgreSQL;
- 18 conformance tests across 10 files, including SQLite and in-memory storage;
- 46 adversarial tests across 11 files;
- 3 forward-migration tests;
- formatting, lint and dependency boundaries, TypeScript/public type contracts, public entry points,
  host capabilities, the frozen `0.4.0` baseline, generated schemas, adapter admission records,
  documentation links, and license policy.

`pnpm pack:verify` packed and checksummed 19 public packages, installed them into a clean consumer,
and compiled the frozen `0.4` host fixture from tarballs. `pnpm sbom` generated a CycloneDX inventory
with 45 components.

## Operational boundary

The CLI and reference hosts keep model capability disabled. A host must supply provider transport,
credentials, fresh repository consent, regional/retention controls, provider-side deletion, cache or
embedding deletion, and backup expiry. The public
[reasoning provider guide](../extensions/reasoning-provider.md) is normative for that integration.
