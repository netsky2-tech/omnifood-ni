import 'package:floor/floor.dart';

/// Local mirror of one backend `modifier_groups` row (reusable extras/
/// modifier group). Single-device mirror: no tenant column, backend uuid as
/// TEXT primary key, same as promotions. Soft-deleted groups arrive with
/// [isActive] false as tombstones so the terminal mirrors the delete.
@Entity(tableName: 'modifier_groups')
class ModifierGroupEntity {
  @primaryKey
  final String id;
  final String name;
  @ColumnInfo(name: 'min_selected')
  final int minSelected;
  @ColumnInfo(name: 'max_selected')
  final int maxSelected;
  @ColumnInfo(name: 'allow_quantities')
  final bool allowQuantities;
  @ColumnInfo(name: 'sort_order')
  final int sortOrder;
  @ColumnInfo(name: 'is_active')
  final bool isActive;

  ModifierGroupEntity({
    required this.id,
    required this.name,
    this.minSelected = 0,
    this.maxSelected = 1,
    this.allowQuantities = false,
    this.sortOrder = 0,
    this.isActive = true,
  });
}
