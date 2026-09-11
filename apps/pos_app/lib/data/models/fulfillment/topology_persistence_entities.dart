import 'package:floor/floor.dart';

@Entity(tableName: 'topology_snapshots')
class TopologySnapshotEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'tenant_id')
  final String tenantId;
  final int revision;
  final String hash;
  final String payload;
  @ColumnInfo(name: 'received_at')
  final String receivedAt;
  TopologySnapshotEntity({
    required this.id,
    required this.tenantId,
    required this.revision,
    required this.hash,
    required this.payload,
    required this.receivedAt,
  });
}

@Entity(tableName: 'shift_topology_bindings')
class ShiftTopologyBindingEntity {
  @primaryKey
  @ColumnInfo(name: 'shift_id')
  final String shiftId;
  @ColumnInfo(name: 'tenant_id')
  final String tenantId;
  @ColumnInfo(name: 'snapshot_id')
  final String snapshotId;
  @ColumnInfo(name: 'bound_at')
  final String boundAt;
  ShiftTopologyBindingEntity({
    required this.shiftId,
    required this.tenantId,
    required this.snapshotId,
    required this.boundAt,
  });
}

@Entity(tableName: 'emergency_topology_audits')
class EmergencyTopologyAuditEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'tenant_id')
  final String tenantId;
  @ColumnInfo(name: 'shift_id')
  final String shiftId;
  @ColumnInfo(name: 'snapshot_id')
  final String snapshotId;
  @ColumnInfo(name: 'actor_id')
  final String actorId;
  @ColumnInfo(name: 'actor_role')
  final String actorRole;
  @ColumnInfo(name: 'device_id')
  final String deviceId;
  final String reason;
  @ColumnInfo(name: 'occurred_at')
  final String occurredAt;
  EmergencyTopologyAuditEntity({
    required this.id,
    required this.tenantId,
    required this.shiftId,
    required this.snapshotId,
    required this.actorId,
    required this.actorRole,
    required this.deviceId,
    required this.reason,
    required this.occurredAt,
  });
}
