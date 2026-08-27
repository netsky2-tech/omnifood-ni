import 'package:freezed_annotation/freezed_annotation.dart';
import 'invoice.dart'; // For SyncStatus

part 'customer_point_transaction.freezed.dart';
part 'customer_point_transaction.g.dart';

enum PointTransactionType {
  earn,
  redeem,
  adjust,
}

@freezed
class CustomerPointTransaction with _$CustomerPointTransaction {
  const factory CustomerPointTransaction({
    required String id,
    required String customerId,
    String? invoiceId,
    required PointTransactionType type,
    required double points,
    required double balanceAfter,
    @Default(0.1) double conversionRate,
    String? reason,
    required DateTime createdAt,
    @Default(SyncStatus.pending) SyncStatus syncStatus,
  }) = _CustomerPointTransaction;

  factory CustomerPointTransaction.fromJson(Map<String, dynamic> json) =>
      _$CustomerPointTransactionFromJson(json);
}
