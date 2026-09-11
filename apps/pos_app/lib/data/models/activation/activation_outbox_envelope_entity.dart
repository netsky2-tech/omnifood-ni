import 'package:floor/floor.dart';

@Entity(
  tableName: 'activation_outbox_envelopes',
  indices: [
    Index(
      value: ['tenant_id', 'idempotency_key'],
      unique: true,
      name: 'index_activation_outbox_envelopes_tenant_id_idempotency_key',
    ),
    Index(
      value: ['tenant_id', 'activation_attempt_id'],
      name: 'index_activation_outbox_envelopes_tenant_id_activation_attempt_id',
    ),
  ],
)
class ActivationOutboxEnvelopeEntity {
  @primaryKey
  @ColumnInfo(name: 'id')
  final String id;

  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  @ColumnInfo(name: 'activation_attempt_id')
  final String activationAttemptId;

  @ColumnInfo(name: 'event_type')
  final String eventType;

  @ColumnInfo(name: 'idempotency_key')
  final String idempotencyKey;

  @ColumnInfo(name: 'payload_json')
  final String payloadJson;

  @ColumnInfo(name: 'payload_hash')
  final String payloadHash;

  @ColumnInfo(name: 'sync_status')
  final String syncStatus;

  @ColumnInfo(name: 'created_at')
  final String createdAt;

  @ColumnInfo(name: 'synced_at')
  final String? syncedAt;

  @ColumnInfo(name: 'last_error')
  final String? lastError;

  const ActivationOutboxEnvelopeEntity({
    required this.id,
    required this.tenantId,
    required this.activationAttemptId,
    required this.eventType,
    required this.idempotencyKey,
    required this.payloadJson,
    required this.payloadHash,
    required this.syncStatus,
    required this.createdAt,
    this.syncedAt,
    this.lastError,
  });

  ActivationOutboxEnvelopeEntity copyWith({
    String? syncStatus,
    String? syncedAt,
    String? lastError,
  }) {
    return ActivationOutboxEnvelopeEntity(
      id: id,
      tenantId: tenantId,
      activationAttemptId: activationAttemptId,
      eventType: eventType,
      idempotencyKey: idempotencyKey,
      payloadJson: payloadJson,
      payloadHash: payloadHash,
      syncStatus: syncStatus ?? this.syncStatus,
      createdAt: createdAt,
      syncedAt: syncedAt ?? this.syncedAt,
      lastError: lastError ?? this.lastError,
    );
  }
}
