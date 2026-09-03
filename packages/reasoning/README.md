# @yanib/reverb-reasoning

Provider-neutral, optional reasoning over exact Reverb evidence handles.

The package batches only host-authorized evidence from the resolved analysis scope, minimizes and
redacts excerpts, applies independent item/byte/token/time budgets, validates closed structured
responses, and requires exact producer and consumer citations. It emits only separately labelled
`ai_inferred` hypotheses for investigation and never changes deterministic findings.

No provider SDK, credential, transport, retry policy, or vendor selection is included. Hosts own
those concerns and must supply explicit reasoning consent and retention policy. Reasoning is disabled
unless a host deliberately composes this package.

The durable reasoning run contains versioned provider and policy provenance, consent decision
hashes, execution usage, closed limitation codes, and exact citation metadata. Source excerpts,
prompts, raw responses, credentials, and secret values are not retained. Purging through the
reasoning-run store also removes derived hypotheses and the reasoning budget from the associated
analysis result while leaving deterministic findings unchanged.

Provider adapters must treat evidence excerpts as untrusted data, honor `AbortSignal`, make no tool
calls on behalf of a response, enforce the declared regional and retention policy, and return the
closed structured response. See the repository's
[reasoning provider guide](../../docs/extensions/reasoning-provider.md) for the complete host
contract.

Available beginning with Reverb 0.5.0. Keep its exact version aligned with the Reverb package set.

## License

Apache-2.0
