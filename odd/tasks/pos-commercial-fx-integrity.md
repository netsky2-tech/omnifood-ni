# pos-commercial-fx-integrity — #66 + #67

Branch: `fix/pos-commercial-fx-integrity` (worktree `/home/octavio_morales/omnifood-ni-fx-guard`, base `origin/main` @ `328afd2a`)
Feature scope: the commercial exchange rate at the point of sale — who may edit it (#66), and what happens when it cannot be resolved (#67).

## Why these two are one branch

Both defects are the same fiscal surface seen from two sides: the commercial rate that turns
córdobas into dollars on a DGI invoice. #66 lets the wrong person set it; #67 lets the terminal
invent it. Fixing only one leaves the invoice wrong by the other path. Two work units, one branch,
one review surface.

## Tickets

- **#66** — *Tasa de cambio comercial editable por cajera sin guarda de rol.* Any operator with an
  operational PIN reaches Perfil del Negocio and rewrites the commercial rate: an unauthorized
  price change at the point of collection.
- **#67** — *Caída silenciosa al FX por defecto (36.5000).* When rate resolution or refresh fails or
  returns null, the app silently falls back to `36.5000` and issues the invoice with an invented
  rate that does not match the business's own.

### Numbering warning (read before linking issues)

The backlog numbers `#66`–`#70` are **not** GitHub issues in this repository. GitHub `#66`–`#70` are
closed batch-3c sync/CI items (`feat(sync): add deterministic backend sequencing`, `ci: run checks
on feature chain PRs`, …). The `R-*` identifiers belong to
`docs/plans/sales/prueba_integral_dia_1_soho.md`, where only `R-1`…`R-9` exist: `R-9` is real
(duplicate cart lines), `R-17`/`R-19` appear nowhere in the repo. Do not map these numbers to GitHub
without confirming the tracker with the founder.

## Verified state (evidence gathered in this worktree)

### #66 — the surface

| Fact | Evidence |
|---|---|
| Exactly one entry point, with **no role condition** | `lib/ui/features/widgets/app_drawer.dart:261` (`'Perfil del Negocio'` `ListTile`) — siblings do gate: `:271 if (_isAdminOrManager)` |
| Route registered with no guard | `lib/main.dart:942 '/config/profile'` |
| A route-guard pattern already exists | `lib/main.dart:866` wraps `/inventory/boh` in `BohRouteGuard` → `BohAccessDeniedView` (`boh_navigation_shell_view.dart:161-190`) |
| The exact field | `business_profile_view.dart:224` `Key('commercial_exchange_rate_field')` |
| It already has a `readOnly` precedent — driven by the **cloud marker, not by role** | `business_profile_view.dart:231` ← `viewModel.isCommercialRateCloudManaged` (`business_profile_view_model.dart:74`) |
| **Zero role awareness** in the feature | grep `role|Role` in `lib/ui/features/config/business_profile/` → no hits |
| The permission pattern to mirror | `boh_permissions.dart` (constants class + `resolve*` + `has*` over `UserRole?`) |
| Canonical way to read the current role | `context.read<AuthRepository>().getCurrentUser()` (async), as in `app_drawer.dart:29-30` |
| A reusable supervisor-authorization port exists (NOT used by this fix) | `AuthRepository.authorizeOverride({supervisorId, pin, totpCode})` — `auth_repository.dart:22`; UI `SupervisorOverrideModal`, used at `sale_view.dart:599-636` |
| Governing POS standard | `docs/nhilos/nhilos_pos_experience_standard_v1.0.md:596` (*navigation visibility follows permission*) and `:1237` (§33 *Permisos y overrides de supervisor*); audit template `nhilos_pos_module_audit_template_v1.0.md` EX-09 (end-to-end authorization) |

### #67 — the fallback

Evidence to be re-verified in this worktree during T2 (the first pass was taken in the main clone on
`feat/ota-b5a-clean`, where `main.dart` numbering already proved to drift — treat those line numbers
as unconfirmed until re-read):
`SaleViewModel.loadExchangeRates()` swallows every failure (`catch (_) { // Fallback to default FX
rates }`), and each value uses `double.tryParse(...) ?? 36.50` / `?? 36.6241`. The printer path has
the same shape (`receipt_document.dart`, `receipt_layout_formatter.dart`).

## Decisions (founder, this session)

1. **Guard style — simple role**: the cashier/waiter *sees* the rate (they need it to quote prices)
   but cannot edit it; only owner/manager edit. No supervisor-PIN override in this work unit.
2. **Scope — FX fields only**: commercial rate + BCN official rate + checkout FX mode. The rest of
   the screen is explicitly out of scope (see follow-up below).

## Follow-up finding (not fixed here, must not be lost)

Perfil del Negocio exposes **16 editable fields** to any PIN-bearing operator, and the DGI block is
among them: `dgi_prefix`, `dgi_current_number`, `dgi_range_start`, `dgi_authorization_code`,
`tax_regime`, `ruc` (`business_profile_view.dart:118-488`, written to `local_configs` by
`business_profile_view_model.dart` `saveConfig`). A cashier can therefore move the **fiscal
consecutive number** — a DGI numbering hazard, not a pricing one. Reported to the founder, explicitly
deferred out of this work unit.

---

## T1 — #66: role guard on the FX fields

Design: **fail-closed**. The guard is enforced in two layers, matching the four enforcement styles
already present in the app (drawer hide / route deny / disabled control / write-method check):

1. **New permission helper** `lib/ui/features/config/config_permissions.dart`, mirroring
   `boh_permissions.dart` exactly: `class ConfigPermission` with `editExchangeRates =
   'config.exchange_rates.edit'` and `all`; `List<String> resolveConfigPermissions(UserRole?)`;
   `bool hasConfigPermission(UserRole?, String)`. Owner/manager → granted; cashier/waiter/null → denied.
2. **View-model holds the role, defaulting to null (= no permission)**:
   `UserRole? _currentUserRole` + `void setCurrentUserRole(UserRole?)` (notifies) +
   `bool get canEditExchangeRates`. Rationale: the view reads the role asynchronously, so an unset
   role must deny, never allow. Both write paths consult it:
   - `saveConfig` drops the FX keys (`commercial_exchange_rate`, `bcn_official_exchange_rate`,
     `checkout_fx_mode`) when `!canEditExchangeRates`, alongside the existing retired-key,
     cloud-managed and blank-sequence skips — without disturbing those.
   - `fetchOfficialBcnRate` is a **direct write path** that bypasses `saveConfig` (`view_model.dart:141-144`);
     it must refuse when `!canEditExchangeRates` instead of writing the BCN rate.
3. **View**: `initState` loads the current user (as `app_drawer.dart:29-30` does) and calls
   `setCurrentUserRole(user?.role)`. Then:
   - `commercial_exchange_rate_field` → `readOnly` when either cloud-managed **or** role-restricted.
   - `bcn_official_exchange_rate` field → `readOnly` when role-restricted.
   - `checkout_fx_mode_dropdown` → `onChanged: null` when role-restricted.
   - BCN "consultar" `IconButton` → `onPressed: null` when role-restricted.
   - Helper text and `prefixIcon` must say **why**, and the two reasons must not be conflated: the
     cloud-managed copy stays as-is ("Definido por la oficina…"); the role-restricted copy states
     that only the owner or a manager can change the rate. When both apply, cloud-managed wins.
     (POS standard AP-17 *disabled dead end*: a disabled control must explain itself.)

### Checks for T1

- `flutter analyze` clean (`apps/pos_app`).
- New `test/ui/features/config/config_permissions_test.dart`: owner/manager/cashier/waiter/null.
- `test/ui/features/config/business_profile_view_model_test.dart`: cashier role → `saveConfig` does
  **not** persist the three FX keys but **does** persist a non-FX key in the same call;
  `fetchOfficialBcnRate` refused for cashier, allowed for owner; unset role denied.
- `test/ui/features/config/business_profile_view_test.dart`: cashier → the three FX controls are
  read-only/disabled and the lock copy explains why; owner → editable. Regression: cloud-managed
  read-only behavior unchanged.
- Full `flutter test` suite on this host: **explicitly not claimed as green**. Two runs produced
  2986/−3 and 2961/−4 with **disjoint** failing file sets, every failure a load-time
  `WebSocketException: Invalid WebSocket upgrade request` from `flutter_tester`, every flaked file
  passing in isolation, and none in the touched surface. Harness flake, not a regression — but CI
  (`flutter test --coverage` on ubuntu-latest) is the only place the full-suite gate is meaningful.
- TDD: RED observed first, on the new and extended tests, then GREEN.

## T1 — outcome

Committed as **`28b31525`** (6 files, +533/−14) on `fix/pos-commercial-fx-integrity`. Test volume
pushed the diff above the 250-350 estimate the plan expected; the production diff is ~135 lines.

What shipped: `config_permissions.dart` (mirrors `boh_permissions.dart`); the view model holds the
signed-in role with a **null = denied** default, drops the three FX keys in `saveConfig`, and refuses
`fetchOfficialBcnRate` before it writes or mutates anything; the view renders the commercial-rate
field, the BCN field, the checkout-FX dropdown and the BCN fetch button inert for a restricted role,
with copy that names the reason and keeps the cloud-managed reason separate (it wins when both
apply).

### The defect the first verification missed

The first verification (`flutter analyze` clean, 76/76 focused, guard holds, scope clean) reported
"safe to commit" with the cached role flagged as a low-confidence, `UNVERIFIED` residual. It was
real, and the parent proved it instead of accepting the report:

`app_drawer.dart:82` pushes `/lock` (a push, so `/config/profile` stays **mounted** underneath) and
`lock_screen_view.dart:58` replaces it with `/home`, so the profile route is never disposed and kept
the **previous** operator's role. A cashier returning to it would have found the fields editable:
the exact hazard #66 closes, through another door. Verified downstream in the SDK: `RouteObserver`
delivers `didPopNext()` to the `previousRoute` on pop, and it does **not** override `didReplace`.

Fix: `_BusinessProfileViewState` now uses the app's **already existing** `appRouteObserver`
(`lib/core/navigation/route_observer.dart:8`, registered at `main.dart:746`) with `RouteAware`,
resubscribing in `didChangeDependencies` and re-resolving the role in `didPopNext()` — mirroring
`sale_view.dart:153-196`, whose own comment names this case. No `main.dart` change, no view-model
change, no new infrastructure. The invariant: the profile route becomes visible again only when the
route above it is popped, and every pop fires `didPopNext`. No `removeRoute`/`removeRouteBelow`/
`popUntil` exists in `lib/` (grep), so no re-exposure path escapes the refresh today.

### Evidence for T1

- Focused: `77/77` across the three test files; `.only` grep clean; `flutter analyze` clean.
- The stale-role test is non-vacuous: real `appRouteObserver` in `navigatorObservers`, a real covering
  push with a runtime role flip and a real pop, then inertness assertions plus
  `findsNWidgets(3)` role copy / `findsNothing` cloud copy. RED was observed first
  (`Expected: true / Actual: <false>` on the commercial-rate field).
- Guard invariants re-verified twice independently, plus `git status` scope (exactly six files, no
  pubspec/lock or generated churn).
- **Not verified**: the real `/lock` → `/home` flow end to end on a device or in an integration run.
  The test reproduces the covering-push/pop mechanics against the same observer wiring `main.dart`
  uses, but `main.dart` itself was never executed.

### Carried-forward findings from T1 (not fixed, must not be lost)

1. `inventory_repository_impl.dart:714` is a second writer of `bcn_official_exchange_rate`. It is
   reachable only through the purchases BOH screen, which sits behind `BohRouteGuard` with the same
   owner/manager allowlist, and the value comes from the backend BCN service — a refresh of the
   official rate, not an operator-authored value. Not a bypass; recorded as a known second writer.
2. `operation_mode` is still editable by a restricted role on the save path (it is not an FX key and
   was outside the approved scope).
3. Validators keep running on the `readOnly` FX fields, as they already did for the cloud-managed
   case; a persisted-and-invalid value would make a cashier's save fail validation. Pre-existing
   parity, not introduced here.

## T2 — #67: never invent the rate

Founder decisions (this session):

1. **Total blocking.** Without a reliable rate the terminal does not sell at all. No "allow and warn".
2. **Both recorded rates must be reliable**, because every invoice persists *and* prints both: the commercial
   rate and the BCN official rate. An absent, corrupt or retracted row is not a rate.
3. The `BCN_OFFICIAL` divergence found during recon is fixed **in this branch** (T2b).

Why this keeps the change small: because the sale is blocked *before* an invoice is built, the
"unknown" state lives only in the sale view-model's gate. The `NOT NULL DEFAULT 36.50` columns, the
entity, the mapper and the sync contract stay exactly as they are — no migration.

### The resolution chain, as it actually is (recon evidence)

| Layer | Evidence | On absent / corrupt / error |
|---|---|---|
| Sale view model | `sale_view_model.dart:596-634` — field defaults, `?? 36.50` / `?? 36.6241`, and `catch (_) { // Fallback to default FX rates }` | keeps the default, **silent** |
| Domain calculator | `invoice_fiscal_calculator.dart:325,339` — `commercialRate > 0 ? commercialRate : 36.50` | fabricates, **silent** |
| Cloud projection | `fiscal_inbox_handler.dart:617` — the snapshot can **delete** `commercial_exchange_rate` | key vanishes, collapses to the default |
| BCN cache | `inventory_repository_impl.dart:764` — `return 36.6241` with no log at all on an absent row | fabricates, **silent** |
| Schema | `migrations.dart:1616,1621` — `NOT NULL DEFAULT 36.6241 / 36.50` | any insert that omits the column |

**Point of no return**: `sales_repository_impl.dart:139 saveSale` persists the view model's **in-memory
snapshot** (`invoice.copyWith(number: …)` → `SalesMapper.toInvoiceEntity`). Nothing re-reads
`local_configs`. Whatever number the view model holds *is* the invoice.

**"Not configured" and "resolution failed" are indistinguishable today**: an absent row, a row deleted
by the cloud, a corrupt value and a DAO exception all collapse into the same literals.

### What is and is not fiscally material (recon evidence)

The **DGI tax base never uses a rate**: `invoice_fiscal_calculator.dart` computes taxable/exempt base
and tax from NIO amounts only; the rate produces `totalUsd` (`:325-326`). The commercial rate *is*
material to `total_usd` (persisted + synced), to USD tender/change conversion, and to the printed
`Tipo de Cambio` / `TOTAL DOLARES` block. Credit notes inherit the origin rates
(`sales_repository_impl.dart:998-1049`, JD-B-002) — with the comment that the constructor defaults
"would fabricate a fiscal fact".

---

## T2a — total blocking on an unreliable rate

Goal: no invoice is ever emitted with a rate the terminal invented, and the operator learns it before
the invoice is built — not after.

1. **Stop fabricating in the sale path.** `sale_view_model.dart` holds the rates as unknown-aware
   state (nullable) instead of `36.50` / `36.6241` field defaults; `loadExchangeRates()` assigns a value
   only when the row exists, parses as a number and is `> 0`. The `double.tryParse(...) ?? 36.50`
   coercions and the swallowing `catch (_) { // Fallback to default FX rates }` go away, and the failure
   reason is recorded so it can be surfaced and diagnosed.
2. **Stop fabricating in the domain calculator.** `invoice_fiscal_calculator.dart:325,339` must not turn
   `<= 0` into a usable rate. Throw a configuration error instead, so the fabrication is impossible even
   for a caller the view model does not control. `SaleViewModel.currentFiscalCalculation` already has
   the established pattern for this: it catches the fiscal configuration error and degrades the *preview*
   ("cart browsing must remain usable before the business configures its DGI regime; finalization still
   fails closed in processSale"). Degrade the preview the same way — NIO figures only, no fabricated USD.
3. **Fail closed at finalization**, *before* any DGI sequence number is consumed. The blocking reason
   must name **who can fix it**: since T1 made the FX fields owner/manager-only, the operator-facing
   message must point at the owner or a manager, never at a screen the cashier cannot edit. Two distinct
   messages, because the two missing rates have different fixes.
4. **Show the state before the sale, not at the end**: the checkout rate label must say the rate is not
   configured instead of printing `TC Comercial: 36.50`.

### Checks for T2a

- RED first, then GREEN, on: absent commercial row → blocked; corrupt value → blocked; `<= 0` → blocked;
  absent BCN row → blocked; DAO exception → blocked; both valid → behavior unchanged.
- The block must be proven to happen **without consuming a fiscal sequence number**.
- The calculator throws instead of fabricating (unit test on the `<= 0` path), and the preview degrades.
- `flutter analyze` clean and the focused suites for the touched surfaces green.

## T2b — persist the rate actually applied

Defect: in `BCN_OFFICIAL` mode the dialogs convert using `vm.activeCheckoutRate`
(`multi_currency_checkout_dialog.dart:61-72`) while the invoice persists `calc.commercialRate`
(`sale_view_model.dart:1376-1377`, fed `commercialRate: _commercialRate` at `:749`). The receipt prints
`invoice.commercialRate` as `Tipo de Cambio` (`receipt_layout_formatter.dart:1604-1619`, `1911-1927`),
so in BCN mode the printed rate is not the rate that was charged, and `total_usd` is computed from the
wrong rate.

The contract already says what we want: `sales_mapper.dart:546-561` (D-6) — *"the fx-rate fiscal
snapshot travels as issued so the cloud mirrors the conversion actually applied at checkout"* — and the
backend credit-note recompute divides by `origin.commercialRate`
(`admin_backend/.../invoices.service.ts:420-425`), which only makes sense for the applied rate.
`owner_dashboard` does no arithmetic on any rate field.

Fix: feed the fiscal calculation the **applied** rate (`activeCheckoutRate`) so
`invoice.commercialRate` carries the conversion actually applied, keeping `bcnOfficialRate` as the BCN
configuration snapshot. `Payment.exchangeRate` must carry the same applied rate on every path — today
only the split path does (`split_payment_calculator.dart:106,149,180`), while
`sale_view_model.dart:1403` and `multi_currency_checkout_dialog.dart:204,213,236` write the configured
commercial rate even though the charged amounts were converted at the active rate. The share-split and
tip dialogs (`sale_view.dart:1676-1680`, `tip_dialog.dart:101`) pass `vm.commercialRate`; in BCN mode
that display disagrees with the charge, so they move to the applied rate too, and the D-5 comment there
must be updated to say why rather than silently contradicted.

### Checks for T2b

- RED first, then GREEN: in `BCN_OFFICIAL` mode the persisted `invoice.commercialRate`, `totalUsd` and
  every `Payment.exchangeRate` equal the BCN rate, and the printed `Tipo de Cambio` matches the charge.
- COMMERCIAL mode stays byte-identical (applied rate == commercial rate there), so every existing
  checkout test must still pass unchanged.
- Document the column semantics where it is read (mapper/entity comment): `commercial_rate` is the
  conversion applied at checkout; the office configuration lives in `local_configs` and the
  business-profile mirror.

### Carried-forward finding for T2b (not fixed here)

`inventory_repository_impl.dart:740-765` `getCachedOfficialBcnRate` returns a hardcoded `36.6241` on an
absent row **with no log at all**, and its single production caller (`purchase_view_model.dart:107`)
pre-fills and **locks** the "Tasa de cambio BCN" field in purchases behind an authoritative-looking
value with no warning. It cannot reach an invoice or a receipt, but it is the same defect in the
purchases path.

## Acceptance for the branch

1. A cashier/waiter cannot change the commercial rate, the BCN rate, or the checkout FX mode by any
   reachable path in the app (field, dropdown, BCN button, save) — and can still read the rate.
2. Owner/manager behavior is byte-identical to today.
3. No invoice is ever emitted with a rate the terminal invented.
4. Each work unit is one commit with its tests, on this branch. Push/PR/merge remain the founder's.

## Ledger

| Task | Status | Evidence |
|---|---|---|
| Feature opened, recon + decisions | done | this document; explorer recon (read-only) |
| T1 (#66) | done | `28b31525` — 6 files, +533/−14; 77/77 focused; `flutter analyze` clean; two independent verification runs; stale-role defect found by the parent and fixed in the same work unit |
| T2 (#67) | pending | — |
