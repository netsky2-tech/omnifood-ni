# SOHO Day-1 Integral Test — Clean Client Tenant Execution

Authority: `docs/plans/sales/prueba_integral_dia_1_soho.md` (plan), `docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md` (§4 Core Promise), `odd/tasks/go-live-plan.md` (measured remaining work), `odd/tasks/go-live-decisions.md` (DEC-1…DEC-5).

Goal: execute Fases 0–14 of the day-1 integral test on the physical tablet **against a clean client tenant** — real RUC, the validated 58-item menu, and a real DGI series — and record honest per-check evidence.

## Why a clean tenant

The tablet was bound to tenant `SOHO` (`e05bf002-b1d3-45f2-a46a-3592e1cc1431`), which is a **test fixture**: RUC placeholder `J0000000000000`, 23 products (12 SIMPLE + 11 COMPOUND), 33 invoices named `TEST-BOUND-D` / `CASE-E2-YEAR-START`. No tenant in the local DB carries the 58-item menu. Running the fiscal phases there would emit real invoices against a false RUC and the wrong catalog — a §4.1 violation and contrary to the plan's honesty criterion.

## Environment (verified 2026-10-01)

| Fact | State |
|---|---|
| Codebase | `main` local synced `374b051a` → `c3036357` (= `origin/main`); redundant H-3 commit dropped (identical to `d0d1df33`); backup tag `backup-pre-sync-20261001-095130` |
| Backend | local `nest --watch` in main worktree, rebuilt on correct code (R-1 `inbound-sync.service.ts:522`, R-2 `87423d4f`) |
| Migrations | 4 pending applied, incl. `BackfillTemplateProductTypes` (10 SIMPLE→COMPOUND) |
| Tablet | `192.168.0.7:46605` (MIRAY TPM4G_E9863), app `com.nhilos.pos_app` |
| Connectivity | tablet cannot route to host; resolved with `adb reverse tcp:3000 tcp:3000` → verified REACHABLE (app `API_URL` default `http://127.0.0.1:3000/api`) |
| Device binding | tenant `SOHO` (test fixture) — **to be replaced** |

## Tasks

- [x] **T1 — Provision the clean client tenant.** Tenant `bc3bd4dd-92bb-4cfe-883e-cb5ec97bfe94` (`SOHO`/`soho`, RUC `J0000001203012`); owner `3d052da1-6b6f-4bfe-913a-84116606e297` (`admin@soho.com`). The pre-existing `SOHO` fixture was renamed to `SOHO Test Fixture`/`soho-test-fixture` (UPDATE, reversible) to free the canonical name.
- [x] **T2 — Fiscal setup.** Applied: regime `CUOTA_FIJA`, businessName `SOHO`, ruc `J0000001203012`, `commercialFxSpread` 0.5, `pricesIncludeTax` false, `operationMode` `FOODPARK_QSR`, `checkoutFxMode` `COMMERCIAL`. `taxRateIva: 0`, config revision 1.
- [x] **T3 — Import the menu.** PREVIEW on the clean tenant: `categories 7 / productsToCreate 58 / productsToUpdate 0 / recipesToCreate 0 / insumosToCreate [] / errors [] / warnings []`. Gate PASSED (58 create is the clean-tenant expectation). Committed: 58 products, all `SIMPLE`, all with price > 0 and active; categories 16/11/12/4/4/5/6; 0 insumos.
- [ ] **T4 — Re-link the tablet and run activation (Fase 3).** New linking code; phases 1-2-3; `initializeRange` runs here (`activation_controlled_sale_runner.dart:127`).
- [ ] **T5 — Execute Fases 1–14** on the tablet and record per-check evidence (POS state vs cloud state).
- [ ] **T6 — Close the plan.** Update `docs/plans/sales/prueba_integral_dia_1_soho.md` per the release gate; declare unproven checks honestly.

## Open inputs (owner-provided, not in the repo)

- Real business/legal name and **RUC** (deliberately not recorded: `AP_Q80_PILOT_EVIDENCE.md` §5).
- Owner name, email, password, 6-digit PIN.
- `commercialFxSpread`, `operationMode`, `checkoutFxMode`.
- DGI authorization code / issuedAt / expiresAt (nullable in the DTO).

## Known limitations to record

- `printer_driver_type=MOCK` on the device — printing checks (8.6, 14.2) are not provable until a real printer is configured.
- Fiscal tripwire `FISCAL_SEQUENCE_RECOVERY_REQUIRED` does not exist in code (D-6/B2a pending, `odd/tasks/go-live-plan.md` G2).

## Evidence log

### Environment (2026-10-01)

- `main` synced `374b051a` → `78e2b77d` (= `origin/main`); backup tag `backup-pre-sync-20261001-095130`. Note: another session moved this worktree to `78e2b77d` (includes #765 server card) and left untracked files under `docs/nhilos/`.
- 4 pending migrations applied to local `omnifood`.
- Tablet `192.168.0.7:46605` reaches the local backend via `adb reverse tcp:3000 tcp:3000` (app `API_URL` default `http://127.0.0.1:3000/api`; log: `[ApiUrl] Server not configured ... development default`).
- App reinstalled 2026-10-01 14:43 as a **release (signed) build**, so `run-as` is unavailable — verification is UI + backend DB + logcat only.
- `npm run migration:show|run` is BROKEN under pnpm (`Cannot find module .../database-connection.config`); workaround is loading the DataSource directly with `npx ts-node -r tsconfig-paths/register -e "require('./src/data-source.ts').default"`.

### Phase observations

| Check | Result | Evidence |
|---|---|---|
| 1.1 cold start | PASS | `pm clear` + relaunch, no crash |
| 2.2/1.2 online login | PASS | log: `POST /identity/login`, `Synced 1 staff members to local DB` |
| 1.3 staff list | PASS | lock screen shows `Maxwell Orozco` (OWNER) |
| 2.2 PIN | PASS | log: `Attempting unlock with PIN of length: 6` → `Unlock successful, navigating to /home` |
| 3.1 linking | PASS | 2 codes claimed (`pos-local-acb6f5a8…`, `pos-local-082cc471…`) |
| 4.1 no sale without shift | PASS | POS shows `APERTURA DE CAJA` instead of the sale screen |
| 3.1 linking | PASS | 2 codes claimed; `device_linking_codes.status = CLAIMED` |
| 3.2 activation discovery | PASS | `Activar Terminal` → `prepare()` found the attempt (`Estado del intento: Asignado`) |
| 3.3 Fase 1 checks | PASS | all 6 `Aprobado`: terminal vinculada, configuración requerida, usuario autorizado, impresora disponible, impresión de prueba, durabilidad de la DB |
| 3.3 Fase 2 verification sale | PASS | ticket `b61fc508-f642-4317-942c-1332d7f02eea`; `Venta fuera de línea pagada / Ticket de la venta / Evidencia guardada localmente` all `Aprobado` |
| 3.4 consecutive consumed | PASS (accepted) | invoice number **1** |
| 3.5 verification marked `paid` | PASS | cloud `invoices.payment_status = paid`, `is_canceled = false`, total 80.00 |
| 3.6/3.7 finalize + sync | PASS | `onboarding_sessions.lifecycle_state = ACTIVATED`; device-sync credential `8aa04518-880b-41ae-8700-5078ef188f14`; POS sync badge green |
| 5.6 no inventory impact | PASS (early) | `VERIFICATION_SALE` `ACCEPTED`, `APPLIED_NO_INVENTORY_IMPACT`, reason `NO_EXPLICIT_INSUMO_MAPPING` |
| 4.1/4.3/4.4/4.5 | PASS | shift opened with C$1000.00; cloud `cash_shift_sessions`: `status=OPEN`, `initial_float_nio=1000.0000`, `cashier_id` + `terminal_id` bound |
| 5.1 price correct | PASS | Cappuccino 12oz added, cart total C$125.00 |
| 5.2/5.3/5.5 change | PASS | received C$200.00 → `Vuelto: C$ 75.00`; cloud payment `amount=200.00`, `change_given=75.00`; reports net the change (`sales-reports.service.ts:146-159`, `sales-export.service.ts:746`) so collected money is 125.00, not inflated |
| 5.4 change in NIO/USD | PARTIAL | UI offers `Vuelto en NIO (C$)` and `Vuelto en USD ($)`; only the NIO path was exercised |
| 5.6/5.7 no inventory impact | PASS | invoice #2 `APPLIED_NO_INVENTORY_IMPACT` / `NO_EXPLICIT_INSUMO_MAPPING`; `inventory_kardex` count = 0 |
| 5.8/5.9 fiscal numbering + sync | PASS | consecutive 1 → 2 with no gaps; invoice #2 in cloud with `subtotal=125.00`, `total_tax=0.00`, `total=125.00`, `payment_status=paid` |
| commercial FX | PASS | checkout shows `TC Comercial: 36.50` = BCN 36.00 + spread 0.50 |
| 6.1 card dialog | PASS | `Procese el cobro en el datáfono físico (BAC / BANPRO / LAFISE)` + franquicia VISA/MASTERCARD/AMEX |
| 6.2 fast voucher | PASS | `Cobro Rápido (Hora Pico)` on → "El voucher se guardará como PENDIENTE para conciliar al cierre de turno" |
| 6.3 card reaches cloud | PASS | invoice #3 `paid`, payment `card` `amount=100.00`, `card_brand=VISA`, `card_type=DEBITO`, `bank_pos=BAC`, `reconciliation_status=PENDIENTE`, `voucher_code=PENDIENTE` |
| 7.1 split payment | PASS | invoice #4 `paid` `total=125.00` with `cash 75.00` + `card 50.00` (VISA, PENDIENTE); `Resta: C$0.00` before finalizing |
| 7.3 collect button gating | PASS | `FINALIZAR VENTA` disabled while `Total Pagado C$0.00`; green once `C$125.00` |
| 7.4/7.5 payments sum to total | PASS | `sum(amount) = 125.00 = total` for invoice #4 |
| 8.1/8.2 void UI | PARTIAL | `ANULAR FACTURA` + mandatory reason list. No supervisor PIN requested for the OWNER; the void itself **failed** — see D-8 |
| 8.5 reprint | PARTIAL | `REIMPRIMIR` requires an auditable reason (Papel atascado / Cliente perdió su ticket / Verificación / Otro + detail); no success feedback afterwards (printer simulated) |
| 14.1 sales history | PASS | `Historial de Ventas` lists invoices 1–4 with number, date and total; the detail shows the raw user UUID instead of the cashier name |
| 9.1 X report is read-only | PASS | `Lectura Parcial (Corte X)` states "La lectura X es informativa y no cierra el turno de caja" |
| 9.7 Z blocked by vouchers | PASS | `Control de Caja y Turnos`: "2 vouchers de tarjeta pendientes de conciliar — Debe ingresar los códigos de autorización bancarios antes de emitir el Corte Z" |
| 9.9 NIO + USD | PASS | float and expected shown in both C$ and USD columns |
| 10.1/11.1 entry points | PASS | `Registrar Movimiento` and `Vouchers (2)` / `Conciliar Vouchers` present |
| 9.1 expected cash correctness | **FAILED** | see D-9 |

### Defects observed (need triage)

1. **D-1 `[Bootstrap] REQUEST` logs a malformed URL** `http://127.0.0.1:3000/apionboarding/activation/device-sync-credential` (missing `/` after `api`). The subsequent FAIL line shows the correct URL, and the backend answered with a real 404 message — so the request itself is correct and this is a **logging-only** defect.
2. **D-2 `Online login successful for null`** — the success log interpolates `null`. Login and staff sync actually worked, so likely a logging/field defect worth checking.
3. **D-3 `cash_shift_sessions.cashier_name` stores the user id, not the name.** Cloud row has `cashier_name = 3d052da1-6b6f-4bfe-913a-84116606e297` (the owner's UUID) while the column is named `cashier_name`. Data-quality defect for reports.
4. **D-4 (SEVERE — FIXED & VERIFIED) — FX commercial rate.** The dashboard field `commercialFxSpread` carries the tenant's **commercial exchange rate**, not a spread over BCN (operator-confirmed; the POS business profile selects which of the two rates the checkout uses). Two defects had to be fixed: (a) the field was labelled **"Spread Cambiario Comercial (C$)"** with a `0.5` default, so the operator (and I) loaded a spread into what the POS consumes as a rate — `fiscal_inbox_handler.dart` maps the value into `local_configs['commercial_exchange_rate']` and `SaleViewModel.loadExchangeRates()` uses it as `_commercialRate`; (b) that made the checkout show `TC Comercial: 0.50` and C$100.00 → **$200.00 USD**. Fix: relabelled to **"Tipo de Cambio Comercial (C$)"** with `step=0.0001`, placeholder/default `36.5`, corrected the helper text and the zod messages (`fiscal-setup-form.tsx`, `types.ts`), corrected the audit table in `docs/nhilos/audits/settings-experience-audit-v2.1.md`, and set the tenant value to the real rate. Verified live: `TC Comercial: 36.62`, C$100.00 → **$2.73 USD**. Dashboard tests 71/71 pass.
5. **D-5 (UX gap — FIXED, branch only)**: `loadExchangeRates()` ran only in the `SaleViewModel` constructors, so a fiscal-config or FX change did not reach an already-running terminal until the POS was restarted. Fixed on branch `fix/soho-commercial-fx-rate` (commit `4f1b7b31`) by reloading the rates before opening the checkout and split-bill dialogs. **Not yet verified on the device** — needs an APK built from that branch.
6. **D-6 (invoice FX provenance)**: the invoice's `commercial_rate` is the backend's hardcoded column default, not the rate used at the checkout. `apps/admin_backend/src/modules/sales/entities/invoice.entity.ts` declares `commercial_rate ... default: 36.5`, and the POS never sends `commercialRate` in its sync payload (`sync_service.dart` has no reference to it). Observed live: invoice #3 was charged at `TC Comercial: 36.62` yet stored `commercial_rate = 36.5000`. Since invoices are immutable fiscal records, the recorded rate (and any derived `total_usd`) is wrong.
7. **D-7 (tips and split bill unreachable in SOHO's mode)**: `BusinessModeEvaluator.isSplitBillAllowed` and `isSuggestedTipPromptEnabled` both derive from `canUseTableService` → `TenantConfig.supportsTables` → `operationMode.supportsTables`, and `TenantOperationMode.foodparkQsr.supportsTables` is `false`. The tip UI lives only in `SplitBillDialog` (opened by the cart's `DIVIDIR CUENTA` button, which is itself gated on `isSplitBillAllowed`). SOHO runs `FOODPARK_QSR`, so **the operator cannot charge a tip at all** — even though `invoices` carries `tip_amount_nio/usd`, `tip_percentage` and `tip_eligible_base_nio`, and `TipEngine` is implemented. Enabling tips requires the tenant to run `RESTAURANT`/`HYBRID` or to set `TenantConfig.tableServiceEnabled`.
8. **D-8 (void fails with no diagnostics) — DIAGNOSTICS FIXED, root cause pending**: `ANULAR FACTURA` accepts a reason, enables the button, then fails with the generic snackbar **"No se pudo anular la factura."** and `invoices.is_canceled` stays `false`. The three-predicate gate was passed (a denial surfaces `decision.uiMessage` instead), so the throw comes from `SalesRepositoryImpl.voidInvoice` — most likely `reverseInventoryUseCase.execute(...)` — or from the ANULADO reprint. `SaleViewModel.voidInvoice` caught `StateError`/`Exception` and swallowed the cause with no log, so the operator got nothing actionable and the field could not diagnose it. **Fix (commit `c9533c9f`)**: log the cause at SEVERE with the stack trace and map known domain errors to actionable Spanish that always states the invoice was left intact (`_voidFailureMessage`), with unit coverage for the already-canceled and inventory-provenance branches. **The root cause is still unidentified** — it needs the log from an APK built off this branch; the SIMPLE-product reversal path (`recipeVersionId` null → `getRecipeByProductId` empty → no movements) has no throw on inspection, so the failure is elsewhere in the void unit.

### Device verification of D-8 / D-9 (APK `versionCode 2002`, built from this branch)

- **D-9 — VERIFIED FIXED.** After the same C$200 of cash sales, `Control de Caja y Turnos` and `Lectura Parcial (Corte X)` both report **Esperado en Gaveta = C$ 1200.00** (was C$ 1000.00), i.e. float 1000 + 125 + 75.
- **D-8 — the void SUCCEEDED on this build**, so the earlier failure did not reproduce: invoice #3 now shows the red **ANULADA** badge in the history detail and only `REIMPRIMIR` remains. No SEVERE log fired. The diagnostics fix stands as insurance (the failure was observed twice on the previous build and the cause is still unnamed).
- **D-10 (new) — a canceled invoice does not reach the cloud.** More than 90 s after the successful local void, cloud `invoices.is_canceled` is still `false` for invoice #3, though the void sets `syncStatus = 'pending'` so the cancellation re-syncs. The POS sync badge had been amber since the earlier failed void attempt, so the outbound invoice sync itself looks stalled — this needs its own investigation (the cancellation is fiscally invisible to the backoffice until it lands).
9. **D-9 (SEVERE — drawer expectation ignores cash sales) — FIXED (commit `12861a97`), device verification pending**: the `Corte X` "Resumen de Flujo de Gaveta en Tiempo Real" and the `Control de Caja y Turnos` card both reported **Esperado en Gaveta = C$1000.00**, i.e. the initial float unchanged, after two cash sales totalling C$200 (invoice #2: 200 received − 75 change = 125; invoice #4: 75). The cloud agreed (`cash_shift_sessions.expected_cash_nio = 1000.0000`). Root cause: only the Z close used `effectiveExpectedNio/Usd` (base + net cash sales, from the #529 work); the cards and `XReportDialog` printed the raw `shift.expectedNio/Usd`, which carry only the float plus manual movements. Fix: both now display/pass the effective expectation. `flutter test test/ui/features/cash/` + the blind-count integration test pass (28/28).

### Blocked / pending

- **Fase 3 COMPLETE.** The printer was configured (simulated, to save paper); Fase 1 then passed all 6 checks. Activation attempt `8b2f1984-e6bf-4170-b8a0-324a61c1f56a` finalized: 5 reconnect envelopes delivered (3× `ACTIVATION_CHECK`, `VERIFICATION_SALE`, `FIRST_SUCCESSFUL_SALE_OBSERVED`), device-sync credential provisioned, session `ACTIVATED`, sync badge green.
- **Fiscal series is still unconfigured** and the verification invoice consumed **number 1**. On the real tenant, the operator must load the DGI-authorized initial consecutive in `Configuración del Negocio` BEFORE activation, or the first commercial sale will not be the authorized initial number (D-6).
- **Preconditions the activation needed, discovered en route**: the onboarding session must be `SALE_READY`, which only happens after `GET /api/onboarding/session` reconciles readiness (tenant + owner + minimum fiscal + at least one sellable product). `GET /api/onboarding/readiness` does NOT reconcile. Without that call, `POST /api/onboarding/activation/attempts` returns `CANNOT_START_ACTIVATION_NOT_SALE_READY`.
- **Printing is simulated** (`printer_driver_type` simulated per operator): checks 8.6 and 14.2 (physical ticket fidelity) remain not provable and must be repeated in production with real paper.
- **Cash opening screen offers only a NIO field.** `cash_shift_sessions` has both `initial_float_nio` and `initial_float_usd`, but the POS opening UI exposed only `Fondo de Caja Inicial C$`; Fase 4.2 (separate NIO + USD floats) is therefore only half provable from this screen.
- **Scope addition from the operator**: the day-1 run must also cover **discounts, promotions and tips** (SOHO ran a 2x1 on hot coffees for International Coffee Day). Add these as explicit checks before declaring the plan complete.

### Issue found — promotions model is unfit for the business (operator-confirmed)

The promotions feature works only for the narrowest case and is unusable for how SOHO actually runs promotions (`apps/pos_app/lib/domain/services/sales/promotions_engine.dart` + `apps/owner_dashboard/src/features/promotions/PromotionForm.tsx`):

1. **Category-wide 2x1 is not expressible.** `PromotionType.buyXGetYFree` matches only `targetProductId`; `targetCategoryId` is ignored for that type. "2x1 on all hot coffees" (the real International Coffee Day promo) cannot be built — only per-product.
2. **No grouping / no dynamic product selector in the dashboard.** `PromotionForm` asks for raw product and category IDs instead of a searchable selector, and offers no way to group products or categories into one promotion.
3. **Common restaurant scenarios** (combo packages, happy hour by schedule, bundles) are not constructible end to end. `comboPackage` exists in the enum but the engine's `case PromotionType.comboPackage:` is a no-op.
4. **VERIFIED BROKEN END TO END — category-scoped promotions never match.** The backend product delta (`fetchProductDeltas` in `inbound-sync.service.ts`) returns `id, name, uom, stock, averageCost, sellPrice, taxRate, isTaxExempt, isActive, isPerishable, warehouseId, productType, mappingVersionId, insumoId, createdAt, updatedAt, tenantId` — **no `category`**. The POS stores `category: map['category'] ?? existing` → `Product.category` is null, and `PromotionsEngine` matches categories with `item.category?.toLowerCase() == targetCategoryId!.toLowerCase()`, which can never be true. Reproduced live: a `percentageDiscount` 10% on `CAFÉ CALIENTE` did not apply to a cart of Cappuccino 12oz while an equivalent per-product `buyXGetYFree` 2x1 did (badge `2x1`, discount −C$125.00).

Operator decision: leave this as its own issue/follow-up; it does not block the day-1 flow but must be redesigned before promotions are used in production.

### Next (Fases 5–14) — not yet executed

Sale with cash + change (5.2-5.5, 5.8-5.9), card voucher (6), split payment (7), void/credit note/reprint (8), X and Z cuts + blind count (9), cash movements (10), voucher reconciliation (11), operator switch (12), sync under load and with the network down (13), day close reports (14), plus the promotions/discounts/tips scenarios. Each needs a human at the tablet for the physical parts (cash counting, supervisor PINs, paper) and cloud-side verification in parallel.
