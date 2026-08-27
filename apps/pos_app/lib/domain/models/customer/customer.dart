import 'package:freezed_annotation/freezed_annotation.dart';

part 'customer.freezed.dart';
part 'customer.g.dart';

@freezed
class Customer with _$Customer {
  const factory Customer({
    required String id,
    required String name,
    String? taxId, // Cédula o RUC
    String? phone,
    String? email,
    String? address,
    @Default(0.0) double pointsBalance,
    @Default(true) bool isActive,
    DateTime? createdAt,
    DateTime? updatedAt,
    @Default('synced') String syncStatus,
  }) = _Customer;

  factory Customer.fromJson(Map<String, dynamic> json) => _$CustomerFromJson(json);
}
