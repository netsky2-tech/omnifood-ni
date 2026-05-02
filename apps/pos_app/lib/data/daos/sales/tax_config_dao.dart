import 'package:floor/floor.dart';
import '../../models/sales/tax_config_entity.dart';

@dao
abstract class TaxConfigDao {
  @Query('SELECT * FROM tax_configurations')
  Future<List<TaxConfigEntity>> getAllTaxConfigs();

  @Query('SELECT * FROM tax_configurations WHERE is_active = 1')
  Future<List<TaxConfigEntity>> getActiveTaxConfigs();

  @insert
  Future<void> insertTaxConfig(TaxConfigEntity config);

  @update
  Future<void> updateTaxConfig(TaxConfigEntity config);
}
