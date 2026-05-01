import 'package:floor/floor.dart';

@Entity(tableName: 'uom_conversions')
class UomConversionEntity {
  @primaryKey
  final String id;
  @ColumnInfo(name: 'insumo_id')
  final String insumoId;
  @ColumnInfo(name: 'unit_name')
  final String unitName;
  final double factor;
  @ColumnInfo(name: 'is_default')
  final bool isDefault;

  UomConversionEntity({
    required this.id,
    required this.insumoId,
    required this.unitName,
    required this.factor,
    this.isDefault = false,
  });
}
