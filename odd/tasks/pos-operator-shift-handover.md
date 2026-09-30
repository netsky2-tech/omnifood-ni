# POS Operator Shift Handover (Cambio de Operador)

Authorised 2026-09-30 after the SOHO local E2E relink session surfaced that changing the
operator on a terminal required destroying the device session.

## Product decisions (from the user, not inferred)

| # | Decision | Consequence |
|---|---|---|
| 1 | A handover must **force closing the outgoing cash shift** first | The switch is guarded by `SaleViewModel.activeSession != null`, not just a convenience route |
| 2 | Authorization is the **incoming operator's PIN only** | No outgoing PIN, no supervisor override |
| 3 | Build **only the navigation gap** now; the full handover feature is documented for later | Remaining scope lives in `docs/plans/sales/sales_cash_roadmap.md` → Batch 7 |

## Architectural constraint discovered (durable)

The POS conflates two auth layers:

- **Device / tenant auth** — admin JWT. Enables cloud sync and the tenant binding.
- **Operator auth** — staff PIN via `AuthRepository.loginOffline()`
  (`lib/data/repositories/auth_repository_impl.dart:482-510`), which sets only
  `_currentUser` and touches no token.

`logout()` (`auth_repository_impl.dart:621-635`) clears `_accessToken`, removes the Dio
`Authorization` header and deletes `access_token` from secure storage. Before this work the
only route to `/lock` was the login screen (`login_view.dart:84,100`), so "change operator"
necessarily meant "log the device out".

**Rule going forward: no operator-change path may call `logout()` or touch the device token.**

## Why the pieces were already available

- `LockScreenViewModel` + `/lock` route already do user selection + offline PIN, and are
  already registered in the root DI (`main.dart:416`, route `main.dart:717`).
- `/lock` on success does `pushReplacementNamed('/home')` (`lock_screen_view.dart:53-62`) and
  `/home` is `SaleView` (`main.dart:718`), so the sales screen rebuilds and
  `checkActiveSession()` (`sale_view_model.dart:1006`) loads the **new** operator's own shift,
  scoped by `getActiveSessionForUserAndTerminal` (issue #552). The desired handover semantics
  came for free; only the entry point was missing.
- `AppDrawer` is shared by `sale_view.dart:485` and
  `ui/features/inventory/boh/boh_navigation_shell_view.dart:26`; `SaleViewModel` is provided at
  the root `MultiProvider` (`main.dart:509`) so the guard read is safe in both hosts.

## Tasks

- [x] **T1 — Drawer entry `Cambiar operador` with shift guard.**
  Delegated to `gentle-ai-worker` (TDD, RED observed first). Surfaces:
  `lib/ui/widgets/app_drawer.dart`, `test/ui/widgets/app_drawer_test.dart`.
  Behaviour: open shift → Spanish actionable copy + route to `/sales/cash`, never `/lock`;
  no open shift → push `/lock`, never `logout()`. Existing `CERRAR SESIÓN` unchanged.
  <!-- commit: pending record -->

- [ ] **T2 — Record Batch 7 scope in the sales/cash roadmap.**
  Done as part of this session: `docs/plans/sales/sales_cash_roadmap.md` gained
  *Batch 7: Shift Handover (Cambio de Operador)* with the delivered guard separated from the
  remaining blind-count / lineage / responsibility work. Numbering note: 4-6 are taken by §6's
  deferred backlog; the pre-existing §9-vs-§6 "Batch 6" title conflict is flagged, not fixed.

- [ ] **T3 — Verify on device.** After the APK carrying T1 is installed: switch operator with a
  shift open (must be refused), close the shift, switch again (must land on sales as the new
  operator), and confirm sync still works with **no** re-login — i.e. the device token survived.

## Related but distinct

The same session found and fixed a separate defect that made COMPOUND products unsellable:
inbound user-delta pulls erased `users.tenant_id`, downgrading checkout from the frozen
`SALE_TIME_V1` authority path to the legacy path. Tracked in
`odd/tasks/soho-local-e2e-relink.md`; fixed in `ed7a3d90` (backend emits `tenantId`) and
`88f81881` (POS consumes + heals NULL rows). Not part of this feature, but it is why the
operator's local `tenant_id` matters to auth-adjacent flows.
