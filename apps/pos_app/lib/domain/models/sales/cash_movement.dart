import 'package:freezed_annotation/freezed_annotation.dart';

part 'cash_movement.freezed.dart';
part 'cash_movement.g.dart';

enum CashMovementType {
  @JsonValue('CASH_IN')
  cashIn,
  @JsonValue('CASH_OUT')
  cashOut,
  @JsonValue('PETTY_CASH')
  pettyCash,
  @JsonValue('SAFE_DROP')
  safeDrop,
}

@freezed
class CashMovement with _$CashMovement {
  const factory CashMovement({
    required String id,
    required String shiftId,
    @Default('default-terminal') String terminalId,
    required CashMovementType type,
    required double amountNio,
    @Default(0.0) double amountUsd,
    required String reason,
    String? authorizedByUserId,
    required DateTime timestamp,
    @Default('pending') String syncStatus,
  }) = _CashMovement;

  factory CashMovement.fromJson(Map<String, dynamic> json) =>
      _$CashMovementFromJson(json);
}
