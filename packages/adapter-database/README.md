# @yanib/reverb-adapter-database

Deterministic, network-free shared database and migration impact analysis for Reverb.

The adapter recognizes bounded PostgreSQL DDL/migrations, literal SQL reads and writes, Prisma
schema and enum metadata, and configured Prisma client calls. It emits versioned table, column, and
enum evidence without connecting to a database or executing repository code. Migration documents
are applied in lexicographic repository-path order; migration filenames therefore need to preserve
deployment order.

The host supplies a stable `databaseNamespace`, the PostgreSQL dialect, and any Prisma client
model/field mappings. Dynamic SQL, missing migration bases, unsupported dialects, generated
migrations, stored procedures, unresolved query columns, and missing client mappings remain
explicit coverage limitations rather than absence proofs.

The package is available beginning with Reverb 0.5.0. Import only its documented root entry point,
pin an exact package version, and keep its version aligned with the rest of the Reverb package set.

## License

Apache-2.0
