import 'package:pos_app/domain/models/user.dart';

class BohPermission {
  static const shell = 'inventory.boh.shell';
  static const purchasesView = 'inventory.boh.purchases.view';
  static const productionView = 'inventory.boh.production.view';
  static const countsView = 'inventory.boh.counts.view';
  static const alertsView = 'inventory.boh.alerts.view';
  static const kardexView = 'inventory.boh.kardex.view';
  static const recipesView = 'inventory.boh.recipes.view';
  static const shrinkageView = 'inventory.boh.shrinkage.view';

  static const all = <String>[
    shell,
    purchasesView,
    productionView,
    countsView,
    alertsView,
    kardexView,
    recipesView,
    shrinkageView,
  ];
}

List<String> resolveBohPermissions(UserRole? role) {
  switch (role) {
    case UserRole.owner:
    case UserRole.manager:
      return BohPermission.all;
    case UserRole.cashier:
    case UserRole.waiter:
    case null:
      return const <String>[];
  }
}

bool hasBohPermission(UserRole? role, String permission) =>
    resolveBohPermissions(role).contains(permission);

bool canAccessAnyBoh(UserRole? role) => resolveBohPermissions(role).isNotEmpty;
