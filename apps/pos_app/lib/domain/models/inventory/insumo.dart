import 'package:freezed_annotation/freezed_annotation.dart';

part 'insumo.freezed.dart';
part 'insumo.g.dart';

@freezed
class Insumo with _$Insumo {
  const factory Insumo({
    required String id,
    required String name,
    required String consumptionUom,
    required double stock,
    required double averageCost,
    double? parLevel,
    @JsonKey(name: 'warehouse_id') String? warehouseId,
    @Default(false) @JsonKey(name: 'is_perishable') bool isPerishable,
  }) = _Insumo;

  factory Insumo.fromJson(Map<String, dynamic> json) => _$InsumoFromJson(json);
}
