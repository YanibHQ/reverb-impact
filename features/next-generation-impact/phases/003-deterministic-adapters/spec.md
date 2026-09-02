# Phase 003 specification

## Shared requirements

Every adapter is optional, independently versioned, network-free, resource-bounded, deterministic,
incremental, schema-validated, and admitted separately. It emits definitions, references, changes,
coverage, and limitations; only application/domain code joins evidence into findings.

Each family must prove canonical identity stability, clean/incremental equivalence, deletion and
rename behavior, exact producer head reuse, immutable downstream generation use, unsupported/dynamic
gaps, no scope expansion, and failure containment.

## Family gates

- **Events:** Kafka, SQS/SNS, Pub/Sub producers/consumers/destinations/payload schema compatibility.
- **Database:** tables/columns/enums/migrations plus supported ORM/query readers and writers.
- **HTTP:** framework routes and client calls without OpenAPI, including bounded aliases/templates.
- **Configuration:** env/config keys, feature flags, and value-free secret references.
- **Infrastructure:** Kubernetes, bounded Helm/Terraform, service/ingress/output/runtime wiring.

## Definition of done

All five packages pass SDK conformance, admission, unit/integration/adversarial/incremental tests,
backend-to-backend and same-repository fixtures, scope canaries, and documented limitations.
