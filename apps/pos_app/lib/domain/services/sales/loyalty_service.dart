import 'package:uuid/uuid.dart';
import '../../models/customer/customer.dart';
import '../../models/sales/customer_point_transaction.dart';
import '../../models/sales/invoice.dart';

class RedemptionValidationResult {
  final bool isValid;
  final double discountAmount;
  final String? errorMessage;

  const RedemptionValidationResult({
    required this.isValid,
    required this.discountAmount,
    this.errorMessage,
  });

  factory RedemptionValidationResult.success(double discountAmount) =>
      RedemptionValidationResult(
        isValid: true,
        discountAmount: discountAmount,
      );

  factory RedemptionValidationResult.failure(String errorMessage) =>
      RedemptionValidationResult(
        isValid: false,
        discountAmount: 0.0,
        errorMessage: errorMessage,
      );
}

class LoyaltyService {
  final double earnRate; // 1 punto por cada (1 / earnRate) unidades monetarias
  final double redeemRate; // Descuento monetario por cada punto
  final double minPointsToRedeem;

  const LoyaltyService({
    this.earnRate = 0.1,
    this.redeemRate = 0.1,
    this.minPointsToRedeem = 10.0,
  });

  double calculatePointsEarned(double netAmount) {
    if (netAmount <= 0) return 0.0;
    return netAmount * earnRate;
  }

  double calculateDiscountFromPoints(double points) {
    if (points <= 0) return 0.0;
    return points * redeemRate;
  }

  double calculatePointsRequiredForDiscount(double discountAmount) {
    if (discountAmount <= 0 || redeemRate <= 0) return 0.0;
    return discountAmount / redeemRate;
  }

  RedemptionValidationResult validateRedemption({
    required Customer customer,
    required double pointsToRedeem,
    required double orderTotal,
  }) {
    if (pointsToRedeem < minPointsToRedeem) {
      return RedemptionValidationResult.failure(
        'El monto mínimo para redimir es de ${minPointsToRedeem.toStringAsFixed(0)} puntos.',
      );
    }

    if (customer.pointsBalance < pointsToRedeem) {
      return RedemptionValidationResult.failure(
        'Saldo de puntos insuficiente. Saldo disponible: ${customer.pointsBalance.toStringAsFixed(0)} pts.',
      );
    }

    final discountAmount = calculateDiscountFromPoints(pointsToRedeem);
    if (discountAmount > orderTotal) {
      return RedemptionValidationResult.failure(
        'El descuento por puntos (C\$ ${discountAmount.toStringAsFixed(2)}) no puede exceder el total de la orden (C\$ ${orderTotal.toStringAsFixed(2)}).',
      );
    }

    return RedemptionValidationResult.success(discountAmount);
  }

  CustomerPointTransaction createEarnTransaction({
    required String customerId,
    required double currentBalance,
    required double netAmount,
    String? invoiceId,
  }) {
    final pointsEarned = calculatePointsEarned(netAmount);
    return CustomerPointTransaction(
      id: const Uuid().v4(),
      customerId: customerId,
      invoiceId: invoiceId,
      type: PointTransactionType.earn,
      points: pointsEarned,
      balanceAfter: currentBalance + pointsEarned,
      conversionRate: earnRate,
      reason: 'Acumulación por compra',
      createdAt: DateTime.now(),
      syncStatus: SyncStatus.pending,
    );
  }

  CustomerPointTransaction createRedeemTransaction({
    required String customerId,
    required double currentBalance,
    required double pointsToRedeem,
    String? invoiceId,
  }) {
    return CustomerPointTransaction(
      id: const Uuid().v4(),
      customerId: customerId,
      invoiceId: invoiceId,
      type: PointTransactionType.redeem,
      points: -pointsToRedeem.abs(),
      balanceAfter: currentBalance - pointsToRedeem.abs(),
      conversionRate: redeemRate,
      reason: 'Redención en checkout',
      createdAt: DateTime.now(),
      syncStatus: SyncStatus.pending,
    );
  }

  CustomerPointTransaction createAdjustmentTransaction({
    required String customerId,
    required double currentBalance,
    required double pointsDelta,
    required String reason,
    String? invoiceId,
  }) {
    return CustomerPointTransaction(
      id: const Uuid().v4(),
      customerId: customerId,
      invoiceId: invoiceId,
      type: PointTransactionType.adjust,
      points: pointsDelta,
      balanceAfter: currentBalance + pointsDelta,
      conversionRate: earnRate,
      reason: reason,
      createdAt: DateTime.now(),
      syncStatus: SyncStatus.pending,
    );
  }
}
