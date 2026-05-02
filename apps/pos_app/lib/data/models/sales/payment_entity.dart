import 'package:floor/floor.dart';
import './invoice_entity.dart';

@Entity(
  tableName: 'payments',
  foreignKeys: [
    ForeignKey(
      childColumns: ['invoice_id'],
      parentColumns: ['id'],
      entity: InvoiceEntity,
    ),
  ],
)
class PaymentEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'invoice_id')
  final String invoiceId;
  final String method;
  final double amount;
  final String currency;
  @ColumnInfo(name: 'exchange_rate')
  final double exchangeRate;
  @ColumnInfo(name: 'created_at')
  final int? createdAt;

  PaymentEntity({
    required this.id,
    required this.invoiceId,
    required this.method,
    required this.amount,
    this.currency = 'NIO',
    this.exchangeRate = 1.0,
    this.createdAt,
  });
}
