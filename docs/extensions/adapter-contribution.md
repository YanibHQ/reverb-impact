# Adapter Contribution and Admission

An adapter contributes versioned structural extraction/diff behavior, not ambient application
access. Implement the public adapter SDK manifest and operations, keep one identity function across
producer base/head and consumer extraction, and declare evidence strata, limitations, resources,
licenses, external tools, and remedies.

Required contribution evidence:

- canonical identity round-trip and deterministic output tests;
- producer definition/change and consumer reference fixtures, including deletion and partial input;
- compatibility direction fixtures and explicit `unknown` boundaries;
- resource/output limits, no network, safe paths, and hostile/malformed input tests;
- pinned external tool version/digest/license with closed exit mapping, when used;
- admission report showing coverage, failure semantics, and initial `UNMEASURED` promotion state;
- dependency license and package-boundary checks.

Run:

```bash
pnpm test
pnpm test:integration
pnpm test:conformance
pnpm test:adversarial
pnpm adapters:admission:check
pnpm licenses:check
```

Adapters cannot import application, host, or storage packages; use provider/database/network/
filesystem clients; execute repository code; emit source-bearing telemetry; create labels; make
disclosure decisions; or strengthen findings with model output. A new identity version triggers
re-index and calibration-reset review before delivery can be considered.
