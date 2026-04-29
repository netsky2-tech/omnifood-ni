import 'package:floor/floor.dart';

@Entity(tableName: 'users')
class UserEntity {
  @primaryKey
  final String id;
  final String name;
  final String role;
  @ColumnInfo(name: 'pin_hash')
  final String pinHash;
  @ColumnInfo(name: 'is_active')
  final bool isActive;
  final String? email;
  @ColumnInfo(name: 'tenant_id')
  final String? tenantId;

  UserEntity({
    required this.id,
    required this.name,
    required this.role,
    required this.pinHash,
    required this.isActive,
    this.email,
    this.tenantId,
  });
}
