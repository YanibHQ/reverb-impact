# @yanib/reverb-adapter-http

Deterministic, network-free implicit HTTP route and client-call impact analysis for Reverb.

The adapter recognizes bounded literal route registrations and HTTP client calls, normalizes route
templates, and resolves service identities only from immutable host context. Dynamic hosts,
arbitrary URL construction, runtime route registration, proxy rewrites, and missing aliases remain
explicit coverage limitations. OpenAPI evidence remains a separate, higher-specificity adapter.

The package is available beginning with Reverb 0.5.0. Import only its documented root entry point
and keep its exact version aligned with the Reverb package set.

## License

Apache-2.0
