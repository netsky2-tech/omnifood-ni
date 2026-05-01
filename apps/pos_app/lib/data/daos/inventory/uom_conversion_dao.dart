import 'package:floor/floor.dart';
import '../../models/inventory/uom_conversion_entity.dart';

@dao
abstract class UomConversionDao {
  @Query('SELECT * FROM uom_conversions WHERE insumo_id = :insumoId')
  Future<List<UomConversionEntity>> findConversionsByInsumoId(String insumoId);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertConversions(List<UomConversionEntity> conversions);
}
