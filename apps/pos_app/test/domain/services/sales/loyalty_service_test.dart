import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/customer/customer.dart';
import 'package:pos_app/domain/models/sales/customer_point_transaction.dart';
import 'package:pos_app/domain/services/sales/loyalty_service.dart';

void main() {
  late LoyaltyService loyaltyService;

  setUp(() {
    // Configuración por defecto:
    // 1 punto por cada C$ 10 netos gastados (earnRate = 0.1)
    // 1 punto = C$ 0.10 de descuento (100 puntos = C$ 10 descuento, redeemRate = 0.1)
    loyaltyService = const LoyaltyService(
      earnRate: 0.1, // 1 pt por cada 10 NIO
      redeemRate: 0.1, // 1 pt = 0.10 NIO
      minPointsToRedeem: 10.0,
    );
  });

  group('LoyaltyService - Points Accumulation (EARN) Triangulation', () {
    test('acumula 0 puntos si el monto neto es <= 0', () {
      expect(loyaltyService.calculatePointsEarned(0.0), equals(0.0));
      expect(loyaltyService.calculatePointsEarned(-50.0), equals(0.0));
    });

    test('calcula puntos acumulados según tasa de conversión (C\$100 -> 10 pts, C\$250 -> 25 pts)', () {
      expect(loyaltyService.calculatePointsEarned(100.0), equals(10.0));
      expect(loyaltyService.calculatePointsEarned(250.0), equals(25.0));
      expect(loyaltyService.calculatePointsEarned(55.0), equals(5.5));
    });

    test('aplica tasa personalizada si se provee en la configuración', () {
      const customService = LoyaltyService(earnRate: 0.2, redeemRate: 0.1); // 2 pts por cada 10 NIO
      expect(customService.calculatePointsEarned(100.0), equals(20.0));
    });
  });

  group('LoyaltyService - Points Redemption (REDEEM) Triangulation', () {
    test('calcula descuento en dinero correspondiente a los puntos a redimir', () {
      // 100 puntos -> C$ 10.0
      expect(loyaltyService.calculateDiscountFromPoints(100.0), equals(10.0));
      // 250 puntos -> C$ 25.0
      expect(loyaltyService.calculateDiscountFromPoints(250.0), equals(25.0));
    });

    test('calcula puntos necesarios para cubrir un monto específico en dinero', () {
      // C$ 10.0 -> 100 puntos
      expect(loyaltyService.calculatePointsRequiredForDiscount(10.0), equals(100.0));
      // C$ 35.5 -> 355 puntos
      expect(loyaltyService.calculatePointsRequiredForDiscount(35.5), equals(355.0));
    });

    test('valida exitosamente redención cuando el cliente tiene saldo suficiente', () {
      const customer = Customer(
        id: 'cust-1',
        name: 'Carlos Mendoza',
        pointsBalance: 150.0,
      );

      final validation = loyaltyService.validateRedemption(
        customer: customer,
        pointsToRedeem: 100.0,
        orderTotal: 200.0,
      );

      expect(validation.isValid, isTrue);
      expect(validation.discountAmount, equals(10.0));
      expect(validation.errorMessage, isNull);
    });

    test('rechaza redención si el cliente no tiene puntos suficientes', () {
      const customer = Customer(
        id: 'cust-1',
        name: 'Carlos Mendoza',
        pointsBalance: 50.0,
      );

      final validation = loyaltyService.validateRedemption(
        customer: customer,
        pointsToRedeem: 100.0,
        orderTotal: 200.0,
      );

      expect(validation.isValid, isFalse);
      expect(validation.errorMessage, contains('Saldo de puntos insuficiente'));
    });

    test('rechaza redención si los puntos no alcanzan el mínimo requerido', () {
      const customer = Customer(
        id: 'cust-1',
        name: 'Carlos Mendoza',
        pointsBalance: 50.0,
      );

      final validation = loyaltyService.validateRedemption(
        customer: customer,
        pointsToRedeem: 5.0, // Mínimo configurado es 10
        orderTotal: 200.0,
      );

      expect(validation.isValid, isFalse);
      expect(validation.errorMessage, contains('mínimo'));
    });

    test('rechaza redención si el descuento por puntos excede el total de la orden', () {
      const customer = Customer(
        id: 'cust-1',
        name: 'Carlos Mendoza',
        pointsBalance: 1000.0,
      );

      // 1000 puntos = C$ 100 descuento, pero la orden es de C$ 50
      final validation = loyaltyService.validateRedemption(
        customer: customer,
        pointsToRedeem: 1000.0,
        orderTotal: 50.0,
      );

      expect(validation.isValid, isFalse);
      expect(validation.errorMessage, contains('exceder el total'));
    });
  });

  group('LoyaltyService - Transaction Building & Balances', () {
    test('construye transacción de acumulación (EARN) con nuevo balance', () {
      const customer = Customer(
        id: 'c-1',
        name: 'Lucía Gómez',
        pointsBalance: 100.0,
      );

      final tx = loyaltyService.createEarnTransaction(
        customerId: customer.id,
        currentBalance: customer.pointsBalance,
        netAmount: 200.0, // Gana 20 pts
        invoiceId: 'inv-101',
      );

      expect(tx.customerId, equals('c-1'));
      expect(tx.type, equals(PointTransactionType.earn));
      expect(tx.points, equals(20.0));
      expect(tx.balanceAfter, equals(120.0));
      expect(tx.invoiceId, equals('inv-101'));
    });

    test('construye transacción de redención (REDEEM) con saldo debitado', () {
      const customer = Customer(
        id: 'c-1',
        name: 'Lucía Gómez',
        pointsBalance: 150.0,
      );

      final tx = loyaltyService.createRedeemTransaction(
        customerId: customer.id,
        currentBalance: customer.pointsBalance,
        pointsToRedeem: 50.0, // Redime 50 pts
        invoiceId: 'inv-102',
      );

      expect(tx.customerId, equals('c-1'));
      expect(tx.type, equals(PointTransactionType.redeem));
      expect(tx.points, equals(-50.0)); // Débito
      expect(tx.balanceAfter, equals(100.0));
      expect(tx.invoiceId, equals('inv-102'));
    });

    test('construye transacción de ajuste/reversión (ADJUST) al anular factura', () {
      const customer = Customer(
        id: 'c-1',
        name: 'Lucía Gómez',
        pointsBalance: 120.0,
      );

      // Factura anulada había otorgado 20 pts -> se revierten restando 20 pts
      final tx = loyaltyService.createAdjustmentTransaction(
        customerId: customer.id,
        currentBalance: customer.pointsBalance,
        pointsDelta: -20.0,
        reason: 'Anulación de Factura inv-101',
        invoiceId: 'inv-101',
      );

      expect(tx.type, equals(PointTransactionType.adjust));
      expect(tx.points, equals(-20.0));
      expect(tx.balanceAfter, equals(100.0));
    });
  });
}
