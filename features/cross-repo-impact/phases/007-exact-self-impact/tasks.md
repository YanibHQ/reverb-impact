# Phase 007 Tasks

**Status:** Implemented and verified locally

## Exact selection

- [x] Require an exact producer head contract observation
- [x] Validate workspace/repository/commit/generation scope
- [x] Include the selected producer in consumer selection
- [x] Apply consume authorization and coverage states
- [x] Join only exact-head producer references

## Verification

- [x] Same-repository live reference produces a finding
- [x] Deleted head reference produces no finding
- [x] Mismatched head observation fails closed
- [x] Existing multi-repository findings and abstentions remain intact
- [x] Local CLI fixture detects producer and downstream consumers

