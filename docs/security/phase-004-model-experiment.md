# Optional model-provider status

**Decision:** No live model provider or experiment is enabled.

Reverb exposes a provider-neutral reasoning protocol, bounded retrieval planner, citation verifier,
and fake-provider conformance suite. Those components establish a safe extension boundary; they do
not authorize source export, choose a vendor, configure credentials, or enable a model in the CLI or
reference hosts. The standalone repository has no authorized human-labelled real-world corpus on
which to demonstrate selective-risk improvement.

Any live experiment requires separate approval and all of the following:

- explicit host model capability, repository-level reasoning consent, exact selected scope, and an
  approved provider region/retention contract;
- the public bounded request/response protocols, with no tools, writes, autonomous retrieval,
  deterministic-finding mutation, disclosure decision, or severity promotion;
- exact producer and consumer citations for every retained `ai_inferred` hypothesis;
- pinned provider/model/settings, repeated-run variability, latency, cost, shift, and retention
  reporting;
- a frozen comparison against the same structural baseline and a report of selection-coverage and
  recall cost;
- cross-scope, secret, prompt-injection, deletion, backup-expiry, and provider-retention review.

See the [reasoning provider contract](../extensions/reasoning-provider.md). Failure to improve
selective risk materially means keeping the provider disabled, not quietly retaining it.
