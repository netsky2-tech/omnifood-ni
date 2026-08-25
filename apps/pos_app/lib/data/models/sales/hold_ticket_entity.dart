import 'package:floor/floor.dart';

@Entity(tableName: 'hold_tickets')
class HoldTicketEntity {
  @primaryKey
  final String id;
  final String name;
  @ColumnInfo(name: 'created_at')
  final int createdAt;
  @ColumnInfo(name: 'updated_at')
  final int? updatedAt;
  @ColumnInfo(name: 'table_id')
  final String? tableId;
  @ColumnInfo(name: 'area_id')
  final String? areaId;
  @ColumnInfo(name: 'waiter_id')
  final String? waiterId;
  @ColumnInfo(name: 'waiter_name')
  final String? waiterName;
  @ColumnInfo(name: 'guest_count')
  final int guestCount;
  @ColumnInfo(name: 'global_tax_exempt')
  final bool isGlobalTaxExempt;
  final int version;

  HoldTicketEntity({
    required this.id,
    required this.name,
    required this.createdAt,
    this.updatedAt,
    this.tableId,
    this.areaId,
    this.waiterId,
    this.waiterName,
    this.guestCount = 1,
    this.isGlobalTaxExempt = false,
    this.version = 1,
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
  @ColumnInfo(name: 'variant_id')
  final String? variantId;
  final String? notes;
  @ColumnInfo(name: 'modifiers_json')
  final String? modifiersJson;

  HoldTicketItemEntity({
    required this.id,
    required this.holdTicketId,
    required this.productId,
    required this.productName,
    required this.quantity,
    required this.unitPrice,
    required this.taxRate,
    this.variantId,
    this.notes,
    this.modifiersJson,
  });
}
