# Next-generation impact architecture

## 1. Boundary

The existing domain/application/adapter/host separation remains authoritative. New capabilities are
additive packages and v2 use cases; they do not fork or replace the `0.4.0` execution path.

```text
host-selected exact PR + immutable registry revision + bounded consumer scope
                                |
                 authorization/consent scope gate
                                |
        +-----------------------+-----------------------+
        |                                               |
 deterministic adapter lanes                    optional reasoning lane
 TS/OpenAPI/Protobuf + events/db/http/config/infra      bounded retrieval
        |                                               |
        +------------ immutable evidence ---------------+
                                |
              v1 unchanged result OR negotiated v2 result
                                |
                 host-owned projection and delivery
```

## 2. Dual contract strategy

`AnalyzePullRequest` remains the v1 compatibility path. `AnalyzePullRequestV2` is a new public use
case with explicit input and output types. It may invoke the existing deterministic engine, but v1
never depends on v2.

```ts
interface AnalyzePullRequestV2Input {
  schemaMajor: 2;
  producer: ExactPullRequestInput;
  producerHeadObservation: ContractObservationV2;
  registryRevision: RegistryRevision;
  consumerScope?: ConsumerScopeV2;
  enabledAdapterFamilies: readonly AdapterFamilyV2[];
  reasoning?: ReasoningRequestV2;
}

interface ConsumerScopeV2 {
  mode: "allowlist";
  repositoryIds: readonly RepositoryStableId[];
}
```

Omitting `consumerScope` deliberately invokes a legacy-scope compatibility adapter. Supplying an
empty allowlist selects only the producer. These states are distinct in type, provenance, and hash.

## 3. Scope gate

The application layer constructs a `ResolvedAnalysisScope` before calling generation or evidence
ports. The value contains only authorized repositories. Downstream ports require that value rather
than accepting a raw workspace query.

```text
requested IDs
  -> normalize/dedupe/sort
  -> add producer
  -> prove membership at registry revision
  -> authorize evidence.consume and required retention/retrieval actions
  -> freeze decisions and hash
  -> issue opaque scoped read capability
```

Generation/evidence/retrieval queries require the opaque capability and reject repository IDs not
contained in it. This enforces scope beneath host/UI code. The gate does not discover repositories
from graph edges and does not report whether omitted repositories exist.

## 4. Adapter vertical slices

Each new package implements the existing adapter SDK extended by v2-only protocol types:

| Package | Family | Initial inputs |
| --- | --- | --- |
| `@yanib/reverb-adapter-events` | events/queues | source, manifests, broker/schema declarations |
| `@yanib/reverb-adapter-database` | shared database | SQL migrations/schema, bounded ORM/query forms |
| `@yanib/reverb-adapter-http` | implicit HTTP | framework routes, client calls, registry aliases |
| `@yanib/reverb-adapter-config` | env/config/flags/secrets | source and configuration manifests |
| `@yanib/reverb-adapter-infrastructure` | infrastructure | Kubernetes, bounded Helm, Terraform |

An adapter emits definitions, references, compatibility changes, diagnostics, and coverage. It does
not query storage, expand repository scope, call a provider/model, decide delivery, or execute
repository code. Shared parser utilities may live in the SDK only when they preserve family-specific
identity and semantics.

## 5. V2 evidence model

V2 adds an extensible discriminated union rather than widening schema-1.0 closed enums. Initial
identity kinds are:

- `event.destination` and `event.payload_schema`;
- `database.table`, `database.column`, and `database.enum`;
- `http.route`;
- `configuration.key` and `configuration.feature_flag`;
- `infrastructure.service`, `infrastructure.endpoint`, and `infrastructure.output`.

Canonical keys use length-prefixed components and explicit identity-algorithm versions. Display
names are not identity. Aliases are resolved only against the frozen registry revision, and each
resolution records its basis. Adapter identity changes require a new identity version and re-index
notice; they never reinterpret existing records.

## 6. Storage

SQLite and PostgreSQL receive matching additive migrations for:

- normalized analysis scopes and repository selections;
- per-selection authorization/consent decision provenance;
- v2 observations, definitions, references, changes, edges, and results;
- family-level coverage and diagnostics;
- reasoning runs, bounded citations, and deletion state.

Existing tables and columns are not renamed or rewritten. V2 tables reference existing immutable
generation IDs where possible. Readers select a schema/protocol major explicitly. Migration tests
start from every supported `0.4.0` fixture and prove old records remain readable.

## 7. Optional reasoning boundary

`@yanib/reverb-reasoning` contains only provider-neutral protocol, retrieval planning, validation,
citation verification, and failure isolation. It has no vendor SDK dependency.

```ts
interface ReasoningPort {
  reason(request: StructuredReasoningRequestV1): Promise<StructuredReasoningResponseV1>;
}
```

The host owns provider selection, credentials, regional/retention policy, rate limits, and transport.
The application supplies opaque evidence handles and minimized excerpts only after authorization.
The response cannot directly construct a deterministic `Finding`; it can construct only a validated
`ReasoningHypothesisV1`. Invalid or uncited claims are discarded with a diagnostic.

## 8. Execution lanes

- **Bootstrap indexing:** bounded full generation for explicitly selected repositories.
- **Incremental indexing:** changed artifacts plus version-compatible reuse, equivalent to rebuild.
- **Pull-request analysis:** exact producer overlay plus selected immutable consumer generations.
- **Reasoning:** optional post-deterministic lane with an independent timeout/circuit breaker.
- **Delivery:** existing host-owned, authorization-rechecked projection; no automatic enablement.

No lane may turn an infrastructure failure into a successful empty result. Every immutable result
records inputs, versions, scope, and coverage sufficient to reproduce its claims.
