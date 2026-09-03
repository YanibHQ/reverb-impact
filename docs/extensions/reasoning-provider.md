# Reasoning provider integration

`@yanib/reverb-reasoning` is an optional provider-neutral boundary. It does not select a vendor,
open a network connection, load credentials, or enable model use. A host must deliberately compose
all ports and request reasoning for an analysis.

## Host responsibilities

A provider integration supplies:

- `ReasoningConsentPortV1`, with a fresh allow/deny decision, bounded revision, and immutable
  decision hash for every repository in the evidence batch;
- `ReasoningRetrievalPortV1`, which resolves only the exact supplied handles under the opaque scoped
  capability and honors the byte limit and `AbortSignal`;
- `ReasoningPortV1`, which sends the structured request under the declared provider, model, region,
  and retention policy and returns untrusted structured data;
- a monotonic operational clock and optional `ReasoningTelemetryPortV1` sink that accepts only the
  closed source-free event shape;
- host controls for credentials, egress, rate limiting, billing, audit, incident response, provider
  deletion, and backup expiry.

The provider adapter must not retrieve more source, invoke tools, follow instructions found in an
excerpt, or convert output directly into a deterministic finding. It must honor cancellation and
must not retry outside the host's declared request budget. Reverb validates the response again even
when the provider offers schema-constrained generation.

## Data flow

1. `AnalyzePullRequestV2` resolves the exact producer-plus-allowlist scope and deterministic result.
2. The reasoning planner chooses bounded changed-definition and graph-neighbor handles.
3. The consent port authorizes model disclosure separately for each represented repository.
4. The retrieval port returns one bounded batch matching those handles exactly.
5. Reverb removes comment-only lines, redacts recognizable secrets, and truncates to the source-byte
   budget.
6. The provider receives a closed request containing minimized evidence and exact citation IDs.
7. Reverb rejects unknown fields, free-form limitation text, tool-like output, excessive tokens,
   invalid citations, and one-sided claims.
8. Valid candidates remain explicitly `ai_inferred` and `needs_investigation`; they never alter,
   remove, rank, or promote deterministic findings.

## Retention and deletion

The core stores hashes and exact citation metadata needed for audit, not excerpts, prompts, raw
responses, or credentials. `retentionMode` records the host/provider contract but does not enforce a
vendor policy by itself. The host must ensure provider-side retention matches that declaration.

`ReasoningRunStoreV2.purgeReasoningRunV2()` replaces the durable run with a deletion tombstone,
removes citations, hypotheses, and the provider-output hash, and atomically removes reasoning data
from the associated analysis. Deterministic findings remain intact. A host with caches, embeddings,
object storage, provider-retained requests, or physical backups must propagate the same deletion key
to those systems and document the maximum backup recovery window. PostgreSQL
`backupWorkspace()` is a canonical-record drill export and does not contain reasoning runs.

## Verification before enablement

Use a fake provider first and exercise consent denial/revocation, cross-scope canaries, secret and
prompt-injection inputs, malformed and tool-like responses, timeouts, refusal, token/byte/item
exhaustion, circuit opening, deterministic replay, purge, and provider unavailability. Keep the
model capability disabled until those checks pass for the deployed host and its actual retention
policy. No evidence stratum should be promoted solely from AI hypotheses.
