import 'package:floor/floor.dart';

@Entity(
  tableName: 'customers',
  indices: [
    Index(value: ['tax_id'], name: 'idx_customers_tax_id'),
    Index(value: ['phone'], name: 'idx_customers_phone'),
    Index(value: ['name'], name: 'idx_customers_name'),
  ],
)
class CustomerEntity {
  @primaryKey
  final String id;
  final String name;
  @ColumnInfo(name: 'tax_id')
  final String? taxId;
  final String? phone;
  final String? email;
  final String? address;
  @ColumnInfo(name: 'points_balance')
  final double pointsBalance;
  @ColumnInfo(name: 'is_active')
  final bool isActive;
  @ColumnInfo(name: 'created_at')
  final int createdAt; // Store as timestamp millis
  @ColumnInfo(name: 'updated_at')
  final int updatedAt; // Store as timestamp millis
  @ColumnInfo(name: 'sync_status')
  final String syncStatus;

  CustomerEntity({
    required this.id,
    required this.name,
    this.taxId,
    this.phone,
    this.email,
    this.address,
    this.pointsBalance = 0.0,
    this.isActive = true,
    required this.createdAt,
    required this.updatedAt,
    this.syncStatus = 'synced',
  });
}
