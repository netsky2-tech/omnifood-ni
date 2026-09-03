# Apply Progress: Configurable Fulfillment Topology

**Mode**: Strict TDD
**Delivery**: `ask-on-risk` resolved to `feature-branch-chain`

## Cumulative Completed Tasks

- [x] 1.1–1.3
- [x] 2.1A–2.2C
- [x] 2.2D.1
- [x] 2.2D.2a
- [x] 2.2D.2b
- [ ] 3.1–5.1

## 2.2D.2a Evidence

| TDD stage | Evidence |
|---|---|
| RED | Historical SQLite harness failed before the candidate because fulfillment was absent and invalid contexts mutated state. |
| GREEN | `flutter test test/data/repositories/sales/sales_repository_fulfillment_checkout_test.dart` → exit 0, 2/2 tests passed. |
| TRIANGULATE | Valid checkout/replay plus missing, cross-tenant, stale-revision, and hash-mismatch no-mutation paths passed. |
| REFACTOR | Candidate retained; no further refactor was required. |

| Work-unit evidence | Result |
|---|---|
| Focused test / runtime harness | Same real in-memory Floor SQLite command passed: invoice, inventory, fulfillment, print, outbox, and DGI advancement committed atomically; replay remained idempotent. |
| Rollback boundary | Revert `sales_repository_impl.dart` and `sales_repository_fulfillment_checkout_test.dart`; no unrelated behavior is removed. |

**Scoped authored diff**: 365 lines (116 additions + 15 deletions production; 234 additions harness).
**Excluded test SHA-256**: `28ceeb6ee1800d65cab052d5ab86346c58f29134b9c866a700f9fc4a142dcc28` (unchanged).
**Evidence revision**: `sha256:99429369d37ad1ffa4791cd2ed44de077ccf76203bdf09692ae417e7501a6fc9`

## 2.2D.2b Evidence

| TDD stage | Evidence |
|---|---|
| Correction RED | Semantic validation `sha256:4ee8dec9c064627c18d75231ee38915721b871e114e3a59da9cae308782e9faf` found that passing tests had removed immutable context-forwarding proof. |
| GREEN | Final formatted candidate: check-only Dart format passed (1 file/0 changed); changed-test analyzer passed with no issues; required combined repository + SQLite + DGI tests passed 31/31; diff and staged diff checks passed. |
| REFACTOR | Smallest test-only correction; production unchanged. |

| Work-unit evidence | Result |
|---|---|
| Semantic proof | Exact immutable tenant/snapshot ID/revision/hash/channel identity, one fulfillment transaction invocation, and legacy no-context DGI/no-callback behavior. |
| Final formatted test boundary | `apps/pos_app/test/data/repositories/sales/sales_repository_impl_test.dart`: 160 additions + 96 deletions = 256 changed lines. |
| Complete child boundary | Before this passive wording adjustment: 180 additions + 99 deletions = 279 changed lines across test, tasks, and apply-progress; under the 400-line review cap. |
| Rollback boundary | Revert only that test file correction without removing 2.2D.2a behavior. |

**Native correction evidence revision**: `sha256:8e52e779448b2b5da4448fabc7066292cb94aaad0297d9b7904c2e4250bee11b`.
**Native settle**: complete, remediating failed revision `sha256:4ee8dec9c064627c18d75231ee38915721b871e114e3a59da9cae308782e9faf`.
**Final normalized ordinary-delivery evidence revision**: `sha256:dc249544cf0ca159f0c6c67b4559902eb40df8247f3704a1bb27e28991462f82`.
