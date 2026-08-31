# Phase 007 Specification

**Parent invariants:** INV-1, INV-2, INV-5, INV-8, INV-9, INV-12

## P7-FR-1 — Producer-as-consumer selection

Every selected workspace repository, including the producer, participates in consumer selection.
The producer selection uses only a contract observation extracted from the exact analyzed head.

## P7-FR-2 — Exact head validation

The head observation and all nested definitions/references must match the analysis workspace,
producer repository, generation, and head commit. A mismatch fails closed before any edge or
analysis record is written.

## P7-FR-3 — Head reference semantics

Only producer references present in the exact head observation may join producer changes. Base,
default-branch, previously selected, and stale producer observations are not substitutes.

## P7-FR-4 — Coverage and authorization

Producer evidence is subject to the same consume authorization as downstream repositories.
Unsupported, failed, or unauthorized head evidence creates the existing bounded abstention state.
Partial positive evidence remains explicit and cannot establish negative assurance.

## P7-FR-5 — Compatibility

`AnalyzePullRequestInput.producerHeadObservation` is required. This intentional pre-1.0 API change
is released in the next minor version and documented in release metadata.

## Definition of done

Unit/integration and local CLI tests prove presence, deletion, mismatch, authorization, coverage,
and downstream non-regression behavior.

