# Phase 005 Hosted Security Review

**Decision:** local shadow/reference-host implementation is accepted; external advisory delivery is
not authorized because Phase 004 promoted no evidence stratum and no production GitHub installation
is in scope.

## Controls exercised

- constant-time HMAC-SHA256 over exact raw webhook bytes, size bounds, closed event/action set, and
  installation-scoped delivery deduplication;
- pointer-only webhook retention: fork state and exact SHAs are retained, while PR title/body,
  repository names, source, and token canaries are discarded;
- exact Git source interface with ephemeral read tokens and sanitized closed failures;
- separate read/write token brokers; provider write-client ownership restricted to one module;
- PostgreSQL composite workspace keys, forced RLS policies, explicit scoped predicates, and seeded
  cross-workspace canaries;
- current authorization for detail/review/write, authorization-revision cache invalidation, selected
  repository removal/reinstall, and audited purge;
- public/private and unequal-private whole-audience disclosure matrix with restricted canaries;
- closed schemas for disclosure and check projections, advisory-only conclusions, exact changed-line
  annotations, and provider batching;
- hard neutral deadline, stale-head rejection, no-promotion/no-write behavior, emergency disable,
  and automatic demotion rollback;
- closed telemetry property allowlist and safe escaped, keyboard-native HTML detail rendering.

## Fork-source disposition

Fork content remains untrusted bytes. The reference source path exposes read/tree/blob/diff
operations only; it has no install, build, test, generator, script, shell, or model operation. Parser
workers are outside the token-bearing source boundary. The adversarial suite proves malicious PR
text is absent from durable pointers and backend exceptions cannot expose token/source canaries.

## Remaining external gates

- operator authorization and registration of a real minimum-permission GitHub App;
- independently labeled promotion evidence for a current stratum;
- production shadow duration, provider/database network latency, alert burden, and cost observation;
- limited current-head advisory observation and rollback exercise in an authorized workspace;
- independent hosted security assessment before public GA.

None of those are simulated or reported as completed by repository fixtures.
