import 'package:floor/floor.dart';

@Entity(
  tableName: 'invoices',
  indices: [
    Index(value: ['invoice_number'], unique: true),
  ],
)
class InvoiceEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'invoice_number')
  final String number;
  @ColumnInfo(name: 'created_at')
  final int createdAt; // Store as timestamp
  @ColumnInfo(name: 'user_id')
  final String userId;
  final double subtotal;
  @ColumnInfo(name: 'total_tax')
  final double totalTax;
  final double total;
  @ColumnInfo(name: 'is_canceled')
  final bool isCanceled;
  @ColumnInfo(name: 'void_reason')
  final String? voidReason;
  @ColumnInfo(name: 'sync_status')
  final String syncStatus;
  @ColumnInfo(name: 'payment_status')
  final String paymentStatus;
  @ColumnInfo(name: 'customer_id')
  final String? customerId;
  @ColumnInfo(name: 'global_tax_override')
  final bool globalTaxOverride;
  final String type; // 'regular' | 'creditNote'
  @ColumnInfo(name: 'related_invoice_id')
  final String? relatedInvoiceId;

  InvoiceEntity({
    required this.id,
    required this.number,
    required this.createdAt,
    required this.userId,
    required this.subtotal,
    required this.totalTax,
    required this.total,
    this.isCanceled = false,
    this.voidReason,
    this.syncStatus = 'pending',
    this.paymentStatus = 'pending',
    this.customerId,
    this.globalTaxOverride = false,
    this.type = 'regular',
    this.relatedInvoiceId,
  });
}
