import 'package:floor/floor.dart';
import './invoice_item_entity.dart';

@Entity(
  tableName: 'invoice_item_modifiers',
  foreignKeys: [
    ForeignKey(
      childColumns: ['invoice_item_id'],
      parentColumns: ['id'],
      entity: InvoiceItemEntity,
    ),
  ],
)
class InvoiceItemModifierEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'invoice_item_id')
  final String invoiceItemId;
  final String name;
  @ColumnInfo(name: 'extra_price')
  final double extraPrice;

  InvoiceItemModifierEntity({
    required this.id,
    required this.invoiceItemId,
    required this.name,
    required this.extraPrice,
  });
}
