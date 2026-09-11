import 'package:floor/floor.dart';

@Entity(
  tableName: 'first_customer_sale_observations',
  indices: [
    Index(value: ['ticket_id'], unique: true),
    Index(value: ['outbox_event_id'], unique: true),
  ],
)
class FirstCustomerSaleObservationEntity {
  @primaryKey
  @ColumnInfo(name: 'tenant_id')
  final String tenantId; // Write-once per tenant

  @ColumnInfo(name: 'terminal_id')
  final String terminalId;

  @ColumnInfo(name: 'ticket_id')
  final String ticketId;

  @ColumnInfo(name: 'occurred_at')
  final String occurredAt;

  @ColumnInfo(name: 'outbox_event_id')
  final String outboxEventId;

  @ColumnInfo(name: 'created_at_local')
  final String createdAtLocal;

  const FirstCustomerSaleObservationEntity({
    required this.tenantId,
    required this.terminalId,
    required this.ticketId,
    required this.occurredAt,
    required this.outboxEventId,
    required this.createdAtLocal,
  });
}
