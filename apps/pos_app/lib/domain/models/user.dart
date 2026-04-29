import 'package:freezed_annotation/freezed_annotation.dart';

part 'user.freezed.dart';
part 'user.g.dart';

enum UserRole {
  @JsonValue('OWNER')
  owner,
  @JsonValue('MANAGER')
  manager,
  @JsonValue('CASHIER')
  cashier,
  @JsonValue('WAITER')
  waiter,
}

@freezed
class User with _$User {
  const factory User({
    required String id,
    required String name,
    required UserRole role,
    @JsonKey(name: 'pin_hash') String? pinHash,
    @JsonKey(defaultValue: true) required bool isActive,
    String? email,
    @JsonKey(name: 'tenant_id') String? tenantId,
  }) = _User;

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}
