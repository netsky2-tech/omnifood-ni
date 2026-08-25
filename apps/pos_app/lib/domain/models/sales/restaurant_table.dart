import 'package:freezed_annotation/freezed_annotation.dart';

part 'restaurant_table.freezed.dart';
part 'restaurant_table.g.dart';

@freezed
class RestaurantTable with _$RestaurantTable {
  const factory RestaurantTable({
    required String id,
    required String areaId,
    required String tableNumber,
    @Default(4) int capacity,
    @Default('DISPONIBLE') String status, // 'DISPONIBLE', 'OCUPADA', 'POR_COBRAR', 'RESERVADA'
    String? currentTicketId,
    int? activeGuests,
    DateTime? openedAt,
  }) = _RestaurantTable;

  factory RestaurantTable.fromJson(Map<String, dynamic> json) =>
      _$RestaurantTableFromJson(json);
}
