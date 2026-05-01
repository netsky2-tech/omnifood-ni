import 'package:floor/floor.dart';

@Entity(
  tableName: 'recipes',
  foreignKeys: [
    ForeignKey(
      childColumns: ['product_id'],
      parentColumns: ['id'],
      entity: ProductEntity,
    ),
  ],
)
class RecipeEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'product_id')
  final String productId;
  @ColumnInfo(name: 'ingredient_id')
  final String ingredientId;
  @ColumnInfo(name: 'ingredient_type')
  final String ingredientType;
  final double quantity;

  RecipeEntity({
    required this.id,
    required this.productId,
    required this.ingredientId,
    required this.ingredientType,
    required this.quantity,
  });
}

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

  ProductEntity({
    required this.id,
    required this.name,
    required this.uom,
    required this.stock,
    required this.averageCost,
    required this.sellPrice,
    this.isActive = true,
  });
}
