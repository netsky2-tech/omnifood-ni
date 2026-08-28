import 'package:floor/floor.dart';

@Entity(tableName: 'kardex_recalculate_queue')
class KardexRecalculateQueueEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'insumo_id')
  final String insumoId;
  @ColumnInfo(name: 'origin_movement_id')
  final String originMovementId;
  @ColumnInfo(name: 'trigger_movement_id')
  final String triggerMovementId;
  final String status;
  final int attempts;
  @ColumnInfo(name: 'claimed_at')
  final String? claimedAt;
  @ColumnInfo(name: 'last_error')
  final String? lastError;
  @ColumnInfo(name: 'created_at')
  final String createdAt;
  @ColumnInfo(name: 'updated_at')
  final String updatedAt;

  KardexRecalculateQueueEntity({
    required this.id,
    required this.insumoId,
    required this.originMovementId,
    required this.triggerMovementId,
    this.status = 'PENDING',
    this.attempts = 0,
    this.claimedAt,
    this.lastError,
    required this.createdAt,
    required this.updatedAt,
  });
}
