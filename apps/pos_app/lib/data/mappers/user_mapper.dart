import '../../domain/models/user.dart';
import '../models/user_entity.dart';

extension UserMapper on UserEntity {
  User toDomain() {
    return User(
      id: id,
      name: name,
      role: UserRole.values.firstWhere((e) => e.toString().split('.').last.toUpperCase() == role.toUpperCase()),
      pinHash: pinHash,
      isActive: isActive,
      email: email,
      tenantId: tenantId,
    );
  }
}

extension UserEntityMapper on User {
  UserEntity toEntity() {
    return UserEntity(
      id: id,
      name: name,
      role: role.toString().split('.').last.toUpperCase(),
      pinHash: pinHash ?? '',
      isActive: isActive,
      email: email,
      tenantId: tenantId,
    );
  }
}
