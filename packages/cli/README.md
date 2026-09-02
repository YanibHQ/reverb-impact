# reverb-impact

Local CLI and embeddable CLI construction for evidence-backed cross-repository impact analysis.

## Usage

```bash
pnpm dlx reverb-impact@0.4.0 --help
```

For persistent installation:

```bash
pnpm add --global reverb-impact@0.4.0
reverb --help
```

See the [project README](https://github.com/YanibHQ/reverb-impact#readme) for workspace setup,
analysis commands, safety guarantees, and package documentation.

## Terminal output

Human-readable help and status output uses color when the terminal supports it. Set `NO_COLOR=1`
to disable ANSI styling. Commands with `--json` continue to emit undecorated, stable machine output.

Reverb 0.x is a pre-1.0 release line. Pin an exact version and review release metadata before
upgrading.

## License

Apache-2.0
