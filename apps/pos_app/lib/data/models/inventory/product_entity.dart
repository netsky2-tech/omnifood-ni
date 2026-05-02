import 'package:floor/floor.dart';

@Entity(tableName: 'products')
class ProductEntity {
  @primaryKey
  final String id;
  final String name;
  final String uom;
  final double stock;
  @ColumnInfo(name: 'average_cost')
  final double averageCost;
  @ColumnInfo(name: 'sell_price')
  final double sellPrice;
  @ColumnInfo(name: 'is_active')
  final bool isActive;
  final String? sku;
  final String? barcode;

  ProductEntity({
    required this.id,
    required this.name,
    required this.uom,
    required this.stock,
    required this.averageCost,
    required this.sellPrice,
    this.isActive = true,
    this.sku,
    this.barcode,
  });
}

@Entity(
  tableName: 'product_variants',
  foreignKeys: [
    ForeignKey(
      childColumns: ['product_id'],
      parentColumns: ['id'],
      entity: ProductEntity,
    ),
  ],
)
class ProductVariantEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'product_id')
  final String productId;
  final String name;
  @ColumnInfo(name: 'price_adjustment')
  final double priceAdjustment;

  ProductVariantEntity({
    required this.id,
    required this.productId,
    required this.name,
    required this.priceAdjustment,
  });
}

@Entity(
  tableName: 'product_modifiers',
  foreignKeys: [
    ForeignKey(
      childColumns: ['product_id'],
      parentColumns: ['id'],
      entity: ProductEntity,
    ),
  ],
)
class ProductModifierEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'product_id')
  final String productId;
  final String name;
  @ColumnInfo(name: 'extra_price')
  final double extraPrice;

  ProductModifierEntity({
    required this.id,
    required this.productId,
    required this.name,
    required this.extraPrice,
  });
}
