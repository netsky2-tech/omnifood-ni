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

  /// T4: the pre-V1 checkout earn writes a §9.3-conformant row when the
  /// program is attributable (declared EARN requires ticket AND program —
  /// the shape triggers abort otherwise). Unattributable earns stay in the
  /// NULL legacy namespace instead of fabricating an attribution.
  CustomerPointTransaction createEarnTransaction({
    required String customerId,
    required double currentBalance,
    required double netAmount,
    String? invoiceId,
    String? loyaltyProgramId,
  }) {
    final pointsEarned = calculatePointsEarned(netAmount);
    final declared = invoiceId != null && loyaltyProgramId != null;
    // Issue #891 (owner option A): units are the canonical ledger amount.
    // The cloud customer balance sums the fractional points column while
    // the V1 projection sums integer units — the ROW itself is quantized
    // (points mirrors the rounded units) so every balance path agrees.
    // A positive earn below half a point still credits one unit: a
    // declared EARN with NULL/zero units violates the residual §9.3 guard
    // (the insert would ABORT — issue #4 trap).
    final units = pointsEarned.round() == 0 && pointsEarned > 0
        ? 1
        : pointsEarned.round();
    final quantized = units.toDouble();
    return CustomerPointTransaction(
      id: const Uuid().v4(),
      customerId: customerId,
      invoiceId: invoiceId,
      type: PointTransactionType.earn,
      points: quantized,
      balanceAfter: currentBalance + quantized,
      conversionRate: earnRate,
      reason: 'Acumulación por compra',
      createdAt: DateTime.now(),
      syncStatus: SyncStatus.pending,
      loyaltyProgramId: loyaltyProgramId,
      ticketId: invoiceId,
      transactionType: declared ? 'EARN' : null,
      units: units == 0 ? null : units,
      origin: 'POS',
      idempotencyKey: declared
          ? 'loyalty:earn:$loyaltyProgramId:$invoiceId'
          : null,
    );
  }

  /// T4: REDEEM declares its type with the ticket alone (§9.3 requires a
  /// ticket but not a program); the attributed program rides along when the
  /// caller knows it (reward-driven redemption). The idempotency key
  /// discriminates the reward from a legacy-points redemption on the same
  /// ticket (issue #891). Same quantization contract as EARN: a positive
  /// redemption below half a point still debits one unit.
  CustomerPointTransaction createRedeemTransaction({
    required String customerId,
    required double currentBalance,
    required double pointsToRedeem,
    String? invoiceId,
    String? loyaltyProgramId,
    String? rewardId,
  }) {
    final redeemed = pointsToRedeem.abs();
    final magnitude = redeemed.round() == 0 && redeemed > 0 ? 1 : redeemed.round();
    final quantized = magnitude.toDouble();
    return CustomerPointTransaction(
      id: const Uuid().v4(),
      customerId: customerId,
      invoiceId: invoiceId,
      type: PointTransactionType.redeem,
      points: -quantized,
      balanceAfter: currentBalance - quantized,
      conversionRate: redeemRate,
      reason: 'Redención en checkout',
      createdAt: DateTime.now(),
      syncStatus: SyncStatus.pending,
      loyaltyProgramId: loyaltyProgramId,
      ticketId: invoiceId,
      transactionType: invoiceId != null ? 'REDEEM' : null,
      units: magnitude == 0 ? null : -magnitude,
      origin: 'POS',
      idempotencyKey: invoiceId != null
          ? 'loyalty:redeem:$invoiceId:${rewardId ?? 'points'}'
          : null,
    );
  }

  /// T4: ADJUST carries no §9.3 ticket/program shape requirement, so the
  /// type is declared unconditionally (signed units for the sync sender).
  CustomerPointTransaction createAdjustmentTransaction({
    required String customerId,
    required double currentBalance,
    required double pointsDelta,
    required String reason,
    String? invoiceId,
  }) {
    // Issue #891: same quantization contract — a fractional delta still
    // moves one signed unit (a declared ADJUST with NULL/zero units would
    // abort against the residual §9.3 guard).
    final units = pointsDelta.round() == 0 && pointsDelta != 0
        ? (pointsDelta > 0 ? 1 : -1)
        : pointsDelta.round();
    final quantized = units.toDouble();
    return CustomerPointTransaction(
      id: const Uuid().v4(),
      customerId: customerId,
      invoiceId: invoiceId,
      type: PointTransactionType.adjust,
      points: quantized,
      balanceAfter: currentBalance + quantized,
      conversionRate: earnRate,
      reason: reason,
      createdAt: DateTime.now(),
      syncStatus: SyncStatus.pending,
      transactionType: 'ADJUST',
      units: units == 0 ? null : units,
      origin: 'POS',
    );
  }
}
