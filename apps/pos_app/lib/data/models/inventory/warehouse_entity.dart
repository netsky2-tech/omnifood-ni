import 'package:floor/floor.dart';

@Entity(tableName: 'warehouses')
class WarehouseEntity {
  @primaryKey
  final String id;
  final String name;
  final String? description;
  @ColumnInfo(name: 'is_active')
  final bool isActive;

  WarehouseEntity({
    required this.id,
    required this.name,
    this.description,
    this.isActive = true,
  });
}
