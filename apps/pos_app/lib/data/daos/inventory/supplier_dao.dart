import 'package:floor/floor.dart';
import '../../models/inventory/supplier_entity.dart';

@dao
abstract class SupplierDao {
  @Query('SELECT * FROM suppliers WHERE is_active = 1')
  Future<List<SupplierEntity>> findAllActiveSuppliers();

  @Query('SELECT * FROM suppliers WHERE id = :id')
  Future<SupplierEntity?> findSupplierById(String id);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertSuppliers(List<SupplierEntity> suppliers);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updateSupplier(SupplierEntity supplier);
}
