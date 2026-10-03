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
- Full `flutter test` suite green (CI gate) + `build_runner` codegen unchanged.
- TDD: RED observed first, on the new and extended tests, then GREEN.

## T2 — #67: never invent the rate

To be specified after T1 lands: re-verify the fallback chain in this worktree (`SaleViewModel`,
printer/receipt paths), decide fail-closed behavior and its operator-visible surface, then fix with
RED-first tests. No open question is carried into implementation without evidence.

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
| T1 (#66) | in progress | — |
| T2 (#67) | pending | — |
