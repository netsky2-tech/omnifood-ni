import 'package:floor/floor.dart';

@Entity(tableName: 'restaurant_areas')
class RestaurantAreaEntity {
  @primaryKey
  final String id;
  final String name;
  @ColumnInfo(name: 'display_order')
  final int displayOrder;
  @ColumnInfo(name: 'is_active')
  final bool isActive;

  RestaurantAreaEntity({
    required this.id,
    required this.name,
    this.displayOrder = 0,
    this.isActive = true,
  });
}
