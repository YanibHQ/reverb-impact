# Governance

YanibHQ is the initial steward of Reverb. Maintainers are responsible for releases, security
response, package publishers, the GitHub App identity, and project scope.

## Decision process

Routine changes use pull-request review. Changes to public schemas, identity rules, evidence
classes, permission semantics, compatibility policy, or architecture require an ADR. Security,
identity, and compatibility changes require two maintainer approvals once a second maintainer is
appointed.

Maintainers seek consensus. When consensus cannot be reached, the project lead records the decision,
dissent, and revisit trigger in the ADR. Evidence and documented user outcomes take priority over
roadmap momentum.

## Roles

- Contributors submit changes under the DCO.
- Committers may merge reviewed routine changes.
- Maintainers own areas, releases, and governance decisions.
- The project lead resolves deadlocks and appoints maintainers publicly.

The current initial project lead is Binay Dhakal. A maintainer roster and succession policy will be
added before external adapter contributions are accepted.

## Scope boundary

Reverb is independently versioned and does not depend on Yanib source, tables, billing, tenancy, or
release cadence. A future Yanib integration must consume the public protocol or implement documented
ports and conformance tests.
