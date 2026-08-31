# Phase 007 Plan

1. Make the exact producer head observation a required analysis input.
2. Validate its complete identity envelope before selecting consumers.
3. Select the producer through authorization and coverage policy without freshness substitution.
4. Join exact head references alongside stored downstream-generation references.
5. Add regression and end-to-end CLI coverage.
6. Update public API, compatibility, architecture, and release documentation.

## Deliberate constraint

This phase does not infer head references by querying the latest producer generation. Callers must
extract and pass the exact head observation they already use for contract diffing.

