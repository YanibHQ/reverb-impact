<p align="center">
  <img src="docs/assets/reverb-logo.png" alt="Reverb logo: an R-shaped evidence graph emitting traceable impact signals" width="180" />
</p>

<h1 align="center">Reverb</h1>

<p align="center">
  Evidence-backed impact analysis for contract changes across repositories.
</p>

<p align="center">
  <a href="https://github.com/YanibHQ/reverb-impact/actions/workflows/ci.yml"><img src="https://github.com/YanibHQ/reverb-impact/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/YanibHQ/reverb-impact" alt="Apache-2.0 license" /></a>
</p>

Reverb helps engineering teams understand which consumers may be affected by a pull request. It
indexes an explicitly configured set of repositories, compares exact base and head commits, and
connects changed producer contracts to concrete downstream references.

Every finding includes inspectable producer and consumer evidence. Coverage, freshness, and
incomplete inputs are reported separately so uncertainty is visible instead of being presented as
a clean result.

## Why Reverb?

- **Cross-repository analysis:** trace contract changes beyond the repository where they originate.
- **Exact pull-request semantics:** analyze immutable base and head commits rather than comparing
  unrelated local scans.
- **Evidence-first findings:** preserve the definitions, references, paths, and commit identities
  behind each reported impact.
- **Selective reliability:** abstain when source, authorization, or parser coverage is incomplete.
- **Host-neutral design:** embed the domain and application packages in a local tool or an
  independently operated service.
- **Deterministic output:** use canonical identities and versioned schemas for repeatable analysis
  and machine consumption.

## Supported contracts

| Adapter | Detects |
| --- | --- |
| TypeScript/npm | Exported package symbols and downstream imports |
| OpenAPI/HTTP | Operations, paths, methods, and service references |
| Protobuf/gRPC | Services, methods, messages, fields, and generated-code references |

Additional contract types can be implemented through the public adapter SDK and its validation,
compatibility, sandboxing, and admission interfaces.

## Development status

Reverb is under active development and is available for evaluation from source. Public APIs and
storage formats may change before the first stable release, so downstream users should pin an
exact commit. Analysis output is advisory: evidence classes must be calibrated with representative,
human-reviewed data before they are used for automated delivery or policy decisions.

The project is independently versioned and operated. It does not depend on Yanib source code or
data; product integrations use Reverb's public package and host boundaries.

## Requirements

- Node.js 24 or 25
- pnpm 10.27.x
- Git
- SQLite for the local host, or PostgreSQL 18 for a hosted integration

## Build from source

```bash
git clone https://github.com/YanibHQ/reverb-impact.git
cd reverb-impact
corepack enable
pnpm install --frozen-lockfile
pnpm build

export REVERB_CLI="$PWD/packages/cli/dist/bin.js"
node "$REVERB_CLI" --help
```

Run `pnpm run ci` to execute the same formatting, lint, type, API, compatibility, test, schema,
documentation, and license checks used by the repository's continuous-integration workflow.

## Quick start

Create a workspace, then register existing local Git checkouts with stable aliases:

```bash
node "$REVERB_CLI" init /path/to/reverb-workspace
cd /path/to/reverb-workspace

node "$REVERB_CLI" workspace add /path/to/producer-repo --alias producer
node "$REVERB_CLI" workspace add /path/to/consumer-repo --alias consumer
node "$REVERB_CLI" registry validate
node "$REVERB_CLI" doctor
```

Index the registered repositories and analyze an exact producer change:

```bash
node "$REVERB_CLI" index --ref HEAD
node "$REVERB_CLI" analyze \
  --repo producer \
  --base main \
  --head HEAD \
  --json
```

Use exact commit SHAs in automated workflows. Service and alias registration is available for
workspaces that need to resolve HTTP or deployment identities:

```bash
node "$REVERB_CLI" registry service-add \
  --id billing-api \
  --repo producer \
  --root . \
  --environment production \
  --owner payments
```

Run `node "$REVERB_CLI" <command> --help` for command-specific options. The CLI also provides
finding inspection, append-only reviews, suppressions, corpus evaluation, frozen-policy simulation,
promotion decisions, status, and diagnostics.

## Packages

| Package | Purpose |
| --- | --- |
| `reverb-impact` | Local `reverb` CLI and embeddable CLI construction |
| `@yanibhq/reverb-domain` | Immutable values and deterministic analysis policy |
| `@yanibhq/reverb-schema` | Canonical JSON Schemas and runtime validation |
| `@yanibhq/reverb-application` | Host-neutral use cases and ports |
| `@yanibhq/reverb-adapter-sdk` | Contract-adapter interfaces, validation, and admission helpers |
| `@yanibhq/reverb-adapter-typescript` | TypeScript and npm contract analysis |
| `@yanibhq/reverb-adapter-openapi` | OpenAPI and HTTP contract analysis |
| `@yanibhq/reverb-adapter-protobuf` | Protobuf and gRPC contract analysis |
| `@yanibhq/reverb-storage-sqlite` | Local durable storage |
| `@yanibhq/reverb-storage-postgres` | Hosted PostgreSQL storage |
| `@yanibhq/reverb-host-local` | Local Git and filesystem host primitives |
| `@yanibhq/reverb-host-github` | GitHub reference-host primitives |
| `@yanibhq/reverb-testkit` | Host conformance tests, fakes, and fixtures |

Package consumers should import documented root entry points only. See the
[public package API](docs/api/public-packages.md) and
[compatibility policy](docs/compatibility/versioning.md) before embedding Reverb in another host.

## Safety model

Reverb treats repository contents, diffs, schemas, indexes, and provider payloads as untrusted.

- Repository membership is explicit and revisioned.
- Source files are parsed; repository code is not executed.
- External tools run behind a network-denied, resource-bounded boundary.
- Missing or partial input produces an incomplete or unknown result, never an inferred clean pass.
- Indexing, disclosure, and external writes are separate permissions.
- The GitHub reference writer is disabled unless an operator explicitly enables an eligible,
  calibrated evidence class.

Review the [security and privacy model](features/cross-repo-impact/security.md) before processing
private repositories or operating a hosted deployment.

## Documentation

| Guide | Description |
| --- | --- |
| [Concepts and requirements](features/cross-repo-impact/spec.md) | Product invariants, behavior, and success criteria |
| [Architecture](features/cross-repo-impact/architecture.md) | Components, data flow, storage, indexing, and analysis |
| [API contracts](features/cross-repo-impact/api.md) | Library, CLI, JSON, webhook, and host interfaces |
| [Public packages](docs/api/public-packages.md) | Supported entry points and host responsibilities |
| [Self-hosting](docs/operations/self-host.md) | Local and hosted operating guidance |
| [Compatibility](docs/compatibility/versioning.md) | Package, schema, storage, and adapter versioning |
| [Adapter development](docs/extensions/adapter-contribution.md) | Adding and validating contract adapters |
| [Security](features/cross-repo-impact/security.md) | Threat model, consent, isolation, retention, and disclosure |

Detailed design decisions, evaluation records, and reproducibility evidence remain available in
the repository for maintainers and reviewers without being part of the end-user setup path.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), follow the
[Code of Conduct](CODE_OF_CONDUCT.md), and sign commits according to the
[Developer Certificate of Origin](DCO.md). Please report security issues through the process in
[SECURITY.md](SECURITY.md), not through a public issue.

## License

Reverb is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution
information.
