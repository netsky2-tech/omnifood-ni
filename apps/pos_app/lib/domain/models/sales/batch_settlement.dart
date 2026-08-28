import 'package:freezed_annotation/freezed_annotation.dart';

part 'batch_settlement.freezed.dart';
part 'batch_settlement.g.dart';

@freezed
class BatchSettlement with _$BatchSettlement {
  const factory BatchSettlement({
    required String id,
    required String batchNumber,
    required String terminalId,
    @Default('BAC') String bankPos,
    @Default(0) int totalTransactions,
    @Default(0.0) double totalAmountNio,
    @Default(0.0) double totalAmountUsd,
    @Default('OPEN') String status, // 'OPEN', 'SETTLED', 'FORCE_CLOSED'
    required DateTime openedAt,
    DateTime? settledAt,
    String? sessionId,
    String? settledByUserId,
    String? notes,
  }) = _BatchSettlement;

  factory BatchSettlement.fromJson(Map<String, dynamic> json) =>
      _$BatchSettlementFromJson(json);
}

extension BatchSettlementX on BatchSettlement {
  bool get isSettled => status == 'SETTLED';
  bool get isOpen => status == 'OPEN';
}
