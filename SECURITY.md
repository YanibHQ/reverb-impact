# Security policy

Reverb treats repository content, diffs, schemas, indexes, comments, and adapter input as
untrusted data. The normative threat model is in
[`features/cross-repo-impact/security.md`](features/cross-repo-impact/security.md).

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for `YanibHQ/reverb-impact`. Do not open a
public issue for suspected vulnerabilities, source disclosure, credential exposure, or tenant
isolation failures. Until the canonical repository is published, contact a YanibHQ organization
owner privately.

Include the affected version or commit, impact, reproduction steps, and any suggested mitigation.
Do not include third-party private source or credentials.

## Supported versions

No public version has been released. Security fixes currently target the default branch. A formal
support window will be published before 1.0.

## Scope

High-priority reports include parser or sandbox escape, path traversal, provider-token exposure,
cross-workspace disclosure, unsafe static projections, unauthorized writes, suppression poisoning,
and failures represented as clean negative results.
