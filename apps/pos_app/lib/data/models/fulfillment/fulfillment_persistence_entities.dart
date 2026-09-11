import 'package:floor/floor.dart';
@Entity(tableName: 'fulfillment_records')
class FulfillmentRecordEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'tenant_id')
  final String tenantId;
  @ColumnInfo(name: 'sale_id')
  final String saleId;
  @ColumnInfo(name: 'topology_snapshot_id')
  final String topologySnapshotId;
  @ColumnInfo(name: 'topology_revision')
  final int topologyRevision;
  final String channel;
  @ColumnInfo(name: 'route_state')
  final String routeState;
  @ColumnInfo(name: 'delivery_state')
  final String deliveryState;
  @ColumnInfo(name: 'lines_payload')
  final String linesPayload;
  FulfillmentRecordEntity({
    required this.id,
    required this.tenantId,
    required this.saleId,
    required this.topologySnapshotId,
    required this.topologyRevision,
    required this.channel,
    required this.routeState,
    required this.deliveryState,
    required this.linesPayload,
  });
}
@Entity(
  tableName: 'print_jobs',
  indices: [
    Index(value: ['tenant_id', 'idempotency_key'], unique: true),
  ],
)
class PrintJobEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'tenant_id')
  final String tenantId;
  @ColumnInfo(name: 'fulfillment_id')
  final String fulfillmentId;
  @ColumnInfo(name: 'document_kind')
  final String documentKind;
  final int sequence;
  final String payload;
  final String state;
  @ColumnInfo(name: 'retry_count')
  final int retryCount;
  @ColumnInfo(name: 'idempotency_key')
  final String idempotencyKey;
  PrintJobEntity({
    required this.id,
    required this.tenantId,
    required this.fulfillmentId,
    required this.documentKind,
    required this.sequence,
    required this.payload,
    required this.state,
    required this.retryCount,
    required this.idempotencyKey,
  });
}
@Entity(
  tableName: 'fulfillment_outbox_events',
  indices: [
    Index(value: ['tenant_id', 'idempotency_key'], unique: true),
  ],
)
class OutboxEventEntity {
  @primaryKey
  @ColumnInfo(name: 'event_id')
  final String eventId;
  @ColumnInfo(name: 'tenant_id')
  final String tenantId;
  @ColumnInfo(name: 'device_id')
  final String deviceId;
  @ColumnInfo(name: 'source_sequence')
  final int sourceSequence;
  @ColumnInfo(name: 'aggregate_type')
  final String aggregateType;
  @ColumnInfo(name: 'aggregate_id')
  final String aggregateId;
  @ColumnInfo(name: 'idempotency_key')
  final String idempotencyKey;
  @ColumnInfo(name: 'payload_hash')
  final String payloadHash;
  @ColumnInfo(name: 'topology_revision')
  final int topologyRevision;
  final String state;
  final int attempts;
  OutboxEventEntity({
    required this.eventId,
    required this.tenantId,
    required this.deviceId,
    required this.sourceSequence,
    required this.aggregateType,
    required this.aggregateId,
    required this.idempotencyKey,
    required this.payloadHash,
    required this.topologyRevision,
    required this.state,
    required this.attempts,
  });
}
