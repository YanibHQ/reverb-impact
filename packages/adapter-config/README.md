# @yanib/reverb-adapter-config

Deterministic configuration, feature-flag, and value-free secret-reference impact analysis for Reverb.

The adapter recognizes value-free environment templates, explicit declarations, and bounded literal
reads. Secret identifiers are converted to provider-qualified salted HMACs before persistence;
secret values and value-bearing environment files are excluded. Computed keys and unsupported
provider resolution remain explicit coverage limitations.

Available beginning with Reverb 0.5.0. Keep its exact version aligned with the Reverb package set.

## License

Apache-2.0
