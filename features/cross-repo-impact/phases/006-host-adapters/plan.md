# Phase 006 Plan

## Build order

1. Audit public package exports and schema/error compatibility.
2. Run/close local versus hosted conformance gaps.
3. Build minimal independent third-host example if Yanib integration timing is delayed.
4. Build Yanib shadow source/analysis pointer integration.
5. Add dedicated Yanib Reverb review subject/adapter.
6. Import declared edges as context and map consent/disclosure.
7. Select one external check writer and prove idempotency.
8. Write operations/extensions/release guides.
9. Archive benchmark/research artifact and execute v1 proof.

## Why a minimal third host may precede Yanib

The public engine should not be blocked by Yanib product timing. A small in-memory/HTTP sample host can prove the SDK independently. It does not replace the Yanib design-partner proof, but prevents an interface with only one implementation from being called stable.

## Yanib mapping

```text
Yanib Repo/team/provider consent
  -> Reverb workspace/registry/source request
  -> canonical AnalysisResult
  -> Yanib-owned pointer + authorized projection
  -> dedicated Reverb finding review subject
  -> AppendReview API
```

`ConsumerDeclaration` import:

```text
declared_context -> service identity/routing/explanation
                 X no structural finding without consumer artifact
```

## Check ownership options

1. Reverb writes through its GitHub App; Yanib renders detail only.
2. Reverb emits projection; Yanib writes using its existing provider/consent path. **Recommended for Yanib.**

Never enable both for the same installation/repo/check name.

## Compatibility proof

- install oldest supported package/schema/storage fixture;
- upgrade/migrate to current;
- re-index only when declared;
- reproduce historical canonical result with old reader/container where supported;
- show teaching error for unsupported major;
- reset affected calibration on adapter/identity changes.

## Do not build

- a second generic review loop inside Yanib without mapping existing UX;
- direct Prisma/table coupling;
- bidirectional hidden synchronization;
- Reverb tenancy/billing inside domain;
- proprietary-only language adapters;
- a hosted-scale platform before public conformance/release proof.
