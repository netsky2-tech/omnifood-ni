import 'package:floor/floor.dart';

@Entity(tableName: 'tax_configurations')
class TaxConfigEntity {
  @primaryKey
  final String id;
  final String name;
  final double rate;
  @ColumnInfo(name: 'is_active')
  final bool isActive;
  @ColumnInfo(name: 'is_default')
  final bool isDefault;

  TaxConfigEntity({
    required this.id,
    required this.name,
    required this.rate,
    this.isActive = true,
    this.isDefault = false,
  });
}
