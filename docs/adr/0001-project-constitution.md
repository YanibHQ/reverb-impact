# ADR-0001: Standalone clean-room Reverb project

- Status: Accepted
- Date: 2026-08-28
- Owners: YanibHQ
- Decision scope: product identity, repository, license, contribution policy, prior-art boundary

## Context

Reverb is intended to be an evidence-first pull-request impact engine that can be embedded by Yanib
or another host. Repowise already covers broad code intelligence, local cross-repository workspaces,
contract linking, blast radius, and breaking-change workflows. Its AGPL/commercial distribution
boundary does not fit a permissive, independently embeddable Reverb core.

The product name is memorable but not unique. Initial checks on 2026-08-28 found:

- the authenticated project owner is an active YanibHQ administrator; the public
  `YanibHQ/reverb-impact` repository was created on 2026-08-29;
- npm user `yanib` is authenticated; `reverb-impact` and the planned sampled
  `@yanib/reverb-*` package names returned not found from the npm registry.
- `yanibhq/reverb-impact` returned not found from Docker Hub. The intended container namespace is
  GHCR, which will be created with the repository.
- `reverb-impact.com`, `.dev`, and `.org` had no A records. This is not a registrar-availability
  determination.
- Google's DeepMind Reverb and other software projects already use “Reverb.” A basic web search is
  not trademark clearance.

## Decision

1. Build Reverb as a standalone TypeScript/Node 24 monorepo intended for
   `YanibHQ/reverb-impact`.
2. License Reverb code and documentation under Apache-2.0.
3. Use the personally owned package scope `@yanib/reverb-*`, distribution package
   `reverb-impact`, binary `reverb`, and container `ghcr.io/yanibhq/reverb-impact`. Publisher and
   package-name availability were verified before the first public release.
4. Use the Developer Certificate of Origin 1.1, not a CLA, for initial contributions.
5. Treat Repowise as prior art and a benchmark only. Do not copy, translate, adapt, link, or import
   its implementation into Reverb packages.
6. Keep Yanib outside this repository. Yanib may later consume the public protocol or implement a
   host adapter; neither project reads or writes the other's private tables.
7. Keep “Reverb” provisional until counsel or an authorized trademark reviewer clears it. Rename
   before 1.0 if clearance fails.

## Consequences

- The domain and application layers cannot import GitHub, databases, queues, web frameworks, Yanib,
  Repowise, models, or vector clients.
- CI must enforce license policy, generate an SBOM, and attest release artifacts.
- Publisher creation, default branch protection, GHCR, domain purchase, and legal clearance remain
  external setup actions. They are not simulated locally.
- The project may benchmark documented behavior but must retain provenance and never incorporate
  incompatible source.

## Rejected alternatives

- Implement inside Yanib: rejected because it couples the engine to a SaaS host and release train.
- Fork or embed Repowise: rejected for product scope and license-boundary reasons.
- Claim the unqualified `reverb` package or container name: rejected because the name is already in
  use.
