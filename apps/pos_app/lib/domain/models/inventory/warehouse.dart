import 'package:freezed_annotation/freezed_annotation.dart';

part 'warehouse.freezed.dart';
part 'warehouse.g.dart';

@freezed
class Warehouse with _$Warehouse {
  const factory Warehouse({
    required String id,
    required String name,
    String? description,
    @Default(true) bool isActive,
  }) = _Warehouse;

  factory Warehouse.fromJson(Map<String, dynamic> json) => _$WarehouseFromJson(json);
}
