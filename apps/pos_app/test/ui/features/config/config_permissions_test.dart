import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/ui/features/config/config_permissions.dart';

void main() {
  group('T1 #66: ConfigPermission / resolveConfigPermissions', () {
    test('owner is granted config.exchange_rates.edit', () {
      expect(
        resolveConfigPermissions(UserRole.owner),
        contains(ConfigPermission.editExchangeRates),
      );
      expect(
        hasConfigPermission(UserRole.owner, ConfigPermission.editExchangeRates),
        isTrue,
      );
    });

    test('manager is granted config.exchange_rates.edit', () {
      expect(
        resolveConfigPermissions(UserRole.manager),
        contains(ConfigPermission.editExchangeRates),
      );
      expect(
        hasConfigPermission(UserRole.manager, ConfigPermission.editExchangeRates),
        isTrue,
      );
    });

    test('cashier is denied config.exchange_rates.edit', () {
      expect(
        resolveConfigPermissions(UserRole.cashier),
        isNot(contains(ConfigPermission.editExchangeRates)),
      );
      expect(
        hasConfigPermission(UserRole.cashier, ConfigPermission.editExchangeRates),
        isFalse,
      );
    });

    test('waiter is denied config.exchange_rates.edit', () {
      expect(
        resolveConfigPermissions(UserRole.waiter),
        isNot(contains(ConfigPermission.editExchangeRates)),
      );
      expect(
        hasConfigPermission(UserRole.waiter, ConfigPermission.editExchangeRates),
        isFalse,
      );
    });

    test('null role is denied (fail closed)', () {
      expect(
        resolveConfigPermissions(null),
        isNot(contains(ConfigPermission.editExchangeRates)),
      );
      expect(
        hasConfigPermission(null, ConfigPermission.editExchangeRates),
        isFalse,
      );
    });

    test('all contains exactly the FX edit permission', () {
      expect(ConfigPermission.all, hasLength(1));
      expect(ConfigPermission.all, contains(ConfigPermission.editExchangeRates));
      expect(ConfigPermission.editExchangeRates, 'config.exchange_rates.edit');
    });
  });
}
