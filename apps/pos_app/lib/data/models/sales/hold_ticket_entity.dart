import 'package:floor/floor.dart';

@Entity(tableName: 'hold_tickets')
class HoldTicketEntity {
  @primaryKey
  final String id;
  final String name;
  @ColumnInfo(name: 'created_at')
  final int createdAt;
  @ColumnInfo(name: 'global_tax_exempt')
  final bool isGlobalTaxExempt;

  HoldTicketEntity({
    required this.id,
    required this.name,
    required this.createdAt,
    this.isGlobalTaxExempt = false,
  });
}

@Entity(
  tableName: 'hold_ticket_items',
  foreignKeys: [
    ForeignKey(
      childColumns: ['hold_ticket_id'],
      parentColumns: ['id'],
      entity: HoldTicketEntity,
      onDelete: ForeignKeyAction.cascade,
    ),
  ],
)
class HoldTicketItemEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'hold_ticket_id')
  final String holdTicketId;
  @ColumnInfo(name: 'product_id')
  final String productId;
  @ColumnInfo(name: 'product_name')
  final String productName;
  final double quantity;
  @ColumnInfo(name: 'unit_price')
  final double unitPrice;
  @ColumnInfo(name: 'tax_rate')
  final double taxRate;

  HoldTicketItemEntity({
    required this.id,
    required this.holdTicketId,
    required this.productId,
    required this.productName,
    required this.quantity,
    required this.unitPrice,
    required this.taxRate,
  });
}
