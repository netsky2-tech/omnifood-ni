import 'package:floor/floor.dart';

import 'movement_entity.dart';

class MovementSyncStateStatus {
  MovementSyncStateStatus._();

  static const String pending = 'pending';
  static const String synced = 'synced';
  static const String failed = 'failed';
}

@Entity(
  tableName: 'inventory_movement_sync_state',
  indices: [
    Index(
      value: ['terminal_id', 'flow_type', 'local_sequence'],
      name: 'idx_movement_sync_state_stream_sequence',
      unique: true,
    ),
    Index(
      value: ['idempotency_key'],
      name: 'idx_movement_sync_state_idempotency_key',
      unique: true,
    ),
  ],
  foreignKeys: [
    ForeignKey(
      childColumns: ['movement_id'],
      parentColumns: ['id'],
      entity: MovementEntity,
      onDelete: ForeignKeyAction.cascade,
    ),
  ],
)
class MovementSyncStateEntity {
  @primaryKey
  @ColumnInfo(name: 'movement_id')
  final String movementId;

  @ColumnInfo(name: 'sync_status')
  final String syncStatus;

  @ColumnInfo(name: 'last_attempted_at')
  final String? lastAttemptedAt;

  @ColumnInfo(name: 'synced_at')
  final String? syncedAt;

  @ColumnInfo(name: 'last_error')
  final String? lastError;

  @ColumnInfo(name: 'terminal_id')
  final String? terminalId;

  @ColumnInfo(name: 'flow_type')
  final String? flowType;

  @ColumnInfo(name: 'local_sequence')
  final int? localSequence;

  @ColumnInfo(name: 'idempotency_key')
  final String? idempotencyKey;

  @ColumnInfo(name: 'last_result_code')
  final String? lastResultCode;

  const MovementSyncStateEntity({
    required this.movementId,
    required this.syncStatus,
    this.lastAttemptedAt,
    this.syncedAt,
    this.lastError,
    this.terminalId,
    this.flowType,
    this.localSequence,
    this.idempotencyKey,
    this.lastResultCode,
  });
}
