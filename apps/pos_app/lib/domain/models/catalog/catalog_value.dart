import 'package:freezed_annotation/freezed_annotation.dart';

import 'catalog_type.dart';

part 'catalog_value.freezed.dart';
part 'catalog_value.g.dart';

/// A single tenant-administrable master catalog value, cached locally on the
/// tablet for offline-first operation. Source of truth is the Admin backend;
/// this is the offline mirror.
@freezed
class CatalogValue with _$CatalogValue {
  const factory CatalogValue({
    required String id,
    @JsonKey(fromJson: CatalogType.fromJson, toJson: CatalogType.toJson)
        required CatalogType catalogType,
    required String code,
    required String name,
    @Default(true) bool isActive,
    @Default(0) int sortOrder,
  }) = _CatalogValue;

  factory CatalogValue.fromJson(Map<String, dynamic> json) =>
      _$CatalogValueFromJson(json);
}
