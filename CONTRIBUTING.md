# Contributing to Reverb

Reverb is a clean-room, evidence-first project. Start with the [architecture](features/cross-repo-impact/architecture.md)
and the active phase documents before proposing code.

## Development

Use Node 24 and pnpm 10.27 or newer within the same major.

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

Changes to canonical identity, evidence, coverage, authorization, disclosure, schemas, or adapters
need an ADR and tests tied to the relevant invariant. A fixture proves mechanics; it must not be
described as production precision.

## Clean-room requirement

Repowise is prior art and a benchmark, not a source dependency. Do not copy, translate, adapt, or
link Repowise implementation code into Reverb. Record provenance for nontrivial algorithms, tools,
grammars, and fixtures. Do not contribute code you are not permitted to license under Apache-2.0.

## Developer Certificate of Origin

Reverb uses the Developer Certificate of Origin 1.1 rather than a CLA. Sign every commit with
`git commit -s` to add the `Signed-off-by` line described in [DCO.md](DCO.md).

## Pull requests

- keep domain code deterministic and free of host imports;
- add coverage and bounded diagnostics for incomplete input;
- include tests for failure and partial states;
- run `pnpm run ci` and the relevant integration or benchmark command;
- update the phase task and verification evidence only when the command exists and passes.
