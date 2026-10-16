import 'package:floor/floor.dart';

@Entity(tableName: 'authority_insumos', primaryKeys: ['tenant_id', 'id'])
class AuthorityInsumoEntity {
  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  final String id;
  final String name;
  final String uom;

  const AuthorityInsumoEntity({
    required this.tenantId,
    required this.id,
    required this.name,
    required this.uom,
  });
}

@Entity(tableName: 'authority_recipe_versions', primaryKeys: ['tenant_id', 'id'])
class AuthorityRecipeVersionEntity {
  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  final String id;

  @ColumnInfo(name: 'product_id')
  final String productId;

  @ColumnInfo(name: 'version_number')
  final int versionNumber;

  @ColumnInfo(name: 'is_active')
  final bool isActive;

  @ColumnInfo(name: 'publication_state')
  final String publicationState;

  @ColumnInfo(name: 'effective_from')
  final String effectiveFrom;

  @ColumnInfo(name: 'effective_until')
  final String? effectiveUntil;

  @ColumnInfo(name: 'yield_quantity')
  final double yieldQuantity;

  @ColumnInfo(name: 'technical_shrink_pct')
  final double technicalShrinkPct;

  @ColumnInfo(name: 'published_at')
  final String? publishedAt;

  @ColumnInfo(name: 'created_at')
  final String createdAt;

  @ColumnInfo(name: 'updated_at')
  final String updatedAt;

  const AuthorityRecipeVersionEntity({
    required this.tenantId,
    required this.id,
    required this.productId,
    required this.versionNumber,
    required this.isActive,
    required this.publicationState,
    required this.effectiveFrom,
    this.effectiveUntil,
    required this.yieldQuantity,
    required this.technicalShrinkPct,
    this.publishedAt,
    required this.createdAt,
    required this.updatedAt,
  });
}

@Entity(
  tableName: 'authority_recipe_version_components',
  primaryKeys: ['tenant_id', 'id'],
  // R21 / S18: the insumo_id FK is deliberately absent. A component of type
  // 'SUB_RECIPE' names a PRODUCT id (the sub-recipe), which never has an
  // authority_insumos row — the backend excludes SUB_RECIPE components from
  // the insumo closure it delivers. ingredient_type is what distinguishes the
  // two reference kinds; only INSUMO components must resolve to an insumo.
  foreignKeys: [
    ForeignKey(
      childColumns: ['tenant_id', 'version_id'],
      parentColumns: ['tenant_id', 'id'],
      entity: AuthorityRecipeVersionEntity,
      onDelete: ForeignKeyAction.cascade,
    ),
  ],
  indices: [
    Index(value: ['tenant_id', 'version_id', 'ordinal'], unique: true),
  ],
)
class AuthorityRecipeVersionComponentEntity {
  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  final String id;

  @ColumnInfo(name: 'version_id')
  final String versionId;

  final int ordinal;

  @ColumnInfo(name: 'insumo_id')
  final String insumoId;

  @ColumnInfo(name: 'gross_quantity')
  final double grossQuantity;

  @ColumnInfo(name: 'technical_shrink_pct')
  final double technicalShrinkPct;

  @ColumnInfo(name: 'ingredient_type')
  final String ingredientType;

  @ColumnInfo(name: 'component_name')
  final String componentName;

  @ColumnInfo(name: 'component_uom')
  final String? componentUom;

  @ColumnInfo(name: 'reference_version_id')
  final String? referenceVersionId;

  const AuthorityRecipeVersionComponentEntity({
    required this.tenantId,
    required this.id,
    required this.versionId,
    required this.ordinal,
    required this.insumoId,
    required this.grossQuantity,
    required this.technicalShrinkPct,
    required this.ingredientType,
    required this.componentName,
    this.componentUom,
    this.referenceVersionId,
  });
}
