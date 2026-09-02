# @yanib/reverb-schema

Canonical Reverb JSON Schemas and runtime validation.

Schema-major 2 additions use separate exported schema values and checked-in files. This includes
the v2 analysis scope, coverage, budget, result, and deterministic adapter manifest, extraction,
and diff envelopes; schema-major 1 remains unchanged.

## Installation

```bash
pnpm add --save-exact @yanib/reverb-schema@0.4.0
```

Import only the documented package root. See the
[public package API](https://github.com/YanibHQ/reverb-impact/blob/main/docs/api/public-packages.md)
and [compatibility policy](https://github.com/YanibHQ/reverb-impact/blob/main/docs/compatibility/versioning.md)
before embedding Reverb in a host.

Reverb 0.x is a pre-1.0 release line. Pin an exact version and review release metadata before
upgrading.

## License

Apache-2.0
