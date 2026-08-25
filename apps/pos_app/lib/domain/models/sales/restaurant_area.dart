import 'package:freezed_annotation/freezed_annotation.dart';

part 'restaurant_area.freezed.dart';
part 'restaurant_area.g.dart';

@freezed
class RestaurantArea with _$RestaurantArea {
  const factory RestaurantArea({
    required String id,
    required String name,
    @Default(0) int displayOrder,
    @Default(true) bool isActive,
  }) = _RestaurantArea;

  factory RestaurantArea.fromJson(Map<String, dynamic> json) =>
      _$RestaurantAreaFromJson(json);
}
