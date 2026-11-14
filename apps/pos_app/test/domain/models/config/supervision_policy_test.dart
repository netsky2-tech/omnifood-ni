import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/supervision_policy.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';

void main() {
  group('SupervisionPolicy - Presets por Tipo de Negocio', () {
    test('foodparkQsr tiene Corte X libre y cierre ágil, con arqueo ciego protegido por defecto', () {
      final policy = SupervisionPolicy.forOperationMode(TenantOperationMode.foodparkQsr);

      expect(policy.blindCountEnabled, isTrue,
          reason: 'Foodpark/QSR protege saldos esperados por defecto');
      expect(policy.supervisorRequiredForPartialXReport, isFalse,
          reason: 'Foodpark/QSR tiene Corte X libre sin trabas de PIN');
      expect(policy.supervisorRequiredForVoid, isFalse,
          reason: 'Foodpark/QSR permite anular facturas sin PIN de supervisor');
      expect(policy.selfAuthorizationAllowedCloseBox, isTrue);
      expect(policy.selfAuthorizationAllowedCashDrawer, isTrue);
      expect(policy.selfAuthorizationAllowedManualDiscount, isTrue);

      // En QSR la anulación no exige supervisor a nadie
      expect(policy.requiresSupervisorForVoid('CASHIER'), isFalse);
      expect(policy.requiresSupervisorForVoid('MANAGER'), isFalse);

      // Por defecto el cajero NO ve los saldos esperados en gaveta
      expect(policy.canViewExpectedCash('CASHIER'), isFalse);
      expect(policy.canViewExpectedCash('WAITER'), isFalse);
      // El manager y owner siempre ven los saldos
      expect(policy.canViewExpectedCash('MANAGER'), isTrue);
      expect(policy.canViewExpectedCash('OWNER'), isTrue);

      // Si el manager decide habilitar la visibilidad de saldos para cajeros,
      // desactiva blindCountEnabled y el cajero los ve de inmediato
      final customPolicy = policy.copyWith(blindCountEnabled: false);
      expect(customPolicy.canViewExpectedCash('CASHIER'), isTrue);
    });

    test('restaurant impone control estricto (arqueo ciego y Corte X supervisado)', () {
      final policy = SupervisionPolicy.forOperationMode(TenantOperationMode.restaurant);

      expect(policy.blindCountEnabled, isTrue,
          reason: 'Restaurante requiere arqueo ciego para cajeros');
      expect(policy.supervisorRequiredForPartialXReport, isTrue,
          reason: 'Restaurante requiere PIN de supervisor para ver Corte X');
      expect(policy.supervisorRequiredForVoid, isTrue,
          reason: 'Restaurante requiere PIN de supervisor para anular facturas');
      expect(policy.selfAuthorizationAllowedCloseBox, isTrue,
          reason: 'El cierre fiscal nunca se bloquea para evitar un dead-end');
      expect(policy.selfAuthorizationAllowedCashDrawer, isFalse);

      // En restaurante, el cajero REQUIERE supervisor para anular
      expect(policy.requiresSupervisorForVoid('CASHIER'), isTrue);
      expect(policy.requiresSupervisorForVoid('WAITER'), isTrue);
      expect(policy.requiresSupervisorForVoid(null), isTrue);

      // El manager NO requiere supervisor externo para anular porque ya es autorizador
      expect(policy.requiresSupervisorForVoid('MANAGER'), isFalse);
      expect(policy.requiresSupervisorForVoid('OWNER'), isFalse);

      // En restaurante, el cajero NO ve los saldos esperados
      expect(policy.canViewExpectedCash('CASHIER'), isFalse);
      expect(policy.canViewExpectedCash('WAITER'), isFalse);
      expect(policy.canViewExpectedCash(null), isFalse);

      // Solo los roles autorizadores ven los saldos esperados
      expect(policy.canViewExpectedCash('MANAGER'), isTrue);
      expect(policy.canViewExpectedCash('OWNER'), isTrue);
    });

    test('hybrid combina soporte de mesas con arqueo ciego', () {
      final policy = SupervisionPolicy.forOperationMode(TenantOperationMode.hybrid);

      expect(policy.blindCountEnabled, isTrue);
      expect(policy.supervisorRequiredForPartialXReport, isTrue);
      expect(policy.supervisorRequiredForVoid, isTrue);
      expect(policy.selfAuthorizationAllowedCloseBox, isTrue);

      expect(policy.canViewExpectedCash('CASHIER'), isFalse);
      expect(policy.canViewExpectedCash('MANAGER'), isTrue);
      expect(policy.requiresSupervisorForVoid('CASHIER'), isTrue);
      expect(policy.requiresSupervisorForVoid('MANAGER'), isFalse);
    });
  });

  group('SupervisionPolicy - Parseo y Compatibilidad Legacy', () {
    test('tryParse lee correctamente una política completa con arqueo ciego', () {
      final raw = {
        'authorizingRoles': ['MANAGER', 'OWNER', 'ENCARGADO'],
        'selfAuthorizationAllowedCloseBox': true,
        'selfAuthorizationAllowedCashDrawer': false,
        'selfAuthorizationAllowedManualDiscount': false,
        'supervisorRequiredForModifierQuantity': false,
        'blindCountEnabled': true,
        'supervisorRequiredForPartialXReport': true,
        'supervisorRequiredForVoid': true,
      };

      final policy = SupervisionPolicy.tryParse(raw);
      expect(policy, isNotNull);
      expect(policy!.blindCountEnabled, isTrue);
      expect(policy.supervisorRequiredForPartialXReport, isTrue);
      expect(policy.supervisorRequiredForVoid, isTrue);
      expect(policy.authorizes('ENCARGADO'), isTrue);
      expect(policy.canViewExpectedCash('ENCARGADO'), isTrue);
      expect(policy.canViewExpectedCash('CASHIER'), isFalse);
      expect(policy.requiresSupervisorForVoid('ENCARGADO'), isFalse);
      expect(policy.requiresSupervisorForVoid('CASHIER'), isTrue);
    });

    test('tryParse soporta payloads legacy que omiten blindCountEnabled sin fallar', () {
      final legacyRaw = {
        'authorizingRoles': ['MANAGER', 'OWNER'],
        'selfAuthorizationAllowedCloseBox': true,
        'selfAuthorizationAllowedCashDrawer': true,
        'selfAuthorizationAllowedManualDiscount': true,
        'supervisorRequiredForModifierQuantity': false,
      };

      final policy = SupervisionPolicy.tryParse(legacyRaw);
      expect(policy, isNotNull);
      expect(policy!.blindCountEnabled, isFalse,
          reason: 'Legacy payloads default a false con tolerancia');
      expect(policy.supervisorRequiredForPartialXReport, isFalse);
      expect(policy.supervisorRequiredForVoid, isFalse);
    });

    test('tryParse rechaza datos corruptos retornando null limpiamente', () {
      expect(SupervisionPolicy.tryParse('invalid string'), isNull);
      expect(SupervisionPolicy.tryParse({'authorizingRoles': 'not-a-list'}), isNull);
    });
  });
}
