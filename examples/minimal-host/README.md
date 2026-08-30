# Minimal Reverb host

This private example proves a third host can consume canonical analyses using only documented
package entry points. It has no GitHub, PostgreSQL, SQLite, Yanib, billing, notification, or hidden
table dependency.

`MinimalMemoryHost` is deliberately ephemeral. Its capability declaration marks durable jobs,
source fetching, reviews, blob storage, and external delivery unsupported. It accepts immutable
`AnalysisResult` records, preserves workspace/supersession isolation, exposes projection-only
output, and propagates repository deletion.

Use the local or GitHub reference hosts for real operation. This example is an integration teaching
artifact, not a production server.
