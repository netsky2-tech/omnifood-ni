import 'package:floor/floor.dart';
import './invoice_entity.dart';

@Entity(
  tableName: 'invoice_items',
  foreignKeys: [
    ForeignKey(
      childColumns: ['invoice_id'],
      parentColumns: ['id'],
      entity: InvoiceEntity,
    ),
  ],
)
class InvoiceItemEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'invoice_id')
  final String invoiceId;
  @ColumnInfo(name: 'product_id')
  final String productId;
  @ColumnInfo(name: 'product_name')
  final String productName;
  final double quantity;
  @ColumnInfo(name: 'unit_price')
  final double unitPrice;
  @ColumnInfo(name: 'original_tax_rate')
  final double originalTaxRate;
  @ColumnInfo(name: 'applied_tax_rate')
  final double appliedTaxRate;
  @ColumnInfo(name: 'tax_amount')
  final double taxAmount;
  final double total;
  final double discount;
  @ColumnInfo(name: 'variant_id')
  final String? variantId;
  final String? notes;

  InvoiceItemEntity({
    required this.id,
    required this.invoiceId,
    required this.productId,
    required this.productName,
    required this.quantity,
    required this.unitPrice,
    required this.originalTaxRate,
    required this.appliedTaxRate,
    required this.taxAmount,
    required this.total,
    this.discount = 0.0,
    this.variantId,
    this.notes,
  });
}
