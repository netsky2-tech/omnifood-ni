## Apply Progress — identity_audit_scenarios_coverage_wave1b

- **Mode**: Strict TDD
- **Delivery**: chained PR slice (`feature-branch-chain`)
- **Work unit**: Unit 2 / Slice 2 (nightly gap detector + dedup evidence)
- **Boundary**: scheduler wiring + gap detector + alert evidence persistence/dedup only

### Completed Tasks (Cumulative)

- [x] 1.1 Create `apps/admin_backend/src/migrations/<ts>-EnforceAuditLogImmutability.ts`
- [x] 1.2 Create `apps/admin_backend/src/migrations/<ts>-CreateAuditIntegrityAlerts.ts`
- [x] 1.3 Create `apps/admin_backend/src/modules/identity/entities/audit-integrity-alert.entity.ts`
- [x] 1.4 Modify `apps/admin_backend/src/modules/identity/identity.module.ts` to register new entity/service providers
- [x] 1.5 Modify `apps/admin_backend/src/core/app/app.module.ts` to import `ScheduleModule.forRoot()` once at root
- [x] 2.1 RED: Create immutability migration spec with UPDATE/DELETE rejection assertions
- [x] 2.2 GREEN: Implement migration SQL trigger/function until spec passes
- [x] 2.3 Extend `audit.controller.spec.ts` to protect INSERT ingest path behavior
- [x] 3.1 RED: Create `audit-integrity.service.spec.ts` for ACTIVE-only gap detection, tenant isolation, and dedup behavior
- [x] 3.2 GREEN: Create `audit-integrity.service.ts` with nightly scan query and signature generation
- [x] 3.3 Implement persistence branch for new signatures, dedup by update `last_seen_at`, emit event only for new signatures
- [x] 3.4 Add nightly cron hook `0 2 * * *` (`America/Managua`, `waitForCompletion: true`) invoking `runNightly()`
- [x] 4.1 Add migration-level evidence for mutation rejection + rollback safety
- [x] 4.1a Corrective: replace mocked immutability evidence with real Postgres-backed integration checks
- [x] 4.1b Corrective: prove INSERT ingest compatibility with trigger installed at DB runtime
- [x] 4.1c Corrective: fix ESLint `@typescript-eslint/require-await` regression in migration spec
- [x] 4.2 Add scenario-aligned tests: `T1` gap detected, `T2` hidden, non-`ACTIVE` rows ignored, unchanged gaps not re-alerted
- [x] 4.2a Corrective: add runtime assertions for new-gap persistence/emission and mixed ACTIVE/non-ACTIVE filtering evidence

### TDD Cycle Evidence (Cumulative)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 / 2.2 / 4.1 | `apps/admin_backend/src/migrations/1764000000000-EnforceAuditLogImmutability.spec.ts` | Unit (migration behavior contract) | N/A (new) | ✅ Written first (missing migration class) | ✅ Passed (`2/2`) | ✅ 2 cases (update+delete rejection path + rollback path) | ➖ None needed |
| 2.3 | `apps/admin_backend/src/modules/identity/controllers/audit.controller.spec.ts` | Unit | ✅ Baseline `10/10` passing before edit | ✅ Added INSERT-only compatibility test first | ✅ Passed (`11/11`) | ✅ Existing suite already covers multiple ingest branches; new case adds trigger-compatibility branch | ➖ None needed |
| 4.1a / 4.1b / 4.1c (remediation) | `apps/admin_backend/src/migrations/1764000000000-EnforceAuditLogImmutability.spec.ts` | Integration (real Postgres runtime) + Unit rollback assertion | ✅ Baseline prior targeted suites passing (`13/13`) | ✅ Replaced mocked behavior with real DB mutation tests first (would fail without trigger enforcement) | ✅ Passed (`3/3` migration suite; `14/14` targeted combined) | ✅ 3 runtime cases (UPDATE reject + DELETE reject + INSERT allowed) | ✅ Cleanup/refactor for typed query results and lint-clean async usage |
| 3.1 / 3.2 / 3.3 / 4.2 | `apps/admin_backend/src/modules/identity/services/audit-integrity.service.spec.ts` | Unit | N/A (new file + new service) | ✅ Written first (missing service/entity modules) | ✅ Passed (`2/2` then `4/4`) | ✅ 4 cases (T1 gap + T2 hidden, ACTIVE-only query guard, unchanged dedup update path, no-gap path) | ✅ Added focused mapping/helper and preserved behavior |
| 3.4 | `apps/admin_backend/src/modules/identity/services/audit-integrity.service.spec.ts` | Unit | N/A (new file) | ✅ Hook expectation added first | ✅ Passed (`4/4`) | ✅ Additional cron delegation case | ➖ None needed |
| 4.2a (corrective runtime evidence) | `apps/admin_backend/src/modules/identity/services/audit-integrity.service.spec.ts` | Unit | ⚠️ Baseline not captured pre-edit in this batch (executor corrective continuation) | ✅ Added failing mixed ACTIVE/non-ACTIVE runtime test first | ✅ Passed (`5/5`) | ✅ 2 corrective cases (new-gap insert+emit payload assertions + mixed status filter behavior) | ✅ Minimal guard filter in service + typed assertion cleanup |

### Test Execution Evidence (Cumulative)

- `npm test -- src/modules/identity/controllers/audit.controller.spec.ts` (baseline): **10 passed**
- `npm test -- src/migrations/1764000000000-EnforceAuditLogImmutability.spec.ts` (RED): **failed** (missing migration module)
- `npm test -- src/migrations/1764000000000-EnforceAuditLogImmutability.spec.ts` (GREEN): **2 passed**
- `npm test -- src/modules/identity/controllers/audit.controller.spec.ts` (post-change): **11 passed**
- `npm test -- src/migrations/1764000000000-EnforceAuditLogImmutability.spec.ts src/modules/identity/controllers/audit.controller.spec.ts`: **13 passed**
- `npm test -- src/migrations/1764000000000-EnforceAuditLogImmutability.spec.ts` (remediation integration): **3 passed**
- `npm test -- src/migrations/1764000000000-EnforceAuditLogImmutability.spec.ts src/modules/identity/controllers/audit.controller.spec.ts` (post-remediation): **14 passed**
- `npm test -- src/modules/identity/services/audit-integrity.service.spec.ts` (RED): **failed** (missing service/entity modules)
- `npm test -- src/modules/identity/services/audit-integrity.service.spec.ts` (GREEN): **2 passed**
- `npm test -- src/modules/identity/services/audit-integrity.service.spec.ts` (triangulated): **4 passed**
- `npm test -- src/modules/identity/services/audit-integrity.service.spec.ts` (corrective RED): **failed** (`Expected: 1, Received: 2` on mixed ACTIVE/non-ACTIVE rows)
- `npm test -- src/modules/identity/services/audit-integrity.service.spec.ts` (corrective GREEN): **5 passed**
- `npm run lint -- src/modules/identity/services/audit-integrity.service.ts src/modules/identity/services/audit-integrity.service.spec.ts`: **success**
- `npm run build`: **success**

### Notes

- Slice 2 implemented as an autonomous chained work unit with no intentional behavior changes to Slice 1.
- Alert evidence dedup uses durable signature key `(tenant_id, device_id, user_id, signature)` and updates `last_seen_at` for unchanged gaps.
- Corrective slice adds explicit runtime assertions for persistence/emission side effects and defensive non-`ACTIVE` filtering when mixed-status rows are returned.
- No `size:exception` used.
