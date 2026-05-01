import 'package:freezed_annotation/freezed_annotation.dart';

part 'uom_conversion.freezed.dart';
part 'uom_conversion.g.dart';

@freezed
class UomConversion with _$UomConversion {
  const factory UomConversion({
    required String id,
    required String insumoId,
    required String unitName,
    required double factor,
    @Default(false) bool isDefault,
  }) = _UomConversion;

  factory UomConversion.fromJson(Map<String, dynamic> json) => _$UomConversionFromJson(json);
}
