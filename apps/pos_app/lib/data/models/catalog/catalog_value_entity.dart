import 'package:floor/floor.dart';

/// Floor entity for the local `catalog_values` table (offline mirror of the
/// Admin backend master catalogs). `catalog_type` is stored as the protocol
/// string (see CatalogType).
@Entity(tableName: 'catalog_values')
class CatalogValueEntity {
  @primaryKey
  final String id;

  @ColumnInfo(name: 'catalog_type')
  final String catalogType;

  final String code;
  final String name;

  @ColumnInfo(name: 'is_active')
  final bool isActive;

  @ColumnInfo(name: 'sort_order')
  final int sortOrder;

  CatalogValueEntity({
    required this.id,
    required this.catalogType,
    required this.code,
    required this.name,
    this.isActive = true,
    this.sortOrder = 0,
  });
}
