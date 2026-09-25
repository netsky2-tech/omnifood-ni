# Issue #560 / #567 — Activation UX Cluster (Composed messages & Terminal ID)

Status: in progress · Branch: `fix/560-567-activation-ux` (worktree `issue-560-567-activation-ux`, base `main` @ `663d8414`)

## Problem

The `#587` app-wide label sweep deliberately excluded dynamic composed messages and UUIDs. The activation flow still surfaces English exception strings (like `Activation phase refused: ...` and `Finalizer communication error: ...`), config descriptions (`Printer driver type`), and the login screen incorrectly displays "Aprovisionamiento Inicial del Terminal" even for regular cashiers. Additionally, the `link_terminal_view` truncates the terminal ID, making it impossible for owners to copy the full correlation UUID required for dashboard linking.

## Decisions

- **D1 — Composed messages translation**: Translate English interpolations and exception strings generated in the domain/runner layer directly at their composition sites. Remove internal phase names from the user-facing text.
- **D2 — Full correlation ID (#567)**: The `link_terminal_view` will display the full, untruncated terminal ID. It must be wrapped in `SelectableText` so it can be easily copied.
- **D3 — Login screen title**: Change the hardcoded "Aprovisionamiento Inicial del Terminal" on `login_view.dart` to a standard "Iniciar Sesión".
- **D4 — Config descriptions**: Translate metadata strings in `printer_config_service.dart`.

## Edit Surfaces

- `apps/pos_app/lib/ui/features/auth/views/login_view.dart`
- `apps/pos_app/lib/ui/features/auth/views/link_terminal_view.dart`
- `apps/pos_app/lib/ui/features/config/activation/activation_session_view_model.dart`
- `apps/pos_app/lib/data/services/activation_session_service.dart`
- `apps/pos_app/lib/data/services/activation_reconnect_sync_runner.dart`
- `apps/pos_app/lib/domain/services/config/printer_config_service.dart`

## Acceptance Criteria

1. No English composed messages leak into the UI from the activation runners.
2. The linking screen shows a full, selectable terminal UUID.
3. The login view shows "Iniciar Sesión".
4. `flutter analyze` and `flutter test` remain green.
