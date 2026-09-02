# Host and Yanib integration boundary

Yanib is a possible downstream host, not part of this implementation. No Yanib source, schema,
deployment, or repository is modified by the `0.5.0` work.

After a separately approved Reverb release, a host integration would:

1. install exact `0.5.0` public packages or call a versioned Reverb service;
2. supply exact producer base/head and the producer head observation;
3. translate host-owned workspace membership and consent into an immutable registry revision;
4. choose an explicit consumer allowlist and enabled adapter families;
5. implement Reverb ports without direct Reverb-to-host database-table coupling;
6. provision independent Reverb storage and apply Reverb migrations;
7. keep model provider selection/credentials and data policy in the host, if reasoning is enabled;
8. store canonical Reverb record pointers/projections rather than copying internal storage models;
9. enable reads, indexing, deterministic analysis, projection, check writes, and actions gradually;
10. retain exactly one owner for each external check or issue write.

Omitting the v2 scope contract preserves `0.4.0` host behavior. An empty explicit allowlist requests
same-repository analysis. The host must not interpret either state as organization-wide discovery.

Publication, hosted database provisioning, Vercel/environment configuration, GitHub App permission
changes, and a Yanib pull request are excluded from this repository goal and require explicit user
approval after Phase 005 evidence is complete.
