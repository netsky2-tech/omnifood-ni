import 'package:floor/floor.dart';
import './product_entity.dart';

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
