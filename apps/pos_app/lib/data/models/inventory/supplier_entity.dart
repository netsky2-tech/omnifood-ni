import 'package:floor/floor.dart';

@Entity(tableName: 'suppliers')
class SupplierEntity {
  @primaryKey
  final String id;
  final String name;
  final String? phone;
  @ColumnInfo(name: 'contact_person')
  final String? contactPerson;
  @ColumnInfo(name: 'credit_terms')
  final String? creditTerms;
  @ColumnInfo(name: 'is_active')
  final bool isActive;

  SupplierEntity({
    required this.id,
    required this.name,
    this.phone,
    this.contactPerson,
    this.creditTerms,
    this.isActive = true,
  });
}
