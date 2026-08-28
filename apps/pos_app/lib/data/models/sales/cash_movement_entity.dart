import 'package:floor/floor.dart';

@Entity(tableName: 'cash_movements')
class CashMovementEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'shift_id')
  final String shiftId;
  @ColumnInfo(name: 'terminal_id')
  final String terminalId;
  @ColumnInfo(name: 'type')
  final String type; // 'CASH_IN', 'CASH_OUT', 'PETTY_CASH', 'SAFE_DROP'
  @ColumnInfo(name: 'amount_nio')
  final double amountNio;
  @ColumnInfo(name: 'amount_usd')
  final double amountUsd;
  @ColumnInfo(name: 'reason')
  final String reason;
  @ColumnInfo(name: 'authorized_by_user_id')
  final String? authorizedByUserId;
  @ColumnInfo(name: 'timestamp')
  final int timestamp;
  @ColumnInfo(name: 'sync_status')
  final String syncStatus;

  CashMovementEntity({
    required this.id,
    required this.shiftId,
    required this.terminalId,
    required this.type,
    required this.amountNio,
    this.amountUsd = 0.0,
    required this.reason,
    this.authorizedByUserId,
    required this.timestamp,
    this.syncStatus = 'pending',
  });
}
