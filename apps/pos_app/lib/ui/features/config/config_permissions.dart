import 'package:pos_app/domain/models/user.dart';

/// T1 (#66): permissions for the business-profile configuration surface.
/// Mirrors the BOH permission helper exactly in style: a constants class
/// plus `resolve*` / `has*` functions over a nullable [UserRole].
class ConfigPermission {
  /// May write the commercial exchange rate, the BCN official rate and the
  /// checkout FX mode. The cashier/waiter must still SEE those values (they
  /// quote prices), but can never change them.
  static const editExchangeRates = 'config.exchange_rates.edit';

  static const all = <String>[editExchangeRates];
}

/// Fail-closed: owner/manager are granted; cashier, waiter and any unset
/// role are denied.
List<String> resolveConfigPermissions(UserRole? role) {
  switch (role) {
    case UserRole.owner:
    case UserRole.manager:
      return ConfigPermission.all;
    case UserRole.cashier:
    case UserRole.waiter:
    case null:
      return const <String>[];
  }
}

bool hasConfigPermission(UserRole? role, String permission) =>
    resolveConfigPermissions(role).contains(permission);
