import 'package:floor/floor.dart';

@Entity(
  tableName: 'customer_point_transactions',
  indices: [
    Index(value: ['customer_id']),
    Index(value: ['invoice_id']),
    Index(value: ['created_at']),
  ],
)
class CustomerPointTransactionEntity {
  @primaryKey
  final String id;

  @ColumnInfo(name: 'customer_id')
  final String customerId;

  @ColumnInfo(name: 'invoice_id')
  final String? invoiceId;

  final String type; // 'earn', 'redeem', 'adjust'

  final double points;

  @ColumnInfo(name: 'balance_after')
  final double balanceAfter;

  @ColumnInfo(name: 'conversion_rate')
  final double conversionRate;

  final String? reason;

  @ColumnInfo(name: 'created_at')
  final int createdAt; // timestamp millis

  @ColumnInfo(name: 'sync_status')
  final String syncStatus; // 'pending', 'synced', 'error'

  CustomerPointTransactionEntity({
    required this.id,
    required this.customerId,
    this.invoiceId,
    required this.type,
    required this.points,
    required this.balanceAfter,
    required this.conversionRate,
    this.reason,
    required this.createdAt,
    this.syncStatus = 'pending',
  });
}
