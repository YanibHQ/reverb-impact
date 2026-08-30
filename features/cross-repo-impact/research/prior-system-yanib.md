# Prior-host design lessons

**Status:** Public design context; no private-source or production-history claims

Reverb is a standalone project. This note records generic constraints learned from building and
operating change-detection systems without publishing another product's source structure, private
revision history, customer topology, or internal metrics. Yanib is only a possible future consumer
of Reverb's public protocol; Reverb does not depend on it.

## Transferable constraints

### Read and write consent are separate

Permission to inspect source does not imply permission to retain derived artifacts, disclose a
repository or contract, publish a check, notify another repository, or use a case for research.
Reverb therefore models those decisions independently and defaults uncertainty to omit/no-write.

### Structural claims require inspectable facts

Configuration and declarations can help route or explain a relationship, but cannot independently
produce a structural finding. A finding requires versioned producer and consumer artifacts that a
reviewer can inspect and falsify.

### Coverage is not confidence

A parser or provider failure must not look like a clean negative. Positive evidence can survive an
unrelated gap; absence and removal conclusions are withheld when missing input could change them.

### Identity must have one owner

Definitions, references, diffs, joins, suppressions, and fingerprints use the same versioned
identity function for a contract kind. Duplicated normalization logic eventually diverges.

### Detection paths must converge

Local, hosted, pre-merge, and post-merge entry points should call the same canonical extraction and
analysis operations. Reimplementing classification in each delivery path creates silent drift.

### Review exists before delivery

Human decisions are append-only, multi-axis events kept separate from structural records. Workflow
actions and elapsed time are usefulness signals, not correctness labels.

### Synthetic fixtures prove mechanics, not product accuracy

Fixtures and mutations establish determinism, failure semantics, and controlled capability. They do
not establish real-world precision or recall. External delivery requires independently labelled
cases, sampled no-finding audits, disclosure review, and a forward observation window.

### Adapters require admission

An adapter needs a versioned identity, fixtures, resource limits, coverage semantics, limitations,
remedies, license provenance, and an initial `UNMEASURED` state. Technical existence alone is not a
reason to expose it in external delivery.

### Inferred evidence expires

Definitions, references, and edges belong to immutable generations. Current projections use
valid-time selection and invalidation; inferred relationships cannot become permanent facts merely
because refresh stopped.

## Public-evidence boundary

This file intentionally contains no private repository names, source paths, commit identifiers,
customer counts, internal schema names, or unpublished performance/accuracy figures. Any future
host-specific claim must cite a permission-safe public artifact or be omitted.
