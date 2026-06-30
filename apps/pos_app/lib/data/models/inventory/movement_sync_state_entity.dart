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

  const MovementSyncStateEntity({
    required this.movementId,
    required this.syncStatus,
    this.lastAttemptedAt,
    this.syncedAt,
    this.lastError,
  });
}
