import 'package:freezed_annotation/freezed_annotation.dart';

part 'tax_configuration.freezed.dart';
part 'tax_configuration.g.dart';

@freezed
class TaxConfiguration with _$TaxConfiguration {
  const factory TaxConfiguration({
    required String id,
    required String name,
    required double rate,
    @Default(true) bool isActive,
    @Default(false) bool isDefault,
  }) = _TaxConfiguration;

  factory TaxConfiguration.fromJson(Map<String, dynamic> json) =>
      _$TaxConfigurationFromJson(json);
}
