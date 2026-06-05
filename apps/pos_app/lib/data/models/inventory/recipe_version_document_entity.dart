import 'package:floor/floor.dart';

@Entity(tableName: 'recipe_version_documents')
class RecipeVersionDocumentEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'product_id')
  final String productId;
  @ColumnInfo(name: 'product_name')
  final String productName;
  @ColumnInfo(name: 'version_number')
  final int versionNumber;
  @ColumnInfo(name: 'yield_quantity')
  final double yieldQuantity;
  @ColumnInfo(name: 'technical_shrink_pct')
  final double technicalShrinkPct;
  @ColumnInfo(name: 'created_at')
  final String createdAt;
  @ColumnInfo(name: 'version_note')
  final String? versionNote;
  @ColumnInfo(name: 'published_at')
  final String? publishedAt;
  @ColumnInfo(name: 'components_json')
  final String componentsJson;
  @ColumnInfo(name: 'is_synced')
  final bool isSynced;

  const RecipeVersionDocumentEntity({
    required this.id,
    required this.productId,
    required this.productName,
    required this.versionNumber,
    required this.yieldQuantity,
    required this.technicalShrinkPct,
    required this.createdAt,
    required this.componentsJson,
    this.versionNote,
    this.publishedAt,
    this.isSynced = false,
  });
}
