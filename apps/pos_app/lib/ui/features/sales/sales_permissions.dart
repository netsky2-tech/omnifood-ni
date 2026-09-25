import 'package:pos_app/domain/models/user.dart';

/// D-15/D-10: void permissions are a policy knob, not a role hardcode. The
/// resolver maps roles today; revoking the capability per employee tomorrow
/// is a configuration concern (a per-employee override layer) and
/// deliberately out of scope. Mirrors the BohPermission shape.
class SalesPermission {
  /// SOHO V1 self-void under the three-predicate rule (D-15).
  static const voidOwnCurrentShiftSale = 'sales.void.own_current_shift';

  /// The owner/manager broader gate: void any invoice, bypassing the shift
  /// and date predicates while keeping the audit duty (D-10/D-11).
  static const voidAnyInvoice = 'sales.void.any';

  static const all = <String>[voidOwnCurrentShiftSale, voidAnyInvoice];
}

List<String> resolveSalesPermissions(UserRole? role) {
  switch (role) {
    case UserRole.owner:
    case UserRole.manager:
      return const <String>[SalesPermission.voidAnyInvoice];
    case UserRole.cashier:
      return const <String>[SalesPermission.voidOwnCurrentShiftSale];
    case UserRole.waiter:
    case null:
      return const <String>[];
  }
}

bool hasSalesPermission(UserRole? role, String permission) =>
    resolveSalesPermissions(role).contains(permission);
