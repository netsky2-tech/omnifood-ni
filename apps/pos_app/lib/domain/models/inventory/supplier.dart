import 'package:freezed_annotation/freezed_annotation.dart';

part 'supplier.freezed.dart';
part 'supplier.g.dart';

@freezed
class Supplier with _$Supplier {
  const factory Supplier({
    required String id,
    required String name,
    String? phone,
    @JsonKey(name: 'contact_person') String? contactPerson,
    @JsonKey(name: 'credit_terms') String? creditTerms,
    @Default(true) bool isActive,
  }) = _Supplier;

  factory Supplier.fromJson(Map<String, dynamic> json) => _$SupplierFromJson(json);
}
