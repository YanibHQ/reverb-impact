# @yanib/reverb-adapter-infrastructure

Deterministic, network-free static infrastructure and deployment impact analysis for Reverb.

The adapter recognizes Kubernetes services, ingress wiring, workloads and containers; Helm
templates using only declared scalar values; and bounded Terraform Kubernetes services, outputs,
and remote-state references. It never executes templates, Terraform, repository code, provider
plugins, or network/live-cluster operations. State, plans, variable values, Secrets, unknown
templates, and dynamic controller behavior remain explicit coverage limitations.

Available beginning with Reverb 0.5.0. Keep its exact version aligned with the Reverb package set.

## License

Apache-2.0
